import { createHash, randomBytes } from "crypto"
import fs from "fs"
import path from "path"

const secretFile = path.join(process.cwd(), "app-data", "secret.key")

/**
 * Application secret used for signing sessions. Persisted so sessions survive restarts.
 * Priority:
 *   1. APP_SECRET env var (set this on Vercel/serverless — required there,
 *      because serverless functions have no writable persistent disk)
 *   2. app-data/secret.key file (local dev; generated on first use)
 *   3. Deterministic fallback (derived from cwd)
 */
export function getOrCreateSecret(): string {
  const fromEnv = process.env.APP_SECRET?.trim()
  if (fromEnv) return fromEnv

  try {
    if (fs.existsSync(secretFile)) {
      return fs.readFileSync(secretFile, "utf-8").trim()
    }
    const secret = randomBytes(32).toString("hex")
    fs.mkdirSync(path.dirname(secretFile), { recursive: true })
    fs.writeFileSync(secretFile, secret, { mode: 0o600 })
    return secret
  } catch {
    // No writable disk (serverless without APP_SECRET): deterministic fallback.
    // Sessions may be invalidated across cold starts — set APP_SECRET to avoid.
    return createHash("sha256").update(process.cwd() + "::cbm").digest("hex")
  }
}
