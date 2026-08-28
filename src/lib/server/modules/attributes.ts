// Attributes: categories, collections, sizes, colors, materials, patterns
import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, requireStr } from "@/lib/server/helpers"

const TABLES = {
  categories: { model: "category", label: "Category" },
  collections: { model: "collection", label: "Collection" },
  sizes: { model: "size", label: "Size" },
  colors: { model: "color", label: "Color" },
  materials: { model: "material", label: "Material" },
  patterns: { model: "pattern", label: "Pattern" },
} as const

type ModelName = "category" | "collection" | "size" | "color" | "material" | "pattern"

function getModel(name: ModelName) {
  const m = db as any
  return m[name] as {
    findMany(args?: any): Promise<any[]>
    findUnique(args?: any): Promise<any>
    findFirst(args?: any): Promise<any>
    create(args?: any): Promise<any>
    update(args?: any): Promise<any>
    delete(args?: any): Promise<any>
    count(args?: any): Promise<number>
  }
}

export async function handle(ctx: Ctx) {
  const [, tableName, id] = ctx.segs
  const t = TABLES[tableName as keyof typeof TABLES]
  if (!t) {
    // combined list for pickers
    if (ctx.method === "GET" && tableName === "all") {
      const [categories, collections, sizes, colors, materials, patterns] = await Promise.all([
        db.category.findMany({ orderBy: { sortOrder: "asc" } }),
        db.collection.findMany({ orderBy: { createdAt: "desc" } }),
        db.size.findMany({ orderBy: { sortOrder: "asc" } }),
        db.color.findMany({ orderBy: { name: "asc" } }),
        db.material.findMany({ orderBy: { name: "asc" } }),
        db.pattern.findMany({ orderBy: { name: "asc" } }),
      ])
      return json({ categories, collections, sizes, colors, materials, patterns })
    }
    return null
  }
  const model = getModel(t.model as ModelName)

  if (ctx.method === "GET" && !id) {
    ctx.requirePerm("products", "view")
    const items = await model.findMany(
      tableName === "categories" ? { orderBy: { sortOrder: "asc" } } :
      tableName === "sizes" ? { orderBy: { sortOrder: "asc" } } :
      tableName === "collections" ? { orderBy: { createdAt: "desc" } } :
      { orderBy: { name: "asc" } },
    )
    return json({ items })
  }

  if (ctx.method === "POST" && !id) {
    ctx.requirePerm("products", "create")
    const b = ctx.body ?? {}
    const name = requireStr(b.name, `${t.label} name`, 80)
    let data: any = { name }
    if (tableName === "categories") {
      data.parentId = optStr(b.parentId)
      data.description = optStr(b.description)
      data.sortOrder = parseInt(b.sortOrder ?? "0") || 0
    }
    if (tableName === "collections") {
      data.season = optStr(b.season)
      data.description = optStr(b.description)
      data.startDate = b.startDate ? new Date(b.startDate) : null
      data.endDate = b.endDate ? new Date(b.endDate) : null
      data.active = b.active !== false
    }
    if (tableName === "colors") data.hex = optStr(b.hex) ?? "#000000"
    if (tableName === "sizes") data.sortOrder = parseInt(b.sortOrder ?? "0") || 0
    try {
      const item = await model.create({ data })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "products", "CREATE", item.id, { attribute: tableName, name }))
      return json({ item })
    } catch (e: any) {
      if (String(e?.message).includes("Unique")) throw new AppError(`${t.label} "${name}" already exists`)
      throw e
    }
  }

  if (ctx.method === "PUT" && id) {
    ctx.requirePerm("products", "edit")
    const existing = await model.findUnique({ where: { id } })
    if (!existing) throw new AppError(`${t.label} not found`, 404)
    const b = ctx.body ?? {}
    const data: any = {}
    if (b.name !== undefined) data.name = requireStr(b.name, "Name", 80)
    if (tableName === "categories") {
      if (b.parentId !== undefined) data.parentId = optStr(b.parentId)
      if (b.description !== undefined) data.description = optStr(b.description)
      if (b.sortOrder !== undefined) data.sortOrder = parseInt(b.sortOrder) || 0
    }
    if (tableName === "collections") {
      if (b.season !== undefined) data.season = optStr(b.season)
      if (b.description !== undefined) data.description = optStr(b.description)
      if (b.active !== undefined) data.active = !!b.active
    }
    if (tableName === "colors" && b.hex !== undefined) data.hex = optStr(b.hex) ?? "#000000"
    if (tableName === "sizes" && b.sortOrder !== undefined) data.sortOrder = parseInt(b.sortOrder) || 0
    try {
      const item = await model.update({ where: { id }, data })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "products", "UPDATE", id, { attribute: tableName, data }))
      return json({ item })
    } catch (e: any) {
      if (String(e?.message).includes("Unique")) throw new AppError(`Name already exists`)
      throw e
    }
  }

  if (ctx.method === "DELETE" && id) {
    ctx.requirePerm("products", "delete")
    const existing = await model.findUnique({ where: { id } })
    if (!existing) throw new AppError(`${t.label} not found`, 404)
    try {
      await model.delete({ where: { id } })
    } catch {
      throw new AppError(`Cannot delete — ${t.label} is in use by products`)
    }
    await db.$transaction(async (tx) => audit(tx, ctx.user, "products", "DELETE", id, { attribute: tableName, name: existing.name }))
    return json({ ok: true })
  }

  return null
}
