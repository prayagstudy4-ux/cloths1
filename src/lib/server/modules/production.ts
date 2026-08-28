import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum, clampInt, parseDate, requireStr } from "@/lib/server/helpers"
import { applyStockChange, checkStockAlerts, createPayment, SessionInfo } from "@/lib/server/services/core"

// Handles: /api/contractors, /api/jobworks, /api/production, /api/raw-materials
export async function handle(ctx: Ctx) {
  const root = ctx.segs[0]
  const action = ctx.segs[1]
  const id = ctx.segs[2]

  // ============================================================
  // CONTRACTORS
  // ============================================================
  if (root === "contractors") {
    if (ctx.method === "GET" && !action) {
      ctx.requirePerm("production", "view")
      const contractors = await db.contractor.findMany({
        orderBy: { createdAt: "desc" },
        include: { jobWorks: { orderBy: { assignedAt: "desc" }, take: 100 } },
      })
      return json({
        contractors: contractors.map((c) => ({
          ...c, jobWorks: undefined,
          stats: {
            totalWorks: c.jobWorks.length,
            activeWorks: c.jobWorks.filter((j) => j.status === "ASSIGNED" || j.status === "PROCESSING").length,
            completedWorks: c.jobWorks.filter((j) => j.status === "COMPLETED").length,
            totalEarned: c.jobWorks.reduce((s, j) => s + j.totalAmount, 0),
            outstanding: c.outstanding,
          },
        })),
      })
    }
    if (ctx.method === "POST" && !action) {
      ctx.requirePerm("production", "create")
      const b = ctx.body ?? {}
      const contractor = await db.contractor.create({
        data: {
          name: requireStr(b.name, "Name", 120),
          type: optStr(b.type) ?? "TAILOR",
          phone: optStr(b.phone, 20),
          address: optStr(b.address, 400),
          rate: optNum(b.rate, 0),
          notes: optStr(b.notes, 1000),
        },
      })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "CREATE", contractor.id, { type: "contractor", name: contractor.name }))
      return json({ contractor })
    }
    if (ctx.method === "PUT" && action && !id) {
      const contractorId = action
      ctx.requirePerm("production", "edit")
      const existing = await db.contractor.findUnique({ where: { id: contractorId } })
      if (!existing) throw new AppError("Contractor not found", 404)
      const b = ctx.body ?? {}
      const contractor = await db.contractor.update({
        where: { id: contractorId },
        data: {
          name: optStr(b.name) ?? existing.name,
          type: optStr(b.type) ?? existing.type,
          phone: b.phone !== undefined ? optStr(b.phone, 20) : existing.phone,
          address: b.address !== undefined ? optStr(b.address, 400) : existing.address,
          rate: b.rate !== undefined ? optNum(b.rate, existing.rate) : existing.rate,
          notes: b.notes !== undefined ? optStr(b.notes, 1000) : existing.notes,
          active: b.active !== undefined ? !!b.active : existing.active,
        },
      })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "UPDATE", contractorId, { type: "contractor" }))
      return json({ contractor })
    }
    if (ctx.method === "DELETE" && action && !id) {
      const contractorId = action
      ctx.requirePerm("production", "delete")
      const existing = await db.contractor.findUnique({ where: { id: contractorId }, include: { jobWorks: { take: 1 } } })
      if (!existing) throw new AppError("Contractor not found", 404)
      if (existing.jobWorks.length) throw new AppError("Contractor has job work history")
      await db.contractor.delete({ where: { id: contractorId } })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "DELETE", contractorId, { name: existing.name }))
      return json({ ok: true })
    }
    if (ctx.method === "GET" && action && !id) {
      ctx.requirePerm("production", "view")
      const contractor = await db.contractor.findUnique({
        where: { id: action },
        include: { jobWorks: { orderBy: { assignedAt: "desc" } } },
      })
      if (!contractor) throw new AppError("Contractor not found", 404)
      const payments = await db.payment.findMany({ where: { contractorId: id }, orderBy: { date: "desc" }, take: 50 })
      return json({ contractor: { ...contractor, payments } })
    }
    // Pay contractor
    if (ctx.method === "POST" && action && id === "pay") {
    const contractorId = action
      ctx.requirePerm("production", "pay")
      const b = ctx.body ?? {}
      const amount = optNum(b.amount, 0)
      if (amount <= 0) throw new AppError("Amount must be greater than zero")
      const result = await db.$transaction(async (tx) => {
        const contractor = await tx.contractor.findUnique({ where: { id: contractorId } })
        if (!contractor) throw new AppError("Contractor not found", 404)
        const payment = await createPayment(tx, {
          direction: "OUT",
          method: ["CASH", "UPI", "CARD", "BANK"].includes(b.method) ? b.method : "CASH",
          category: "CONTRACTOR_PAYMENT",
          amount, date: b.date ? parseDate(b.date) : new Date(),
          contractorId, notes: optStr(b.notes, 500) ?? `Payment to ${contractor.name}`,
        }, ctx.user as SessionInfo)
        await tx.contractor.update({ where: { id: contractorId }, data: { outstanding: { decrement: amount } } })
        await audit(tx, ctx.user, "production", "PAY", payment.id, { contractor: contractor.name, amount })
        return payment
      }, { timeout: 60000, maxWait: 20000 })
      return json({ payment: result })
    }
  }

  // ============================================================
  // JOB WORKS
  // ============================================================
  if (root === "jobworks") {
    if (ctx.method === "GET" && !action) {
      ctx.requirePerm("production", "view")
      const status = ctx.params.get("status")
      const contractorId = ctx.params.get("contractorId")
      const where: any = {}
      if (status) where.status = status
      if (contractorId) where.contractorId = contractorId
      const jobWorks = await db.jobWork.findMany({
        where, orderBy: { assignedAt: "desc" }, take: 200,
        include: { contractor: true },
      })
      return json({
        jobWorks,
        summary: {
          pending: jobWorks.filter((j) => j.status === "ASSIGNED" || j.status === "PROCESSING").reduce((s, j) => s + (j.quantity - j.completedQty), 0),
          completed: jobWorks.reduce((s, j) => s + j.completedQty, 0),
          outstandingPayable: jobWorks.reduce((s, j) => s + j.totalAmount, 0),
        },
      })
    }
    if (ctx.method === "POST" && !action) {
      ctx.requirePerm("production", "create")
      const b = ctx.body ?? {}
      const contractorId = requireStr(b.contractorId, "Contractor")
      const quantity = clampInt(b.quantity, 1, 1000000, 0)
      if (quantity < 1) throw new AppError("Quantity must be at least 1")
      const rate = optNum(b.rate, 0)
      const jobWork = await db.$transaction(async (tx) => {
        const contractor = await tx.contractor.findUnique({ where: { id: contractorId } })
        if (!contractor) throw new AppError("Contractor not found", 404)
        const business = await tx.businessProfile.findFirst()
        const count = await tx.counter.upsert({ where: { key: "JW" }, update: { value: { increment: 1 } }, create: { key: "JW", value: 1 } })
        const number = `${business?.jobworkPrefix ?? "JW"}-${String(count.value).padStart(5, "0")}`
        let productName = optStr(b.description, 200) ?? "Job work"
        if (b.productId) {
          const product = await tx.product.findUnique({ where: { id: b.productId } })
          if (product) productName = product.name
        }
        return tx.jobWork.create({
          data: {
            number, contractorId,
            productId: optStr(b.productId),
            variantId: optStr(b.variantId),
            description: productName,
            quantity, rate,
            totalAmount: 0,
            status: "ASSIGNED",
            dueDate: b.dueDate ? parseDate(b.dueDate) : null,
            notes: optStr(b.notes, 1000),
            createdByName: ctx.user?.fullName ?? "System",
          },
        })
      }, { timeout: 60000, maxWait: 20000 })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "CREATE", jobWork.id, { type: "jobwork", number: jobWork.number, quantity, rate }))
      return json({ jobWork })
    }
    // Update progress (completed qty) → contractor earns rate × delta
    if (ctx.method === "POST" && action && id === "progress") {
    const jobWorkId = action
      ctx.requirePerm("production", "edit")
      const b = ctx.body ?? {}
      const result = await db.$transaction(async (tx) => {
        const jw = await tx.jobWork.findUnique({ where: { id: jobWorkId } })
        if (!jw) throw new AppError("Job work not found", 404)
        if (jw.status === "CANCELLED") throw new AppError("Job work is cancelled")
        const completedQty = clampInt(b.completedQty, 0, jw.quantity, jw.completedQty)
        const delta = completedQty - jw.completedQty
        const earned = delta * jw.rate
        const status = completedQty >= jw.quantity ? "COMPLETED" : completedQty > 0 ? "PROCESSING" : "ASSIGNED"
        const updated = await tx.jobWork.update({
          where: { id: jobWorkId },
          data: {
            completedQty, status,
            totalAmount: { increment: earned },
            completedAt: status === "COMPLETED" ? new Date() : null,
          },
        })
        if (earned !== 0) {
          await tx.contractor.update({ where: { id: jw.contractorId }, data: { outstanding: { increment: earned } } })
        }
        return updated
      }, { timeout: 60000, maxWait: 20000 })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "UPDATE", jobWorkId, { type: "jobwork_progress", number: result.number, completedQty: result.completedQty }))
      return json({ jobWork: result })
    }
    // Receive finished goods into stock from job work
    if (ctx.method === "POST" && action && id === "receive-goods") {
    const jobWorkId = action
      ctx.requirePerm("production", "edit")
      const b = ctx.body ?? {}
      const result = await db.$transaction(async (tx) => {
        const jw = await tx.jobWork.findUnique({ where: { id: jobWorkId } })
        if (!jw) throw new AppError("Job work not found", 404)
        if (!jw.variantId) throw new AppError("This job work is not linked to a product variant")
        const quantity = clampInt(b.quantity, 1, jw.completedQty, 0)
        if (quantity < 1) throw new AppError("No completed pieces available to receive")
        const warehouse = (await tx.warehouse.findFirst({ where: { isDefault: true } })) ?? await tx.warehouse.findFirst()
        if (!warehouse) throw new AppError("No warehouse configured")
        await applyStockChange(tx, {
          variantId: jw.variantId, warehouseId: warehouse.id, delta: quantity,
          type: "PRODUCTION_IN", referenceType: "JOBWORK", referenceId: jw.id,
          note: `Finished goods from ${jw.number}`, userName: ctx.user?.fullName,
        })
        await checkStockAlerts(tx, jw.variantId)
        return { ok: true, quantity }
      }, { timeout: 60000, maxWait: 20000 })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "RECEIVE", jobWorkId, { action: "received_finished_goods", quantity: result.quantity }))
      return json(result)
    }
    if (ctx.method === "POST" && action && id === "cancel") {
      ctx.requirePerm("production", "edit")
      const jobWorkId = action
      const jw = await db.$transaction(async (tx) => {
        const j = await tx.jobWork.findUnique({ where: { id: jobWorkId } })
        if (!j) throw new AppError("Job work not found", 404)
        if (j.status === "COMPLETED") throw new AppError("Completed job work cannot be cancelled")
        return tx.jobWork.update({ where: { id: jobWorkId }, data: { status: "CANCELLED" } })
      }, { timeout: 60000, maxWait: 20000 })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "VOID", jobWorkId, { number: jw.number }))
      return json({ jobWork: jw })
    }
    if (ctx.method === "GET" && action && !id) {
      ctx.requirePerm("production", "view")
      const jobWork = await db.jobWork.findUnique({ where: { id: action }, include: { contractor: true } })
      if (!jobWork) throw new AppError("Job work not found", 404)
      return json({ jobWork })
    }
  }

  // ============================================================
  // PRODUCTION ORDERS
  // ============================================================
  if (root === "production") {
    if (ctx.method === "GET" && !action) {
      ctx.requirePerm("production", "view")
      const status = ctx.params.get("status")
      const where: any = {}
      if (status) where.status = status
      const orders = await db.productionOrder.findMany({
        where, orderBy: { startDate: "desc" }, take: 200,
        include: { contractor: true },
      })
      return json({
        orders,
        summary: {
          active: orders.filter((o) => o.status === "IN_PROGRESS").length,
          completed: orders.filter((o) => o.status === "COMPLETED").length,
        },
      })
    }
    if (ctx.method === "POST" && !action) {
      ctx.requirePerm("production", "create")
      const b = ctx.body ?? {}
      const productId = requireStr(b.productId, "Product")
      const quantity = clampInt(b.quantity, 1, 1000000, 0)
      if (quantity < 1) throw new AppError("Quantity must be at least 1")
      const order = await db.$transaction(async (tx) => {
        const product = await tx.product.findUnique({ where: { id: productId }, include: { variants: true } })
        if (!product) throw new AppError("Product not found", 404)
        const business = await tx.businessProfile.findFirst()
        const count = await tx.counter.upsert({ where: { key: "PRO" }, update: { value: { increment: 1 } }, create: { key: "PRO", value: 1 } })
        const number = `${business?.productionPrefix ?? "PRO"}-${String(count.value).padStart(5, "0")}`
        // plan lines: how finished qty splits across variants
        let planLines: { variantId: string; qty: number }[] = []
        if (Array.isArray(b.planLines) && b.planLines.length) {
          planLines = b.planLines.map((l: any) => ({ variantId: String(l.variantId), qty: clampInt(l.qty, 0, 1000000, 0) }))
        } else if (product.variants.length === 1) {
          planLines = [{ variantId: product.variants[0].id, qty: quantity }]
        }
        return tx.productionOrder.create({
          data: {
            number, productId,
            designName: optStr(b.designName, 160),
            contractorId: optStr(b.contractorId),
            quantity,
            stage: "DESIGN",
            status: "IN_PROGRESS",
            planLines: planLines.length ? JSON.stringify(planLines) : null,
            warehouseId: optStr(b.warehouseId),
            costEstimate: optNum(b.costEstimate, 0),
            notes: optStr(b.notes, 1000),
            targetDate: b.targetDate ? parseDate(b.targetDate) : null,
            createdByName: ctx.user?.fullName ?? "System",
          },
          include: { contractor: true },
        })
      }, { timeout: 60000, maxWait: 20000 })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "CREATE", order.id, { type: "production_order", number: order.number, quantity }))
      return json({ order: { ...order, planLines: JSON.parse(order.planLines ?? "[]") } })
    }
    // Advance stage (or jump); on COMPLETED → finished stock in
    if (ctx.method === "POST" && action && id === "stage") {
    const orderId = action
      ctx.requirePerm("production", "edit")
      const b = ctx.body ?? {}
      const result = await db.$transaction(async (tx) => {
        const order = await tx.productionOrder.findUnique({ where: { id: orderId } })
        if (!order) throw new AppError("Production order not found", 404)
        if (order.status !== "IN_PROGRESS") throw new AppError("Production order is not active")
        const stages = ["DESIGN", "RAW_MATERIAL", "CUTTING", "STITCHING", "PRINTING", "FINISHING", "QC", "PACKAGING", "COMPLETED"]
        let stage = optStr(b.stage)
        if (!stage || !stages.includes(stage)) {
          const idx = stages.indexOf(order.stage)
          stage = stages[Math.min(idx + 1, stages.length - 1)]
        }
        const updated = await tx.productionOrder.update({
          where: { id: orderId },
          data: {
            stage,
            status: stage === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
            completedAt: stage === "COMPLETED" ? new Date() : null,
          },
        })
        if (stage === "COMPLETED") {
          // Finished goods into stock per plan lines
          const plan: { variantId: string; qty: number }[] = JSON.parse(order.planLines ?? "[]")
          const warehouseId = order.warehouseId ?? (await tx.warehouse.findFirst({ where: { isDefault: true } }))?.id ?? (await tx.warehouse.findFirst())?.id
          if (warehouseId && plan.length) {
            for (const line of plan) {
              if (line.qty <= 0) continue
              await applyStockChange(tx, {
                variantId: line.variantId, warehouseId, delta: line.qty,
                type: "PRODUCTION_IN", referenceType: "PRODUCTION", referenceId: order.id,
                note: `Production completed ${order.number}`, userName: ctx.user?.fullName,
              })
              await checkStockAlerts(tx, line.variantId)
            }
          }
        }
        return updated
      }, { timeout: 60000, maxWait: 20000 })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "UPDATE", orderId, { type: "stage", stage: result.stage, number: result.number }))
      return json({ order: result })
    }
    if (ctx.method === "POST" && action && id === "cancel") {
      ctx.requirePerm("production", "edit")
      const orderId2 = action
      const order = await db.productionOrder.update({ where: { id: orderId2 }, data: { status: "CANCELLED" } })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "VOID", orderId2, { number: order.number }))
      return json({ order })
    }
    if (ctx.method === "GET" && action && !id) {
      ctx.requirePerm("production", "view")
      const order = await db.productionOrder.findUnique({ where: { id: action }, include: { contractor: true } })
      if (!order) throw new AppError("Production order not found", 404)
      return json({ order: { ...order, plan: JSON.parse(order.planLines ?? "[]") } })
    }
  }

  // ============================================================
  // RAW MATERIALS
  // ============================================================
  if (root === "raw-materials") {
    if (ctx.method === "GET" && !action) {
      ctx.requirePerm("production", "view")
      const type = ctx.params.get("type")
      const q = ctx.params.get("q")?.toLowerCase()
      const where: any = {}
      if (type) where.type = type
      if (q) where.name = { contains: q }
      const materials = await db.rawMaterial.findMany({ where, orderBy: { name: "asc" } })
      return json({
        materials,
        summary: {
          totalValue: materials.reduce((s, m) => s + m.quantity * m.costPerUnit, 0),
          lowCount: materials.filter((m) => m.quantity <= m.minQuantity).length,
        },
      })
    }
    if (ctx.method === "POST" && !action) {
      ctx.requirePerm("production", "create")
      const b = ctx.body ?? {}
      const material = await db.rawMaterial.create({
        data: {
          name: requireStr(b.name, "Material name", 120),
          type: optStr(b.type) ?? "FABRIC",
          unit: optStr(b.unit) ?? "METER",
          quantity: optNum(b.quantity, 0),
          minQuantity: optNum(b.minQuantity, 0),
          costPerUnit: optNum(b.costPerUnit, 0),
          supplierId: optStr(b.supplierId),
          notes: optStr(b.notes, 500),
        },
      })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "CREATE", material.id, { type: "raw_material", name: material.name }))
      return json({ material })
    }
    if (ctx.method === "PUT" && action && !id) {
      ctx.requirePerm("production", "edit")
      const materialId = action
      const existing = await db.rawMaterial.findUnique({ where: { id: materialId } })
      if (!existing) throw new AppError("Material not found", 404)
      const b = ctx.body ?? {}
      const material = await db.rawMaterial.update({
        where: { id: materialId },
        data: {
          name: optStr(b.name) ?? existing.name,
          type: optStr(b.type) ?? existing.type,
          unit: optStr(b.unit) ?? existing.unit,
          quantity: b.quantity !== undefined ? optNum(b.quantity, existing.quantity) : existing.quantity,
          minQuantity: b.minQuantity !== undefined ? optNum(b.minQuantity, existing.minQuantity) : existing.minQuantity,
          costPerUnit: b.costPerUnit !== undefined ? optNum(b.costPerUnit, existing.costPerUnit) : existing.costPerUnit,
          notes: b.notes !== undefined ? optStr(b.notes, 500) : existing.notes,
        },
      })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "UPDATE", materialId, { type: "raw_material" }))
      return json({ material })
    }
    if (ctx.method === "DELETE" && action && !id) {
      ctx.requirePerm("production", "delete")
      await db.rawMaterial.delete({ where: { id: action } })
      await db.$transaction(async (tx) => audit(tx, ctx.user, "production", "DELETE", action, { type: "raw_material" }))
      return json({ ok: true })
    }
  }

  return null
}
