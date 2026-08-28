import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { presetRange } from "@/lib/format"
import { istDayStartUTC, istDayEndUTC, monthStartIST } from "@/lib/format"

export async function handle(ctx: Ctx) {
  const [, action] = ctx.segs

  // ---------- OVERVIEW (balances + receivables/payables) ----------
  if (ctx.method === "GET" && (!action || action === "overview" || action === "index")) {
    ctx.requirePerm("accounts", "view")

    const [firstSession, payments, customers, suppliers, contractors, stockLevels] = await Promise.all([
      db.cashSession.findFirst({ orderBy: { openedAt: "asc" } }),
      db.payment.findMany({ where: { status: "VERIFIED" } }),
      db.customer.findMany(),
      db.supplier.findMany(),
      db.contractor.findMany(),
      db.stockLevel.findMany({ include: { variant: true } }),
    ])

    let cash = firstSession?.openingAmount ?? 0
    let upi = 0, card = 0, bank = 0
    const inflow = { CASH: 0, UPI: 0, CARD: 0, BANK: 0 }
    const outflow = { CASH: 0, UPI: 0, CARD: 0, BANK: 0 }
    for (const p of payments) {
      const bucket = p.direction === "IN" ? inflow : outflow
      bucket[p.method as "CASH"] = (bucket[p.method as "CASH"] ?? 0) + p.amount
    }
    cash += inflow.CASH - outflow.CASH
    upi = inflow.UPI - outflow.UPI
    card = inflow.CARD - outflow.CARD
    bank = inflow.BANK - outflow.BANK

    const receivables = customers.filter((c) => c.outstanding > 0)
    const customerAdvances = customers.filter((c) => c.outstanding < 0)
    const payablesSuppliers = suppliers.filter((s) => s.outstanding > 0)
    const payablesContractors = contractors.filter((c) => c.outstanding > 0)

    const stockValue = stockLevels.reduce((s, l) => s + l.quantity * l.variant.costPrice, 0)

    return json({
      balances: { cash, upi, card, bank, total: cash + upi + card + bank },
      inflow, outflow,
      receivables: {
        total: receivables.reduce((s, c) => s + c.outstanding, 0),
        count: receivables.length,
        top: receivables.sort((a, b) => b.outstanding - a.outstanding).slice(0, 10)
          .map((c) => ({ id: c.id, name: c.name, phone: c.phone, outstanding: c.outstanding })),
      },
      customerAdvances: { total: -customerAdvances.reduce((s, c) => s + c.outstanding, 0), count: customerAdvances.length },
      payables: {
        suppliers: { total: payablesSuppliers.reduce((s, x) => s + x.outstanding, 0), count: payablesSuppliers.length, top: payablesSuppliers.slice(0, 10).map((s) => ({ id: s.id, name: s.name, outstanding: s.outstanding })) },
        contractors: { total: payablesContractors.reduce((s, x) => s + x.outstanding, 0), count: payablesContractors.length, top: payablesContractors.slice(0, 10).map((s) => ({ id: s.id, name: s.name, outstanding: s.outstanding })) },
      },
      stockValue,
    })
  }

  // ---------- PROFIT & LOSS ----------
  if (ctx.method === "GET" && (action === "pnl" || action === "profit-loss")) {
    ctx.requirePerm("accounts", "view")
    const preset = ctx.params.get("preset") ?? "this_month"
    const { from, to } = presetRange(preset, ctx.params.get("from") ?? undefined, ctx.params.get("to") ?? undefined)

    const [sales, saleItems, returns, expenses, jobWorksCompleted, salaryExtra] = await Promise.all([
      db.sale.findMany({ where: { status: "COMPLETED", date: { gte: from, lte: to } }, include: { items: true } }),
      db.saleItem.findMany({
        where: { sale: { status: "COMPLETED", date: { gte: from, lte: to } } },
      }),
      db.returnRecord.findMany({ where: { createdAt: { gte: from, lte: to } }, include: { lines: true } }),
      db.expense.findMany({ where: { date: { gte: from, lte: to } } }),
      db.jobWork.findMany({ where: { completedAt: { gte: from, lte: to } } }),
      Promise.resolve(null),
    ])

    const grossRevenue = sales.reduce((s, x) => s + x.total, 0)
    const cogs = saleItems.reduce((s, i) => s + i.costPrice * (i.quantity - i.returnedQty), 0)
    const returnsValue = returns.reduce((s, r) => s + r.totalValue, 0)
    const refundsPaid = returns.reduce((s, r) => s + r.refundAmount, 0)
    const netRevenue = grossRevenue - returnsValue
    const grossProfit = netRevenue - cogs

    const opex = expenses.reduce((s, e) => s + e.amount, 0)
    const productionCost = jobWorksCompleted.reduce((s, j) => s + j.totalAmount, 0)
    const netProfit = grossProfit - opex - productionCost

    const byExpenseCategory: Record<string, number> = {}
    for (const e of expenses) byExpenseCategory[e.category] = (byExpenseCategory[e.category] ?? 0) + e.amount

    return json({
      period: { from, to, preset },
      revenue: { gross: grossRevenue, returns: returnsValue, refundsPaid, net: netRevenue, orderCount: sales.length },
      cogs,
      grossProfit,
      operatingExpenses: { total: opex, byCategory: byExpenseCategory },
      productionCost,
      netProfit,
    })
  }

  // ---------- CASH FLOW ----------
  if (ctx.method === "GET" && action === "cashflow") {
    ctx.requirePerm("accounts", "view")
    const preset = ctx.params.get("preset") ?? "this_month"
    const { from, to } = presetRange(preset, ctx.params.get("from") ?? undefined, ctx.params.get("to") ?? undefined)
    const payments = await db.payment.findMany({
      where: { status: "VERIFIED", date: { gte: from, lte: to } },
      orderBy: { date: "asc" },
      include: { customer: true, supplier: true },
    })
    const inflow = payments.filter((p) => p.direction === "IN")
    const outflow = payments.filter((p) => p.direction === "OUT")
    const byDay = new Map<string, { in: number; out: number }>()
    for (const p of payments) {
      const day = new Date(p.date).toISOString().slice(0, 10)
      const rec = byDay.get(day) ?? { in: 0, out: 0 }
      if (p.direction === "IN") rec.in += p.amount
      else rec.out += p.amount
      byDay.set(day, rec)
    }
    return json({
      period: { from, to },
      totalIn: inflow.reduce((s, p) => s + p.amount, 0),
      totalOut: outflow.reduce((s, p) => s + p.amount, 0),
      byDay: Array.from(byDay.entries()).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
      recentIn: inflow.slice(-20).map((p) => ({ number: p.number, amount: p.amount, method: p.method, party: p.customer?.name ?? "—", date: p.date })),
      recentOut: outflow.slice(-20).map((p) => ({ number: p.number, amount: p.amount, method: p.method, party: p.supplier?.name ?? p.notes ?? "—", date: p.date })),
    })
  }

  return null
}
