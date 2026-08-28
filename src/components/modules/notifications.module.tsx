"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { PageHeader, StatCard, EmptyState } from "@/components/shared/basics"
import { ConfirmDialog } from "@/components/shared/fields"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bell, CheckCheck, Eraser, CheckCircle2, AlertTriangle } from "lucide-react"
import { fmtDateIST } from "@/lib/format"
import { NOTIFICATION_TYPES } from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface Notification {
  id: string
  title: string
  message: string
  type: string
  severity: string
  module?: string | null
  entityId?: string | null
  read: boolean
  createdAt: string
}

const TYPE_LABELS: Record<string, string> = {
  PAYMENT: "Payment", STOCK: "Stock", ORDER: "Order", TASK: "Task",
  DUE: "Due", SYSTEM: "System", BACKUP: "Backup",
}

const SEVERITY_DOT: Record<string, string> = {
  INFO: "bg-primary",
  WARNING: "bg-amber-500",
  CRITICAL: "bg-red-500",
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime()
  if (diff < 0 || isNaN(diff)) return fmtDateIST(d)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return fmtDateIST(d)
}

export function NotificationsModule() {
  const qc = useQueryClient()
  const [showUnread, setShowUnread] = useState(false)
  const [typeFilter, setTypeFilter] = useState("")
  const [confirmClear, setConfirmClear] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", showUnread],
    queryFn: () => api.get(`notifications${qs({ unread: showUnread ? 1 : "" })}`),
  })

  const notifications: Notification[] = data?.notifications ?? []
  const unreadCount: number = data?.unreadCount ?? 0
  const visible = notifications.filter((n) => !typeFilter || n.type === typeFilter)

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e: any) => toast({ title: "Could not mark as read", description: e.message, variant: "destructive" }),
  })

  const markAllRead = useMutation({
    mutationFn: () => api.post("notifications/read-all"),
    onSuccess: () => {
      toast({ title: "All notifications marked as read" })
      qc.invalidateQueries({ queryKey: ["notifications"] })
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  })

  const clearRead = useMutation({
    mutationFn: () => api.del("notifications/clear-read"),
    onSuccess: () => {
      toast({ title: "Read notifications cleared" })
      qc.invalidateQueries({ queryKey: ["notifications"] })
      setConfirmClear(false)
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  })

  const warningCount = notifications.filter((n) => n.severity === "WARNING").length
  const criticalCount = notifications.filter((n) => n.severity === "CRITICAL").length

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Bell className="h-5 w-5" />}
        title="Notifications"
        description="Payment confirmations, stock alerts, dues and system messages — everything that needs your attention."
        actions={
          <>
            <Button
              variant="outline" size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending || unreadCount === 0}
            >
              <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all read
            </Button>
            <Button
              variant="outline" size="sm" className="text-red-600 hover:text-red-600"
              onClick={() => setConfirmClear(true)}
              disabled={clearRead.isPending || (notifications.length > 0 && unreadCount === notifications.length)}
            >
              <Eraser className="mr-1.5 h-4 w-4" /> Clear read
            </Button>
          </>
        }
      />

      {/* ---------- STATS ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Unread" value={unreadCount} tone={unreadCount > 0 ? "primary" : "default"} icon={<Bell className="h-4 w-4" />} />
        <StatCard label="Shown" value={visible.length} sub={showUnread ? "Unread filter" : "Latest 200"} icon={<Bell className="h-4 w-4" />} />
        <StatCard label="Warnings" value={warningCount} tone={warningCount > 0 ? "warning" : "default"} icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Critical" value={criticalCount} tone={criticalCount > 0 ? "negative" : "default"} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      {/* ---------- FILTERS ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          <button
            onClick={() => setShowUnread(false)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              !showUnread ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </button>
          <button
            onClick={() => setShowUnread(true)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              showUnread ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Unread{unreadCount > 0 && <span className="ml-1.5 rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">{unreadCount}</span>}
          </button>
        </div>
        <Select value={typeFilter || undefined} onValueChange={(v) => setTypeFilter(v)}>
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            {NOTIFICATION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t] ?? t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {typeFilter && (
          <button className="text-xs text-muted-foreground underline" onClick={() => setTypeFilter("")}>clear type filter</button>
        )}
      </div>

      {/* ---------- LIST ---------- */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6 text-emerald-500" />}
          title="You're all caught up"
          description={
            showUnread || typeFilter
              ? "No notifications match the current filter."
              : "Alerts about payments, low stock, dues and backups will appear here."
          }
        />
      ) : (
        <div className="space-y-1.5">
          {visible.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.read && markRead.mutate(n.id)}
              title={n.read ? undefined : "Click to mark as read"}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                n.read ? "bg-card hover:bg-accent" : "border-primary/30 bg-primary/5 hover:bg-primary/10",
              )}
            >
              <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", SEVERITY_DOT[n.severity] ?? "bg-muted-foreground")} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm leading-snug", n.read ? "font-medium text-foreground" : "font-semibold")}>
                  {n.title}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium">{TYPE_LABELS[n.type] ?? n.type}</span> · {timeAgo(n.createdAt)}
                </p>
              </div>
              {!n.read && (
                <span className="mt-1 shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                  New
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear read notifications?"
        description="All notifications that have been read will be permanently removed. Unread notifications are kept."
        confirmLabel="Clear read"
        destructive
        loading={clearRead.isPending}
        onConfirm={() => clearRead.mutate()}
      />
    </div>
  )
}
