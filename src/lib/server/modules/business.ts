import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum } from "@/lib/server/helpers"
import fs from "fs"
import path from "path"
import { randomUUID } from "crypto"

export async function handle(ctx: Ctx) {
  const [, action] = ctx.segs

  if (ctx.method === "GET" && (!action || action === "index")) {
    ctx.requirePerm("business", "view")
    const business = await db.businessProfile.findFirst()
    const counts = {
      products: await db.product.count(),
      customers: await db.customer.count(),
      suppliers: await db.supplier.count(),
      sales: await db.sale.count(),
      purchases: await db.purchase.count(),
      employees: await db.employee.count(),
      variants: await db.productVariant.count(),
    }
    return json({ business, counts })
  }

  if (ctx.method === "PUT" && (!action || action === "index")) {
    ctx.requirePerm("business", "edit")
    const b = ctx.body ?? {}
    const business = await db.businessProfile.findFirst()
    if (!business) throw new AppError("Business profile not found", 404)
    const updated = await db.businessProfile.update({
      where: { id: business.id },
      data: {
        name: optStr(b.name) ?? business.name,
        brandName: optStr(b.brandName),
        address: optStr(b.address),
        city: optStr(b.city),
        state: optStr(b.state),
        pincode: optStr(b.pincode),
        phone: optStr(b.phone),
        email: optStr(b.email),
        website: optStr(b.website),
        gstin: optStr(b.gstin),
        pan: optStr(b.pan),
        businessType: optStr(b.businessType),
        bankName: optStr(b.bankName),
        bankAccount: optStr(b.bankAccount),
        bankIfsc: optStr(b.bankIfsc),
        upiId: optStr(b.upiId),
        upiPayeeName: optStr(b.upiPayeeName),
        invoicePrefix: optStr(b.invoicePrefix) ?? business.invoicePrefix,
        quotationPrefix: optStr(b.quotationPrefix) ?? business.quotationPrefix,
        orderPrefix: optStr(b.orderPrefix) ?? business.orderPrefix,
        purchasePrefix: optStr(b.purchasePrefix) ?? business.purchasePrefix,
        returnPrefix: optStr(b.returnPrefix) ?? business.returnPrefix,
        jobworkPrefix: optStr(b.jobworkPrefix) ?? business.jobworkPrefix,
        productionPrefix: optStr(b.productionPrefix) ?? business.productionPrefix,
        payPrefix: optStr(b.payPrefix) ?? business.payPrefix,
        defaultTaxRate: optNum(b.defaultTaxRate, business.defaultTaxRate),
        taxEnabled: typeof b.taxEnabled === "boolean" ? b.taxEnabled : business.taxEnabled,
        pricesIncludeTax: typeof b.pricesIncludeTax === "boolean" ? b.pricesIncludeTax : business.pricesIncludeTax,
        invoiceTerms: optStr(b.invoiceTerms),
        invoiceFooter: optStr(b.invoiceFooter),
      },
    })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "business", "UPDATE", updated.id, { fields: Object.keys(b) }))
    return json({ business: updated })
  }

  // Logo upload (multipart)
  if (ctx.method === "POST" && action === "logo") {
    ctx.requirePerm("business", "edit")
    const fd = ctx.body as FormData
    const file = fd?.get("file") as File | null
    if (!file) throw new AppError("No file provided")
    const dir = path.join(process.cwd(), "app-data", "uploads")
    fs.mkdirSync(dir, { recursive: true })
    const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "")
    const filename = `logo-${randomUUID()}.${ext || "png"}`
    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length > 2 * 1024 * 1024) throw new AppError("Logo must be under 2MB")
    fs.writeFileSync(path.join(dir, filename), buf)
    const url = `/api/documents/file?path=${encodeURIComponent(`uploads/${filename}`)}`
    const business = await db.businessProfile.findFirst()
    if (business) await db.businessProfile.update({ where: { id: business.id }, data: { logo: url } })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "business", "UPDATE", business?.id, { action: "logo_upload" }))
    return json({ ok: true, logo: url })
  }

  return null
}
