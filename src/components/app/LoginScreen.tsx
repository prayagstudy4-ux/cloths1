"use client"

import { useState } from "react"
import { api } from "@/lib/client/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, LockKeyhole, User } from "lucide-react"
import { toast } from "@/hooks/use-toast"

export function LoginScreen({
  onLoggedIn,
  hasDemo,
}: {
  onLoggedIn: (user: any, modules: string[]) => void
  hasDemo: boolean
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!username || !password) return
    setLoading(true)
    try {
      const res = await api.post("auth/login", { username, password })
      toast({ title: `Welcome back, ${res.user.fullName}` })
      onLoggedIn(res.user, res.modules)
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-900 to-teal-950 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground shadow-lg">V</div>
          <h1 className="text-xl font-semibold text-white">Clothing Business Manager</h1>
          <p className="mt-1 text-sm text-zinc-400">Sign in to your business workspace</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-6 shadow-xl">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs text-muted-foreground">Username</Label>
            <div className="relative">
              <User className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="username" value={username} autoFocus autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username" className="pl-8 h-10"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs text-muted-foreground">Password</Label>
            <div className="relative">
              <LockKeyhole className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password" className="pl-8 h-10" autoComplete="current-password"
              />
            </div>
          </div>
          <Button type="submit" className="h-10 w-full" disabled={loading || !username || !password}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sign In
          </Button>

          {hasDemo && (
            <button
              type="button"
              onClick={() => { setUsername("owner"); setPassword("owner123") }}
              className="w-full rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
            >
              Demo data loaded — tap to fill owner credentials (owner / owner123)
            </button>
          )}
        </form>

        <p className="mt-6 text-center text-xs text-zinc-500">
          Works fully offline · Data stored locally in SQLite
        </p>
      </div>
    </div>
  )
}
