import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { presetRange } from "@/lib/format"

export async function handle(ctx: Ctx) {
  if (ctx.method !== "GET") return null
  const type = ctx.segs[1] ?? "sales"
  const preset = ctx.params.get("preset") ?? "this_month"
  const { from, to } = presetRange(preset, ctx.params.get("from") ?? undefined, ctx.params.get("to") ?? undefined)

  // ============================================================
  // SALES REPORT
  // ============================================================
  if (type === "sales") {
    ctx.requirePerm("reports", "view")
    const [sales, items] = await Promise.all([
      db.sale.findMany({ where: { status: "COMPLETED", date: { gte: from, lte: to } }, include: { customer: true } }),
      db.saleItem.findMany({
        where: { sale: { status: "COMPLETED", date: { gte: from, lte: to } } },
        include: { variant: { include: { product: { include: { category: true } }, size: true, color: true } } },
      }),
    ])
    const payments = await db.payment.findMany({
      where: { status: "VERIFIED", direction: "IN", date: { gte: from, lte: to }, category: { in: ["SALE_RECEIPT", "CUSTOMER_PAYMENT"] } },
    })
    const methodTotals: Record<string, number> = { CASH: 0, UPI: 0, CARD: 0, BANK: 0 }
    for (const p of payments) methodTotals[p.method] = (methodTotals[p.method] ?? 0) + p.amount

    // by day
    const byDay = new Map<string, { date: string; total: number; count: number }>()
    for (const s of sales) {
      const day = new Date(s.date).toISOString().slice(0, 10)
      const rec = byDay.get(day) ?? { date: day, total: 0, count: 0 }
      rec.total += s.total
      rec.count += 1
      byDay.set(day, rec)
    }
    // top products
    const prodMap = new Map<string, { name: string; sku: string; units: number; revenue: number; cogs: number }>()
    for (const i of items) {
      const key = i.variantId
      const rec = prodMap.get(key) ?? { name: i.productName, sku: i.variant.sku, units: 0, revenue: 0, cogs: 0 }
      rec.units += i.quantity - i.returnedQty
      rec.revenue += (i.lineTotal / i.quantity) * (i.quantity - i.returnedQty)
      rec.cogs += i.costPrice * (i.quantity - i.returnedQty)
      prodMap.set(key, rec)
    }
    // category-wise
    const catMap = new Map<string, number>()
    for (const i of items) {
      const cat = i.variant.product.category?.name ?? "Uncategorized"
      catMap.set(cat, (catMap.get(cat) ?? 0) + i.lineTotal)
    }
    // salesperson-wise
    const staffMap = new Map<string, number>()
    for (const s of sales) {
      const name = s.salespersonName ?? "—"
      staffMap.set(name, (staffMap.get(name) ?? 0) + s.total)
    }
    // customer-wise top
    const custMap = new Map<string, { name: string; total: number; count: number }>()
    for (const s of sales) {
      if (!s.customerId) continue
      const rec = custMap.get(s.customerId) ?? { name: s.customer?.name ?? "—", total: 0, count: 0 }
      rec.total += s.total
      rec.count++
      custMap.set(s.customerId, rec)
    }
    return json({
      type, period: { from, to, preset },
      summary: {
        totalSales: sales.reduce((s, x) => s + x.total, 0),
        invoiceCount: sales.length,
        avgSale: sales.length ? sales.reduce((s, x) => s + x.total, 0) / sales.length : 0,
        due: sales.reduce((s, x) => s + x.dueAmount, 0),
        cogs: items.reduce((s, i) => s + i.costPrice * (i.quantity - i.returnedQty), 0),
        grossProfit: sales.reduce((s, x) => s + x.total, 0) - items.reduce((s, i) => s + i.costPrice * (i.quantity - i.returnedQty), 0),
      },
      methodTotals,
      byDay: Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)),
      topProducts: Array.from(prodMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 20),
      byCategory: Array.from(catMap.entries()).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total),
      bySalesperson: Array.from(staffMap.entries()).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total),
      topCustomers: Array.from(custMap.values()).sort((a, b) => b.total - a.total).slice(0, 15),
    })
  }

  // ============================================================
  // INVENTORY REPORT
  // ============================================================
  if (type === "inventory") {
    ctx.requirePerm("reports", "view")
    const sub = ctx.params.get("sub") ?? "valuation"
    const variants = await db.productVariant.findMany({
      include: { product: { include: { category: true } }, size: true, color: true, stockLevels: { include: { warehouse: true } } },
    })
    const rows = variants.map((v) => {
      const total = v.stockLevels.reduce((s, l) => s + l.quantity, 0)
      return {
        sku: v.sku, product: v.product.name, category: v.product.category?.name ?? "—",
        variant: [v.color?.name, v.size?.name].filter(Boolean).join(" / ") || "Default",
        stock: total, costPrice: v.costPrice, sellingPrice: v.sellingPrice,
        stockValue: total * v.costPrice, retailValue: total * v.sellingPrice,
        minStock: v.product.minStock,
        status: total <= 0 ? "OUT" : total <= v.product.minStock ? "LOW" : "OK",
      }
    })
    let filtered = rows
    if (sub === "low") filtered = rows.filter((r) => r.status === "LOW")
    else if (sub === "out") filtered = rows.filter((r) => r.status === "OUT")

    // fast / slow sellers in period
    const items = await db.saleItem.findMany({
      where: { sale: { status: "COMPLETED", date: { gte: from, lte: to } } },
    })
    const soldMap = new Map<string, number>()
    for (const i of items) soldMap.set(i.variantId, (soldMap.get(i.variantId) ?? 0) + i.quantity)
    const fastSelling = Array.from(soldMap.entries())
      .map(([variantId, units]) => {
        const v = variants.find((x) => x.id === variantId)
        return { sku: v?.sku ?? variantId, product: v?.product.name ?? "—", units }
      })
      .sort((a, b) => b.units - a.units).slice(0, 20)
    const slowSelling = variants.filter((v) => !soldMap.has(v.id) && v.stockLevels.reduce((s, l) => s + l.quantity, 0) > 0)
      .map((v) => ({ sku: v.sku, product: v.product.name, units: 0, stock: v.stockLevels.reduce((s, l) => s + l.quantity, 0) }))
      .slice(0, 20)

    return json({
      type, sub, period: { from, to, preset },
      summary: {
        totalVariants: rows.length,
        totalUnits: rows.reduce((s, r) => s + r.stock, 0),
        totalValue: rows.reduce((s, r) => s + r.stockValue, 0),
        retailValue: rows.reduce((s, r) => s + r.retailValue, 0),
        lowCount: rows.filter((r) => r.status === "LOW").length,
        outCount: rows.filter((r) => r.status === "OUT").length,
      },
      rows: filtered, fastSelling, slowSelling,
    })
  }

  // ============================================================
  // PAYMENTS REPORT
  // ============================================================
  if (type === "payments") {
    ctx.requirePerm("reports", "view")
    const payments = await db.payment.findMany({
      where: { date: { gte: from, lte: to } },
      include: { customer: true, supplier: true },
      orderBy: { date: "desc" },
    })
    const byMethod: Record<string, number> = {}
    const byCategory: Record<string, number> = {}
    let totalIn = 0, totalOut = 0, unmatched = 0, refunds = 0
    for (const p of payments) {
      if (p.status === "VOID") continue
      if (p.status === "UNMATCHED") unmatched += p.amount
      if (p.category === "REFUND") refunds += p.amount
      byMethod[p.method] = (byMethod[p.method] ?? 0) + (p.direction === "IN" ? p.amount : -p.amount)
      byCategory[p.category] = (byCategory[p.category] ?? 0) + (p.direction === "IN" ? p.amount : -p.amount)
      if (p.direction === "IN") totalIn += p.amount
      else totalOut += p.amount
    }
    return json({
      type, period: { from, to, preset },
      summary: { totalIn, totalOut, net: totalIn - totalOut, unmatched, refunds },
      byMethod, byCategory,
      payments: payments.slice(0, 500),
    })
  }

  // ============================================================
  // CUSTOMERS REPORT
  // ============================================================
  if (type === "customers") {
    ctx.requirePerm("reports", "view")
    const customers = await db.customer.findMany({
      include: { sales: { where: { status: "COMPLETED", date: { gte: from, lte: to } } } },
    })
    const rows = customers.map((c) => ({
      name: c.name, code: c.code, phone: c.phone, type: c.type,
      purchases: c.sales.reduce((s, x) => s + x.total, 0),
      invoiceCount: c.sales.length,
      outstanding: c.outstanding,
    })).sort((a, b) => b.purchases - a.purchases)
    return json({
      type, period: { from, to, preset },
      summary: {
        totalCustomers: customers.length,
        activeCustomers: rows.filter((r) => r.invoiceCount > 0).length,
        totalRevenue: rows.reduce((s, r) => s + r.purchases, 0),
        totalOutstanding: customers.filter((c) => c.outstanding > 0).reduce((s, c) => s + c.outstanding, 0),
      },
      top: rows.slice(0, 30),
      outstanding: rows.filter((r) => r.outstanding > 0).slice(0, 50),
    })
  }

  // ============================================================
  // SUPPLIERS REPORT
  // ============================================================
  if (type === "suppliers") {
    ctx.requirePerm("reports", "view")
    const suppliers = await db.supplier.findMany({
      include: { purchases: { where: { orderDate: { gte: from, lte: to } } } },
    })
    const rows = suppliers.map((s) => ({
      name: s.name, code: s.code,
      purchases: s.purchases.filter((p) => p.status !== "CANCELLED").reduce((sm, p) => sm + p.total, 0),
      purchaseCount: s.purchases.length,
      outstanding: s.outstanding,
    })).sort((a, b) => b.purchases - a.purchases)
    return json({
      type, period: { from, to, preset },
      summary: {
        totalSuppliers: suppliers.length,
        totalPurchases: rows.reduce((s, r) => s + r.purchases, 0),
        totalOutstanding: suppliers.filter((s) => s.outstanding > 0).reduce((s, x) => s + x.outstanding, 0),
      },
      rows,
    })
  }

  // ============================================================
  // PRODUCTION REPORT
  // ============================================================
  if (type === "production") {
    ctx.requirePerm("reports", "view")
    const [jobWorks, contractors, productionOrders] = await Promise.all([
      db.jobWork.findMany({ where: { assignedAt: { gte: from, lte: to } }, include: { contractor: true } }),
      db.contractor.findMany({ include: { jobWorks: true } }),
      db.productionOrder.findMany({ where: { startDate: { gte: from, lte: to } }, include: { contractor: true } }),
    ])
    return json({
      type, period: { from, to, preset },
      summary: {
        jobWorks: jobWorks.length,
        piecesAssigned: jobWorks.reduce((s, j) => s + j.quantity, 0),
        piecesCompleted: jobWorks.reduce((s, j) => s + j.completedQty, 0),
        laborCost: jobWorks.reduce((s, j) => s + j.totalAmount, 0),
        outstandingPayable: contractors.reduce((s, c) => s + Math.max(0, c.outstanding), 0),
        productionOrders: productionOrders.length,
        completedOrders: productionOrders.filter((o) => o.status === "COMPLETED").length,
      },
      contractorPerformance: contractors.map((c) => ({
        name: c.name, type: c.type,
        works: c.jobWorks.length,
        assigned: c.jobWorks.reduce((s, j) => s + j.quantity, 0),
        completed: c.jobWorks.reduce((s, j) => s + j.completedQty, 0),
        earned: c.jobWorks.reduce((s, j) => s + j.totalAmount, 0),
        outstanding: c.outstanding,
      })).sort((a, b) => b.earned - a.earned),
      jobWorks: jobWorks.slice(0, 200),
    })
  }

  // ============================================================
  // FINANCE / P&L
  // ============================================================
  if (type === "finance" || type === "pnl") {
    ctx.requirePerm("reports", "view")
    const [sales, items, returns, expenses, jobWorks] = await Promise.all([
      db.sale.findMany({ where: { status: "COMPLETED", date: { gte: from, lte: to } } }),
      db.saleItem.findMany({ where: { sale: { status: "COMPLETED", date: { gte: from, lte: to } } } }),
      db.returnRecord.findMany({ where: { createdAt: { gte: from, lte: to } } }),
      db.expense.findMany({ where: { date: { gte: from, lte: to } } }),
      db.jobWork.findMany({ where: { completedAt: { gte: from, lte: to } } }),
    ])
    const gross = sales.reduce((s, x) => s + x.total, 0)
    const returnsValue = returns.reduce((s, r) => s + r.totalValue, 0)
    const net = gross - returnsValue
    const cogs = items.reduce((s, i) => s + i.costPrice * (i.quantity - i.returnedQty), 0)
    const grossProfit = net - cogs
    const opex = expenses.reduce((s, e) => s + e.amount, 0)
    const productionCost = jobWorks.reduce((s, j) => s + j.totalAmount, 0)
    return json({
      type, period: { from, to, preset },
      revenue: { gross, returns: returnsValue, net },
      cogs, grossProfit,
      opex: { total: opex, byCategory: expenses.reduce((acc: Record<string, number>, e) => { acc[e.category] = (acc[e.category] ?? 0) + e.amount; return acc }, {}) },
      productionCost,
      netProfit: grossProfit - opex - productionCost,
    })
  }

  return null
}
