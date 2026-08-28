import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { getSettings, setSetting, audit } from "@/lib/server/helpers"

const SETTING_KEYS = [
  "auto_backup", "backup_retention_days", "session_timeout_hours", "require_login",
  "notify_low_stock", "notify_payment", "notify_due", "default_invoice_print",
  "allow_negative_stock", "razorpay_key_id", "razorpay_key_secret", "razorpay_enabled",
  "razorpay_webhook_secret",
]

export async function handle(ctx: Ctx) {
  const [, action] = ctx.segs

  if (ctx.method === "GET" && (!action || action === "index")) {
    const all = await getSettings()
    const out: Record<string, string> = {}
    for (const k of SETTING_KEYS) out[k] = all[k] ?? ""
    out.auto_backup = out.auto_backup || "1"
    out.backup_retention_days = out.backup_retention_days || "30"
    out.notify_low_stock = out.notify_low_stock || "1"
    out.notify_payment = out.notify_payment || "1"
    out.default_invoice_print = out.default_invoice_print || "A4"
    // Never expose full secret — mask it
    const masked = { ...out }
    if (masked.razorpay_key_secret) masked.razorpay_key_secret = masked.razorpay_key_secret.slice(0, 4) + "••••••••"
    if (masked.razorpay_webhook_secret) masked.razorpay_webhook_secret = masked.razorpay_webhook_secret.slice(0, 4) + "••••••••"
    return json({ settings: masked })
  }

  if (ctx.method === "PUT" && (!action || action === "index")) {
    ctx.requirePerm("settings", "edit")
    const b = ctx.body ?? {}
    const changed: string[] = []
    for (const k of SETTING_KEYS) {
      if (b[k] === undefined) continue
      let value = String(b[k])
      // Don't overwrite the secret with the mask
      if (k === "razorpay_key_secret" && value.includes("••")) continue
      if (k === "razorpay_webhook_secret" && value.includes("••")) continue
      await setSetting(k, value)
      changed.push(k)
    }
    await db.$transaction(async (tx) => audit(tx, ctx.user, "settings", "UPDATE", null, { changed }))
    return json({ ok: true, changed })
  }

  return null
}
