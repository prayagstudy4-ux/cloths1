import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { getOrCreateSecret } from "@/lib/server/secretStore"

const COOKIE_NAME = "cbm_session"
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ---------- Password hashing (scrypt) ----------
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":")
    const computed = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, "hex")
    return computed.length === expected.length && timingSafeEqual(computed, expected)
  } catch {
    return false
  }
}

// ---------- Session token (HMAC signed) ----------
interface SessionPayload {
  uid: string
  exp: number
}

function sign(data: string): string {
  return createHmac("sha256", getOrCreateSecret()).update(data).digest("base64url")
}

export function createSessionToken(userId: string): string {
  const payload: SessionPayload = { uid: userId, exp: Date.now() + SESSION_TTL_MS }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${body}.${sign(body)}`
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [body, sig] = token.split(".")
    if (!body || !sig) return null
    const expected = sign(body)
    const a = Buffer.from(sig), b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export interface SessionUser {
  id: string
  username: string
  fullName: string
  role: string
}

// ---------- Cookie helpers ----------
export async function setSessionCookie(userId: string) {
  const store = await cookies()
  store.set(COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_TTL_MS / 1000,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = verifySessionToken(token)
  if (!payload) return null
  const user = await db.user.findUnique({ where: { id: payload.uid } })
  if (!user || !user.active) return null
  return { id: user.id, username: user.username, fullName: user.fullName, role: user.role }
}
