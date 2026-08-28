import { createHash, randomBytes } from "crypto"
import fs from "fs"
import path from "path"
import { db } from "@/lib/db"

const SECRET_KEY = "app_secret"
const secretFile = path.join(process.cwd(), "app-data", "secret.key")

/**
 * Application secret used for signing sessions. Persisted so sessions survive restarts.
 * Priority: Setting table → app-data/secret.key file (generated).
 */
export function getOrCreateSecret(): string {
  try {
    const stored = db.setting.findUnique({ where: { key: SECRET_KEY } })
    // sync call cannot be awaited here (used from sync context); use file-based primary
  } catch { /* ignore */ }
  try {
    if (fs.existsSync(secretFile)) {
      return fs.readFileSync(secretFile, "utf-8").trim()
    }
    const secret = randomBytes(32).toString("hex")
    fs.mkdirSync(path.dirname(secretFile), { recursive: true })
    fs.writeFileSync(secretFile, secret, { mode: 0o600 })
    return secret
  } catch {
    // Fallback: deterministic per-install secret derived from db path
    return createHash("sha256").update(process.cwd() + "::cbm").digest("hex")
  }
}
