import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"

export async function handle(ctx: Ctx) {
  const [, action, id] = ctx.segs

  if (ctx.method === "GET" && (!action || action === "index")) {
    const unreadOnly = ctx.params.get("unread") === "1"
    const where: any = {}
    if (unreadOnly) where.read = false
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
      db.notification.count({ where: { read: false } }),
    ])
    return json({ notifications, unreadCount })
  }

  if (ctx.method === "POST" && action && id === "read") {
    await db.notification.updateMany({ where: { id: action }, data: { read: true } })
    return json({ ok: true })
  }

  if (ctx.method === "POST" && action === "read-all") {
    await db.notification.updateMany({ where: { read: false }, data: { read: true } })
    return json({ ok: true })
  }

  if (ctx.method === "DELETE" && action && !id) {
    ctx.requirePerm("notifications", "edit")
    await db.notification.delete({ where: { id: action } })
    return json({ ok: true })
  }

  if (ctx.method === "DELETE" && action === "clear-read") {
    ctx.requirePerm("notifications", "edit")
    await db.notification.deleteMany({ where: { read: true } })
    return json({ ok: true })
  }

  return null
}
