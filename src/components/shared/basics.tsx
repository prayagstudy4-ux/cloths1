"use client"

import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
      {action}
    </div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
  onClick,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: React.ReactNode
  tone?: "default" | "positive" | "negative" | "warning" | "primary"
  onClick?: () => void
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    positive: "text-emerald-600 dark:text-emerald-400",
    negative: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
    primary: "text-primary",
  }
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 shadow-sm transition-shadow",
        onClick && "cursor-pointer hover:shadow-md",
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums", tones[tone])}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? "○"}
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
