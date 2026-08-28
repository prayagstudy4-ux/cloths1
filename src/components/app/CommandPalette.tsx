"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/client/api"
import { useApp } from "@/lib/client/store"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Search, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

const QUICK_ACTIONS = [
  { label: "New Sale (POS)", module: "sales", params: { tab: "pos" } },
  { label: "New Customer", module: "customers", params: { new: true } },
  { label: "New Product", module: "products", params: { new: true } },
  { label: "New Purchase", module: "purchases", params: { new: true } },
  { label: "Receive Payment", module: "payments", params: { tab: "receive" } },
  { label: "UPI / QR Payment", module: "payments", params: { tab: "qr" } },
  { label: "Add Expense", module: "expenses", params: { new: true } },
  { label: "Create Order", module: "sales", params: { tab: "orders", new: true } },
  { label: "Add Stock", module: "inventory", params: { tab: "adjust" } },
  { label: "Transfer Stock", module: "inventory", params: { tab: "transfer" } },
  { label: "Create Job Work", module: "production", params: { tab: "jobwork", new: true } },
  { label: "Add Staff", module: "staff", params: { new: true } },
  { label: "Generate Report", module: "reports" },
  { label: "Backup Now", module: "settings", params: { tab: "backup" } },
]

export function CommandPalette() {
  const { commandOpen, setCommandOpen, setActiveModule } = useApp()
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (commandOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [commandOpen])

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.get(`search?q=${encodeURIComponent(debounced)}`),
    enabled: commandOpen && debounced.trim().length > 0,
  })

  const quickMatches = q
    ? QUICK_ACTIONS.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()))
    : QUICK_ACTIONS.slice(0, 6)

  function go(module: string, params?: any) {
    setActiveModule(module, params)
    setCommandOpen(false)
  }

  return (
    <Dialog open={commandOpen} onOpenChange={(v) => { if (!v) setQ(""); setCommandOpen(v) }}>
      <DialogContent className="top-[15%] max-w-xl translate-y-0 gap-0 p-0" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Global Search</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customers, products, invoices, payments… or type an action"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Escape") setCommandOpen(false)
              if (e.key === "Enter" && quickMatches[0]) go(quickMatches[0].module, quickMatches[0].params)
            }}
          />
          {isFetching && <span className="text-xs text-muted-foreground">…</span>}
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2 thin-scrollbar">
          {quickMatches.length > 0 && (
            <>
              <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</p>
              {quickMatches.map((a) => (
                <button
                  key={a.label}
                  onClick={() => go(a.module, a.params)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-accent"
                >
                  <span>{a.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </>
          )}
          {data?.groups?.map((g: any) => (
            <div key={g.label}>
              <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
              {g.results.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => go(r.module, { entityId: r.entityId ?? r.id, tab: r.tab })}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          ))}
          {debounced && !isFetching && data?.groups?.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No results for “{debounced}”</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
