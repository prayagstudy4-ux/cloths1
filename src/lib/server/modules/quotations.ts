import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum, parseDate, requireStr } from "@/lib/server/helpers"

export async function handle(ctx: Ctx) {
  const [, seg1, seg2] = ctx.segs

  if (ctx.method === "GET" && !seg1) {
    ctx.requirePerm("orders", "view")
    const q = ctx.params.get("q")?.toLowerCase()
    const status = ctx.params.get("status")
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(200, parseInt(ctx.params.get("pageSize") ?? "50"))
    const where: any = {}
    if (status) where.status = status
    if (q) where.OR = [{ number: { contains: q } }, { customer: { name: { contains: q } } }]
    const [total, quotations] = await Promise.all([
      db.quotation.count({ where }),
      db.quotation.findMany({ where, orderBy: { date: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { customer: true, items: true } }),
    ])
    return json({ quotations, total, page, pageSize })
  }

  if (ctx.method === "POST" && !seg1) {
    ctx.requirePerm("orders", "create")
    const b = ctx.body ?? {}
    const customerId = requireStr(b.customerId, "Customer")
    const items = Array.isArray(b.items) ? b.items : []
    if (!items.length) throw new AppError("Add at least one item")

    const quotation = await db.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } })
      if (!customer) throw new AppError("Customer not found", 404)
      const business = await tx.businessProfile.findFirst()
      let subtotal = 0, taxAmount = 0
      const lines: any[] = []
      for (const item of items) {
        const v = await tx.productVariant.findUnique({ where: { id: item.variantId }, include: { product: true, size: true, color: true } })
        if (!v) throw new AppError("Product variant not found")
        const qty = Math.round(optNum(item.quantity, 0))
        if (qty < 1) throw new AppError("Quantity must be at least 1")
        const unitPrice = optNum(item.unitPrice, v.sellingPrice || v.product.sellingPrice)
        const taxRate = optNum(item.taxRate, business?.taxEnabled === false ? 0 : v.product.taxRate)
        const lineTotal = unitPrice * qty * (1 + taxRate / 100)
        subtotal += unitPrice * qty
        taxAmount += unitPrice * qty * taxRate / 100
        lines.push({
          variantId: v.id, productName: v.product.name,
          variantLabel: [v.color?.name, v.size?.name].filter(Boolean).join(" / ") || "Default",
          quantity: qty, unitPrice, taxRate, lineTotal,
        })
      }
      const discountAmount = Math.max(0, optNum(b.discountAmount, 0))
      const total = Math.max(0, subtotal - discountAmount + taxAmount)
      const count = await tx.counter.upsert({ where: { key: "QUO" }, update: { value: { increment: 1 } }, create: { key: "QUO", value: 1 } })
      const prefix = business?.quotationPrefix ?? "QUO"
      const number = `${prefix}-${String(count.value).padStart(5, "0")}`
      return tx.quotation.create({
        data: {
          number, customerId,
          date: b.date ? parseDate(b.date) : new Date(),
          validUntil: b.validUntil ? parseDate(b.validUntil) : null,
          status: ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"].includes(b.status) ? b.status : "DRAFT",
          subtotal, discountAmount, taxAmount, total,
          notes: optStr(b.notes, 1000),
          createdByName: ctx.user?.fullName ?? "System",
          items: { create: lines },
        },
        include: { items: true, customer: true },
      })
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "orders", "CREATE", quotation.id, { type: "quotation", number: quotation.number, total: quotation.total }))
    return json({ quotation })
  }

  if (ctx.method === "GET" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("orders", "view")
    const quotation = await db.quotation.findUnique({
      where: { id },
      include: { customer: true, items: { include: { variant: { include: { product: true, size: true, color: true } } } } },
    })
    if (!quotation) throw new AppError("Quotation not found", 404)
    return json({ quotation })
  }

  // Update status
  if (ctx.method === "PUT" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("orders", "edit")
    const existing = await db.quotation.findUnique({ where: { id } })
    if (!existing) throw new AppError("Quotation not found", 404)
    const b = ctx.body ?? {}
    const quotation = await db.quotation.update({
      where: { id },
      data: {
        status: ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"].includes(b.status) ? b.status : existing.status,
        notes: b.notes !== undefined ? optStr(b.notes, 1000) : existing.notes,
      },
    })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "orders", "UPDATE", id, { type: "quotation", status: quotation.status }))
    return json({ quotation })
  }

  // Convert to order
  if (ctx.method === "POST" && seg1 && seg2 === "convert") {
    const id = seg1
    ctx.requirePerm("orders", "create")
    const order = await db.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUnique({ where: { id }, include: { items: true } })
      if (!quotation) throw new AppError("Quotation not found", 404)
      if (quotation.convertedOrderId) throw new AppError("Quotation already converted")
      const business = await tx.businessProfile.findFirst()
      const count = await tx.counter.upsert({ where: { key: "ORD" }, update: { value: { increment: 1 } }, create: { key: "ORD", value: 1 } })
      const number = `${business?.orderPrefix ?? "ORD"}-${String(count.value).padStart(5, "0")}`
      const created = await tx.order.create({
        data: {
          number,
          customerId: quotation.customerId,
          quotationId: quotation.id,
          status: "CONFIRMED",
          orderDate: new Date(),
          subtotal: quotation.subtotal,
          discountAmount: quotation.discountAmount,
          taxAmount: quotation.taxAmount,
          total: quotation.total,
          notes: `From quotation ${quotation.number}`,
          createdByName: ctx.user?.fullName ?? "System",
          items: {
            create: quotation.items.map((i) => ({
              variantId: i.variantId, productName: i.productName, variantLabel: i.variantLabel,
              quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate, lineTotal: i.lineTotal,
            })),
          },
        },
      })
      await tx.quotation.update({ where: { id }, data: { status: "CONVERTED", convertedOrderId: created.id } })
      return created
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "orders", "CREATE", order.id, { type: "order_from_quotation", number: order.number }))
    return json({ order })
  }

  return null
}
