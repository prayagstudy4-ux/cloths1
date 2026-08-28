"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/client/api"
import { useApp } from "@/lib/client/store"
import { APP_VERSION } from "@/lib/constants"
import { Database, HardDrive, Keyboard } from "lucide-react"
import { cn } from "@/lib/utils"

export function StatusBar() {
  const { user } = useApp()
  const { data: dbHealth, isError } = useQuery({
    queryKey: ["status", "db"],
    queryFn: () => api.get("public/status"),
    refetchInterval: 60_000,
  })
  const { data: cash } = useQuery({
    queryKey: ["status", "cash"],
    queryFn: () => api.get("cash-register").catch(() => null),
    refetchInterval: 60_000,
  })
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t bg-zinc-100 px-3 text-[11px] text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
      <span className="flex items-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", isError ? "bg-red-500" : "bg-emerald-500 animate-pulse")} />
        <Database className="h-3 w-3" />
        SQLite · Local
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        <HardDrive className="h-3 w-3" />
        {cash?.current ? `Cash register: OPEN (₹${(cash.current.openingAmount ?? 0).toFixed(0)})` : "Cash register: closed"}
      </span>
      <span className="hidden md:inline">{today}</span>
      <span className="ml-auto hidden items-center gap-1 lg:flex">
        <Keyboard className="h-3 w-3" /> Ctrl+K search · Ctrl+B sidebar
      </span>
      <span className="font-medium">{user?.fullName} ({user?.role})</span>
      <span className="text-zinc-400">v{APP_VERSION}</span>
    </footer>
  )
}
