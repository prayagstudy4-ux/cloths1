import { Prisma, PrismaClient } from "@prisma/client"
import { db } from "@/lib/db"
import { BusinessProfile } from "@prisma/client"

export class AppError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

type Tx = Prisma.TransactionClient | PrismaClient

// ---------- Document numbering ----------
const PREFIX_FALLBACK: Record<string, string> = {
  INV: "INV", QUO: "QUO", ORD: "ORD", PUR: "PUR", RET: "RET",
  JW: "JW", PRO: "PRO", PAY: "PAY", CUST: "C", SUP: "S", EMP: "EMP", QRP: "QRP",
}

export async function nextDocNumber(tx: Tx, key: string, prefixOverride?: string): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  })
  const prefix = prefixOverride ?? PREFIX_FALLBACK[key] ?? key
  const n = counter.value
  return `${prefix}-${String(n).padStart(5, "0")}`
}

// Prefixes from business profile (owner can customize)
export async function docPrefixes(tx: Tx): Promise<Record<string, string>> {
  const bp = await tx.businessProfile.findFirst()
  return {
    INV: bp?.invoicePrefix ?? "INV", QUO: bp?.quotationPrefix ?? "QUO", ORD: bp?.orderPrefix ?? "ORD",
    PUR: bp?.purchasePrefix ?? "PUR", RET: bp?.returnPrefix ?? "RET", JW: bp?.jobworkPrefix ?? "JW",
    PRO: bp?.productionPrefix ?? "PRO", PAY: bp?.payPrefix ?? "PAY",
  }
}

export async function nextNumbered(tx: Tx, key: string): Promise<string> {
  const prefixes = await docPrefixes(tx)
  return nextDocNumber(tx, key, prefixes[key])
}

// ---------- Audit log ----------
export async function audit(
  tx: Tx,
  user: { fullName: string; role: string } | null,
  module: string,
  action: string,
  entityId?: string | null,
  details?: unknown,
) {
  await tx.auditLog.create({
    data: {
      userName: user?.fullName ?? "System",
      userRole: user?.role ?? "SYSTEM",
      module, action,
      entityId: entityId ?? null,
      details: details === undefined ? null : JSON.stringify(details, null, 0),
    },
  })
}

// ---------- Notifications (deduplicated) ----------
export async function notify(
  tx: Tx,
  title: string,
  message: string,
  type: string,
  severity: string = "INFO",
  dedupeKey?: string,
  module?: string,
  entityId?: string,
) {
  if (dedupeKey) {
    const existing = await tx.notification.findUnique({ where: { dedupeKey } })
    if (existing && !existing.read) return
    if (existing) {
      // update message and mark unread again
      await tx.notification.update({ where: { id: existing.id }, data: { title, message, read: false, createdAt: new Date() } })
      return
    }
  }
  await tx.notification.create({
    data: { title, message, type, severity, dedupeKey, module, entityId },
  })
}

// ---------- Settings helpers ----------
export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.setting.findMany()
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

export async function setSetting(key: string, value: string) {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
}

// ---------- Validation ----------
export function requireStr(v: unknown, field: string, maxLen = 500): string {
  if (typeof v !== "string" || !v.trim()) throw new AppError(`${field} is required`)
  return v.trim().slice(0, maxLen)
}

export function optStr(v: unknown, maxLen = 2000): string | null {
  if (typeof v !== "string" || !v.trim()) return null
  return v.trim().slice(0, maxLen)
}

export function requireNum(v: unknown, field: string, min = -1e12, max = 1e12): number {
  const n = typeof v === "number" ? v : parseFloat(String(v))
  if (!isFinite(n) || isNaN(n)) throw new AppError(`${field} must be a number`)
  if (n < min || n > max) throw new AppError(`${field} out of range`)
  return n
}

export function optNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""))
  return isFinite(n) && !isNaN(n) ? n : fallback
}

export function parseDate(v: unknown, fallback: Date = new Date()): Date {
  if (typeof v === "string" && v) {
    const d = new Date(v)
    if (!isNaN(d.getTime())) return d
  }
  return fallback
}

export function clampInt(v: unknown, min: number, max: number, fallback = 0): number {
  const n = Math.round(optNum(v, fallback))
  return Math.max(min, Math.min(max, n))
}
