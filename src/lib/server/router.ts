import { NextRequest, NextResponse } from "next/server"
import { getSessionUser, SessionUser } from "@/lib/server/auth"
import { can, Action } from "@/lib/server/permissions"
import { AppError } from "@/lib/server/helpers"

export interface Ctx {
  req: NextRequest
  method: string
  segs: string[] // path segments after /api/
  params: URLSearchParams
  body: any // parsed JSON (or FormData object)
  user: SessionUser | null
  canPerm: (module: string, action?: string) => boolean
  requirePerm: (module: string, action?: string) => void
}

export type DomainHandler = (ctx: Ctx) => Promise<NextResponse | null>

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data as object, { status })
}

export const noPerm = () => json({ error: "You do not have permission to perform this action" }, 403)

// Registered domain handlers (populated in route.ts to avoid circular imports)
const domains = new Map<string, DomainHandler>()

export function registerDomain(name: string, handler: DomainHandler) {
  domains.set(name, handler)
}

export async function handleApi(req: NextRequest, method: string): Promise<NextResponse> {
  const url = new URL(req.url)
  const segs = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent)
  const params = url.searchParams

  let body: any = null
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    const ct = req.headers.get("content-type") ?? ""
    try {
      if (ct.includes("application/json")) body = await req.json()
      else if (ct.includes("form-data") || ct.includes("multipart")) body = await req.formData()
    } catch { body = null }
  }

  const user = await getSessionUser()
  const ctx: Ctx = {
    req, method, segs, params, body, user,
    canPerm: (module: string, action: string = "view") => can(user, module, action as Action),
    requirePerm: (module, action = "view") => {
      if (!can(user, module, action as Action)) throw new AppError("You do not have permission to perform this action", 403)
    },
  }

  const root = segs[0] ?? ""
  const PUBLIC_PATHS = new Set(["public", "auth", "setup"])

  try {
    const handler = domains.get(root)
    if (!handler) return json({ error: `Unknown API endpoint: /${segs.join("/")}` }, 404)

    if (!PUBLIC_PATHS.has(root) && !user) {
      return json({ error: "Not authenticated" }, 401)
    }

    const res = await handler(ctx)
    if (res) return res
    return json({ error: `No handler for ${method} /${segs.join("/")}` }, 404)
  } catch (err: any) {
    if (err instanceof AppError) return json({ error: err.message }, err.status)
    console.error(`[API ERROR] ${method} /${segs.join("/")}:`, err)
    return json({ error: err?.message ?? "Internal server error" }, 500)
  }
}
