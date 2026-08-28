import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum, parseDate, requireStr } from "@/lib/server/helpers"
import { notify } from "@/lib/server/helpers"

export async function handle(ctx: Ctx) {
  const [, action, id] = ctx.segs

  if (ctx.method === "GET" && (!action || action === "index")) {
    ctx.requirePerm("tasks", "view")
    const status = ctx.params.get("status")
    const where: any = {}
    if (status) where.status = status
    const tasks = await db.task.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 300 })
    return json({
      tasks,
      summary: {
        pending: tasks.filter((t) => t.status === "PENDING").length,
        inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
        overdue: tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.dueDate && t.dueDate < new Date()).length,
      },
    })
  }

  if (ctx.method === "POST" && (!action || action === "index")) {
    ctx.requirePerm("tasks", "create")
    const b = ctx.body ?? {}
    const task = await db.task.create({
      data: {
        title: requireStr(b.title, "Title", 200),
        description: optStr(b.description, 1000),
        assignedTo: optStr(b.assignedTo, 120),
        priority: ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(b.priority) ? b.priority : "MEDIUM",
        dueDate: b.dueDate ? parseDate(b.dueDate) : null,
        status: ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(b.status) ? b.status : "PENDING",
        createdByName: ctx.user?.fullName ?? "System",
      },
    })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "tasks", "CREATE", task.id, { title: task.title }))
    return json({ task })
  }

  if (ctx.method === "PUT" && id) {
    ctx.requirePerm("tasks", "edit")
    const existing = await db.task.findUnique({ where: { id } })
    if (!existing) throw new AppError("Task not found", 404)
    const b = ctx.body ?? {}
    const task = await db.task.update({
      where: { id },
      data: {
        title: optStr(b.title, 200) ?? existing.title,
        description: b.description !== undefined ? optStr(b.description, 1000) : existing.description,
        assignedTo: b.assignedTo !== undefined ? optStr(b.assignedTo, 120) : existing.assignedTo,
        priority: ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(b.priority) ? b.priority : existing.priority,
        dueDate: b.dueDate !== undefined ? (b.dueDate ? parseDate(b.dueDate) : null) : existing.dueDate,
        status: ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(b.status) ? b.status : existing.status,
        completedAt: b.status === "COMPLETED" ? new Date() : existing.completedAt,
      },
    })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "tasks", "UPDATE", id, { status: task.status }))
    return json({ task })
  }

  if (ctx.method === "DELETE" && id) {
    ctx.requirePerm("tasks", "delete")
    await db.task.delete({ where: { id } })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "tasks", "DELETE", id, {}))
    return json({ ok: true })
  }

  return null
}
