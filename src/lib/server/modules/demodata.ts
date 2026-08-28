import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { audit, setSetting } from "@/lib/server/helpers"
import { createSale } from "@/lib/server/services/sales"
import { applyCustomerPayment, applySupplierPayment, postSupplierLedger, applyStockChange, SessionInfo } from "@/lib/server/services/core"

function daysAgo(n: number, hour = 11): Date {
  const d = istNoon(n)
  d.setUTCHours(hour - 5, 30, 0, 0)
  return d
}
function istNoon(n: number): Date {
  const d = new Date(Date.now() - n * 86400000)
  // keep IST date
  const ist = new Date(d.getTime() + 5.5 * 3600000)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 6, 30))
}
function rand(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

export async function handle(ctx: Ctx) {
  const [, action] = ctx.segs

  if (ctx.method === "GET" && action === "status") {
    const s = await db.setting.findUnique({ where: { key: "demo_loaded" } })
    return json({ loaded: s?.value === "1" })
  }

  if (ctx.method === "POST" && (!action || action === "load")) {
    ctx.requirePerm("settings", "edit")
    const existing = await db.setting.findUnique({ where: { key: "demo_loaded" } })
    if (existing?.value === "1") return json({ error: "Demo data already loaded" }, 400)

    const user: SessionInfo = ctx.user ? { fullName: ctx.user.fullName, role: ctx.user.role } : null

    await db.$transaction(async (tx) => {
      // ---------- Attributes ----------
      const sizes = await tx.size.findMany()
      const sizeMap = new Map(sizes.map((s) => [s.name, s.id]))
      const colors = await tx.color.findMany()
      const colorMap = new Map(colors.map((c) => [c.name, c.id]))
      const materials = await tx.material.findMany()
      const matMap = new Map(materials.map((m) => [m.name, m.id]))

      const catDefs = [
        ["T-Shirts", "Casual t-shirts"], ["Shirts", "Formal and casual shirts"],
        ["Kurtas & Kurtis", "Ethnic wear"], ["Jeans & Trousers", "Bottoms"],
        ["Dresses", "Women's dresses"], ["Hoodies & Jackets", "Winter wear"],
      ]
      const cats: Record<string, string> = {}
      for (const [name, desc] of catDefs) {
        const c = await tx.category.upsert({ where: { name }, update: {}, create: { name, description: desc } })
        cats[name] = c.id
      }

      const colDefs: [string, string][] = [
        ["Summer 2026", "SUMMER"], ["Festive Collection", "FESTIVE"], ["Essentials", "ALL_SEASON"],
      ]
      const cols: Record<string, string> = {}
      for (const [name, season] of colDefs) {
        const existingCol = await tx.collection.findFirst({ where: { name } })
        const c = existingCol ?? await tx.collection.create({ data: { name, season, description: `${season} line` } })
        cols[name] = c.id
      }

      // ---------- Warehouses ----------
      let mainShop = await tx.warehouse.findFirst({ where: { name: "Main Shop" } })
      if (!mainShop) mainShop = await tx.warehouse.create({ data: { name: "Main Shop", type: "SHOP", isDefault: true } })
      let warehouse = await tx.warehouse.findFirst({ where: { name: "Central Warehouse" } })
      if (!warehouse) warehouse = await tx.warehouse.create({ data: { name: "Central Warehouse", type: "WAREHOUSE" } })

      // ---------- Suppliers ----------
      const supDefs: [string, string, string, string | null][] = [
        ["Shree Textiles Pvt Ltd", "STPL", "FABRIC", "27AABCS1429B1Z1"],
        ["Metro Garments Co", "MGC", "FINISHED_GOODS", "27AAECM5521K1Z3"],
        ["Kumar Accessories", "KA", "ACCESSORIES", null],
      ]
      const sups: string[] = []
      for (let i = 0; i < supDefs.length; i++) {
        const [name, , type, gstin] = supDefs[i]
        const s = await tx.supplier.create({
          data: {
            code: `S${String(i + 1).padStart(4, "0")}`, name, company: name,
            phone: `98200${rand(10000, 99999)}`, gstin: gstin as string | null, type,
            address: `${rand(10, 200)}, Textile Market, Surat`,
          },
        })
        sups.push(s.id)
      }

      // ---------- Customers ----------
      const custDefs: [string, string, string][] = [
        ["Rahul Patel", "RETAIL", "9820011111"], ["Priya Sharma", "VIP", "9820022222"],
        ["Anil Kumar", "RETAIL", "9820033333"], ["Meena Gupta", "WHOLESALE", "9820044444"],
        ["Vikram Singh", "RETAIL", "9820055555"], ["Sunita Devi", "REGULAR", "9820066666"],
        ["Style Bazaar (Store)", "WHOLESALE", "9820077777"], ["Arjun Mehta", "RETAIL", "9820088888"],
      ]
      const custs: string[] = []
      for (let i = 0; i < custDefs.length; i++) {
        const [name, type, phone] = custDefs[i]
        const c = await tx.customer.create({
          data: {
            code: `C${String(i + 1).padStart(4, "0")}`, name, phone, type,
            address: `${rand(1, 99)}, ${pick(["MG Road", "Station Road", "Civil Lines", "Model Town"])}, ${pick(["Mumbai", "Pune", "Nashik", "Surat"])}`,
            creditLimit: type === "WHOLESALE" ? 100000 : type === "VIP" ? 25000 : 5000,
            discountPercent: type === "WHOLESALE" ? 10 : type === "VIP" ? 5 : 0,
          },
        })
        custs.push(c.id)
      }

      // ---------- Products ----------
      interface PDef { name: string; code: string; cat: string; col: string; type: string; gender: string; material: string; cost: number; mrp: number; sell: number; whole: number; colors: string[]; sizes: string[]; minStock: number }
      const pDefs: PDef[] = [
        { name: "Premium Cotton T-Shirt", code: "TS001", cat: "T-Shirts", col: "Summer 2026", type: "T-SHIRT", gender: "MEN", material: "Cotton", cost: 240, mrp: 799, sell: 599, whole: 450, colors: ["Black", "White", "Navy", "Olive"], sizes: ["S", "M", "L", "XL"], minStock: 6 },
        { name: "Graphic Print Tee", code: "TS002", cat: "T-Shirts", col: "Summer 2026", type: "T-SHIRT", gender: "UNISEX", material: "Cotton", cost: 210, mrp: 699, sell: 499, whole: 380, colors: ["White", "Grey"], sizes: ["M", "L", "XL"], minStock: 5 },
        { name: "Oxford Formal Shirt", code: "SH001", cat: "Shirts", col: "Essentials", type: "SHIRT", gender: "MEN", material: "Cotton Blend", cost: 420, mrp: 1499, sell: 1199, whole: 950, colors: ["White", "Blue", "Grey"], sizes: ["S", "M", "L", "XL", "XXL"], minStock: 5 },
        { name: "Linen Casual Shirt", code: "SH002", cat: "Shirts", col: "Summer 2026", type: "SHIRT", gender: "MEN", material: "Linen", cost: 520, mrp: 1899, sell: 1499, whole: 1200, colors: ["Beige", "White"], sizes: ["M", "L", "XL"], minStock: 4 },
        { name: "Embroidered Cotton Kurta", code: "KT001", cat: "Kurtas & Kurtis", col: "Festive Collection", type: "KURTA", gender: "MEN", material: "Cotton", cost: 650, mrp: 2299, sell: 1799, whole: 1400, colors: ["White", "Maroon"], sizes: ["M", "L", "XL"], minStock: 4 },
        { name: "Printed Rayon Kurti", code: "KT002", cat: "Kurtas & Kurtis", col: "Festive Collection", type: "KURTI", gender: "WOMEN", material: "Rayon", cost: 380, mrp: 1299, sell: 999, whole: 780, colors: ["Red", "Pink", "Green"], sizes: ["S", "M", "L", "XL"], minStock: 6 },
        { name: "Slim Fit Denim Jeans", code: "JN001", cat: "Jeans & Trousers", col: "Essentials", type: "JEANS", gender: "MEN", material: "Denim", cost: 580, mrp: 1999, sell: 1599, whole: 1250, colors: ["Navy", "Black"], sizes: ["S", "M", "L", "XL"], minStock: 5 },
        { name: "Floral Summer Dress", code: "DR001", cat: "Dresses", col: "Summer 2026", type: "DRESS", gender: "WOMEN", material: "Rayon", cost: 480, mrp: 1799, sell: 1399, whole: 1100, colors: ["Pink", "Yellow"], sizes: ["S", "M", "L"], minStock: 4 },
        { name: "Fleece Hoodie", code: "HD001", cat: "Hoodies & Jackets", col: "Essentials", type: "HOODIE", gender: "UNISEX", material: "Polyester", cost: 620, mrp: 2199, sell: 1699, whole: 1350, colors: ["Black", "Grey", "Navy"], sizes: ["M", "L", "XL"], minStock: 4 },
      ]

      const allVariantIds: string[] = []
      let pIdx = 0
      for (const pd of pDefs) {
        pIdx++
        const product = await tx.product.create({
          data: {
            name: pd.name, code: pd.code,
            categoryId: cats[pd.cat], collectionId: cols[pd.col],
            productType: pd.type, gender: pd.gender,
            materialId: matMap.get(pd.material) ?? null,
            brand: "VastraCo",
            costPrice: pd.cost, mrp: pd.mrp, sellingPrice: pd.sell, wholesalePrice: pd.whole,
            taxRate: 5, minStock: pd.minStock,
            supplierId: pick(sups),
          },
        })
        for (const colorName of pd.colors) {
          for (const sizeName of pd.sizes) {
            const sku = `${pd.code}-${colorName.slice(0, 3).toUpperCase()}-${sizeName}`
            const v = await tx.productVariant.create({
              data: {
                productId: product.id, sku,
                barcode: `890${String(rand(1000000000, 9999999999)).slice(0, 10)}`,
                sizeId: sizeMap.get(sizeName) ?? null, colorId: colorMap.get(colorName) ?? null,
                costPrice: pd.cost, mrp: pd.mrp, sellingPrice: pd.sell,
              },
            })
            allVariantIds.push(v.id)
            // Opening stock in both warehouses
            const qtyMain = rand(8, 30)
            const qtyWh = rand(10, 40)
            await applyStockChange(tx, { variantId: v.id, warehouseId: mainShop.id, delta: qtyMain, type: "OPENING", note: "Demo opening stock" })
            await applyStockChange(tx, { variantId: v.id, warehouseId: warehouse.id, delta: qtyWh, type: "OPENING", note: "Demo opening stock" })
          }
        }
      }

      // ---------- Purchases ----------
      for (let i = 0; i < 3; i++) {
        const supplierId = sups[i % sups.length]
        const pickVariants = allVariantIds.slice(rand(0, 5), rand(6, 12))
        const items = pickVariants.map((vid) => {
          const v = pickVariants.includes(vid) ? vid : null
          return v
        }).filter(Boolean)
        const chosen = pickVariants.slice(0, Math.min(4, pickVariants.length))
        const count = await tx.counter.upsert({ where: { key: "PUR" }, update: { value: { increment: 1 } }, create: { key: "PUR", value: 1 } })
        const number = `PUR-${String(count.value).padStart(5, "0")}`
        let subtotal = 0
        const lines: { vid: string; qty: number; v: any }[] = []
        for (const vid of chosen) {
          const v = await tx.productVariant.findUnique({ where: { id: vid }, include: { product: true, size: true, color: true } })
          if (!v) continue
          const qty = rand(20, 60)
          subtotal += v.costPrice * qty
          lines.push({ vid, qty, v })
        }
        const total = subtotal * 1.05
        const purchase = await tx.purchase.create({
          data: {
            number, supplierId, status: "RECEIVED",
            orderDate: daysAgo(30 - i * 9), receivedAt: daysAgo(28 - i * 9),
            subtotal, taxAmount: subtotal * 0.05, total,
            dueAmount: i === 2 ? total * 0.5 : 0,
            paidAmount: i === 2 ? total * 0.5 : total,
            paymentStatus: i === 2 ? "PARTIAL" : "PAID",
            createdByName: "Demo",
            items: {
              create: lines.map((l) => ({
                variantId: l.vid, productName: l.v.product.name,
                variantLabel: [l.v.color?.name, l.v.size?.name].filter(Boolean).join(" / "),
                quantity: l.qty, receivedQty: l.qty, unitCost: l.v.costPrice, taxRate: 5, lineTotal: l.v.costPrice * l.qty * 1.05,
              })),
            },
          },
        })
        for (const l of lines) {
          await applyStockChange(tx, { variantId: l.vid, warehouseId: warehouse.id, delta: l.qty, type: "PURCHASE", referenceType: "PURCHASE", referenceId: purchase.id, note: `Demo purchase ${number}` })
        }
        await postSupplierLedger(tx, supplierId, purchase.orderDate, `Purchase ${number} (goods received)`, total, 0, "PURCHASE", purchase.id)
        const payAmount = i === 2 ? total * 0.5 : total
        await applySupplierPayment(tx, {
          supplierId, purchaseId: purchase.id, amount: payAmount, method: pick(["CASH", "UPI", "BANK"]),
          date: daysAgo(25 - i * 9), user,
        })
      }

      // ---------- Sales over last 30 days ----------
      const custById = await tx.customer.findMany()
      for (let d = 29; d >= 0; d--) {
        const salesToday = d < 3 ? rand(1, 3) : Math.random() < 0.7 ? rand(0, 2) : 0
        for (let s = 0; s < salesToday; s++) {
          const itemCount = rand(1, 4)
          const items: { variantId: string; quantity: number; unitPrice: number }[] = []
          for (let it = 0; it < itemCount; it++) {
            const vid = pick(allVariantIds)
            const v = await tx.productVariant.findUnique({ where: { id: vid } })
            if (!v) continue
            items.push({ variantId: vid, quantity: rand(1, 3), unitPrice: v.sellingPrice })
          }
          if (!items.length) continue
          const customer = Math.random() < 0.75 ? pick(custById) : null
          const isWholesale = customer?.type === "WHOLESALE"
          if (isWholesale) {
            for (const item of items) {
              const v = await tx.productVariant.findUnique({ where: { id: item.variantId }, include: { product: true } })
              item.unitPrice = v?.product.wholesalePrice || item.unitPrice
              item.quantity = rand(5, 15)
            }
          }
          const totalEst = items.reduce((sm, i) => sm + i.unitPrice * i.quantity, 0) * 1.05
          const roll = Math.random()
          let payments: { method: string; amount: number }[] = []
          if (roll < 0.55) payments = [{ method: "CASH", amount: totalEst }]
          else if (roll < 0.85) payments = [{ method: "UPI", amount: totalEst }]
          else if (roll < 0.92) payments = [{ method: "CARD", amount: totalEst }]
          else if (customer) payments = [{ method: "CASH", amount: Math.round(totalEst * 0.6) }] // partial/credit
          if (d > 25 && customer && roll >= 0.92) payments = [] // older credit sale, later settled
          try {
            const sale = await createSale(tx, {
              customerId: customer?.id ?? null,
              type: isWholesale ? "WHOLESALE" : "RETAIL",
              warehouseId: mainShop.id,
              items, payments,
              date: daysAgo(d, rand(10, 20)),
              salespersonName: pick(["Asha (Sales)", "Demo Owner"]),
            }, user)
            // settle older credit sales later
            if (roll >= 0.92 && customer && d > 15 && Math.random() < 0.8) {
              await applyCustomerPayment(tx, {
                customerId: customer.id, saleId: sale.id,
                amount: sale.dueAmount > 0 ? sale.dueAmount : sale.total,
                method: pick(["CASH", "UPI"]),
                date: daysAgo(d - rand(3, 8), 15),
                user,
              })
            }
          } catch (e) {
            // stock insufficient — skip demo sale
          }
        }
      }

      // ---------- Expenses ----------
      const expDefs: [string, string, number, number][] = [
        ["RENT", "Shop rent", 25000, 25], ["ELECTRICITY", "Electricity bill", 4800, 20],
        ["SALARY", "Staff salary (paid extra)", 18000, 15], ["MARKETING", "Instagram ads", 3500, 12],
        ["PACKAGING", "Poly bags & boxes", 2200, 8], ["TRANSPORT", "Courier charges", 1800, 5],
        ["INTERNET", "Broadband bill", 1200, 3], ["REPAIRS", "Sewing machine repair", 900, 2],
      ]
      for (const [category, description, amount, ago] of expDefs) {
        const { createPayment } = await import("@/lib/server/services/core")
        const payment = await createPayment(tx, {
          direction: "OUT", method: pick(["CASH", "UPI"]), category: "EXPENSE",
          amount, date: daysAgo(ago), notes: description,
        }, user)
        await tx.expense.create({
          data: { category, description, amount, date: daysAgo(ago), method: "CASH", paymentId: payment.id, createdByName: "Demo" },
        })
      }

      // ---------- Staff ----------
      const empDefs: [string, string, number][] = [
        ["Asha Verma", "SALES_PERSON", 18000], ["Ramesh Yadav", "HELPER", 12000],
        ["Suresh Tailor", "TAILOR", 16000],
      ]
      const employeeIds: string[] = []
      for (let i = 0; i < empDefs.length; i++) {
        const [name, designation, salary] = empDefs[i]
        const e = await tx.employee.create({
          data: { code: `EMP${String(i + 1).padStart(3, "0")}`, name, designation, salary, joiningDate: daysAgo(rand(100, 400)), phone: `98111${rand(10000, 99999)}` },
        })
        employeeIds.push(e.id)
        // attendance for last 5 days
        for (let d = 0; d < 5; d++) {
          const date = new Date(Date.now() - d * 86400000)
          const ist = new Date(date.getTime() + 5.5 * 3600000)
          const ymd = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`
          await tx.attendance.upsert({
            where: { employeeId_date: { employeeId: e.id, date: ymd } },
            update: {},
            create: { employeeId: e.id, date: ymd, status: Math.random() < 0.85 ? "PRESENT" : pick(["ABSENT", "LEAVE", "HALF_DAY"]) },
          })
        }
        // salary payment
        const { createPayment } = await import("@/lib/server/services/core")
        const payment = await createPayment(tx, {
          direction: "OUT", method: "CASH", category: "SALARY", amount: salary,
          date: daysAgo(15), employeeId: e.id, notes: `Salary — ${name}`,
        }, user)
        await tx.salaryPayment.create({
          data: { employeeId: e.id, type: "SALARY", month: new Date().toISOString().slice(0, 7), amount: salary, method: "CASH", date: daysAgo(15), paymentId: payment.id },
        })
        await tx.expense.create({
          data: { category: "SALARY", description: `Salary — ${name}`, amount: salary, date: daysAgo(15), method: "CASH", paymentId: payment.id, createdByName: "Demo" },
        })
      }

      // ---------- Contractors & Job Work ----------
      const contractorDefs: [string, string, number][] = [
        ["ABC Stitching Works", "STITCHING", 80], ["Lakshmi Tailors", "TAILOR", 120],
        ["ColorFast Printing", "PRINTING", 25],
      ]
      const contractorIds: string[] = []
      for (let i = 0; i < contractorDefs.length; i++) {
        const [name, type, rate] = contractorDefs[i]
        const c = await tx.contractor.create({
          data: { name, type, rate, phone: `98300${rand(10000, 99999)}`, address: "Readymarket, Surat" },
        })
        contractorIds.push(c.id)
      }
      const jwDefs: [number, string, number, number, string][] = [
        [0, "Premium Cotton T-Shirt stitching", 100, 55, "PROCESSING"],
        [1, "Oxford Formal Shirt stitching", 60, 60, "COMPLETED"],
        [2, "Graphic Print Tee printing", 150, 0, "ASSIGNED"],
      ]
      for (const [ci, description, qty, completed, status] of jwDefs) {
        const contractorId = contractorIds[ci]
        const rate = contractorDefs[ci][2]
        const count = await tx.counter.upsert({ where: { key: "JW" }, update: { value: { increment: 1 } }, create: { key: "JW", value: 1 } })
        const number = `JW-${String(count.value).padStart(5, "0")}`
        await tx.jobWork.create({
          data: {
            number, contractorId, description, quantity: qty,
            completedQty: completed, rate, totalAmount: completed * rate,
            status: completed >= qty ? "COMPLETED" : completed > 0 ? "PROCESSING" : "ASSIGNED",
            assignedAt: daysAgo(rand(5, 20)), dueDate: daysAgo(-rand(2, 10)),
            createdByName: "Demo",
          },
        })
        if (completed > 0) {
          await tx.contractor.update({ where: { id: contractorId }, data: { outstanding: { increment: completed * rate } } })
        }
      }

      // ---------- Raw materials ----------
      const rmDefs: [string, string, string, number, number, number][] = [
        ["Cotton fabric — 180 GSM", "FABRIC", "METER", 850, 200, 145],
        ["Polyester thread spools", "THREAD", "PIECE", 320, 50, 18],
        ["Printed labels", "LABEL", "PIECE", 5000, 1000, 1.5],
        ["Zipper (5 inch)", "ZIPPER", "PIECE", 400, 100, 6],
        ["Poly bags 12×16", "PACKAGING", "PIECE", 2200, 500, 1.2],
      ]
      for (const [name, type, unit, quantity, minQuantity, costPerUnit] of rmDefs) {
        await tx.rawMaterial.create({ data: { name, type, unit, quantity, minQuantity, costPerUnit, supplierId: sups[0] } })
      }

      // ---------- Tasks ----------
      const taskDefs: [string, string, string | null, number][] = [
        ["Prepare Festive Collection inventory", "HIGH", "Asha Verma", 5],
        ["Reorder low-stock t-shirts", "URGENT", "Ramesh Yadav", 1],
        ["Update supplier price list", "MEDIUM", null, 10],
        ["Monthly GST summary", "HIGH", null, 7],
        ["Plan winter hoodie production", "LOW", "Suresh Tailor", 25],
      ]
      for (const [title, priority, assignedTo, due] of taskDefs) {
        await tx.task.create({
          data: {
            title, priority, assignedTo,
            dueDate: daysAgo(-due),
            status: Math.random() < 0.2 ? "IN_PROGRESS" : "PENDING",
            createdByName: "Demo",
          },
        })
      }

      await tx.setting.upsert({ where: { key: "demo_loaded" }, update: { value: "1" }, create: { key: "demo_loaded", value: "1" } })
      await audit(tx, ctx.user, "settings", "CREATE", null, { action: "demo_data_loaded" })
    }, { timeout: 60000, maxWait: 20000 })

    return json({ ok: true })
  }

  return null
}
