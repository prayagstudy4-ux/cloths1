import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum, parseDate, requireStr } from "@/lib/server/helpers"
import { createSale } from "@/lib/server/services/sales"
import { SessionInfo } from "@/lib/server/services/core"

const VALID_STATUSES = ["DRAFT", "CONFIRMED", "PROCESSING", "PACKED", "READY", "DISPATCHED", "DELIVERED", "CANCELLED", "RETURNED"]
const VALID_DELIVERY = ["PENDING", "PACKED", "DISPATCHED", "IN_TRANSIT", "DELIVERED", "FAILED", "RETURNED"]

interface ItemInput { variantId: string; quantity: number; unitPrice?: number; taxRate?: number }

async function computeOrderTotals(tx: any, items: ItemInput[], business: any) {
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
  return { subtotal, taxAmount, lines }
}

export async function handle(ctx: Ctx) {
  const [, seg1, seg2] = ctx.segs

  // ---------- LIST ----------
  if (ctx.method === "GET" && !seg1) {
    ctx.requirePerm("orders", "view")
    const q = ctx.params.get("q")?.toLowerCase()
    const status = ctx.params.get("status")
    const customerId = ctx.params.get("customerId")
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(200, parseInt(ctx.params.get("pageSize") ?? "50"))
    const where: any = {}
    if (status) where.status = status
    if (customerId) where.customerId = customerId
    if (q) where.OR = [{ number: { contains: q } }, { customer: { name: { contains: q } } }]
    const [total, orders] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({ where, orderBy: { orderDate: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { customer: true, items: true } }),
    ])
    return json({ orders, total, page, pageSize })
  }

  // ---------- CREATE ----------
  if (ctx.method === "POST" && !seg1) {
    ctx.requirePerm("orders", "create")
    const b = ctx.body ?? {}
    const customerId = requireStr(b.customerId, "Customer")
    const items = Array.isArray(b.items) ? b.items : []
    if (!items.length) throw new AppError("Add at least one item")

    const order = await db.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } })
      if (!customer) throw new AppError("Customer not found", 404)
      const business = await tx.businessProfile.findFirst()
      const { subtotal, taxAmount, lines } = await computeOrderTotals(tx, items, business)
      const discountAmount = Math.max(0, optNum(b.discountAmount, 0))
      const total = Math.max(0, subtotal - discountAmount + taxAmount)
      const count = await tx.counter.upsert({ where: { key: "ORD" }, update: { value: { increment: 1 } }, create: { key: "ORD", value: 1 } })
      const prefixes = business ? {
        ORD: business.orderPrefix,
      } : { ORD: "ORD" }
      const number = `${prefixes.ORD}-${String(count.value).padStart(5, "0")}`
      return tx.order.create({
        data: {
          number, customerId,
          status: VALID_STATUSES.includes(b.status) ? b.status : "CONFIRMED",
          orderDate: b.orderDate ? parseDate(b.orderDate) : new Date(),
          deliveryDate: b.deliveryDate ? parseDate(b.deliveryDate) : null,
          deliveryAddress: optStr(b.deliveryAddress, 400) ?? customer.address,
          courier: optStr(b.courier, 80),
          trackingNumber: optStr(b.trackingNumber, 60),
          subtotal, discountAmount, taxAmount, total,
          notes: optStr(b.notes, 1000),
          createdByName: ctx.user?.fullName ?? "System",
          items: { create: lines },
        },
        include: { items: true, customer: true },
      })
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "orders", "CREATE", order.id, { number: order.number, total: order.total }))
    return json({ order })
  }

  // ---------- GET ONE ----------
  if (ctx.method === "GET" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("orders", "view")
    const order = await db.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { variant: { include: { product: true, size: true, color: true } } } },
      },
    })
    if (!order) throw new AppError("Order not found", 404)
    return json({ order })
  }

  // ---------- UPDATE (status / delivery / notes) ----------
  if (ctx.method === "PUT" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("orders", "edit")
    const existing = await db.order.findUnique({ where: { id } })
    if (!existing) throw new AppError("Order not found", 404)
    const b = ctx.body ?? {}
    const order = await db.order.update({
      where: { id },
      data: {
        status: VALID_STATUSES.includes(b.status) ? b.status : existing.status,
        deliveryStatus: VALID_DELIVERY.includes(b.deliveryStatus) ? b.deliveryStatus : existing.deliveryStatus,
        deliveryDate: b.deliveryDate !== undefined ? (b.deliveryDate ? parseDate(b.deliveryDate) : null) : existing.deliveryDate,
        courier: b.courier !== undefined ? optStr(b.courier, 80) : existing.courier,
        trackingNumber: b.trackingNumber !== undefined ? optStr(b.trackingNumber, 60) : existing.trackingNumber,
        deliveryAddress: b.deliveryAddress !== undefined ? optStr(b.deliveryAddress, 400) : existing.deliveryAddress,
        notes: b.notes !== undefined ? optStr(b.notes, 1000) : existing.notes,
      },
      include: { items: true, customer: true },
    })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "orders", "UPDATE", id, { fields: Object.keys(b) }))
    return json({ order })
  }

  // ---------- CONVERT TO INVOICE ----------
  if (ctx.method === "POST" && seg1 && seg2 === "invoice") {
    const id = seg1
    ctx.requirePerm("sales", "create")
    const sale = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id }, include: { items: true } })
      if (!order) throw new AppError("Order not found", 404)
      if (order.saleId) throw new AppError("Order already converted to an invoice")
      if (order.status === "CANCELLED") throw new AppError("Cancelled order cannot be invoiced")
      const b = ctx.body ?? {}
      const created = await createSale(tx, {
        customerId: order.customerId,
        items: order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate })),
        extraDiscount: order.discountAmount,
        payments: Array.isArray(b.payments) ? b.payments : [],
        notes: `From order ${order.number}`,
        orderId: order.id,
        date: b.date ? parseDate(b.date) : undefined,
      }, ctx.user as SessionInfo)
      return created
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "orders", "APPROVE", id, { action: "converted_to_invoice", saleId: sale.id }))
    return json({ sale: await db.sale.findUnique({ where: { id: sale.id }, include: { customer: true, items: true, payments: true } }) })
  }

  // ---------- CANCEL ----------
  if (ctx.method === "POST" && seg1 && seg2 === "cancel") {
    const id = seg1
    ctx.requirePerm("orders", "edit")
    const order = await db.order.update({
      where: { id },
      data: { status: "CANCELLED" },
    })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "orders", "VOID", id, { number: order.number, action: "cancelled" }))
    return json({ order })
  }

  return null
}
