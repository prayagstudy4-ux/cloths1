import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum, parseDate, requireStr, notify } from "@/lib/server/helpers"
import { applyCustomerPayment, SessionInfo, postCustomerLedger } from "@/lib/server/services/core"
import QRCode from "qrcode"
import { getRazorpayConfig, createRazorpayQr, listQrPayments } from "@/lib/server/razorpay"

function buildUpiUrl(upiId: string, payee: string, amount: number, note: string) {
  // Use encodeURIComponent (→ %20) rather than URLSearchParams (+ for spaces):
  // strict UPI parsers (e.g. PhonePe) reject the "+" form, yielding "invalid QR".
  const q = [
    `pa=${encodeURIComponent(upiId)}`,
    `pn=${encodeURIComponent(payee)}`,
    `am=${amount.toFixed(2)}`,
    `cu=INR`,
    `tn=${encodeURIComponent(note)}`,
  ].join("&")
  return `upi://pay?${q}`
}

// PERF: throttle Razorpay reconciliation checks while the UI polls QR status
// (at most one provider call per QR per 5 seconds).
const rzpPollThrottle = new Map<string, number>()

/**
 * Marks a QR payment as VERIFIED and records the payment in the books.
 * Shared by staff confirmation (manual) and the Razorpay webhook (automatic).
 */
export async function verifyQrPayment(
  qrId: string,
  opts: { transactionId?: string; verifiedBy: string }
) {
  return db.$transaction(async (tx) => {
    const qr = await tx.qRPayment.findUnique({ where: { id: qrId } })
    if (!qr) throw new AppError("QR payment not found", 404)
    if (qr.status === "VERIFIED") return { alreadyVerified: true as const, qr }
    if (qr.status === "CANCELLED") throw new AppError("QR payment was cancelled")

    const payment = await applyCustomerPayment(tx, {
      customerId: qr.customerId,
      saleId: qr.saleId,
      amount: qr.amount,
      method: "UPI",
      provider: qr.provider,
      transactionId: opts.transactionId ?? null,
      notes: `UPI QR payment ${qr.code}${qr.note ? ` (${qr.note})` : ""}`,
      qrPaymentId: qr.id,
      user: { fullName: opts.verifiedBy, role: "OWNER" },
    })
    await tx.qRPayment.update({
      where: { id: qr.id },
      data: { status: "VERIFIED", transactionId: opts.transactionId ?? null, verifiedAt: new Date(), verifiedBy: opts.verifiedBy, paymentId: payment.id },
    })
    await notify(tx, "Payment Received", `₹${qr.amount.toFixed(2)} UPI payment verified${qr.saleId ? " — invoice updated" : ""}.`, "PAYMENT", "INFO")
    return { alreadyVerified: false as const, payment, qr: await tx.qRPayment.findUnique({ where: { id: qr.id } }) }
  }, { timeout: 60000, maxWait: 20000 })
}

export async function handle(ctx: Ctx) {
  const [, action, id] = ctx.segs

  // ---------- LIST ----------
  if (ctx.method === "GET" && (!action || action === "index")) {
    ctx.requirePerm("payments", "view")
    const q = ctx.params.get("q")?.toLowerCase()
    const method = ctx.params.get("method")
    const status = ctx.params.get("status")
    const direction = ctx.params.get("direction")
    const category = ctx.params.get("category")
    const customerId = ctx.params.get("customerId")
    const from = ctx.params.get("from")
    const to = ctx.params.get("to")
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(300, parseInt(ctx.params.get("pageSize") ?? "50"))
    const where: any = {}
    if (method) where.method = method
    if (status) where.status = status
    if (direction) where.direction = direction
    if (category) where.category = category
    if (customerId) where.customerId = customerId
    if (from || to) {
      where.date = {}
      if (from) where.date.gte = new Date(from)
      if (to) where.date.lte = new Date(to)
    }
    if (q) where.OR = [{ number: { contains: q } }, { transactionId: { contains: q } }, { customer: { name: { contains: q } } }, { reference: { contains: q } }]
    const [total, payments, agg] = await Promise.all([
      db.payment.count({ where }),
      db.payment.findMany({
        where, orderBy: { date: "desc" },
        skip: (page - 1) * pageSize, take: pageSize,
        include: { customer: true, supplier: true, sale: true },
      }),
      db.payment.aggregate({ where: { ...where, status: "VERIFIED" }, _sum: { amount: true } }),
    ])
    return json({ payments, total, page, pageSize, sumVerified: agg._sum.amount ?? 0 })
  }

  // ---------- RECORD MANUAL PAYMENT (cash/UPI/card/bank receive) ----------
  if (ctx.method === "POST" && (!action || action === "index")) {
    ctx.requirePerm("payments", "create")
    const b = ctx.body ?? {}
    const amount = optNum(b.amount, 0)
    if (amount <= 0) throw new AppError("Amount must be greater than zero")
    const method = ["CASH", "UPI", "CARD", "BANK"].includes(b.method) ? b.method : "CASH"

    // Unmatched mode: UPI payment seen in bank/app but not yet linked
    if (b.unmatched) {
      const payment = await db.$transaction(async (tx) => {
        const count = await tx.counter.upsert({ where: { key: "PAY" }, update: { value: { increment: 1 } }, create: { key: "PAY", value: 1 } })
        const business = await tx.businessProfile.findFirst()
        const number = `${business?.payPrefix ?? "PAY"}-${String(count.value).padStart(5, "0")}`
        return tx.payment.create({
          data: {
            number, direction: "IN", method, category: "CUSTOMER_PAYMENT", amount,
            date: b.date ? parseDate(b.date) : new Date(),
            status: "UNMATCHED", provider: "MANUAL",
            transactionId: optStr(b.transactionId, 100),
            notes: optStr(b.notes, 500) ?? "Received via shop QR — pending assignment",
            createdByName: ctx.user?.fullName ?? "System",
          },
        })
      }, { timeout: 60000, maxWait: 20000 })
      await db.$transaction(async (tx) => {
        await audit(tx, ctx.user, "payments", "CREATE", payment.id, { number: payment.number, amount, status: "UNMATCHED" })
        await notify(tx, "Unmatched Payment", `₹${amount.toFixed(2)} received via ${method} needs assignment to a customer/invoice.`, "PAYMENT", "WARNING", `unmatched:${payment.id}`)
      }, { timeout: 60000, maxWait: 20000 })
      return json({ payment })
    }

    const payment = await db.$transaction(async (tx) => {
      return applyCustomerPayment(tx, {
        customerId: optStr(b.customerId),
        saleId: optStr(b.saleId),
        amount, method,
        date: b.date ? parseDate(b.date) : undefined,
        transactionId: optStr(b.transactionId, 100),
        notes: optStr(b.notes, 500),
        user: ctx.user as SessionInfo,
      })
    }, { timeout: 60000, maxWait: 20000 })
    return json({ payment })
  }

  // ---------- ASSIGN UNMATCHED PAYMENT ----------
  if (ctx.method === "POST" && action && id === "assign") {
    ctx.requirePerm("payments", "create")
    const paymentId = action
    const b = ctx.body ?? {}
    const payment = await db.$transaction(async (tx) => {
      const p = await tx.payment.findUnique({ where: { id: paymentId } })
      if (!p) throw new AppError("Payment not found", 404)
      if (p.status !== "UNMATCHED") throw new AppError("Payment is not in unmatched state")

      // Create the verified allocation (new payment row linked properly) and void the placeholder
      const alloc = await applyCustomerPayment(tx, {
        customerId: optStr(b.customerId),
        saleId: optStr(b.saleId),
        amount: p.amount,
        method: p.method,
        date: p.date,
        transactionId: p.transactionId,
        provider: "MANUAL",
        notes: `Assigned from unmatched ${p.number}`,
        user: ctx.user as SessionInfo,
      })
      await tx.payment.update({ where: { id: paymentId }, data: { status: "VOID", voidedAt: new Date(), notes: `Assigned as ${alloc.number}` } })
      return alloc
    }, { timeout: 60000, maxWait: 20000 })
    return json({ payment })
  }

  // ---------- VOID PAYMENT ----------
  if (ctx.method === "POST" && action && id === "void") {
    ctx.requirePerm("payments", "void")
    const paymentId = action
    const reason = optStr(ctx.body?.reason, 500) ?? "Voided"
    await db.$transaction(async (tx) => {
      const p = await tx.payment.findUnique({ where: { id: paymentId } })
      if (!p) throw new AppError("Payment not found", 404)
      if (p.status === "VOID") throw new AppError("Payment already voided")
      await tx.payment.update({ where: { id: paymentId }, data: { status: "VOID", voidedAt: new Date(), notes: `${p.notes ?? ""} | VOID: ${reason}`.slice(0, 500) } })
      // Reverse allocations
      if (p.saleId && p.category === "SALE_RECEIPT") {
        const sale = await tx.sale.findUnique({ where: { id: p.saleId } })
        if (sale && sale.status !== "VOID") {
          const paid = Math.max(0, sale.paidAmount - p.amount)
          const due = Math.max(0, sale.total - paid)
          await tx.sale.update({ where: { id: sale.id }, data: { paidAmount: paid, dueAmount: due, paymentStatus: due <= 0.009 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID" } })
        }
      }
      if (p.customerId) {
        await postCustomerLedger(tx, p.customerId, new Date(), `Payment ${p.number} voided — reversed`, p.amount, 0, "VOID", p.id)
      }
      await audit(tx, ctx.user, "payments", "VOID", paymentId, { number: p.number, reason })
    }, { timeout: 60000, maxWait: 20000 })
    return json({ ok: true })
  }

  // ---------- DELETE PAYMENT (unmatched only) ----------
  if (ctx.method === "DELETE" && action && !id) {
    ctx.requirePerm("payments", "delete")
    const paymentId = action
    await db.$transaction(async (tx) => {
      const p = await tx.payment.findUnique({ where: { id: paymentId } })
      if (!p) throw new AppError("Payment not found", 404)
      if (p.status !== "UNMATCHED") {
        throw new AppError("Only unmatched payments can be deleted. Void verified or allocated payments instead — this preserves the ledger.", 400)
      }
      await tx.payment.delete({ where: { id: paymentId } })
      await audit(tx, ctx.user, "payments", "DELETE", paymentId, { number: p.number, amount: p.amount })
    }, { timeout: 60000, maxWait: 20000 })
    return json({ ok: true })
  }

  // ============================================================
  // QR PAYMENTS
  // ============================================================

  // Create dynamic QR intent
  if (ctx.method === "POST" && action === "qr" && !id) {
    ctx.requirePerm("payments", "create")
    const b = ctx.body ?? {}
    const amount = optNum(b.amount, 0)
    if (amount <= 0) throw new AppError("Amount must be greater than zero")

    // PERF: fetch business + razorpay config in parallel (2 round trips → 1),
    // and use the cached config when possible.
    const [business, rzp] = await Promise.all([
      db.businessProfile.findFirst(),
      getRazorpayConfig(),
    ])
    if (!business?.upiId) throw new AppError("UPI ID is not configured. Set it in Settings → Payments & QR (or Business Profile).")

    // Counter increment needs its own tiny transaction (1 round trip)
    const count = await db.counter.upsert({ where: { key: "QRP" }, update: { value: { increment: 1 } }, create: { key: "QRP", value: 1 } })
    const code = `QRP-${String(count.value).padStart(4, "0")}`
    const sale = b.saleId
      ? await db.sale.findUnique({ where: { id: b.saleId }, select: { id: true, invoiceNumber: true, customerId: true } })
      : null
    if (b.saleId && !sale) throw new AppError("Invoice not found", 404)
    const note = optStr(b.note, 50) ?? (sale ? `${business.invoicePrefix} payment ${sale.invoiceNumber}` : `Payment ${code}`)
    const upiId = business.upiId as string

    // PERF: the Razorpay API call happens OUTSIDE any transaction so the slow
    // network hop never holds a DB transaction open.
    let rqr: { qrId: string; imageUrl: string; upiUrl: string | null } | null = null
    if (rzp) {
      try {
        rqr = await createRazorpayQr(rzp, { code, amount, note })
      } catch (e) {
        // Fall back to plain UPI QR if Razorpay API fails — never block a sale.
        console.error("Razorpay QR creation failed, falling back to UPI intent:", (e as Error).message)
      }
    }

    // Single short transaction: insert the row + audit log together (1 round trip)
    const qr = await db.$transaction(async (tx) => {
      const created = await tx.qRPayment.create({
        data: {
          code, amount,
          note,
          upiId,
          saleId: sale?.id ?? null,
          customerId: optStr(b.customerId) ?? sale?.customerId ?? null,
          status: "PENDING",
          provider: rqr ? "RAZORPAY" : "UPI_QR",
          razorpayQrId: rqr?.qrId ?? null,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })
      await audit(tx, ctx.user, "payments", "CREATE", created.id, { type: "qr_intent", code, amount })
      return created
    }, { timeout: 15000, maxWait: 5000 })

    if (rqr) {
      // Automatic verification path: Razorpay QR. Payment.captured webhook
      // (or reconciliation on poll) marks it VERIFIED — no staff action needed.
      return json({ qr: { ...qr, provider: "RAZORPAY", upiUrl: rqr.upiUrl, qrImageUrl: rqr.imageUrl, qrDataUrl: null } })
    }
    const upiUrl = buildUpiUrl(upiId, business.upiPayeeName ?? business.name, amount, note)
    const qrDataUrl = await QRCode.toDataURL(upiUrl, { width: 512, margin: 4 })
    return json({ qr: { ...qr, upiUrl, qrDataUrl } })
  }

  // QR status (polled by UI)
  if (ctx.method === "GET" && action === "qr" && id) {
    const qr = await db.qRPayment.findUnique({ where: { id }, include: { sale: true, customer: true } })
    if (!qr) throw new AppError("QR payment not found", 404)
    // Razorpay reconciliation: if the webhook was missed, check the provider
    // directly while the UI polls. PERF: throttled to at most one Razorpay call
    // per QR per 5s — polling stays instant and the API isn't hammered.
    if (qr.provider === "RAZORPAY" && qr.status === "PENDING" && qr.razorpayQrId) {
      const now = Date.now()
      const last = rzpPollThrottle.get(id) ?? 0
      if (now - last > 5000) {
        rzpPollThrottle.set(id, now)
        const rzp = await getRazorpayConfig()
        if (rzp) {
          const pays = await listQrPayments(rzp, qr.razorpayQrId)
          const captured = pays.find((p) => p.status === "captured" || p.status === "authorized")
          if (captured) {
            await verifyQrPayment(qr.id, { transactionId: captured.id, verifiedBy: "Razorpay (auto)" })
            const fresh = await db.qRPayment.findUnique({ where: { id: qr.id }, include: { sale: true, customer: true } })
            const payment = fresh?.paymentId ? await db.payment.findUnique({ where: { id: fresh.paymentId } }) : null
            return json({ qr: { ...fresh, payment } })
          }
        }
      }
    }
    const payment = qr.paymentId ? await db.payment.findUnique({ where: { id: qr.paymentId } }) : null
    return json({ qr: { ...qr, payment } })
  }

  // List QR payments
  if (ctx.method === "GET" && action === "qr" && !id) {
    ctx.requirePerm("payments", "view")
    const status = ctx.params.get("status")
    const where: any = {}
    if (status) where.status = status
    const qrs = await db.qRPayment.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { sale: true, customer: true } })
    return json({ qrs })
  }

  // Confirm QR payment received (staff verifies money arrived in UPI app/bank — honest manual verification)
  if (ctx.method === "POST" && action === "qr" && id && ctx.segs[3] === "confirm") {
    ctx.requirePerm("payments", "create")
    const b = ctx.body ?? {}
    const transactionId = optStr(b.transactionId, 100) ?? undefined
    const result = await db.$transaction(async (tx) => {
      const qr = await tx.qRPayment.findUnique({ where: { id } })
      if (!qr) throw new AppError("QR payment not found", 404)
      if (qr.status === "VERIFIED") throw new AppError("QR payment already verified")
      if (qr.status === "CANCELLED") throw new AppError("QR payment was cancelled")

      const payment = await applyCustomerPayment(tx, {
        customerId: qr.customerId,
        saleId: qr.saleId,
        amount: qr.amount,
        method: "UPI",
        provider: "UPI_QR",
        transactionId: transactionId ?? null,
        notes: `UPI QR payment ${qr.code}${qr.note ? ` (${qr.note})` : ""}`,
        qrPaymentId: qr.id,
        user: ctx.user as SessionInfo,
      })
      await tx.qRPayment.update({
        where: { id: qr.id },
        data: { status: "VERIFIED", transactionId: transactionId ?? null, verifiedAt: new Date(), verifiedBy: ctx.user?.fullName ?? "System", paymentId: payment.id },
      })
      await notify(tx, "Payment Received", `₹${qr.amount.toFixed(2)} UPI payment verified${qr.saleId ? ` — invoice updated` : ""}.`, "PAYMENT", "INFO")
      return { payment, qr: await tx.qRPayment.findUnique({ where: { id: qr.id } }) }
    }, { timeout: 60000, maxWait: 20000 })
    return json(result)
  }

  // Cancel QR intent
  if (ctx.method === "POST" && action === "qr" && id && ctx.segs[3] === "cancel") {
    ctx.requirePerm("payments", "create")
    await db.$transaction(async (tx) => {
      const qr = await tx.qRPayment.findUnique({ where: { id } })
      if (!qr) throw new AppError("QR payment not found", 404)
      if (qr.status === "VERIFIED") throw new AppError("Cannot cancel a verified payment")
      await tx.qRPayment.update({ where: { id }, data: { status: "CANCELLED" } })
      await audit(tx, ctx.user, "payments", "VOID", id, { code: qr.code, action: "qr_cancelled" })
    }, { timeout: 60000, maxWait: 20000 })
    return json({ ok: true })
  }

  // ---------- SHOP QR (permanent) ----------
  if (ctx.method === "GET" && action === "shop-qr") {
    const business = await db.businessProfile.findFirst()
    if (!business?.upiId) throw new AppError("UPI ID is not configured. Set it in Settings → Payments & QR.")
    const payee = business.upiPayeeName ?? business.name
    const note = `Payment to ${business.name}`
    // amount-less QR: omit the am param (customer enters amount in their app)
    const anyAmountUrl = [
      `pa=${encodeURIComponent(business.upiId)}`,
      `pn=${encodeURIComponent(payee)}`,
      `cu=INR`,
      `tn=${encodeURIComponent(note)}`,
    ].join("&")
    const upiUrl = `upi://pay?${anyAmountUrl}`
    const qrDataUrl = await QRCode.toDataURL(upiUrl, { width: 512, margin: 4 })
    return json({ upiUrl, qrDataUrl, upiId: business.upiId, payee })
  }

  return null
}
