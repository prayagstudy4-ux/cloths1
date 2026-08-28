import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum, requireStr, clampInt } from "@/lib/server/helpers"

function variantInclude() {
  return {
    size: true, color: true,
    stockLevels: { include: { warehouse: true } },
  }
}

export async function handle(ctx: Ctx) {
  const [, action, id] = ctx.segs

  // ---------- LIST ----------
  if (ctx.method === "GET" && (!action || action === "index")) {
    ctx.requirePerm("products", "view")
    const q = ctx.params.get("q")?.toLowerCase()
    const categoryId = ctx.params.get("categoryId")
    const collectionId = ctx.params.get("collectionId")
    const status = ctx.params.get("status")
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(200, parseInt(ctx.params.get("pageSize") ?? "50"))
    const where: any = {}
    if (status) where.status = status
    if (categoryId) where.categoryId = categoryId
    if (collectionId) where.collectionId = collectionId
    if (q) {
      where.OR = [
        { name: { contains: q } }, { code: { contains: q } }, { brand: { contains: q } },
        { variants: { some: { OR: [{ sku: { contains: q } }, { barcode: { contains: q } }] } } },
      ]
    }
    const [total, products] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize, take: pageSize,
        include: {
          category: true, collection: true, material: true, pattern: true, supplier: true,
          variants: { include: variantInclude() },
        },
      }),
    ])
    return json({ products, total, page, pageSize })
  }

  // ---------- CREATE ----------
  if (ctx.method === "POST" && (!action || action === "index")) {
    ctx.requirePerm("products", "create")
    const b = ctx.body ?? {}
    const name = requireStr(b.name, "Product name", 160)
    let code = optStr(b.code)
    if (!code) {
      const count = await db.product.count()
      code = `P${String(count + 1).padStart(4, "0")}`
    }
    if (await db.product.findUnique({ where: { code } })) throw new AppError(`Product code "${code}" already exists`)

    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name, code,
          description: optStr(b.description, 3000),
          categoryId: optStr(b.categoryId),
          collectionId: optStr(b.collectionId),
          brand: optStr(b.brand, 80),
          productType: optStr(b.productType),
          gender: optStr(b.gender),
          materialId: optStr(b.materialId),
          patternId: optStr(b.patternId),
          taxRate: optNum(b.taxRate, 5),
          costPrice: optNum(b.costPrice, 0),
          mrp: optNum(b.mrp, 0),
          sellingPrice: optNum(b.sellingPrice, 0),
          wholesalePrice: optNum(b.wholesalePrice, 0),
          discountPrice: b.discountPrice ? optNum(b.discountPrice, 0) : null,
          minStock: clampInt(b.minStock, 0, 100000, 5),
          supplierId: optStr(b.supplierId),
          status: ["ACTIVE", "DRAFT", "ARCHIVED"].includes(b.status) ? b.status : "ACTIVE",
        },
      })

      // Variants
      const variants = Array.isArray(b.variants) ? b.variants : []
      for (const v of variants) {
        await createVariant(tx, created.id, v, {
          costPrice: created.costPrice, mrp: created.mrp, sellingPrice: created.sellingPrice,
        })
      }
      return tx.product.findUnique({ where: { id: created.id }, include: { category: true, collection: true, variants: { include: variantInclude() } } })
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "products", "CREATE", product!.id, { name, code, variants: (b.variants ?? []).length }))
    return json({ product })
  }

  // ---------- GET BY ID ----------
  if (ctx.method === "GET" && id && !action) {
    ctx.requirePerm("products", "view")
    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: true, collection: true, material: true, pattern: true, supplier: true,
        variants: { include: variantInclude() },
      },
    })
    if (!product) throw new AppError("Product not found", 404)
    return json({ product })
  }

  // ---------- UPDATE ----------
  if (ctx.method === "PUT" && id && !action) {
    ctx.requirePerm("products", "edit")
    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) throw new AppError("Product not found", 404)
    const b = ctx.body ?? {}
    const product = await db.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          name: optStr(b.name) ?? existing.name,
          description: b.description !== undefined ? optStr(b.description, 3000) : existing.description,
          categoryId: b.categoryId !== undefined ? optStr(b.categoryId) : existing.categoryId,
          collectionId: b.collectionId !== undefined ? optStr(b.collectionId) : existing.collectionId,
          brand: b.brand !== undefined ? optStr(b.brand, 80) : existing.brand,
          productType: b.productType !== undefined ? optStr(b.productType) : existing.productType,
          gender: b.gender !== undefined ? optStr(b.gender) : existing.gender,
          materialId: b.materialId !== undefined ? optStr(b.materialId) : existing.materialId,
          patternId: b.patternId !== undefined ? optStr(b.patternId) : existing.patternId,
          taxRate: b.taxRate !== undefined ? optNum(b.taxRate, existing.taxRate) : existing.taxRate,
          costPrice: b.costPrice !== undefined ? optNum(b.costPrice, existing.costPrice) : existing.costPrice,
          mrp: b.mrp !== undefined ? optNum(b.mrp, existing.mrp) : existing.mrp,
          sellingPrice: b.sellingPrice !== undefined ? optNum(b.sellingPrice, existing.sellingPrice) : existing.sellingPrice,
          wholesalePrice: b.wholesalePrice !== undefined ? optNum(b.wholesalePrice, existing.wholesalePrice) : existing.wholesalePrice,
          discountPrice: b.discountPrice !== undefined ? (b.discountPrice ? optNum(b.discountPrice, 0) : null) : existing.discountPrice,
          minStock: b.minStock !== undefined ? clampInt(b.minStock, 0, 100000, existing.minStock) : existing.minStock,
          supplierId: b.supplierId !== undefined ? optStr(b.supplierId) : existing.supplierId,
          status: ["ACTIVE", "DRAFT", "ARCHIVED"].includes(b.status) ? b.status : existing.status,
        },
      })
      return updated
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "products", "UPDATE", id, { fields: Object.keys(b), name: product.name }))
    return json({ product: await db.product.findUnique({ where: { id }, include: { category: true, collection: true, variants: { include: variantInclude() } } }) })
  }

  // ---------- DELETE (only DRAFT/no stock) ----------
  if (ctx.method === "DELETE" && id && !action) {
    ctx.requirePerm("products", "delete")
    const existing = await db.product.findUnique({ where: { id }, include: { variants: { include: { stockLevels: true, saleItems: { take: 1 } } } } })
    if (!existing) throw new AppError("Product not found", 404)
    if (existing.variants.some((v) => v.saleItems.length > 0)) {
      await db.product.update({ where: { id }, data: { status: "ARCHIVED" } })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "products", "UPDATE", id, { action: "archived (has sales history)" }))
      return json({ ok: true, archived: true })
    }
    const hasStock = existing.variants.some((v) => v.stockLevels.some((l) => l.quantity !== 0))
    if (hasStock) throw new AppError("Product has stock. Adjust stock to zero or archive instead.")
    await db.product.delete({ where: { id } })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "products", "DELETE", id, { name: existing.name }))
    return json({ ok: true })
  }

  // ---------- VARIANT ACTIONS ----------
  if (action === "variants") {
    const [, , , variantAction, variantId] = ctx.segs

    // Add variant
    if (ctx.method === "POST" && !variantAction) {
      ctx.requirePerm("products", "edit")
      const product = await db.product.findUnique({ where: { id } })
      if (!product) throw new AppError("Product not found", 404)
      const variant = await db.$transaction(async (tx) => {
        const v = await createVariant(tx, id, ctx.body ?? {}, {
          costPrice: product.costPrice, mrp: product.mrp, sellingPrice: product.sellingPrice,
        })
        return v
      }, { timeout: 60000, maxWait: 20000 })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "products", "CREATE", variant.id, { action: "variant_added", product: product.name, sku: variant.sku }))
      return json({ variant })
    }

    // Update variant
    if (ctx.method === "PUT" && variantId) {
      ctx.requirePerm("products", "edit")
      const existing = await db.productVariant.findUnique({ where: { id: variantId } })
      if (!existing) throw new AppError("Variant not found", 404)
      const b = ctx.body ?? {}
      const variant = await db.productVariant.update({
        where: { id: variantId },
        data: {
          barcode: b.barcode !== undefined ? optStr(b.barcode, 60) : existing.barcode,
          costPrice: b.costPrice !== undefined ? optNum(b.costPrice, existing.costPrice) : existing.costPrice,
          mrp: b.mrp !== undefined ? optNum(b.mrp, existing.mrp) : existing.mrp,
          sellingPrice: b.sellingPrice !== undefined ? optNum(b.sellingPrice, existing.sellingPrice) : existing.sellingPrice,
        },
      })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "products", "UPDATE", variantId, { action: "variant_updated", sku: variant.sku }))
      return json({ variant })
    }

    // Delete variant
    if (ctx.method === "DELETE" && variantId) {
      ctx.requirePerm("products", "delete")
      const existing = await db.productVariant.findUnique({ where: { id: variantId }, include: { stockLevels: true, saleItems: { take: 1 } } })
      if (!existing) throw new AppError("Variant not found", 404)
      if (existing.saleItems.length > 0) throw new AppError("Variant has sales history and cannot be deleted")
      const hasStock = existing.stockLevels.some((l) => l.quantity !== 0)
      if (hasStock) throw new AppError("Variant has stock. Adjust stock to zero first.")
      await db.productVariant.delete({ where: { id: variantId } })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "products", "DELETE", variantId, { action: "variant_deleted", sku: existing.sku }))
      return json({ ok: true })
    }
  }

  return null
}

import { Prisma } from "@prisma/client"
type Tx = Prisma.TransactionClient

async function createVariant(tx: Tx, productId: string, v: any, fallback: { costPrice: number; mrp: number; sellingPrice: number }) {
  const sizeId = optStr(v.sizeId)
  const colorId = optStr(v.colorId)
  const size = sizeId ? await tx.size.findUnique({ where: { id: sizeId } }) : null
  const color = colorId ? await tx.color.findUnique({ where: { id: colorId } }) : null

  // Generate SKU: productCode-COLOR-SIZE
  const product = await tx.product.findUnique({ where: { id: productId } })
  const parts = [product!.code]
  if (color) parts.push(color.name.slice(0, 3).toUpperCase())
  if (size) parts.push(size.name.toUpperCase())
  let sku = optStr(v.sku) ?? parts.join("-")
  if (await tx.productVariant.findUnique({ where: { sku } })) {
    let i = 1
    while (await tx.productVariant.findUnique({ where: { sku: `${sku}-${i}` } })) i++
    sku = `${sku}-${i}`
  }

  const variant = await tx.productVariant.create({
    data: {
      productId,
      sku,
      barcode: optStr(v.barcode, 60),
      sizeId, colorId,
      costPrice: optNum(v.costPrice, fallback.costPrice),
      mrp: optNum(v.mrp, fallback.mrp),
      sellingPrice: optNum(v.sellingPrice, fallback.sellingPrice),
    },
  })

  // Opening stock per warehouse
  const openings = Array.isArray(v.openingStock) ? v.openingStock : []
  for (const o of openings) {
    const qty = clampInt(o.quantity, -1000000, 1000000, 0)
    if (qty === 0) continue
    const level = await tx.stockLevel.upsert({
      where: { variantId_warehouseId: { variantId: variant.id, warehouseId: o.warehouseId } },
      update: { quantity: { increment: qty } },
      create: { variantId: variant.id, warehouseId: o.warehouseId, quantity: qty },
    })
    await tx.stockMovement.create({
      data: {
        variantId: variant.id, warehouseId: o.warehouseId, type: "OPENING",
        quantity: qty, referenceType: "MANUAL", referenceId: variant.id,
        note: "Opening stock", userName: null,
      },
    })
  }
  return variant
}
