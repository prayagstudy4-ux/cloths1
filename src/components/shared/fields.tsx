"use client"

import { fmtDateIST, fmtDateTimeIST, fmtMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Loader2 } from "lucide-react"
import { useState } from "react"

// ---------- Status badge (generic) ----------
export function StatusBadge({ label, className }: { label: string; className?: string }) {
  if (!className) {
    className = "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
  }
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", className)}>
      {label}
    </span>
  )
}

// ---------- Money ----------
export function Money({ value, className, colored }: { value: number | null | undefined; className?: string; colored?: boolean }) {
  const v = value ?? 0
  return (
    <span className={cn("tabular-nums", colored && (v < 0 ? "text-red-600 dark:text-red-400" : v > 0 ? "text-emerald-600 dark:text-emerald-400" : ""), className)}>
      {fmtMoney(v)}
    </span>
  )
}

// ---------- Confirm dialog ----------
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Confirm", destructive, onConfirm, loading,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  loading?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Form primitives ----------
export function Field({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function TextInput({
  value, onChange, type = "text", placeholder, step, min, disabled, autoFocus, onEnter,
}: {
  value: string | number
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  step?: string
  min?: string
  disabled?: boolean
  autoFocus?: boolean
  onEnter?: () => void
}) {
  return (
    <Input
      type={type} value={value} placeholder={placeholder} step={step} min={min} disabled={disabled} autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter() }}
      className="h-9"
    />
  )
}

export function NumberInput({
  value, onChange, placeholder, min, step = "0.01", disabled,
}: {
  value: number | string
  onChange: (v: number) => void
  placeholder?: string
  min?: number
  step?: string
  disabled?: boolean
}) {
  return (
    <Input
      type="number" value={value} placeholder={placeholder} min={min} step={step} disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)}
      className="h-9 tabular-nums"
    />
  )
}

export function SelectInput({
  value, onChange, options, placeholder = "Select…", disabled,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
}) {
  // Radix Select forbids empty-string item values — map them to a sentinel internally
  const sentinel = "__empty__"
  const items = options.map((o) => ({ value: o.value === "" ? sentinel : o.value, label: o.label }))
  return (
    <Select value={value ? (items.find((i) => i.value === value)?.value ?? value) : undefined} onValueChange={(v) => onChange(v === sentinel ? "" : v)} disabled={disabled}>
      <SelectTrigger className="h-9 w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function TextArea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <Textarea value={value} placeholder={placeholder} rows={rows} onChange={(e) => onChange(e.target.value)} className="text-sm" />
  )
}

export function SwitchInput({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

// ---------- Generic entity picker (searchable combobox using datalist for simplicity) ----------
export function EntityPicker({
  entities, value, onChange, placeholder = "Search…", getLabel, getKey, disabled,
}: {
  entities: { id: string; [k: string]: any }[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  getLabel: (e: any) => string
  getKey?: (e: any) => string
  disabled?: boolean
}) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const key = getKey ?? ((e: any) => e.id)
  const selected = entities.find((e) => key(e) === value)
  const listId = `picker-${placeholder.replace(/\W/g, "")}`
  return (
    <div className="relative">
      <Input
        value={open ? q : selected ? getLabel(selected) : ""}
        onChange={(e) => { setQ(e.target.value); setOpen(true); if (!e.target.value) onChange("") }}
        onFocus={() => { setOpen(true); setQ("") }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-9"
      />
      {open && q && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover shadow-lg thin-scrollbar">
          {entities
            .filter((e) => getLabel(e).toLowerCase().includes(q.toLowerCase()))
            .slice(0, 30)
            .map((e) => (
              <button
                key={key(e)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={(ev) => { ev.preventDefault(); onChange(key(e)); setOpen(false); setQ("") }}
              >
                {getLabel(e)}
              </button>
            ))}
          {entities.filter((e) => getLabel(e).toLowerCase().includes(q.toLowerCase())).length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matches</p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Date display helpers ----------
export function DateCell({ value, withTime }: { value?: string | Date | null; withTime?: boolean }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return <span className="whitespace-nowrap">{withTime ? fmtDateTimeIST(value) : fmtDateIST(value)}</span>
}
