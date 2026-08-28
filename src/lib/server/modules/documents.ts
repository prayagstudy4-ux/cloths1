import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr } from "@/lib/server/helpers"
import fs from "fs"
import path from "path"
import { randomUUID } from "crypto"

const DOC_DIR = path.join(process.cwd(), "app-data", "documents")

export async function handle(ctx: Ctx) {
  const [, action, id] = ctx.segs

  if (ctx.method === "GET" && (!action || action === "index")) {
    ctx.requirePerm("documents", "view")
    const category = ctx.params.get("category")
    const q = ctx.params.get("q")?.toLowerCase()
    const where: any = {}
    if (category) where.category = category
    if (q) where.name = { contains: q }
    const documents = await db.document.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 })
    return json({ documents })
  }

  // Upload (multipart)
  if (ctx.method === "POST" && (!action || action === "upload")) {
    ctx.requirePerm("documents", "create")
    const fd = ctx.body as FormData
    const files = fd?.getAll("files") as File[] | null
    if (!files || !files.length) throw new AppError("No files provided")
    const category = optStr(fd?.get("category")) ?? "OTHER"
    const entityType = optStr(fd?.get("entityType"))
    const entityId = optStr(fd?.get("entityId"))
    fs.mkdirSync(DOC_DIR, { recursive: true })
    const created: { id: string; name: string }[] = []
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) throw new AppError(`${file.name} exceeds 10MB limit`)
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100)
      const filename = `${randomUUID()}-${safe}`
      fs.writeFileSync(path.join(DOC_DIR, filename), Buffer.from(await file.arrayBuffer()))
      const doc = await db.document.create({
        data: {
          name: file.name.slice(0, 200), category, entityType, entityId,
          filePath: `documents/${filename}`, fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          uploadedBy: ctx.user?.fullName ?? "System",
        },
      })
      created.push(doc)
    }
    await db.$transaction(async (tx) => audit(tx, ctx.user, "documents", "CREATE", null, { count: created.length, category }))
    return json({ documents: created })
  }

  if (ctx.method === "DELETE" && action && !id) {
    ctx.requirePerm("documents", "delete")
    const docId = action
    const doc = await db.document.findUnique({ where: { id: docId } })
    if (!doc) throw new AppError("Document not found", 404)
    const abs = path.join(process.cwd(), "app-data", doc.filePath)
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
    await db.document.delete({ where: { id: docId } })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "documents", "DELETE", docId, { name: doc.name }))
    return json({ ok: true })
  }

  return null
}
