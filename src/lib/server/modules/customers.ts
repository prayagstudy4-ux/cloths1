import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum, requireStr } from "@/lib/server/helpers"
import { postCustomerLedger } from "@/lib/server/services/core"

export async function handle(ctx: Ctx) {
  const [, seg1, seg2] = ctx.segs

  // ---------- LIST ----------
  if (ctx.method === "GET" && !seg1) {
    ctx.requirePerm("customers", "view")
    const q = ctx.params.get("q")?.toLowerCase()
    const type = ctx.params.get("type")
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(200, parseInt(ctx.params.get("pageSize") ?? "50"))
    const where: any = {}
    if (type) where.type = type
    if (q) where.OR = [{ name: { contains: q } }, { phone: { contains: q } }, { code: { contains: q } }, { email: { contains: q } }]
    const [total, customers] = await Promise.all([
      db.customer.count({ where }),
      db.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ])
    return json({ customers, total, page, pageSize })
  }

  // ---------- CREATE ----------
  if (ctx.method === "POST" && !seg1) {
    ctx.requirePerm("customers", "create")
    const b = ctx.body ?? {}
    const name = requireStr(b.name, "Customer name", 120)
    const customer = await db.$transaction(async (tx) => {
      const count = await tx.customer.count()
      const code = `C${String(count + 1).padStart(4, "0")}`
      const c = await tx.customer.create({
        data: {
          code, name,
          phone: optStr(b.phone, 20), email: optStr(b.email, 120),
          address: optStr(b.address, 400), city: optStr(b.city, 80),
          birthday: optStr(b.birthday, 5),
          type: ["RETAIL", "WHOLESALE", "DISTRIBUTOR", "VIP", "REGULAR"].includes(b.type) ? b.type : "RETAIL",
          creditLimit: optNum(b.creditLimit, 0),
          discountPercent: optNum(b.discountPercent, 0),
          notes: optStr(b.notes, 1000),
        },
      })
      const opening = optNum(b.openingBalance, 0)
      if (opening !== 0) {
        await postCustomerLedger(tx, c.id, new Date(), "Opening balance (udhaar brought forward)", opening, 0, "OPENING", c.id)
      }
      return c
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "customers", "CREATE", customer.id, { name, code: customer.code }))
    return json({ customer })
  }

  // ---------- DETAIL ----------
  if (ctx.method === "GET" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("customers", "view")
    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        sales: { orderBy: { date: "desc" }, take: 25, include: { items: true } },
        orders: { orderBy: { orderDate: "desc" }, take: 15 },
        payments: { orderBy: { date: "desc" }, take: 25 },
        ledger: { orderBy: { date: "asc" } },
        returns: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    })
    if (!customer) throw new AppError("Customer not found", 404)
    const totalPurchases = customer.sales.filter((s) => s.status !== "VOID").reduce((s, x) => s + x.total, 0)
    const totalPaid = customer.payments.filter((p) => p.status === "VERIFIED").reduce((s, x) => s + x.amount, 0)
    return json({
      customer: {
        ...customer,
        stats: {
          totalPurchases,
          totalPaid,
          outstanding: customer.outstanding,
          totalOrders: customer.orders.length,
          totalSales: customer.sales.length,
          lastPurchase: customer.sales[0]?.date ?? null,
        },
      },
    })
  }

  // ---------- LEDGER ----------
  if (ctx.method === "GET" && seg1 && seg2 === "ledger") {
    const id = seg1
    ctx.requirePerm("customers", "view")
    const customer = await db.customer.findUnique({ where: { id }, include: { ledger: { orderBy: { date: "asc" } } } })
    if (!customer) throw new AppError("Customer not found", 404)
    return json({ ledger: customer.ledger, outstanding: customer.outstanding })
  }

  // ---------- UPDATE ----------
  if (ctx.method === "PUT" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("customers", "edit")
    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) throw new AppError("Customer not found", 404)
    const b = ctx.body ?? {}
    const customer = await db.customer.update({
      where: { id },
      data: {
        name: optStr(b.name) ?? existing.name,
        phone: b.phone !== undefined ? optStr(b.phone, 20) : existing.phone,
        email: b.email !== undefined ? optStr(b.email, 120) : existing.email,
        address: b.address !== undefined ? optStr(b.address, 400) : existing.address,
        city: b.city !== undefined ? optStr(b.city, 80) : existing.city,
        birthday: b.birthday !== undefined ? optStr(b.birthday, 5) : existing.birthday,
        type: ["RETAIL", "WHOLESALE", "DISTRIBUTOR", "VIP", "REGULAR"].includes(b.type) ? b.type : existing.type,
        creditLimit: b.creditLimit !== undefined ? optNum(b.creditLimit, existing.creditLimit) : existing.creditLimit,
        discountPercent: b.discountPercent !== undefined ? optNum(b.discountPercent, existing.discountPercent) : existing.discountPercent,
        notes: b.notes !== undefined ? optStr(b.notes, 1000) : existing.notes,
      },
    })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "customers", "UPDATE", id, { fields: Object.keys(b) }))
    return json({ customer })
  }

  // ---------- DELETE ----------
  if (ctx.method === "DELETE" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("customers", "delete")
    const existing = await db.customer.findUnique({ where: { id }, include: { sales: { take: 1 } } })
    if (!existing) throw new AppError("Customer not found", 404)
    if (existing.sales.length > 0) throw new AppError("Customer has sales history and cannot be deleted")
    await db.customer.delete({ where: { id } })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "customers", "DELETE", id, { name: existing.name }))
    return json({ ok: true })
  }

  return null
}
