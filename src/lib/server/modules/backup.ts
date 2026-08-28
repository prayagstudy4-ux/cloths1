import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { audit, setSetting, getSettings } from "@/lib/server/helpers"
import { assertDisk, isServerless } from "@/lib/server/storage"

import fs from "fs"
import path from "path"

const DB_PATH = process.env.DATABASE_URL?.replace("file:", "") ?? path.join(process.cwd(), "db", "custom.db")
const BACKUP_DIR = path.join(process.cwd(), "app-data", "backups")

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return []
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".db"))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f))
      return { name: f, size: stat.size, createdAt: stat.mtime }
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

export async function handle(ctx: Ctx) {
  const [, action] = ctx.segs

  if (ctx.method === "GET" && (!action || action === "index")) {
    ctx.requirePerm("backup", "view")
    const settings = await getSettings()
    const backups = listBackups()
    return json({
      backups,
      settings: {
        autoBackup: settings.auto_backup !== "0",
        retentionDays: parseInt(settings.backup_retention_days ?? "30") || 30,
      },
      dbPath: DB_PATH,
    })
  }

  // Backup now (SQLite VACUUM INTO — safe online backup)
  if (ctx.method === "POST" && (action === "create" || !action)) {
    ctx.requirePerm("backup", "view")
    assertDisk("Database backup")
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const filename = `backup-${stamp}.db`
    const target = path.join(BACKUP_DIR, filename)
    await db.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
    // retention cleanup
    const settings = await getSettings()
    const retentionDays = parseInt(settings.backup_retention_days ?? "30") || 30
    const backups = listBackups()
    for (const b of backups) {
      const ageDays = (Date.now() - b.createdAt.getTime()) / 86400000
      if (ageDays > retentionDays) {
        try { fs.unlinkSync(path.join(BACKUP_DIR, b.name)) } catch { }
      }
    }
    await db.$transaction(async (tx) => audit(tx, ctx.user, "backup", "CREATE", null, { filename }))
    return json({ ok: true, backup: { name: filename, size: fs.statSync(target).size, createdAt: new Date() }, backups: listBackups().slice(0, 30) })
  }

  // Restore
  if (ctx.method === "POST" && action === "restore") {
    ctx.requirePerm("backup", "approve")
    assertDisk("Backup restore")
    const filename = ctx.body?.filename
    if (!filename || !filename.endsWith(".db") || filename.includes("..")) {
      return json({ error: "Invalid backup file" }, 400)
    }
    const source = path.join(BACKUP_DIR, filename)
    if (!fs.existsSync(source)) return json({ error: "Backup file not found" }, 404)

    // Safety backup of current state first
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    const safety = path.join(BACKUP_DIR, `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.db`)
    try { await db.$executeRawUnsafe(`VACUUM INTO '${safety.replace(/'/g, "''")}'`) } catch { }

    await db.$disconnect()
    fs.copyFileSync(source, DB_PATH)
    // Prisma reconnects automatically on next query
    await setSetting("last_restore", new Date().toISOString())
    return json({ ok: true, message: "Database restored. Data is now from the selected backup." })
  }

  // Auto-backup check (called on app boot)
  if (ctx.method === "POST" && action === "auto-check") {
    if (isServerless()) return json({ ok: true, skipped: true })
    const settings = await getSettings()
    if (settings.auto_backup === "0") return json({ ok: true, skipped: true })
    const backups = listBackups()
    const last = backups[0]
    const stale = !last || (Date.now() - last.createdAt.getTime()) > 20 * 60 * 60 * 1000
    if (!stale) return json({ ok: true, skipped: true })
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    try {
      await db.$executeRawUnsafe(`VACUUM INTO '${path.join(BACKUP_DIR, `auto-${stamp}.db`).replace(/'/g, "''")}'`)
      return json({ ok: true, created: true })
    } catch {
      return json({ ok: false }, 500)
    }
  }

  return null
}
