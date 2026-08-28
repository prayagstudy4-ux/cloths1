import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"

export async function handle(ctx: Ctx) {
  const [, action] = ctx.segs

  if (ctx.method === "GET" && (!action || action === "index")) {
    ctx.requirePerm("audit", "view")
    const page = Math.max(1, parseInt(ctx.params.get("page") ?? "1"))
    const pageSize = Math.min(100, parseInt(ctx.params.get("pageSize") ?? "50"))
    const moduleFilter = ctx.params.get("module")
    const q = ctx.params.get("q")?.toLowerCase()
    const where: any = {}
    if (moduleFilter) where.module = moduleFilter
    if (q) where.OR = [
      { userName: { contains: q } }, { action: { contains: q } }, { details: { contains: q } },
    ]
    const [total, logs] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ])
    return json({ logs, total, page, pageSize })
  }
  return null
}
