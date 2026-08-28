import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum, clampInt, parseDate } from "@/lib/server/helpers"
import { applyStockChange, checkStockAlerts, postCustomerLedger, createPayment, SessionInfo } from "@/lib/server/services/core"

export async function handle(ctx: Ctx) {
  const [, seg1, seg2] = ctx.segs

  if (ctx.method === "GET" && !seg1) {
    ctx.requirePerm("sales", "view")
    const q = ctx.params.get("q")?.toLowerCase()
    const type = ctx.params.get("type")
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(200, parseInt(ctx.params.get("pageSize") ?? "50"))
    const where: any = {}
    if (type) where.type = type
    if (q) where.OR = [{ number: { contains: q } }, { customer: { name: { contains: q } } }]
    const [total, returns] = await Promise.all([
      db.returnRecord.count({ where }),
      db.returnRecord.findMany({
        where, orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize, take: pageSize,
        include: { customer: true, sale: true, lines: { include: { variant: { include: { product: true, size: true, color: true } } } } },
      }),
    ])
    return json({ returns, total, page, pageSize })
  }

  if (ctx.method === "GET" && seg1 && !seg2) {
    const id = seg1
    ctx.requirePerm("sales", "view")
    const ret = await db.returnRecord.findUnique({
      where: { id },
      include: { customer: true, sale: true, lines: { include: { variant: { include: { product: true, size: true, color: true } } } } },
    })
    if (!ret) throw new AppError("Return not found", 404)
    return json({ return: ret })
  }

  // ---------- CREATE RETURN / EXCHANGE ----------
  if (ctx.method === "POST" && !seg1) {
    ctx.requirePerm("sales", "create")
    const b = ctx.body ?? {}
    const type = ["CUSTOMER_RETURN", "EXCHANGE"].includes(b.type) ? b.type : "CUSTOMER_RETURN"
    const saleId = optStr(b.saleId)
    const items = Array.isArray(b.items) ? b.items : [] // [{saleItemId, quantity}]
    const exchangeItems = Array.isArray(b.exchangeItems) ? b.exchangeItems : [] // [{variantId, quantity, unitPrice}]

    const result = await db.$transaction(async (tx) => {
      let sale: any = null
      let customerId: string | null = optStr(b.customerId)
      const warehouse = (await tx.warehouse.findFirst({ where: { isDefault: true } })) ?? await tx.warehouse.findFirst()
      if (!warehouse) throw new AppError("No warehouse configured")

      if (saleId) {
        sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } })
        if (!sale) throw new AppError("Invoice not found", 404)
        if (sale.status === "VOID") throw new AppError("Cannot return against a voided invoice")
        customerId = customerId ?? sale.customerId
      }
      if (!items.length && !exchangeItems.length) throw new AppError("Add at least one returned item")
      if (type === "EXCHANGE" && !exchangeItems.length) throw new AppError("Exchange requires new items")

      // ---- Process returned lines ----
      let returnValue = 0
      const returnLines: any[] = []
      const saleItemMap = new Map<string, any>((sale?.items ?? []).map((i: any) => [i.id as string, i]))
      for (const item of items) {
        const qty = clampInt(item.quantity, 1, 100000, 0)
        if (qty < 1) continue
        let lineUnitPrice = optNum(item.unitPrice, 0)
        let variantId = optStr(item.variantId)
        let productName = ""
        if (item.saleItemId) {
          const si = saleItemMap.get(item.saleItemId)
          if (!si) throw new AppError("Invoice item not found")
          const returnable = si.quantity - si.returnedQty
          if (qty > returnable) throw new AppError(`Only ${returnable} of ${si.productName} (${si.variantLabel}) can still be returned`)
          await tx.saleItem.update({ where: { id: si.id }, data: { returnedQty: { increment: qty } } })
          lineUnitPrice = si.lineTotal / si.quantity // includes tax + discount share
          variantId = si.variantId
          productName = si.productName
        } else if (!variantId) {
          throw new AppError("Returned item missing variant")
        }
        const lineValue = lineUnitPrice * qty
        returnValue += lineValue
        // stock back in
        await applyStockChange(tx, {
          variantId: variantId!, warehouseId: warehouse.id, delta: qty,
          type: "SALE_RETURN", referenceType: "RETURN", note: `${type === "EXCHANGE" ? "Exchange" : "Return"}${sale ? ` ${sale.invoiceNumber}` : ""}`,
          userName: ctx.user?.fullName, allowNegative: false,
        })
        await checkStockAlerts(tx, variantId!)
        returnLines.push({ kind: "RETURNED", variantId: variantId!, warehouseId: warehouse.id, quantity: qty, unitPrice: lineUnitPrice, lineValue })
      }

      // ---- Process exchange (new items out) ----
      let exchangeValue = 0
      for (const ex of exchangeItems) {
        const qty = clampInt(ex.quantity, 1, 100000, 1)
        const v = await tx.productVariant.findUnique({ where: { id: ex.variantId }, include: { product: true, size: true, color: true } })
        if (!v) throw new AppError("Exchange variant not found")
        const unitPrice = optNum(ex.unitPrice, v.sellingPrice)
        const lineValue = unitPrice * qty
        exchangeValue += lineValue
        await applyStockChange(tx, {
          variantId: v.id, warehouseId: warehouse.id, delta: -qty,
          type: "SALE", referenceType: "RETURN", note: `Exchange issue${sale ? ` ${sale.invoiceNumber}` : ""}`,
          userName: ctx.user?.fullName,
        })
        await checkStockAlerts(tx, v.id)
        returnLines.push({ kind: "EXCHANGED_IN", variantId: v.id, warehouseId: warehouse.id, quantity: qty, unitPrice, lineValue })
      }

      // ---- Settle difference ----
      const diff = exchangeValue - returnValue // >0 customer owes, <0 we owe
      let refundAmount = 0
      let exchangeDue = 0
      let exchangePaid = 0
      const refundMethod = optStr(b.refundMethod) ?? (diff < 0 ? "STORE_CREDIT" : "NONE")
      const date = b.date ? parseDate(b.date) : new Date()

      if (diff < 0) {
        refundAmount = -diff
        if (refundMethod === "CASH_REFUND" || refundMethod === "UPI_REFUND") {
          await createPayment(tx, {
            direction: "OUT", method: refundMethod === "CASH_REFUND" ? "CASH" : "UPI", category: "REFUND",
            amount: refundAmount, date, customerId, saleId: sale?.id ?? null,
            notes: `Refund for return${sale ? ` ${sale.invoiceNumber}` : ""}`,
          }, ctx.user as SessionInfo)
        }
        // STORE_CREDIT / ADJUSTMENT → ledger credit only
      } else if (diff > 0) {
        exchangeDue = diff
        const immediate = clampInt(b.exchangePaidAmount, 0, 100000000, 0)
        if (immediate > 0) {
          if (immediate > diff) throw new AppError(`Exchange payment exceeds difference of ₹${diff.toFixed(2)}`)
          exchangePaid = immediate
          await createPayment(tx, {
            direction: "IN", method: ["CASH", "UPI", "CARD", "BANK"].includes(b.exchangePaidMethod) ? b.exchangePaidMethod : "CASH",
            category: "SALE_RECEIPT", amount: immediate, date, customerId, saleId: sale?.id ?? null,
            notes: `Exchange difference${sale ? ` ${sale.invoiceNumber}` : ""}`,
          }, ctx.user as SessionInfo)
        }
      }

      // ---- Create record ----
      const count = await tx.counter.upsert({ where: { key: "RET" }, update: { value: { increment: 1 } }, create: { key: "RET", value: 1 } })
      const business = await tx.businessProfile.findFirst()
      const number = `${business?.returnPrefix ?? "RET"}-${String(count.value).padStart(5, "0")}`
      const ret = await tx.returnRecord.create({
        data: {
          number, type, saleId: sale?.id ?? null, customerId,
          refundMethod: returnValue > 0 || exchangeValue > 0 ? refundMethod : "NONE",
          refundAmount, exchangeDue, exchangePaid, totalValue: returnValue,
          notes: optStr(b.notes, 1000),
          createdByName: ctx.user?.fullName ?? "System",
          lines: { create: returnLines },
        },
        include: { lines: true },
      })

      // ---- Customer ledger ----
      if (customerId) {
        if (returnValue > 0 && diff <= 0) {
          const desc = refundMethod === "STORE_CREDIT" || refundMethod === "ADJUSTMENT"
            ? `Store credit issued (${number})${sale ? ` for ${sale.invoiceNumber}` : ""}`
            : `Refund issued (${number})${sale ? ` for ${sale.invoiceNumber}` : ""}`
          await postCustomerLedger(tx, customerId, date, desc, 0, returnValue, "RETURN", ret.id)
        }
        if (returnValue > 0 && diff > 0) {
          // exchange with higher value: net debit the difference not covered by return
          // return credit then charge difference
          await postCustomerLedger(tx, customerId, date, `Goods returned (${number})`, 0, returnValue, "RETURN", ret.id)
        }
        if (exchangeDue > exchangePaid && exchangeDue > 0) {
          const owed = exchangeDue - exchangePaid
          await postCustomerLedger(tx, customerId, date, `Exchange difference due (${number})`, owed, 0, "RETURN", ret.id)
        } else if (exchangePaid > 0 && exchangeDue === 0 && returnValue === 0) {
          await postCustomerLedger(tx, customerId, date, `Exchange difference received (${number})`, 0, exchangePaid, "RETURN", ret.id)
        }
      }

      // if return without exchange against an invoice with due → reduce sale due by refund (store credit offsets)
      if (sale && refundAmount > 0 && (refundMethod === "STORE_CREDIT" || refundMethod === "ADJUSTMENT")) {
        const s = await tx.sale.findUnique({ where: { id: sale.id } })
        if (s && s.dueAmount > 0) {
          const newDue = Math.max(0, s.dueAmount - refundAmount)
          await tx.sale.update({
            where: { id: sale.id },
            data: { dueAmount: newDue, paidAmount: s.total - newDue, paymentStatus: newDue <= 0.009 ? "PAID" : "PARTIAL" },
          })
        }
      }

      return ret
    }, { timeout: 60000, maxWait: 20000 })

    await db.$transaction(async (tx) => audit(tx, ctx.user, "sales", "CREATE", result.id, { type, number: result.number, refundAmount: result.refundAmount, exchangeDue: result.exchangeDue }))
    return json({ return: await db.returnRecord.findUnique({ where: { id: result.id }, include: { lines: { include: { variant: { include: { product: true } } } } } }) })
  }

  return null
}
