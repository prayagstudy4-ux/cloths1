"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/client/api"
import { useApp } from "@/lib/client/store"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Bell, CheckCheck, Trash2 } from "lucide-react"
import { fmtDateTimeIST } from "@/lib/format"
import { cn } from "@/lib/utils"

export function NotificationsPanel() {
  const { notificationsOpen, setNotificationsOpen } = useApp()
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ["notifications", "panel"],
    queryFn: () => api.get("notifications"),
    enabled: notificationsOpen,
  })
  const notifications = data?.notifications ?? []

  async function markAll() {
    await api.post("notifications/read-all")
    qc.invalidateQueries({ queryKey: ["notifications"] })
  }
  async function markOne(id: string) {
    await api.post(`notifications/${id}/read`)
    qc.invalidateQueries({ queryKey: ["notifications"] })
  }
  async function remove(id: string) {
    await api.del(`notifications/${id}`)
    qc.invalidateQueries({ queryKey: ["notifications"] })
  }

  return (
    <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" /> Notifications
            <span className="ml-auto" />
            <Button variant="outline" size="sm" onClick={markAll} className="h-7 text-xs">
              <CheckCheck className="mr-1 h-3.5 w-3.5" /> Mark all read
            </Button>
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto thin-scrollbar">
          {notifications.length === 0 && (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">No notifications</p>
          )}
          {notifications.map((n: any) => (
            <div
              key={n.id}
              className={cn("group flex gap-3 border-b px-4 py-3", !n.read && "bg-primary/5")}
            >
              <span
                className={cn(
                  "mt-1 h-2 w-2 shrink-0 rounded-full",
                  n.severity === "CRITICAL" ? "bg-red-500" : n.severity === "WARNING" ? "bg-amber-500" : "bg-primary",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{n.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{fmtDateTimeIST(n.createdAt)}</p>
              </div>
              <div className="flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!n.read && (
                  <button onClick={() => markOne(n.id)} title="Mark read" className="rounded p-1 hover:bg-accent">
                    <CheckCheck className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => remove(n.id)} title="Delete" className="rounded p-1 hover:bg-accent">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
