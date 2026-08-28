import { NextRequest, NextResponse } from "next/server"
import { getRazorpayConfig, verifyWebhookSignature } from "@/lib/server/razorpay"
import { verifyQrPayment } from "@/lib/server/modules/payments"
import { db } from "@/lib/db"

/**
 * Razorpay webhook endpoint (public, signature-verified).
 *
 * Configure in Razorpay Dashboard → Settings → Webhooks:
 *   URL:    https://YOUR-DOMAIN/api/razorpay-webhook
 *   Secret: same value stored in Settings → Razorpay (razorpay_webhook_secret)
 *   Events: payment.captured, payment.failed
 *
 * Razorpay signs the RAW request body; we must verify against the exact bytes,
 * which is why this route reads req.text() itself instead of going through the
 * JSON-parsing API router.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text()
    const signature = req.headers.get("x-razorpay-signature") ?? ""
    const cfg = await getRazorpayConfig()
    if (!cfg) return NextResponse.json({ ok: false, error: "Razorpay not configured" }, { status: 400 })
    if (!cfg.webhookSecret) return NextResponse.json({ ok: false, error: "Webhook secret not configured" }, { status: 400 })
    if (!verifyWebhookSignature(raw, signature, cfg.webhookSecret)) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 })
    }

    const event = JSON.parse(raw) as { event?: string; payload?: any }
    const entity = event.payload?.payment?.entity
    if (!entity) return NextResponse.json({ ok: true, ignored: true })

    if (event.event === "payment.captured" || event.event === "payment.authorized") {
      // Matching strategy (in order of reliability):
      //  1. notes.cbm_code — Razorpay copies the QR's notes onto the payment
      //  2. razorpayQrId match — if present in the payload
      //  3. exact paise amount on the oldest PENDING Razorpay QR (defensive)
      let target: { id: string } | null = null
      const cbmCode = entity.notes?.cbm_code as string | undefined
      if (cbmCode) {
        target = await db.qRPayment.findFirst({
          where: { code: cbmCode, provider: "RAZORPAY", status: "PENDING" },
          select: { id: true },
        })
      }
      if (!target && entity.qr_id) {
        target = await db.qRPayment.findFirst({
          where: { razorpayQrId: entity.qr_id, status: "PENDING" },
          select: { id: true },
        })
      }
      if (!target) {
        target = await db.qRPayment.findFirst({
          where: { provider: "RAZORPAY", status: "PENDING", amount: { gte: entity.amount / 100 - 0.01, lte: entity.amount / 100 + 0.01 } },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      }
      if (!target) return NextResponse.json({ ok: true, matched: false })
      await verifyQrPayment(target.id, { transactionId: entity.id, verifiedBy: "Razorpay webhook" })
      return NextResponse.json({ ok: true, matched: true })
    }

    return NextResponse.json({ ok: true, ignored: event.event })
  } catch (e) {
    console.error("razorpay webhook error:", (e as Error).message)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}