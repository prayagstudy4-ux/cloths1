"use client"

import { Loader2 } from "lucide-react"

export function ModuleLoading() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      <p className="text-sm">Loading module…</p>
    </div>
  )
}
