import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, clampInt, optStr, requireStr } from "@/lib/server/helpers"
import { applyStockChange, checkStockAlerts } from "@/lib/server/services/core"

export async function handle(ctx: Ctx) {
  const [, action] = ctx.segs

  // ---------- STOCK LIST (variant × warehouse) ----------
  if (ctx.method === "GET" && (!action || action === "stock")) {
    ctx.requirePerm("inventory", "view")
    const q = ctx.params.get("q")?.toLowerCase()
    const warehouseId = ctx.params.get("warehouseId")
    const filter = ctx.params.get("filter") // low | out
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(300, parseInt(ctx.params.get("pageSize") ?? "100"))

    const variants = await db.productVariant.findMany({
      include: {
        product: { include: { category: true, collection: true } },
        size: true, color: true,
        stockLevels: { include: { warehouse: true } },
      },
      orderBy: { createdAt: "desc" },
    })
    let rows = variants.map((v) => {
      const total = v.stockLevels.reduce((s, l) => s + l.quantity, 0)
      return {
        variantId: v.id,
        sku: v.sku,
        barcode: v.barcode,
        productName: v.product.name,
        productCode: v.product.code,
        category: v.product.category?.name ?? "—",
        collection: v.product.collection?.name ?? "—",
        size: v.size?.name ?? "—",
        color: v.color?.name ?? "—",
        minStock: v.product.minStock,
        totalStock: total,
        costPrice: v.costPrice,
        sellingPrice: v.sellingPrice,
        stockValue: total * v.costPrice,
        warehouseStock: v.stockLevels.map((l) => ({ warehouseId: l.warehouseId, warehouse: l.warehouse.name, quantity: l.quantity })),
      }
    })
    if (q) {
      rows = rows.filter((r) =>
        r.productName.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q) ||
        (r.barcode ?? "").toLowerCase().includes(q) || r.productCode.toLowerCase().includes(q) ||
        r.color.toLowerCase().includes(q))
    }
    if (warehouseId) rows = rows.filter((r) => r.warehouseStock.some((w) => w.warehouseId === warehouseId && w.quantity > 0))
    if (filter === "low") rows = rows.filter((r) => r.totalStock > 0 && r.totalStock <= r.minStock)
    if (filter === "out") rows = rows.filter((r) => r.totalStock <= 0)

    const total = rows.length
    const paged = rows.slice((page - 1) * pageSize, page * pageSize)
    return json({
      rows: paged, total, page, pageSize,
      summary: {
        totalVariants: variants.length,
        totalUnits: rows.reduce((s, r) => s + r.totalStock, 0),
        totalValue: rows.reduce((s, r) => s + r.stockValue, 0),
        lowCount: variants.filter((v) => { const t = v.stockLevels.reduce((s, l) => s + l.quantity, 0); return t > 0 && t <= v.product.minStock }).length,
        outCount: variants.filter((v) => v.stockLevels.reduce((s, l) => s + l.quantity, 0) <= 0).length,
      },
    })
  }

  // ---------- MOVEMENTS HISTORY ----------
  if (ctx.method === "GET" && action === "movements") {
    ctx.requirePerm("inventory", "view")
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(200, parseInt(ctx.params.get("pageSize") ?? "50"))
    const variantId = ctx.params.get("variantId")
    const type = ctx.params.get("type")
    const from = ctx.params.get("from")
    const to = ctx.params.get("to")
    const where: any = {}
    if (variantId) where.variantId = variantId
    if (type) where.type = type
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to) where.createdAt.lte = new Date(to)
    }
    const [total, movements] = await Promise.all([
      db.stockMovement.count({ where }),
      db.stockMovement.findMany({
        where, orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize, take: pageSize,
        include: {
          variant: { include: { product: true, size: true, color: true } },
        },
      }),
    ])
    return json({
      movements: movements.map((m) => ({
        id: m.id, date: m.createdAt, type: m.type, quantity: m.quantity,
        product: m.variant.product.name, sku: m.variant.sku,
        variantLabel: [m.variant.color?.name, m.variant.size?.name].filter(Boolean).join(" / "),
        referenceType: m.referenceType, referenceId: m.referenceId, note: m.note, userName: m.userName,
      })),
      total, page, pageSize,
    })
  }

  // ---------- ADJUSTMENT (opening / damage / loss / manual correction) ----------
  if (ctx.method === "POST" && action === "adjust") {
    ctx.requirePerm("inventory", "edit")
    const b = ctx.body ?? {}
    const variantId = requireStr(b.variantId, "Variant")
    const warehouseId = requireStr(b.warehouseId, "Warehouse")
    const type = ["OPENING", "DAMAGE", "LOSS", "ADJUSTMENT"].includes(b.type) ? b.type : "ADJUSTMENT"
    // For OPENING/DAMAGE/LOSS the UI sends a delta; ADJUSTMENT sets an absolute value
    let delta = clampInt(b.delta, -1000000, 1000000, 0)
    if (type === "ADJUSTMENT" && b.newQuantity !== undefined) {
      const current = await db.stockLevel.findUnique({ where: { variantId_warehouseId: { variantId, warehouseId } } })
      const cur = current?.quantity ?? 0
      delta = clampInt(b.newQuantity, -1000000, 1000000, cur) - cur
    }
    if (delta === 0) throw new AppError("No stock change to apply")

    const result = await db.$transaction(async (tx) => {
      const newQty: number = await applyStockChange(tx, {
        variantId, warehouseId, delta, type,
        referenceType: "MANUAL", referenceId: null,
        note: optStr(b.note) ?? `${type} adjustment`,
        userName: ctx.user?.fullName ?? undefined,
      })
      await checkStockAlerts(tx, variantId)
      return newQty
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "inventory", "ADJUST", variantId, { type, delta, warehouseId, newQty: result }))
    return json({ ok: true, newQuantity: result })
  }

  // ---------- TRANSFER ----------
  if (ctx.method === "POST" && action === "transfer") {
    ctx.requirePerm("inventory", "edit")
    const b = ctx.body ?? {}
    const variantId = requireStr(b.variantId, "Variant")
    const fromWarehouseId = requireStr(b.fromWarehouseId, "From warehouse")
    const toWarehouseId = requireStr(b.toWarehouseId, "To warehouse")
    const quantity = clampInt(b.quantity, 1, 1000000, 0)
    if (quantity < 1) throw new AppError("Quantity must be at least 1")
    if (fromWarehouseId === toWarehouseId) throw new AppError("Source and destination warehouse must be different")
    const note = optStr(b.note) ?? "Stock transfer"

    await db.$transaction(async (tx) => {
      await applyStockChange(tx, { variantId, warehouseId: fromWarehouseId, delta: -quantity, type: "TRANSFER_OUT", referenceType: "TRANSFER", note, userName: ctx.user?.fullName })
      await applyStockChange(tx, { variantId, warehouseId: toWarehouseId, delta: quantity, type: "TRANSFER_IN", referenceType: "TRANSFER", note, userName: ctx.user?.fullName })
      await checkStockAlerts(tx, variantId)
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "inventory", "TRANSFER", variantId, { fromWarehouseId, toWarehouseId, quantity }))
    return json({ ok: true })
  }

  return null
}
