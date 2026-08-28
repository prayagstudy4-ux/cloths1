"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/client/api"
import { useApp } from "@/lib/client/store"
import { APP_NAME, APP_VERSION } from "@/lib/constants"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, CircleUser, LogOut, Minus, Moon, Search, ShieldCheck, Square, Sun, X, KeyRound } from "lucide-react"
import { useTheme } from "next-themes"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import { fmtTimeIST } from "@/lib/format"

export function TitleBar({ onExit }: { onExit: () => void }) {
  const { user, business, setCommandOpen, setNotificationsOpen } = useApp()
  const { theme, setTheme } = useTheme()
  const [showExit, setShowExit] = useState(false)
  const [now, setNow] = useState(new Date())
  const qc = useQueryClient()

  const { data: notif } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get("notifications?unread=1"),
    refetchInterval: 30_000,
  })
  const unread = notif?.unreadCount ?? 0

  useState(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  })

  async function logout() {
    try { await api.post("auth/logout") } catch { }
    useApp.getState().logout()
    qc.clear()
  }

  return (
    <>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-zinc-900 px-3 text-zinc-200 select-none">
        {/* App identity */}
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground text-xs font-bold">V</div>
          <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
          {business?.name && (
            <span className="hidden text-xs text-zinc-400 md:inline">— {business.name}</span>
          )}
        </div>

        {/* Global search trigger */}
        <button
          onClick={() => setCommandOpen(true)}
          className="mx-auto hidden h-7 w-full max-w-md items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-left text-xs text-zinc-400 hover:border-zinc-500 hover:bg-zinc-750 md:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1">Search customers, products, invoices… </span>
          <kbd className="rounded border border-zinc-600 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <span className="mr-2 hidden text-xs tabular-nums text-zinc-400 lg:inline">
            {fmtTimeIST(now)}
          </span>

          {/* Notifications */}
          <button
            onClick={() => setNotificationsOpen(true)}
            className="relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-zinc-800"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {/* Theme */}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-zinc-800"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-8 items-center gap-2 rounded-md px-2 hover:bg-zinc-800">
                <CircleUser className="h-4 w-4" />
                <span className="hidden text-xs font-medium sm:inline">{user?.fullName}</span>
                <Badge variant="outline" className="hidden border-zinc-600 bg-zinc-800 text-[9px] text-zinc-300 lg:inline-flex">
                  {user?.role}
                </Badge>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs">
                <div className="font-semibold">{user?.fullName}</div>
                <div className="text-muted-foreground">@{user?.username}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("cbm:change-password"))}>
                <KeyRound className="mr-2 h-4 w-4" /> Change Password
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => useApp.getState().setActiveModule("settings")}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Window controls (Windows-style) */}
          <div className="ml-2 flex items-center">
            <button
              className="flex h-8 w-9 items-center justify-center rounded hover:bg-zinc-800"
              onClick={() => useApp.getState().toggleSidebar()}
              title="Minimize (collapse sidebar)"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              className="flex h-8 w-9 items-center justify-center rounded hover:bg-zinc-800"
              onClick={() => {
                if (document.fullscreenElement) document.exitFullscreen()
                else document.documentElement.requestFullscreen().catch(() => { })
              }}
              title="Maximize (fullscreen)"
            >
              <Square className="h-3 w-3" />
            </button>
            <button
              className="flex h-8 w-9 items-center justify-center rounded hover:bg-red-600 hover:text-white"
              onClick={() => setShowExit(true)}
              title="Close / Sign out"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <Dialog open={showExit} onOpenChange={setShowExit}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close Clothing Business Manager?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            All data is saved automatically in the local database. You can sign out, or just close the browser tab.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExit(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setShowExit(false); logout() }}>
              <LogOut className="mr-2 h-4 w-4" /> Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChangePasswordDialog />
    </>
  )
}

function ChangePasswordDialog() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [loading, setLoading] = useState(false)

  useState(() => {
    const handler = () => setOpen(true)
    window.addEventListener("cbm:change-password", handler)
    return () => window.removeEventListener("cbm:change-password", handler)
  })

  async function submit() {
    setLoading(true)
    try {
      await api.post("auth/change-password", { currentPassword: current, newPassword: next })
      toast({ title: "Password changed" })
      setOpen(false)
      setCurrent(""); setNext("")
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally { setLoading(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Change Password</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Current password</label>
            <input type="password" className="w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">New password</label>
            <input type="password" className="w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={loading || !current || next.length < 4}>Update</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
