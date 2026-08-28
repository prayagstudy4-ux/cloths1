import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, parseDate } from "@/lib/server/helpers"
import { createSale } from "@/lib/server/services/sales"
import { applyStockChange, checkStockAlerts, postCustomerLedger, SessionInfo } from "@/lib/server/services/core"

export async function handle(ctx: Ctx) {
  // seg1 = id or "pos", seg2 = subaction ("void")
  const [, seg1, seg2] = ctx.segs

  // ---------- LIST ----------
  if (ctx.method === "GET" && !seg1) {
    ctx.requirePerm("sales", "view")
    const q = ctx.params.get("q")?.toLowerCase()
    const status = ctx.params.get("status")
    const paymentStatus = ctx.params.get("paymentStatus")
    const type = ctx.params.get("type")
    const customerId = ctx.params.get("customerId")
    const from = ctx.params.get("from")
    const to = ctx.params.get("to")
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(200, parseInt(ctx.params.get("pageSize") ?? "50"))
    const where: any = {}
    if (status) where.status = status
    if (paymentStatus) where.paymentStatus = paymentStatus
    if (type) where.type = type
    if (customerId) where.customerId = customerId
    if (from || to) {
      where.date = {}
      if (from) where.date.gte = new Date(from)
      if (to) where.date.lte = new Date(to)
    }
    if (q) where.OR = [{ invoiceNumber: { contains: q } }, { salespersonName: { contains: q } }, { customer: { name: { contains: q } } }]
    const [total, sales, agg] = await Promise.all([
      db.sale.count({ where }),
      db.sale.findMany({
        where, orderBy: { date: "desc" },
        skip: (page - 1) * pageSize, take: pageSize,
        include: { customer: true, items: true },
      }),
      db.sale.aggregate({
        where: { ...where, status: "COMPLETED" },
        _sum: { total: true, dueAmount: true },
      }),
    ])
    return json({ sales, total, page, pageSize, sum: { total: agg._sum.total ?? 0, due: agg._sum.dueAmount ?? 0 } })
  }

  // ---------- POS / CREATE ----------
  if (ctx.method === "POST" && (!seg1 || seg1 === "pos")) {
    ctx.requirePerm("sales", "create")
    const b = ctx.body ?? {}
    const sale = await db.$transaction(async (tx) => {
      return createSale(tx, {
        customerId: optStr(b.customerId),
        type: b.type,
        warehouseId: optStr(b.warehouseId) ?? undefined,
        items: Array.isArray(b.items) ? b.items : [],
        extraDiscount: b.extraDiscount,
        payments: Array.isArray(b.payments) ? b.payments : [],
        notes: optStr(b.notes, 1000),
        date: b.date ? parseDate(b.date) : undefined,
        salespersonName: optStr(b.salespersonName),
      }, ctx.user as SessionInfo)
    }, { timeout: 60000, maxWait: 20000 })
    const full = await db.sale.findUnique({
      where: { id: sale.id },
      include: {
        customer: true,
        items: { include: { variant: { include: { size: true, color: true, product: true } } } },
        payments: true,
      },
    })
    return json({ sale: full })
  }

  // ---------- GET ONE ----------
  if (ctx.method === "GET" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("sales", "view")
    const sale = await db.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { variant: { include: { size: true, color: true, product: true } } } },
        payments: true,
        returns: { include: { lines: true } },
      },
    })
    if (!sale) throw new AppError("Invoice not found", 404)
    return json({ sale })
  }

  // ---------- VOID (non-destructive reversal) ----------
  if (ctx.method === "POST" && seg1 && seg2 === "void") {
    const id = seg1
    ctx.requirePerm("sales", "void")
    const reason = optStr(ctx.body?.reason, 500) ?? "No reason provided"
    const sale = await db.$transaction(async (tx) => {
      const s = await tx.sale.findUnique({ where: { id }, include: { payments: true } })
      if (!s) throw new AppError("Invoice not found", 404)
      if (s.status === "VOID") throw new AppError("Invoice is already voided")

      // Reverse stock
      const items = await tx.saleItem.findMany({ where: { saleId: id } })
      for (const item of items) {
        const returnable = item.quantity - item.returnedQty
        if (returnable > 0) {
          await applyStockChange(tx, {
            variantId: item.variantId,
            warehouseId: s.warehouseId ?? (await tx.warehouse.findFirst({ where: { isDefault: true } }))!.id,
            delta: returnable, type: "SALE_RETURN",
            referenceType: "VOID", referenceId: s.id,
            note: `Void ${s.invoiceNumber}`, userName: ctx.user?.fullName,
            allowNegative: true,
          })
        }
      }

      // Void payments (preserve records)
      for (const p of s.payments) {
        if (p.status !== "VOID") {
          await tx.payment.update({ where: { id: p.id }, data: { status: "VOID", voidedAt: new Date() } })
        }
      }

      // Reverse customer ledger
      if (s.customerId) {
        if (s.total > 0) await postCustomerLedger(tx, s.customerId, new Date(), `Invoice ${s.invoiceNumber} VOIDED — reversed`, 0, s.total, "VOID", s.id)
        const verifiedPaid = s.payments.filter((p) => p.status === "VERIFIED" || p.status === "UNMATCHED").reduce((sm, p) => sm + p.amount, 0)
        if (verifiedPaid > 0) await postCustomerLedger(tx, s.customerId, new Date(), `Payments voided for ${s.invoiceNumber}`, verifiedPaid, 0, "VOID", s.id)
      }

      return tx.sale.update({
        where: { id },
        data: { status: "VOID", paymentStatus: "VOID", dueAmount: 0, voidedAt: new Date(), voidReason: reason },
      })
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "sales", "VOID", id, { invoiceNumber: sale.invoiceNumber, reason }))
    return json({ sale })
  }

  return null
}
