import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum, parseDate, requireStr } from "@/lib/server/helpers"
import { applyStockChange, checkStockAlerts, postSupplierLedger, applySupplierPayment, SessionInfo } from "@/lib/server/services/core"

export async function handle(ctx: Ctx) {
  const [, seg1, seg2] = ctx.segs

  // ---------- LIST ----------
  if (ctx.method === "GET" && !seg1) {
    ctx.requirePerm("purchases", "view")
    const q = ctx.params.get("q")?.toLowerCase()
    const status = ctx.params.get("status")
    const supplierId = ctx.params.get("supplierId")
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(200, parseInt(ctx.params.get("pageSize") ?? "50"))
    const where: any = {}
    if (status) where.status = status
    if (supplierId) where.supplierId = supplierId
    if (q) where.OR = [{ number: { contains: q } }, { supplier: { name: { contains: q } } }]
    const [total, purchases, agg] = await Promise.all([
      db.purchase.count({ where }),
      db.purchase.findMany({
        where, orderBy: { orderDate: "desc" },
        skip: (page - 1) * pageSize, take: pageSize,
        include: { supplier: true, items: true },
      }),
      db.purchase.aggregate({ where: { ...where, status: "RECEIVED" }, _sum: { total: true, dueAmount: true } }),
    ])
    return json({ purchases, total, page, pageSize, sum: { total: agg._sum.total ?? 0, due: agg._sum.dueAmount ?? 0 } })
  }

  // ---------- CREATE (PO or direct purchase) ----------
  if (ctx.method === "POST" && !seg1) {
    ctx.requirePerm("purchases", "create")
    const b = ctx.body ?? {}
    const supplierId = requireStr(b.supplierId, "Supplier")
    const items = Array.isArray(b.items) ? b.items : []
    if (!items.length) throw new AppError("Add at least one item")
    const directReceive = b.receiveNow === true // direct purchase: skip PO state

    const purchase = await db.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: supplierId } })
      if (!supplier) throw new AppError("Supplier not found", 404)
      const business = await tx.businessProfile.findFirst()

      let subtotal = 0, taxAmount = 0
      const lines: any[] = []
      for (const item of items) {
        const v = await tx.productVariant.findUnique({ where: { id: item.variantId }, include: { product: true, size: true, color: true } })
        if (!v) throw new AppError("Product variant not found in purchase items")
        const qty = Math.round(optNum(item.quantity, 0))
        if (qty < 1) throw new AppError("Quantity must be at least 1")
        const unitCost = optNum(item.unitCost, v.costPrice || v.product.costPrice)
        const taxRate = optNum(item.taxRate, 0)
        const lineTotal = unitCost * qty * (1 + taxRate / 100)
        subtotal += unitCost * qty
        taxAmount += unitCost * qty * taxRate / 100
        lines.push({
          variantId: v.id, productName: v.product.name,
          variantLabel: [v.color?.name, v.size?.name].filter(Boolean).join(" / ") || "Default",
          quantity: qty, unitCost, taxRate, lineTotal,
        })
      }
      const discountAmount = Math.max(0, optNum(b.discountAmount, 0))
      const total = Math.max(0, subtotal - discountAmount + taxAmount)

      const count = await tx.counter.upsert({ where: { key: "PUR" }, update: { value: { increment: 1 } }, create: { key: "PUR", value: 1 } })
      const number = `${business?.purchasePrefix ?? "PUR"}-${String(count.value).padStart(5, "0")}`

      const created = await tx.purchase.create({
        data: {
          number, supplierId,
          status: directReceive ? "RECEIVED" : "ORDERED",
          orderDate: b.orderDate ? parseDate(b.orderDate) : new Date(),
          expectedDate: b.expectedDate ? parseDate(b.expectedDate) : null,
          receivedAt: directReceive ? new Date() : null,
          subtotal, discountAmount, taxAmount, total,
          paidAmount: 0, dueAmount: total,
          paymentStatus: "UNPAID",
          notes: optStr(b.notes, 1000),
          createdByName: ctx.user?.fullName ?? "System",
          items: { create: lines },
        },
        include: { items: true, supplier: true },
      })

      // Direct receive → increase stock + payable
      if (directReceive) {
        const warehouse = (await tx.warehouse.findFirst({ where: { isDefault: true } })) ?? await tx.warehouse.findFirst()
        if (warehouse) {
          for (const line of lines) {
            await applyStockChange(tx, {
              variantId: line.variantId, warehouseId: warehouse.id, delta: line.quantity,
              type: "PURCHASE", referenceType: "PURCHASE", referenceId: created.id,
              note: `Purchase ${number}`, userName: ctx.user?.fullName,
            })
            await tx.purchaseItem.updateMany({ where: { purchaseId: created.id, variantId: line.variantId }, data: { receivedQty: line.quantity } })
            await tx.productVariant.update({ where: { id: line.variantId }, data: { costPrice: line.unitCost } })
            await checkStockAlerts(tx, line.variantId)
          }
        }
        await postSupplierLedger(tx, supplierId, created.orderDate, `Purchase ${number} (goods received)`, total, 0, "PURCHASE", created.id)
      }

      // Optional immediate payment
      if (directReceive && b.payNowAmount && optNum(b.payNowAmount, 0) > 0) {
        await applySupplierPayment(tx, {
          supplierId, purchaseId: created.id, amount: optNum(b.payNowAmount, 0),
          method: ["CASH", "UPI", "CARD", "BANK"].includes(b.payNowMethod) ? b.payNowMethod : "CASH",
          notes: `Paid at purchase ${number}`,
          user: ctx.user as SessionInfo,
        })
      }

      return created
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "purchases", "CREATE", purchase.id, { number: purchase.number, total: purchase.total, direct: directReceive }))
    return json({ purchase })
  }

  // ---------- GET ONE ----------
  if (ctx.method === "GET" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("purchases", "view")
    const purchase = await db.purchase.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: { include: { variant: { include: { product: true, size: true, color: true } } } },
      },
    })
    if (!purchase) throw new AppError("Purchase not found", 404)
    const payments = await db.payment.findMany({ where: { purchaseId: id }, orderBy: { date: "desc" } })
    return json({ purchase: { ...purchase, payments } })
  }

  // ---------- RECEIVE GOODS ----------
  if (ctx.method === "POST" && seg1 && seg2 === "receive") {
    const id = seg1
    ctx.requirePerm("purchases", "edit")
    const result = await db.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id }, include: { items: true } })
      if (!purchase) throw new AppError("Purchase not found", 404)
      if (purchase.status === "RECEIVED") throw new AppError("Purchase already received")
      if (purchase.status === "CANCELLED") throw new AppError("Purchase was cancelled")

      const warehouse = (await tx.warehouse.findFirst({ where: { isDefault: true } })) ?? await tx.warehouse.findFirst()
      if (!warehouse) throw new AppError("No warehouse configured")

      for (const item of purchase.items) {
        const pending = item.quantity - item.receivedQty
        if (pending <= 0) continue
        await applyStockChange(tx, {
          variantId: item.variantId, warehouseId: warehouse.id, delta: pending,
          type: "PURCHASE", referenceType: "PURCHASE", referenceId: purchase.id,
          note: `Purchase ${purchase.number}`, userName: ctx.user?.fullName,
        })
        await tx.purchaseItem.update({ where: { id: item.id }, data: { receivedQty: item.quantity } })
        await tx.productVariant.update({ where: { id: item.variantId }, data: { costPrice: item.unitCost } })
        await checkStockAlerts(tx, item.variantId)
      }

      await postSupplierLedger(tx, purchase.supplierId, new Date(), `Purchase ${purchase.number} (goods received)`, purchase.total, 0, "PURCHASE", purchase.id)
      return tx.purchase.update({ where: { id }, data: { status: "RECEIVED", receivedAt: new Date() } })
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "purchases", "RECEIVE", id, { number: result.number }))
    return json({ purchase: result })
  }

  // ---------- PAY SUPPLIER ----------
  if (ctx.method === "POST" && seg1 && seg2 === "pay") {
    const id = seg1
    ctx.requirePerm("purchases", "pay")
    const b = ctx.body ?? {}
    const amount = optNum(b.amount, 0)
    if (amount <= 0) throw new AppError("Amount must be greater than zero")
    const payment = await db.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({ where: { id } })
      if (!purchase) throw new AppError("Purchase not found", 404)
      if (purchase.status === "ORDERED") throw new AppError("Receive goods before paying")
      return applySupplierPayment(tx, {
        supplierId: purchase.supplierId, purchaseId: purchase.id, amount,
        method: ["CASH", "UPI", "CARD", "BANK"].includes(b.method) ? b.method : "CASH",
        date: b.date ? parseDate(b.date) : undefined,
        notes: optStr(b.notes, 500),
        user: ctx.user as SessionInfo,
      })
    }, { timeout: 60000, maxWait: 20000 })
    return json({ payment })
  }

  // ---------- CANCEL PO ----------
  if (ctx.method === "POST" && seg1 && seg2 === "cancel") {
    const id = seg1
    ctx.requirePerm("purchases", "edit")
    const purchase = await db.$transaction(async (tx) => {
      const p = await tx.purchase.findUnique({ where: { id } })
      if (!p) throw new AppError("Purchase not found", 404)
      if (p.status === "RECEIVED") throw new AppError("Received purchases cannot be cancelled — they carry stock and payables")
      if (p.paidAmount > 0) throw new AppError("Purchase has payments against it")
      return tx.purchase.update({ where: { id }, data: { status: "CANCELLED" } })
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "purchases", "VOID", id, { number: purchase.number }))
    return json({ purchase })
  }

  return null
}
