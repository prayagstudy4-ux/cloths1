import crypto from "crypto"
import { db } from "@/lib/db"

const RZP_API = "https://api.razorpay.com/v1"

export interface RazorpayConfig {
  keyId: string
  keySecret: string
  webhookSecret: string | null
}

// PERF: cache settings for 30s — saves 1-2 DB round trips per QR request.
const CACHE_TTL_MS = 30_000
let cfgCache: { at: number; value: RazorpayConfig | null } | null = null
export function clearRazorpayConfigCache() {
  cfgCache = null
}

export async function getRazorpayConfig(): Promise<RazorpayConfig | null> {
  if (cfgCache && Date.now() - cfgCache.at < CACHE_TTL_MS) return cfgCache.value
  const s = await db.setting.findMany({
    where: { key: { in: ["razorpay_enabled", "razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"] } },
  })
  const map = Object.fromEntries(s.map((r) => [r.key, r.value]))
  let value: RazorpayConfig | null = null
  if (map.razorpay_enabled === "1" && map.razorpay_key_id && map.razorpay_key_secret) {
    value = {
      keyId: map.razorpay_key_id,
      keySecret: map.razorpay_key_secret,
      webhookSecret: map.razorpay_webhook_secret ?? null,
    }
  }
  cfgCache = { at: Date.now(), value }
  return value
}

function authHeader(cfg: RazorpayConfig): string {
  return `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`
}

export interface RazorpayQr {
  qrId: string
  imageUrl: string
  upiUrl: string | null
}

/**
 * Creates a single-use, fixed-amount UPI QR via Razorpay QR Codes API.
 * The `cbmCode` note is copied by Razorpay onto resulting payments, letting the
 * webhook match the payment back to our QRPayment row.
 */
export async function createRazorpayQr(
  cfg: RazorpayConfig,
  opts: { code: string; amount: number; note: string }
): Promise<RazorpayQr> {
  const res = await fetch(`${RZP_API}/payments/qr_codes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader(cfg) },
    body: JSON.stringify({
      type: "upi_qr",
      name: `CBM ${opts.code}`,
      usage: "single_use",
      fixed_amount: true,
      payment_amount: Math.round(opts.amount * 100), // paise
      description: opts.note.slice(0, 84),
      notes: { cbm_code: opts.code },
    }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body?.error?.description ?? `Razorpay API error ${res.status}`)
  }
  return {
    qrId: body.id as string,
    imageUrl: (body.image_url as string) ?? "",
    upiUrl: (body.upi_link ?? body.short_url ?? null) as string | null,
  }
}

/** Fetches captured payments made against a Razorpay QR (reconciliation fallback). */
export async function listQrPayments(
  cfg: RazorpayConfig,
  razorpayQrId: string
): Promise<{ id: string; status: string }[]> {
  const res = await fetch(`${RZP_API}/payments/qr_codes/${razorpayQrId}/payments`, {
    headers: { Authorization: authHeader(cfg) },
  })
  if (!res.ok) return []
  const body = await res.json()
  return (body?.items ?? []).map((p: any) => ({ id: p.id as string, status: p.status as string }))
}

/** Validates the X-Razorpay-Signature header against the raw webhook body. */
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}