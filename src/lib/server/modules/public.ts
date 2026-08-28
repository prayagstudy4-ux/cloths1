import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"

// Public status endpoint (no auth) — used by login screen & boot sequence
export async function handle(ctx: Ctx) {
  if (ctx.method === "GET" && ctx.segs[1] === "status") {
    const business = await db.businessProfile.findFirst()
    const userCount = await db.user.count()
    const demoLoaded = await db.setting.findUnique({ where: { key: "demo_loaded" } })
    return json({
      setupCompleted: business?.setupCompleted && userCount > 0,
      hasDemo: demoLoaded?.value === "1",
      businessName: business?.name ?? null,
      brandName: business?.brandName ?? null,
    })
  }
  return null
}
