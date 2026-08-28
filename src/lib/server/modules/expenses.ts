import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum, parseDate, requireStr } from "@/lib/server/helpers"
import { createPayment, SessionInfo } from "@/lib/server/services/core"
import { EXPENSE_CATEGORIES } from "@/lib/constants"

export async function handle(ctx: Ctx) {
  const [, action, id] = ctx.segs

  if (ctx.method === "GET" && (!action || action === "index")) {
    ctx.requirePerm("expenses", "view")
    const q = ctx.params.get("q")?.toLowerCase()
    const category = ctx.params.get("category")
    const from = ctx.params.get("from")
    const to = ctx.params.get("to")
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(300, parseInt(ctx.params.get("pageSize") ?? "50"))
    const where: any = {}
    if (category) where.category = category
    if (q) where.OR = [{ description: { contains: q } }, { paidTo: { contains: q } }, { category: { contains: q } }]
    if (from || to) {
      where.date = {}
      if (from) where.date.gte = new Date(from)
      if (to) where.date.lte = new Date(to)
    }
    const [total, expenses, agg] = await Promise.all([
      db.expense.count({ where }),
      db.expense.findMany({ where, orderBy: { date: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      db.expense.aggregate({ where, _sum: { amount: true } }),
    ])
    // category-wise totals
    const byCategory = await db.expense.groupBy({ by: ["category"], where, _sum: { amount: true } })
    return json({ expenses, total, page, pageSize, sum: agg._sum.amount ?? 0, byCategory })
  }

  if (ctx.method === "POST" && (!action || action === "index")) {
    ctx.requirePerm("expenses", "create")
    const b = ctx.body ?? {}
    const amount = optNum(b.amount, 0)
    if (amount <= 0) throw new AppError("Amount must be greater than zero")
    const category = EXPENSE_CATEGORIES.includes(b.category) ? b.category : "OTHER"
    const method = ["CASH", "UPI", "CARD", "BANK"].includes(b.method) ? b.method : "CASH"
    const date = b.date ? parseDate(b.date) : new Date()
    const description = requireStr(b.description, "Description", 300)

    const expense = await db.$transaction(async (tx) => {
      const payment = await createPayment(tx, {
        direction: "OUT", method, category: "EXPENSE", amount, date,
        notes: description,
      }, ctx.user as SessionInfo)
      return tx.expense.create({
        data: {
          category, description, amount, date, method,
          paidTo: optStr(b.paidTo, 120),
          notes: optStr(b.notes, 500),
          paymentId: payment.id,
          createdByName: ctx.user?.fullName ?? "System",
        },
      })
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "expenses", "CREATE", expense.id, { description, amount, category }))
    return json({ expense })
  }

  if (ctx.method === "PUT" && id && !action) {
    ctx.requirePerm("expenses", "edit")
    const existing = await db.expense.findUnique({ where: { id } })
    if (!existing) throw new AppError("Expense not found", 404)
    const b = ctx.body ?? {}
    const expense = await db.expense.update({
      where: { id },
      data: {
        description: optStr(b.description, 300) ?? existing.description,
        category: EXPENSE_CATEGORIES.includes(b.category) ? b.category : existing.category,
        amount: b.amount !== undefined ? optNum(b.amount, existing.amount) : existing.amount,
        notes: b.notes !== undefined ? optStr(b.notes, 500) : existing.notes,
        paidTo: b.paidTo !== undefined ? optStr(b.paidTo, 120) : existing.paidTo,
      },
    })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "expenses", "UPDATE", id, { fields: Object.keys(b) }))
    return json({ expense })
  }

  if (ctx.method === "DELETE" && id && !action) {
    ctx.requirePerm("expenses", "delete")
    const existing = await db.expense.findUnique({ where: { id } })
    if (!existing) throw new AppError("Expense not found", 404)
    await db.$transaction(async (tx) => {
      if (existing.paymentId) {
        await tx.payment.update({ where: { id: existing.paymentId }, data: { status: "VOID", voidedAt: new Date() } }).catch(() => null)
      }
      await tx.expense.delete({ where: { id } })
      await audit(tx, ctx.user, "expenses", "DELETE", id, { description: existing.description, amount: existing.amount })
    }, { timeout: 60000, maxWait: 20000 })
    return json({ ok: true })
  }

  return null
}
