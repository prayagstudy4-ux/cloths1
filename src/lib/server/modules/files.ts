import { Ctx, json } from "@/lib/server/router"
import fs from "fs"
import path from "path"
import { NextResponse } from "next/server"

// Serves files from app-data (uploads, documents) — path restricted to app-data directory
const ALLOWED_PREFIXES = ["uploads/", "documents/"]

export async function handle(ctx: Ctx) {
  if (ctx.segs[1] !== "file") return null
  const rel = ctx.params.get("path")
  if (!rel) return json({ error: "Missing path" }, 400)
  if (!ALLOWED_PREFIXES.some((p) => rel.startsWith(p)) || rel.includes("..")) {
    return json({ error: "Invalid path" }, 403)
  }
  const abs = path.join(process.cwd(), "app-data", rel)
  if (!fs.existsSync(abs)) return json({ error: "File not found" }, 404)
  const data = fs.readFileSync(abs)
  const ext = path.extname(abs).toLowerCase()
  const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
    : ext === ".webp" ? "image/webp" : ext === ".svg" ? "image/svg+xml"
    : ext === ".gif" ? "image/gif" : ext === ".pdf" ? "application/pdf"
    : ext === ".txt" ? "text/plain" : ext === ".csv" ? "text/csv"
    : "application/octet-stream"
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": mime, "Cache-Control": "public, max-age=3600" },
  })
}
