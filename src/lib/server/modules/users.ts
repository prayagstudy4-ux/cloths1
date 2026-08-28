import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, requireStr } from "@/lib/server/helpers"
import { hashPassword } from "@/lib/server/auth"
import { ROLES } from "@/lib/constants"

export async function handle(ctx: Ctx) {
  const [, action, id] = ctx.segs

  if (ctx.method === "GET" && (!action || action === "index")) {
    ctx.requirePerm("users", "view")
    const users = await db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, fullName: true, role: true, phone: true, active: true, createdAt: true },
    })
    return json({ users })
  }

  if (ctx.method === "POST" && (!action || action === "index")) {
    ctx.requirePerm("users", "create")
    const b = ctx.body ?? {}
    const username = requireStr(b.username, "Username", 60).toLowerCase()
    const password = requireStr(b.password, "Password", 200)
    const fullName = requireStr(b.fullName, "Full name", 120)
    const role = ROLES.includes(b.role) ? b.role : "SALES"
    if (password.length < 4) throw new AppError("Password must be at least 4 characters")
    const exists = await db.user.findUnique({ where: { username } })
    if (exists) throw new AppError(`Username "${username}" already exists`)
    const user = await db.user.create({ data: { username, passwordHash: hashPassword(password), fullName, role, phone: optStr(b.phone) } })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "users", "CREATE", user.id, { username, fullName, role }))
    return json({ user: { id: user.id, username, fullName, role } })
  }

  if (ctx.method === "PUT" && action && !id) {
    const userId = action
    ctx.requirePerm("users", "edit")
    const b = ctx.body ?? {}
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError("User not found", 404)
    if (user.role === "OWNER" && b.role && b.role !== "OWNER" && (await db.user.count({ where: { role: "OWNER" } })) <= 1) {
      throw new AppError("Cannot change the role of the only owner account")
    }
    const data: any = {
      fullName: optStr(b.fullName) ?? user.fullName,
      role: ROLES.includes(b.role) ? b.role : user.role,
      phone: optStr(b.phone),
      active: typeof b.active === "boolean" ? b.active : user.active,
    }
    if (typeof b.password === "string" && b.password.length > 0) {
      if (b.password.length < 4) throw new AppError("Password must be at least 4 characters")
      data.passwordHash = hashPassword(b.password)
    }
    const updated = await db.user.update({ where: { id: userId }, data })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "users", "UPDATE", userId, { fields: Object.keys(b) }))
    return json({ user: { id: updated.id, username: updated.username, fullName: updated.fullName, role: updated.role, active: updated.active } })
  }

  if (ctx.method === "DELETE" && action && !id) {
    const userId = action
    ctx.requirePerm("users", "delete")
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError("User not found", 404)
    if (user.role === "OWNER") throw new AppError("The owner account cannot be deleted")
    await db.user.update({ where: { id: userId }, data: { active: false } })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "users", "DELETE", userId, { username: user.username }))
    return json({ ok: true })
  }

  // Audit logs
  return null
}
