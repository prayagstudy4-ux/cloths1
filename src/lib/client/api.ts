"use client"

// Thin fetch wrapper for the catch-all API
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T = any>(method: string, path: string, body?: any, isForm = false): Promise<T> {
  const opts: RequestInit = { method, headers: {} as Record<string, string> }
  if (body !== undefined) {
    if (isForm) {
      opts.body = body as FormData
    } else {
      ;(opts.headers as Record<string, string>)["Content-Type"] = "application/json"
      opts.body = JSON.stringify(body)
    }
  }
  const res = await fetch(`/api/${path}`, opts)
  let data: any = null
  try { data = await res.json() } catch { }
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status)
  }
  return data as T
}

export const api = {
  get: <T = any>(path: string) => request<T>("GET", path),
  post: <T = any>(path: string, body?: any) => request<T>("POST", path, body ?? {}),
  put: <T = any>(path: string, body?: any) => request<T>("PUT", path, body ?? {}),
  del: <T = any>(path: string) => request<T>("DELETE", path),
  upload: <T = any>(path: string, form: FormData) => request<T>("POST", path, form, true),
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") u.set(k, String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ""
}
