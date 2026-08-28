import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/server/auth"
import { AppError, audit, optStr, optNum, setSetting, requireStr } from "@/lib/server/helpers"

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"]
const DEFAULT_COLORS: [string, string][] = [
  ["Black", "#111111"], ["White", "#ffffff"], ["Red", "#dc2626"], ["Maroon", "#7f1d1d"],
  ["Green", "#16a34a"], ["Navy", "#1e3a5f"], ["Olive", "#556b2f"], ["Yellow", "#eab308"],
  ["Pink", "#ec4899"], ["Grey", "#6b7280"], ["Beige", "#e8d5b7"], ["Blue", "#2563eb"],
]
const DEFAULT_MATERIALS = ["Cotton", "Polyester", "Linen", "Denim", "Rayon", "Wool", "Silk", "Cotton Blend"]
const DEFAULT_PATTERNS = ["Plain", "Printed", "Striped", "Checked", "Embroidered", "Solid"]

export async function handle(ctx: Ctx) {
  const [, action] = ctx.segs

  if (ctx.method === "GET" && action === "status") {
    const business = await db.businessProfile.findFirst()
    const users = await db.user.count()
    return json({ setupCompleted: Boolean(business?.setupCompleted && users > 0) })
  }

  // ---------- Complete first-run wizard ----------
  if (ctx.method === "POST" && (action === "complete" || action === "index" || !action)) {
    const b = ctx.body ?? {}
    const business = await db.businessProfile.findFirst()
    if (business?.setupCompleted) throw new AppError("Setup already completed")

    const name = requireStr(b.businessName, "Business name", 120)
    const ownerName = requireStr(b.ownerName, "Owner name", 120)
    const username = requireStr(b.username, "Username", 60).toLowerCase()
    const password = requireStr(b.password, "Password", 200)
    if (password.length < 4) throw new AppError("Password must be at least 4 characters")

    const result = await db.$transaction(async (tx) => {
      const data = {
        name,
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
        upiId: optStr(b.upiId),
        upiPayeeName: optStr(b.upiPayeeName) ?? name,
        bankName: optStr(b.bankName),
        bankAccount: optStr(b.bankAccount),
        bankIfsc: optStr(b.bankIfsc),
        invoicePrefix: optStr(b.invoicePrefix) ?? "INV",
        quotationPrefix: optStr(b.quotationPrefix) ?? "QUO",
        orderPrefix: optStr(b.orderPrefix) ?? "ORD",
        defaultTaxRate: optNum(b.defaultTaxRate, 5),
        taxEnabled: b.taxEnabled !== false,
        invoiceTerms: optStr(b.invoiceTerms),
        invoiceFooter: optStr(b.invoiceFooter),
        setupCompleted: true,
      }
      const profile = business
        ? await tx.businessProfile.update({ where: { id: business.id }, data })
        : await tx.businessProfile.create({ data })

      // Owner account
      const existing = await tx.user.findUnique({ where: { username } })
      if (existing) throw new AppError(`Username "${username}" already exists`)
      const owner = await tx.user.create({
        data: { username, passwordHash: hashPassword(password), fullName: ownerName, role: "OWNER" },
      })

      // Default warehouse
      const whCount = await tx.warehouse.count()
      let warehouse
      if (whCount === 0) {
        warehouse = await tx.warehouse.create({ data: { name: "Main Shop", type: "SHOP", isDefault: true } })
      }

      // Default attributes (idempotent)
      for (let i = 0; i < DEFAULT_SIZES.length; i++) {
        await tx.size.upsert({ where: { name: DEFAULT_SIZES[i] }, update: {}, create: { name: DEFAULT_SIZES[i], sortOrder: i } })
      }
      for (const [n, hex] of DEFAULT_COLORS) {
        await tx.color.upsert({ where: { name: n }, update: {}, create: { name: n, hex } })
      }
      for (const n of DEFAULT_MATERIALS) {
        await tx.material.upsert({ where: { name: n }, update: {}, create: { name: n } })
      }
      for (const n of DEFAULT_PATTERNS) {
        await tx.pattern.upsert({ where: { name: n }, update: {}, create: { name: n } })
      }

      // Settings (using tx to avoid SQLite write-lock deadlock)
      await tx.setting.upsert({ where: { key: "auto_backup" }, update: { value: b.autoBackup === false ? "0" : "1" }, create: { key: "auto_backup", value: b.autoBackup === false ? "0" : "1" } })
      await tx.setting.upsert({ where: { key: "backup_retention_days" }, update: { value: String(optNum(b.backupRetentionDays, 30)) }, create: { key: "backup_retention_days", value: String(optNum(b.backupRetentionDays, 30)) } })

      await audit(tx, { fullName: ownerName, role: "OWNER" }, "business", "CREATE", profile.id, { action: "setup_wizard_completed" })
      return { profile, owner, warehouse }
    }, { timeout: 60000, maxWait: 20000 })

    return json({ ok: true, businessId: result.profile.id, username })
  }

  return null
}
