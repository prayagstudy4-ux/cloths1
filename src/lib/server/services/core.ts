// Core transactional services shared across modules.
// All financial + inventory mutations go through these helpers to guarantee atomicity and consistency.
import { Prisma } from "@prisma/client"
import { AppError, nextNumbered, audit, notify } from "@/lib/server/helpers"

type Tx = Prisma.TransactionClient
export type SessionInfo = { fullName: string; role: string } | null

// ============================================================
// STOCK
// ============================================================

export async function applyStockChange(
  tx: Tx,
  opts: {
    variantId: string
    warehouseId: string
    delta: number // signed
    type: string
    referenceType?: string | null
    referenceId?: string | null
    note?: string | null
    userName?: string | null
    allowNegative?: boolean
  },
): Promise<number> {
  const level = await tx.stockLevel.upsert({
    where: { variantId_warehouseId: { variantId: opts.variantId, warehouseId: opts.warehouseId } },
    update: { quantity: { increment: opts.delta } },
    create: { variantId: opts.variantId, warehouseId: opts.warehouseId, quantity: opts.delta },
  })
  if (!opts.allowNegative && level.quantity < 0) {
    throw new AppError(`Insufficient stock for this item (available would become ${level.quantity}). Reduce quantity or adjust stock first.`, 400)
  }
  await tx.stockMovement.create({
    data: {
      variantId: opts.variantId,
      warehouseId: opts.warehouseId,
      type: opts.type,
      quantity: opts.delta,
      referenceType: opts.referenceType ?? null,
      referenceId: opts.referenceId ?? null,
      note: opts.note ?? null,
      userName: opts.userName ?? null,
    },
  })
  return level.quantity
}

/** Check low/out-of-stock after a change and raise deduplicated notifications */
export async function checkStockAlerts(tx: Tx, variantId: string) {
  const variant = await tx.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true, stockLevels: true },
  })
  if (!variant) return
  const total = variant.stockLevels.reduce((s, l) => s + l.quantity, 0)
  const min = variant.product.minStock
  if (total <= 0) {
    await notify(tx, "Out of Stock", `${variant.product.name} (${variant.sku}) is out of stock.`, "STOCK", "CRITICAL", `oos:${variant.id}`)
  } else if (total <= min) {
    await notify(tx, "Low Stock", `${variant.product.name} (${variant.sku}) has only ${total} left (min: ${min}).`, "STOCK", "WARNING", `low:${variant.id}`)
  }
}

// ============================================================
// CUSTOMER LEDGER
// ============================================================

export async function postCustomerLedger(
  tx: Tx,
  customerId: string,
  date: Date,
  description: string,
  debit: number,
  credit: number,
  referenceType?: string,
  referenceId?: string,
) {
  const customer = await tx.customer.findUnique({ where: { id: customerId } })
  if (!customer) throw new AppError("Customer not found", 404)
  const balanceAfter = customer.outstanding + debit - credit
  await tx.customer.update({ where: { id: customerId }, data: { outstanding: balanceAfter } })
  await tx.customerLedgerEntry.create({
    data: {
      customerId, date, description, debit, credit, balanceAfter,
      referenceType: referenceType ?? null, referenceId: referenceId ?? null,
    },
  })
  return balanceAfter
}

// ============================================================
// SUPPLIER LEDGER
// ============================================================

export async function postSupplierLedger(
  tx: Tx,
  supplierId: string,
  date: Date,
  description: string,
  debit: number,
  credit: number,
  referenceType?: string,
  referenceId?: string,
) {
  const supplier = await tx.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier) throw new AppError("Supplier not found", 404)
  const balanceAfter = supplier.outstanding + debit - credit
  await tx.supplier.update({ where: { id: supplierId }, data: { outstanding: balanceAfter } })
  await tx.supplierLedgerEntry.create({
    data: {
      supplierId, date, description, debit, credit, balanceAfter,
      referenceType: referenceType ?? null, referenceId: referenceId ?? null,
    },
  })
  return balanceAfter
}

// ============================================================
// PAYMENT RECORDING (the single path for money movements)
// ============================================================

export interface PaymentInput {
  direction: "IN" | "OUT"
  method: string // CASH, UPI, CARD, BANK
  category: string
  amount: number
  date?: Date
  transactionId?: string | null
  provider?: string | null
  reference?: string | null
  notes?: string | null
  customerId?: string | null
  supplierId?: string | null
  saleId?: string | null
  purchaseId?: string | null
  expenseId?: string | null
  employeeId?: string | null
  contractorId?: string | null
  qrPaymentId?: string | null
  status?: string
}

/** Creates the Payment row + number. Does NOT touch ledgers (caller decides). */
export async function createPayment(tx: Tx, input: PaymentInput, user: SessionInfo) {
  if (input.amount <= 0) throw new AppError("Payment amount must be greater than zero")
  if (!["CASH", "UPI", "CARD", "BANK"].includes(input.method)) throw new AppError("Invalid payment method")
  const number = await nextNumbered(tx, "PAY")
  return tx.payment.create({
    data: {
      number, direction: input.direction, method: input.method, category: input.category,
      amount: input.amount, date: input.date ?? new Date(),
      status: input.status ?? "VERIFIED",
      transactionId: input.transactionId ?? null,
      provider: input.provider ?? "MANUAL",
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      customerId: input.customerId ?? null,
      supplierId: input.supplierId ?? null,
      saleId: input.saleId ?? null,
      purchaseId: input.purchaseId ?? null,
      expenseId: input.expenseId ?? null,
      employeeId: input.employeeId ?? null,
      contractorId: input.contractorId ?? null,
      qrPaymentId: input.qrPaymentId ?? null,
      verifiedAt: input.status === "VERIFIED" || !input.status ? new Date() : null,
      verifiedBy: input.status === "VERIFIED" || !input.status ? user?.fullName ?? "System" : null,
      createdByName: user?.fullName ?? "System",
    },
  })
}

/** Allocate a customer payment against a sale (or general account). Updates sale + customer ledger. */
export async function applyCustomerPayment(
  tx: Tx,
  opts: {
    customerId: string | null
    saleId?: string | null
    amount: number
    method: string
    date?: Date
    transactionId?: string | null
    provider?: string | null
    notes?: string | null
    qrPaymentId?: string | null
    status?: string
    paymentCategory?: string
    user: SessionInfo
  },
) {
  let sale: null | { id: string; invoiceNumber: string; total: number; paidAmount: number; dueAmount: number; paymentStatus: string; status: string; customerId: string | null } = null
  if (opts.saleId) {
    sale = await tx.sale.findUnique({ where: { id: opts.saleId } })
    if (!sale) throw new AppError("Invoice not found", 404)
    if (sale.status === "VOID") throw new AppError("Cannot pay a voided invoice")
  }

  const payment = await createPayment(tx, {
    direction: "IN",
    method: opts.method,
    category: opts.paymentCategory ?? (sale ? "SALE_RECEIPT" : "CUSTOMER_PAYMENT"),
    amount: opts.amount,
    date: opts.date,
    transactionId: opts.transactionId,
    provider: opts.provider,
    notes: opts.notes,
    customerId: opts.customerId,
    saleId: sale?.id ?? null,
    qrPaymentId: opts.qrPaymentId ?? null,
    status: opts.status,
  }, opts.user)

  // Update sale allocation
  if (sale) {
    const paid = sale.paidAmount + opts.amount
    const due = Math.max(0, sale.total - paid)
    await tx.sale.update({
      where: { id: sale.id },
      data: { paidAmount: paid, dueAmount: due, paymentStatus: due <= 0.009 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID" },
    })
  }

  // Customer ledger (credit = they paid us)
  const customerId = opts.customerId ?? sale?.customerId ?? null
  if (customerId) {
    const date = opts.date ?? new Date()
    await postCustomerLedger(
      tx, customerId, date,
      `Payment received (${payment.number}) via ${opts.method}${sale ? ` against ${sale.invoiceNumber}` : ""}`,
      0, opts.amount, "PAYMENT", payment.id,
    )
  }

  await audit(tx, opts.user, "payments", "PAY", payment.id, { number: payment.number, amount: opts.amount, method: opts.method, saleId: sale?.id, customerId })
  return payment
}

/** Supplier payment: reduces supplier payable, updates purchase allocation */
export async function applySupplierPayment(
  tx: Tx,
  opts: {
    supplierId: string
    purchaseId?: string | null
    amount: number
    method: string
    date?: Date
    notes?: string | null
    user: SessionInfo
  },
) {
  let purchase: null | { id: string; number: string; total: number; paidAmount: number; dueAmount: number } = null
  if (opts.purchaseId) {
    purchase = await tx.purchase.findUnique({ where: { id: opts.purchaseId } })
    if (!purchase) throw new AppError("Purchase not found", 404)
  }

  const payment = await createPayment(tx, {
    direction: "OUT",
    method: opts.method,
    category: "SUPPLIER_PAYMENT",
    amount: opts.amount,
    date: opts.date,
    notes: opts.notes,
    supplierId: opts.supplierId,
    purchaseId: purchase?.id ?? null,
  }, opts.user)

  if (purchase) {
    const paid = purchase.paidAmount + opts.amount
    const due = Math.max(0, purchase.total - paid)
    await tx.purchase.update({
      where: { id: purchase.id },
      data: { paidAmount: paid, dueAmount: due, paymentStatus: due <= 0.009 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID" },
    })
  }

  const date = opts.date ?? new Date()
  await postSupplierLedger(
    tx, opts.supplierId, date,
    `Payment made (${payment.number}) via ${opts.method}${purchase ? ` against ${purchase.number}` : ""}`,
    0, opts.amount, "PAYMENT", payment.id,
  )

  await audit(tx, opts.user, "payments", "PAY", payment.id, { number: payment.number, amount: opts.amount, method: opts.method, supplierId: opts.supplierId })
  return payment
}
