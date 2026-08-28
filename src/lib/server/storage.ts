import { AppError } from "@/lib/server/helpers"

/**
 * True when the app runs on ephemeral, read-only-filesystem hosting
 * (e.g. Vercel serverless functions). Set explicitly via env when deploying
 * to such platforms.
 */
export function isServerless(): boolean {
  return process.env.VERCEL === "1" || process.env.SERVERLESS === "1"
}

/**
 * Throws a friendly error for features that require a writable disk
 * (file uploads, database backups) when running on serverless hosting.
 */
export function assertDisk(feature: string): void {
  if (isServerless()) {
    throw new AppError(
      `${feature} is not available on this hosting (no persistent disk). ` +
        `Deploy to a VPS (see deploy/README.md) to use this feature.`,
      501
    )
  }
}