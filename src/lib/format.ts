// Formatting utilities (client + server safe). All business data is IST (Asia/Kolkata).
import { format as fmtDate, parseISO } from "date-fns"

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

export function toIST(d: Date | string): Date {
  const date = typeof d === "string" ? parseISO(d) : d
  return new Date(date.getTime() + IST_OFFSET_MS)
}

export function fmtMoney(n: number | null | undefined, opts?: { compact?: boolean }): string {
  const v = n ?? 0
  if (opts?.compact) {
    const abs = Math.abs(v)
    if (abs >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`
    if (abs >= 100000) return `₹${(v / 100000).toFixed(2)} L`
    if (abs >= 1000) return `₹${(v / 1000).toFixed(1)}K`
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0,
  }).format(v)
}

export function fmtNum(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN").format(n ?? 0)
}

export function fmtDateIST(d: Date | string | null | undefined, pattern = "dd MMM yyyy"): string {
  if (!d) return "—"
  try { return fmtDate(toIST(d), pattern) } catch { return "—" }
}

export function fmtDateTimeIST(d: Date | string | null | undefined): string {
  return fmtDateIST(d, "dd MMM yyyy, hh:mm a")
}

export function fmtTimeIST(d: Date | string | null | undefined): string {
  return fmtDateIST(d, "hh:mm a")
}

/** IST day boundaries for a given Date (returns UTC instants) */
export function istDayStartUTC(d: Date = new Date()): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS)
  const y = ist.getUTCFullYear(), m = ist.getUTCMonth(), day = ist.getUTCDate()
  return new Date(Date.UTC(y, m, day) - IST_OFFSET_MS)
}

export function istDayEndUTC(d: Date = new Date()): Date {
  return new Date(istDayStartUTC(d).getTime() + 24 * 60 * 60 * 1000 - 1)
}

/** Parse YYYY-MM-DD as an IST date → UTC instant */
export function istDateFromYMD(ymd: string, endOfDay = false): Date {
  const [y, m, d] = ymd.split("-").map(Number)
  const base = Date.UTC(y, m - 1, d) - IST_OFFSET_MS
  return endOfDay ? new Date(base + 24 * 60 * 60 * 1000 - 1) : new Date(base)
}

/** Date to YYYY-MM-DD in IST */
export function ymdIST(d: Date | string = new Date()): string {
  return fmtDateIST(d, "yyyy-MM-dd")
}

export function daysAgoUTC(n: number): Date {
  return istDayStartUTC(new Date(Date.now() - n * 24 * 60 * 60 * 1000))
}

export function daysAheadUTC(n: number): Date {
  return istDayEndUTC(new Date(Date.now() + n * 24 * 60 * 60 * 1000))
}

export function monthStartIST(d: Date = new Date()): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS)
}

/** Resolve a named preset to a {from,to} UTC range */
export function presetRange(preset: string, fromStr?: string, toStr?: string): { from: Date; to: Date } {
  const now = new Date()
  switch (preset) {
    case "today": return { from: istDayStartUTC(now), to: istDayEndUTC(now) }
    case "yesterday": {
      const y = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      return { from: istDayStartUTC(y), to: istDayEndUTC(y) }
    }
    case "this_week": {
      const start = istDayStartUTC(now)
      const dow = (toIST(now).getUTCDay() + 6) % 7 // Monday start
      return { from: new Date(start.getTime() - dow * 86400000), to: istDayEndUTC(now) }
    }
    case "this_month": return { from: monthStartIST(now), to: istDayEndUTC(now) }
    case "last_month": {
      const ist = toIST(now)
      const lm = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - 1, 1) - IST_OFFSET_MS)
      const lmEnd = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 0, 23, 59, 59) - IST_OFFSET_MS)
      return { from: lm, to: lmEnd }
    }
    case "this_year": {
      const ist = toIST(now)
      return { from: new Date(Date.UTC(ist.getUTCFullYear(), 0, 1) - IST_OFFSET_MS), to: istDayEndUTC(now) }
    }
    case "custom":
    default:
      return {
        from: fromStr ? istDateFromYMD(fromStr) : istDayStartUTC(now),
        to: toStr ? istDateFromYMD(toStr, true) : istDayEndUTC(now),
      }
  }
}
