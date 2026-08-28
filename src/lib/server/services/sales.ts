// Sale (invoice) creation — used by POS, order→invoice conversion and demo data.
// ATOMIC: sale + items + stock movements + payments + customer ledger + audit in ONE transaction.
import { Prisma } from "@prisma/client"
import { AppError, nextNumbered, audit, parseDate, optNum, requireNum } from "@/lib/server/helpers"
import { applyStockChange, checkStockAlerts, postCustomerLedger, createPayment, SessionInfo } from "@/lib/server/services/core"

type Tx = Prisma.TransactionClient

export interface SaleItemInput {
  variantId: string
  quantity: number
  unitPrice: number
  discount?: number // line-level discount amount
  taxRate?: number
}

export interface SalePaymentInput {
  method: string
  amount: number
  transactionId?: string
}

export interface CreateSaleInput {
  customerId?: string | null
  type?: string // RETAIL | WHOLESALE
  warehouseId?: string
  items: SaleItemInput[]
  extraDiscount?: number
  payments: SalePaymentInput[]
  notes?: string | null
  date?: Date
  orderId?: string | null
  salespersonName?: string | null
}

export async function createSale(tx: Tx, input: CreateSaleInput, user: SessionInfo) {
  if (!input.items?.length) throw new AppError("Cart is empty — add at least one item")
  if (input.payments?.some((p) => !["CASH", "UPI", "CARD", "BANK"].includes(p.method))) {
    throw new AppError("Invalid payment method")
  }

  const business = await tx.businessProfile.findFirst()
  const defaultWh = await tx.warehouse.findFirst({ where: { isDefault: true } }) ?? await tx.warehouse.findFirst()
  const warehouseId = input.warehouseId ?? defaultWh?.id
  if (!warehouseId) throw new AppError("No warehouse found. Create a warehouse first.")

  // Resolve customer (needed for credit sales)
  let customer = null as null | { id: string; name: string; type: string; discountPercent: number }
  if (input.customerId) {
    customer = await tx.customer.findUnique({ where: { id: input.customerId } })
    if (!customer) throw new AppError("Customer not found", 404)
  }

  const date = input.date ?? new Date()

  // ---- Load variants ----
  const variantIds = input.items.map((i) => i.variantId)
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: true, size: true, color: true },
  })
  const vmap = new Map(variants.map((v) => [v.id, v]))
  for (const item of input.items) {
    if (!vmap.has(item.variantId)) throw new AppError("Product variant not found in cart")
    const q = Math.round(requireNum(item.quantity, "Quantity", 0.5, 100000))
    if (q < 1) throw new AppError("Quantity must be at least 1")
  }

  // ---- Compute totals ----
  let subtotal = 0, itemDiscount = 0, taxAmount = 0
  const lines = input.items.map((item) => {
    const v = vmap.get(item.variantId)!
    const qty = Math.round(item.quantity)
    // wholesale pricing default if price not explicitly passed and sale is wholesale
    let unitPrice = optNum(item.unitPrice, v.sellingPrice || v.product.sellingPrice || v.mrp)
    const discount = Math.max(0, optNum(item.discount, 0))
    const taxRate = optNum(item.taxRate, business?.taxEnabled === false ? 0 : v.product.taxRate)
    const lineSubtotal = unitPrice * qty - discount
    const lineTax = (lineSubtotal * taxRate) / 100
    subtotal += unitPrice * qty
    itemDiscount += discount
    taxAmount += lineTax
    const variantLabel = [v.color?.name, v.size?.name].filter(Boolean).join(" / ") || "Default"
    return {
      variantId: v.id,
      productName: v.product.name,
      variantLabel,
      quantity: qty,
      unitPrice,
      discount,
      taxRate,
      taxAmount: lineTax,
      lineTotal: lineSubtotal + lineTax,
      costPrice: v.costPrice || v.product.costPrice,
    }
  })

  const extraDiscount = Math.max(0, optNum(input.extraDiscount, 0))
  // extra discount reduces taxable base proportionally — keep simple: reduce total, recompute effective tax share proportionally
  const totalBeforeExtra = subtotal - itemDiscount + taxAmount
  const total = Math.max(0, totalBeforeExtra - extraDiscount)

  const paidNow = input.payments?.reduce((s, p) => s + optNum(p.amount, 0), 0) ?? 0
  const dueAmount = Math.max(0, total - paidNow)

  if (dueAmount > 0.009 && !customer) {
    throw new AppError("Credit sale requires a registered customer. Select a customer or record full payment.")
  }
  if (dueAmount > 0.009 && customer) {
    const c = await tx.customer.findUnique({ where: { id: customer.id } })
    const projected = (c?.outstanding ?? 0) + dueAmount
    if (c && c.creditLimit > 0 && projected > c.creditLimit) {
      throw new AppError(`Credit limit exceeded. ${c.name} has outstanding ₹${c.outstanding.toFixed(2)} and limit is ₹${c.creditLimit.toFixed(2)}.`)
    }
  }

  const invoiceNumber = await nextNumbered(tx, "INV")

  // ---- Create sale ----
  const sale = await tx.sale.create({
    data: {
      invoiceNumber,
      type: input.type === "WHOLESALE" ? "WHOLESALE" : "RETAIL",
      customerId: customer?.id ?? null,
      orderId: input.orderId ?? null,
      warehouseId,
      date,
      subtotal, itemDiscount, extraDiscount, taxAmount,
      total, paidAmount: Math.min(paidNow, total), dueAmount,
      paymentStatus: dueAmount <= 0.009 ? "PAID" : paidNow > 0 ? "PARTIAL" : "UNPAID",
      salespersonName: input.salespersonName ?? user?.fullName ?? null,
      notes: input.notes ?? null,
      createdByName: user?.fullName ?? "System",
      items: { create: lines },
    },
    include: { items: true },
  })

  // ---- Stock movements ----
  for (const line of lines) {
    await applyStockChange(tx, {
      variantId: line.variantId, warehouseId, delta: -line.quantity,
      type: "SALE", referenceType: "SALE", referenceId: sale.id,
      note: `Sale ${invoiceNumber}`, userName: user?.fullName,
    })
    await checkStockAlerts(tx, line.variantId)
  }

  // ---- Payments ----
  for (const p of input.payments ?? []) {
    const amt = optNum(p.amount, 0)
    if (amt <= 0) continue
    await createPayment(tx, {
      direction: "IN", method: p.method, category: "SALE_RECEIPT",
      amount: Math.min(amt, total), date, transactionId: p.transactionId ?? null,
      customerId: customer?.id ?? null, saleId: sale.id,
    }, user)
  }

  // ---- Customer ledger ----
  if (customer) {
    await postCustomerLedger(tx, customer.id, date, `Invoice ${invoiceNumber} (sale)`, total, 0, "SALE", sale.id)
    if (paidNow > 0) {
      await postCustomerLedger(
        tx, customer.id, date,
        `Paid at sale (${input.payments.map((p) => p.method).join(" + ")}) against ${invoiceNumber}`,
        0, Math.min(paidNow, total), "PAYMENT", sale.id,
      )
    }
  }

  // ---- Link order ----
  if (input.orderId) {
    await tx.order.update({
      where: { id: input.orderId },
      data: { saleId: sale.id, status: "DELIVERED", deliveryStatus: "DELIVERED", paidAmount: Math.min(paidNow, total) },
    })
  }

  await audit(tx, user, "sales", "CREATE", sale.id, {
    invoiceNumber, total, items: lines.length, customerId: customer?.id,
    paid: Math.min(paidNow, total), due: dueAmount,
  })

  return sale
}
