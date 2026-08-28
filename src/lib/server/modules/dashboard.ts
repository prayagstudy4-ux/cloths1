import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { istDayStartUTC, istDayEndUTC, monthStartIST } from "@/lib/format"

export async function handle(ctx: Ctx) {
  if (ctx.method !== "GET") return null
  ctx.requirePerm("dashboard", "view")

  const todayStart = istDayStartUTC()
  const todayEnd = istDayEndUTC()
  const monthStart = monthStartIST()
  const trendStart = istDayStartUTC(new Date(Date.now() - 13 * 86400000))

  const [todaySales, todayPayments, todayExpenses, todayReturns, customers, suppliers, contractors, stockLevels, pendingOrders, jobWorks, tasks, notifications, recentPayments, recentSales, recentCustomers, recentPurchases, recentExpenses, trendSales, monthExpenses, monthSales, monthItems, cashSession] = await Promise.all([
    db.sale.findMany({ where: { status: "COMPLETED", date: { gte: todayStart, lte: todayEnd } }, include: { items: true } }),
    db.payment.findMany({ where: { status: "VERIFIED", direction: "IN", date: { gte: todayStart, lte: todayEnd } } }),
    db.expense.findMany({ where: { date: { gte: todayStart, lte: todayEnd } } }),
    db.returnRecord.findMany({ where: { createdAt: { gte: todayStart, lte: todayEnd } } }),
    db.customer.findMany(),
    db.supplier.findMany(),
    db.contractor.findMany(),
    db.stockLevel.findMany({ include: { variant: { include: { product: true, size: true, color: true } } } }),
    db.order.findMany({ where: { status: { in: ["CONFIRMED", "PROCESSING", "PACKED", "READY", "DISPATCHED"] } }, orderBy: { orderDate: "desc" }, take: 8, include: { customer: true } }),
    db.jobWork.findMany({ where: { status: { in: ["ASSIGNED", "PROCESSING"] } }, include: { contractor: true }, orderBy: { assignedAt: "desc" }, take: 8 }),
    db.task.findMany({ where: { status: { in: ["PENDING", "IN_PROGRESS"] } }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 8 }),
    db.notification.findMany({ where: { read: false }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.payment.findMany({ where: { status: "VERIFIED" }, orderBy: { date: "desc" }, take: 8, include: { customer: true, supplier: true } }),
    db.sale.findMany({ where: { status: "COMPLETED" }, orderBy: { date: "desc" }, take: 8, include: { customer: true } }),
    db.customer.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    db.purchase.findMany({ orderBy: { orderDate: "desc" }, take: 5, include: { supplier: true } }),
    db.expense.findMany({ orderBy: { date: "desc" }, take: 5 }),
    db.sale.findMany({ where: { status: "COMPLETED", date: { gte: trendStart } }, select: { date: true, total: true } }),
    db.expense.findMany({ where: { date: { gte: monthStart } } }),
    db.sale.findMany({ where: { status: "COMPLETED", date: { gte: monthStart } } }),
    db.saleItem.findMany({ where: { sale: { status: "COMPLETED", date: { gte: monthStart } } } }),
    db.cashSession.findFirst({ where: { status: "OPEN" } }),
  ])

  const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0)
  const todayCogs = todaySales.flatMap((s) => s.items).reduce((s, i) => s + i.costPrice * (i.quantity - i.returnedQty), 0)
  const todayCollection = todayPayments.reduce((s, p) => s + p.amount, 0)
  const todayExpenseTotal = todayExpenses.reduce((s, e) => s + e.amount, 0)
  const todayReturnValues = todayReturns.reduce((s, r) => s + r.totalValue, 0)

  const receivable = customers.filter((c) => c.outstanding > 0).reduce((s, c) => s + c.outstanding, 0)
  const payableSuppliers = suppliers.filter((s) => s.outstanding > 0).reduce((s, x) => s + x.outstanding, 0)
  const payableContractors = contractors.filter((c) => c.outstanding > 0).reduce((s, c) => s + c.outstanding, 0)

  const stockValue = stockLevels.reduce((s, l) => s + l.quantity * l.variant.costPrice, 0)

  const lowStockItems = stockLevels.length
    ? await computeLowStock()
    : []

  // sales trend last 14 days
  const trendMap = new Map<string, number>()
  for (let i = 13; i >= 0; i--) {
    const d = istDayStartUTC(new Date(Date.now() - i * 86400000))
    trendMap.set(d.toISOString().slice(0, 10), 0)
  }
  for (const s of trendSales) {
    const day = istDayStartUTC(s.date).toISOString().slice(0, 10)
    if (trendMap.has(day)) trendMap.set(day, (trendMap.get(day) ?? 0) + s.total)
  }

  // month stats
  const monthRevenue = monthSales.reduce((s, x) => s + x.total, 0)
  const monthCogs = monthItems.reduce((s, i) => s + i.costPrice * (i.quantity - i.returnedQty), 0)
  const monthExpense = monthExpenses.reduce((s, e) => s + e.amount, 0)

  return json({
    kpis: {
      todaySales: todayRevenue,
      todayInvoices: todaySales.length,
      todayCollection,
      todayExpenses: todayExpenseTotal,
      todayProfit: todayRevenue - todayReturnValues - todayCogs - todayExpenseTotal,
      receivable,
      payable: payableSuppliers + payableContractors,
      stockValue,
      lowStockCount: lowStockItems.filter((i) => i.totalStock > 0).length,
      outOfStockCount: lowStockItems.filter((i) => i.totalStock <= 0).length,
      monthRevenue,
      monthProfit: monthRevenue - monthCogs - monthExpense,
      customerCount: customers.length ? await db.customer.count() : 0,
    },
    trend: Array.from(trendMap.entries()).map(([date, total]) => ({ date, total })),
    lists: {
      pendingOrders,
      jobWorks,
      tasks,
      notifications,
      recentPayments: recentPayments.map((p) => ({
        id: p.id, number: p.number, amount: p.amount, method: p.method, direction: p.direction,
        party: p.customer?.name ?? p.supplier?.name ?? "—", date: p.date, category: p.category,
      })),
      recentSales: recentSales.map((s) => ({
        id: s.id, invoiceNumber: s.invoiceNumber, total: s.total, paymentStatus: s.paymentStatus,
        customer: s.customer?.name ?? "Walk-in", date: s.date,
      })),
      recentCustomers,
      recentPurchases: recentPurchases.map((p) => ({
        id: p.id, number: p.number, total: p.total, status: p.status, supplier: p.supplier?.name ?? "—", date: p.orderDate,
      })),
      recentExpenses,
      lowStock: lowStockItems.slice(0, 10),
    },
    cashSessionOpen: !!cashSession,
  })
}

async function computeLowStock() {
  const variants = await (await import("@/lib/db")).db.productVariant.findMany({
    include: { product: true, size: true, color: true, stockLevels: true },
  })
  return variants
    .map((v) => ({
      variantId: v.id, sku: v.sku, product: v.product.name,
      variant: [v.color?.name, v.size?.name].filter(Boolean).join(" / ") || "Default",
      totalStock: v.stockLevels.reduce((s, l) => s + l.quantity, 0),
      minStock: v.product.minStock,
    }))
    .filter((v) => v.totalStock <= v.minStock)
    .sort((a, b) => a.totalStock - b.totalStock)
}
