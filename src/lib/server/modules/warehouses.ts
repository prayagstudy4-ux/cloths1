import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, requireStr } from "@/lib/server/helpers"

export async function handle(ctx: Ctx) {
  const [, id] = ctx.segs

  if (ctx.method === "GET" && !id) {
    ctx.requirePerm("inventory", "view")
    const items = await db.warehouse.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, include: { stockLevels: true } })
    return json({ warehouses: items.map((w) => ({ ...w, stockLevels: undefined, itemCount: w.stockLevels.filter((l) => l.quantity > 0).length, totalUnits: w.stockLevels.reduce((s, l) => s + l.quantity, 0) })) })
  }

  if (ctx.method === "POST" && !id) {
    ctx.requirePerm("inventory", "create")
    const name = requireStr(ctx.body?.name, "Warehouse name", 80)
    const isDefault = !!ctx.body?.isDefault
    const warehouse = await db.$transaction(async (tx) => {
      if (isDefault) await tx.warehouse.updateMany({ data: { isDefault: false } })
      return tx.warehouse.create({ data: { name, type: optStr(ctx.body?.type) ?? "SHOP", address: optStr(ctx.body?.address), isDefault } })
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "inventory", "CREATE", warehouse.id, { name }))
    return json({ warehouse })
  }

  if (ctx.method === "PUT" && id) {
    ctx.requirePerm("inventory", "edit")
    const existing = await db.warehouse.findUnique({ where: { id } })
    if (!existing) throw new AppError("Warehouse not found", 404)
    const b = ctx.body ?? {}
    const warehouse = await db.$transaction(async (tx) => {
      if (b.isDefault) await tx.warehouse.updateMany({ data: { isDefault: false } })
      return tx.warehouse.update({
        where: { id },
        data: {
          name: optStr(b.name) ?? existing.name,
          type: optStr(b.type) ?? existing.type,
          address: b.address !== undefined ? optStr(b.address) : existing.address,
          isDefault: b.isDefault !== undefined ? !!b.isDefault : existing.isDefault,
          active: b.active !== undefined ? !!b.active : existing.active,
        },
      })
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "inventory", "UPDATE", id, { name: warehouse.name }))
    return json({ warehouse })
  }

  if (ctx.method === "DELETE" && id) {
    ctx.requirePerm("inventory", "delete")
    const existing = await db.warehouse.findUnique({ where: { id }, include: { stockLevels: true } })
    if (!existing) throw new AppError("Warehouse not found", 404)
    if (existing.isDefault) throw new AppError("Cannot delete the default warehouse")
    if (existing.stockLevels.some((l) => l.quantity !== 0)) throw new AppError("Warehouse still has stock. Transfer stock out first.")
    await db.warehouse.delete({ where: { id } })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "inventory", "DELETE", id, { name: existing.name }))
    return json({ ok: true })
  }

  return null
}
