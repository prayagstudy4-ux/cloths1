import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, notify } from "@/lib/server/helpers"

export async function handle(ctx: Ctx) {
  const [, action, id] = ctx.segs

  // Current session + history
  if (ctx.method === "GET" && (!action || action === "index")) {
    ctx.requirePerm("accounts", "view")
    const current = await db.cashSession.findFirst({ where: { status: "OPEN" }, orderBy: { openedAt: "desc" } })
    const history = await db.cashSession.findMany({ where: { status: "CLOSED" }, orderBy: { openedAt: "desc" }, take: 30 })

    // Cash flow since session opened
    let cashIn = 0, cashOut = 0, breakdown: any[] = []
    if (current) {
      const payments = await db.payment.findMany({
        where: { status: "VERIFIED", date: { gte: current.openedAt } },
        include: { customer: true, supplier: true },
      })
      for (const p of payments) {
        if (p.method !== "CASH") continue
        if (p.direction === "IN") cashIn += p.amount
        else cashOut += p.amount
        breakdown.push({
          number: p.number, direction: p.direction, category: p.category,
          amount: p.amount, party: p.customer?.name ?? p.supplier?.name ?? p.notes ?? "—",
          time: p.date,
        })
      }
    }
    const expected = current ? current.openingAmount + cashIn - cashOut : 0
    return json({ current, history, cashIn, cashOut, expected, breakdown })
  }

  // Open session
  if (ctx.method === "POST" && action === "open") {
    ctx.requirePerm("accounts", "create")
    const existing = await db.cashSession.findFirst({ where: { status: "OPEN" } })
    if (existing) throw new AppError(`A register is already open (opened by ${existing.openedBy})`)
    const openingAmount = parseFloat(ctx.body?.openingAmount ?? "0") || 0
    const session = await db.cashSession.create({
      data: { openingAmount, openedBy: ctx.user?.fullName ?? "System", status: "OPEN" },
    })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "accounts", "CREATE", session.id, { action: "cash_register_opened", openingAmount }))
    return json({ session })
  }

  // Close session
  if (ctx.method === "POST" && action === "close") {
    ctx.requirePerm("accounts", "edit")
    const b = ctx.body ?? {}
    const counted = parseFloat(b.countedAmount ?? "0") || 0
    const session = await db.$transaction(async (tx) => {
      const current = await tx.cashSession.findFirst({ where: { status: "OPEN" } })
      if (!current) throw new AppError("No open cash register")
      const payments = await tx.payment.findMany({ where: { status: "VERIFIED", method: "CASH", date: { gte: current.openedAt } } })
      let cashIn = 0, cashOut = 0
      for (const p of payments) {
        if (p.direction === "IN") cashIn += p.amount
        else cashOut += p.amount
      }
      const expected = current.openingAmount + cashIn - cashOut
      const difference = counted - expected
      const closed = await tx.cashSession.update({
        where: { id: current.id },
        data: {
          closingAmount: counted, expectedAmount: expected, difference,
          closedAt: new Date(), closedBy: ctx.user?.fullName ?? "System",
          status: "CLOSED", notes: optStr(b.notes, 500),
        },
      })
      await audit(tx, ctx.user, "accounts", "UPDATE", closed.id, { action: "cash_register_closed", expected, counted, difference })
      if (Math.abs(difference) >= 1) {
        await notify(tx, "Cash Difference", `Cash register closed with a difference of ₹${difference.toFixed(2)}.`, "SYSTEM", Math.abs(difference) > 100 ? "CRITICAL" : "WARNING")
      }
      return closed
    }, { timeout: 60000, maxWait: 20000 })
    return json({ session })
  }

  return null
}
