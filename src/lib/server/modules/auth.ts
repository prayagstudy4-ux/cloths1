import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { verifyPassword, hashPassword, setSessionCookie, clearSessionCookie } from "@/lib/server/auth"
import { AppError, audit, requireStr } from "@/lib/server/helpers"
import { allowedModules } from "@/lib/server/permissions"

export async function handle(ctx: Ctx) {
  const [, action] = ctx.segs

  if (ctx.method === "POST" && action === "login") {
    const username = requireStr(ctx.body?.username, "Username", 60).toLowerCase()
    const password = requireStr(ctx.body?.password, "Password", 200)
    const user = await db.user.findUnique({ where: { username } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new AppError("Invalid username or password", 401)
    }
    if (!user.active) throw new AppError("This account is disabled. Contact the owner.", 403)
    await setSessionCookie(user.id)
    await db.$transaction(async (tx) => audit(tx, { fullName: user.fullName, role: user.role }, "users", "LOGIN", user.id, { username }))
    return json({
      user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
      modules: allowedModules({ id: user.id, username: user.username, fullName: user.fullName, role: user.role }),
    })
  }

  if (ctx.method === "POST" && action === "logout") {
    if (ctx.user) {
      await db.$transaction(async (tx) => audit(tx, ctx.user, "users", "LOGOUT", ctx.user!.id))
    }
    await clearSessionCookie()
    return json({ ok: true })
  }

  if (ctx.method === "GET" && action === "me") {
    if (!ctx.user) return json({ error: "Not authenticated" }, 401)
    const business = await db.businessProfile.findFirst()
    return json({
      user: ctx.user,
      modules: allowedModules(ctx.user),
      business: business ? { id: business.id, name: business.name, brandName: business.brandName, logo: business.logo, currency: business.currency } : null,
    })
  }

  if (ctx.method === "POST" && action === "change-password") {
    if (!ctx.user) return json({ error: "Not authenticated" }, 401)
    const current = requireStr(ctx.body?.currentPassword, "Current password")
    const next = requireStr(ctx.body?.newPassword, "New password", 200)
    if (next.length < 4) throw new AppError("New password must be at least 4 characters")
    const user = await db.user.findUnique({ where: { id: ctx.user.id } })
    if (!user || !verifyPassword(current, user.passwordHash)) throw new AppError("Current password is incorrect")
    await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(next) } })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "users", "UPDATE", user.id, { action: "change-password" }))
    return json({ ok: true })
  }

  return null
}
