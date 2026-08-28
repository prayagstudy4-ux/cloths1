import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum, requireStr } from "@/lib/server/helpers"
import { postSupplierLedger } from "@/lib/server/services/core"

export async function handle(ctx: Ctx) {
  const [, seg1, seg2] = ctx.segs

  if (ctx.method === "GET" && !seg1) {
    ctx.requirePerm("suppliers", "view")
    const q = ctx.params.get("q")?.toLowerCase()
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(200, parseInt(ctx.params.get("pageSize") ?? "50"))
    const where: any = {}
    if (q) where.OR = [{ name: { contains: q } }, { company: { contains: q } }, { phone: { contains: q } }, { code: { contains: q } }]
    const [total, suppliers] = await Promise.all([
      db.supplier.count({ where }),
      db.supplier.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ])
    return json({ suppliers, total, page, pageSize })
  }

  if (ctx.method === "POST" && !seg1) {
    ctx.requirePerm("suppliers", "create")
    const b = ctx.body ?? {}
    const name = requireStr(b.name, "Supplier name", 120)
    const supplier = await db.$transaction(async (tx) => {
      const count = await tx.supplier.count()
      const code = `S${String(count + 1).padStart(4, "0")}`
      const s = await tx.supplier.create({
        data: {
          code, name,
          company: optStr(b.company, 120), phone: optStr(b.phone, 20), email: optStr(b.email, 120),
          address: optStr(b.address, 400), gstin: optStr(b.gstin, 20),
          type: optStr(b.type, 40), notes: optStr(b.notes, 1000),
        },
      })
      const opening = optNum(b.openingBalance, 0)
      if (opening !== 0) {
        await postSupplierLedger(tx, s.id, new Date(), "Opening balance payable", opening, 0, "OPENING", s.id)
      }
      return s
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "suppliers", "CREATE", supplier.id, { name, code: supplier.code }))
    return json({ supplier })
  }

  if (ctx.method === "GET" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("suppliers", "view")
    const supplier = await db.supplier.findUnique({
      where: { id },
      include: {
        purchases: { orderBy: { orderDate: "desc" }, take: 25, include: { items: true } },
        payments: { orderBy: { date: "desc" }, take: 25 },
        ledger: { orderBy: { date: "asc" } },
        products: { take: 50, select: { id: true, name: true, code: true } },
      },
    })
    if (!supplier) throw new AppError("Supplier not found", 404)
    return json({
      supplier: {
        ...supplier,
        stats: {
          totalPurchases: supplier.purchases.filter((p) => p.status !== "CANCELLED").reduce((s, x) => s + x.total, 0),
          totalPaid: supplier.payments.filter((p) => p.status === "VERIFIED").reduce((s, x) => s + x.amount, 0),
          outstanding: supplier.outstanding,
        },
      },
    })
  }

  if (ctx.method === "GET" && seg1 && seg2 === "ledger") {
    const id = seg1
    ctx.requirePerm("suppliers", "view")
    const supplier = await db.supplier.findUnique({ where: { id }, include: { ledger: { orderBy: { date: "asc" } } } })
    if (!supplier) throw new AppError("Supplier not found", 404)
    return json({ ledger: supplier.ledger, outstanding: supplier.outstanding })
  }

  if (ctx.method === "PUT" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("suppliers", "edit")
    const existing = await db.supplier.findUnique({ where: { id } })
    if (!existing) throw new AppError("Supplier not found", 404)
    const b = ctx.body ?? {}
    const supplier = await db.supplier.update({
      where: { id },
      data: {
        name: optStr(b.name) ?? existing.name,
        company: b.company !== undefined ? optStr(b.company, 120) : existing.company,
        phone: b.phone !== undefined ? optStr(b.phone, 20) : existing.phone,
        email: b.email !== undefined ? optStr(b.email, 120) : existing.email,
        address: b.address !== undefined ? optStr(b.address, 400) : existing.address,
        gstin: b.gstin !== undefined ? optStr(b.gstin, 20) : existing.gstin,
        type: b.type !== undefined ? optStr(b.type, 40) : existing.type,
        notes: b.notes !== undefined ? optStr(b.notes, 1000) : existing.notes,
      },
    })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "suppliers", "UPDATE", id, { fields: Object.keys(b) }))
    return json({ supplier })
  }

  if (ctx.method === "DELETE" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("suppliers", "delete")
    const existing = await db.supplier.findUnique({ where: { id }, include: { purchases: { take: 1 } } })
    if (!existing) throw new AppError("Supplier not found", 404)
    if (existing.purchases.length > 0) throw new AppError("Supplier has purchase history and cannot be deleted")
    await db.supplier.delete({ where: { id } })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "suppliers", "DELETE", id, { name: existing.name }))
    return json({ ok: true })
  }

  return null
}
