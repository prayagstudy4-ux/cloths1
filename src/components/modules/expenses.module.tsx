"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { canDo, useApp } from "@/lib/client/store"
import { PageHeader, StatCard } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import { StatusBadge, DateCell, ConfirmDialog, Field, TextInput, SelectInput, TextArea, NumberInput } from "@/components/shared/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { fmtMoney, fmtDateIST, ymdIST } from "@/lib/format"
import {
  EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
} from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import { Receipt, Plus, Download, Pencil, Trash2, Loader2, Search, X, FileText } from "lucide-react"

// ==================== Types ====================
interface Expense {
  id: string; category: string; description: string; amount: number
  date: string; method: string; paidTo: string | null; notes: string | null
  createdByName: string | null; createdAt: string
}

// ==================== Local style maps ====================
const EXPENSE_CATEGORY_BADGE: Record<string, string> = {
  RENT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ELECTRICITY: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  SALARY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  TRANSPORT: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  PACKAGING: "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300",
  MARKETING: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  MACHINERY: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  REPAIRS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  INTERNET: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  RAW_MATERIAL: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  CONTRACTOR: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  OTHER: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
}

const EXPENSE_CATEGORY_BAR: Record<string, string> = {
  RENT: "bg-zinc-500",
  ELECTRICITY: "bg-amber-500",
  SALARY: "bg-emerald-500",
  TRANSPORT: "bg-teal-500",
  PACKAGING: "bg-lime-500",
  MARKETING: "bg-rose-500",
  MACHINERY: "bg-orange-500",
  REPAIRS: "bg-yellow-500",
  INTERNET: "bg-cyan-500",
  RAW_MATERIAL: "bg-green-600",
  CONTRACTOR: "bg-fuchsia-500",
  OTHER: "bg-zinc-400",
}

const NEUTRAL_BADGE = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"

// ==================== MAIN MODULE ====================
export function ExpensesModule() {
  const { moduleParams } = useApp()
  const qc = useQueryClient()
  const [category, setCategory] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(!!moduleParams?.new)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const focusId = (moduleParams?.entityId as string) ?? null

  // Debounce server-side search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const toParam = to ? `${to}T23:59:59.999Z` : ""

  const listQuery = useQuery({
    queryKey: ["expenses", "list", search, category, from, to],
    queryFn: () => api.get(`expenses${qs({ q: search, category, from, to: toParam, pageSize: 100 })}`),
  })
  const expenses: Expense[] = listQuery.data?.expenses ?? []

  // This-month snapshot (independent of filters)
  const monthFrom = `${ymdIST().slice(0, 7)}-01`
  const monthTo = `${ymdIST()}T23:59:59.999Z`
  const monthQuery = useQuery({
    queryKey: ["expenses", "month", monthFrom, monthTo],
    queryFn: () => api.get(`expenses${qs({ from: monthFrom, to: monthTo, pageSize: 1 })}`),
  })

  const filteredSum: number = listQuery.data?.sum ?? 0
  const filteredTotal: number = listQuery.data?.total ?? 0
  const monthSum: number = monthQuery.data?.sum ?? 0
  const monthCount: number = monthQuery.data?.total ?? 0

  const byCategory = useMemo(() => {
    const raw: any[] = listQuery.data?.byCategory ?? []
    return raw
      .map((c) => ({ category: String(c.category), amount: Number(c._sum?.amount ?? 0) }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [listQuery.data])

  const monthTop = useMemo(() => {
    const raw: any[] = monthQuery.data?.byCategory ?? []
    const mapped = raw
      .map((c) => ({ category: String(c.category), amount: Number(c._sum?.amount ?? 0) }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount)
    return mapped[0] ?? null
  }, [monthQuery.data])

  const hasFilters = !!(searchInput || category || from || to)

  function clearFilters() {
    setSearchInput("")
    setSearch("")
    setCategory("")
    setFrom("")
    setTo("")
  }

  function exportCsv() {
    exportCSV(
      "expenses",
      ["Date", "Category", "Description", "Paid To", "Method", "Amount", "Created By"],
      expenses.map((e) => [
        fmtDateIST(e.date),
        EXPENSE_CATEGORY_LABELS[e.category] ?? e.category,
        e.description,
        e.paidTo ?? "",
        PAYMENT_METHOD_LABELS[e.method] ?? e.method,
        e.amount,
        e.createdByName ?? "",
      ]),
    )
  }

  async function del() {
    if (!deleting) return
    setDeletingBusy(true)
    try {
      await api.del(`expenses/${deleting.id}`)
      toast({ title: "Expense deleted", description: `${deleting.description} — the linked payment was voided.` })
      qc.invalidateQueries({ queryKey: ["expenses"] })
      qc.invalidateQueries({ queryKey: ["payments"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })
      setDeleting(null)
    } catch (e: any) {
      toast({ title: "Could not delete expense", description: e.message, variant: "destructive" })
    } finally {
      setDeletingBusy(false)
    }
  }

  const columns: Column<Expense>[] = [
    { key: "date", header: "Date", sortValue: (e) => e.date, render: (e) => <DateCell value={e.date} /> },
    {
      key: "category", header: "Category",
      render: (e) => (
        <StatusBadge label={EXPENSE_CATEGORY_LABELS[e.category] ?? e.category} className={EXPENSE_CATEGORY_BADGE[e.category] ?? NEUTRAL_BADGE} />
      ),
    },
    {
      key: "description", header: "Description",
      render: (e) => <span className="block max-w-[280px] truncate" title={e.description}>{e.description}</span>,
    },
    { key: "paidTo", header: "Paid To", render: (e) => e.paidTo ?? <span className="text-muted-foreground">—</span> },
    { key: "method", header: "Method", render: (e) => PAYMENT_METHOD_LABELS[e.method] ?? e.method },
    {
      key: "amount", header: "Amount", align: "right", sortValue: (e) => e.amount,
      render: (e) => <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{fmtMoney(e.amount)}</span>,
    },
    { key: "createdByName", header: "Created By", render: (e) => <span className="text-muted-foreground">{e.createdByName ?? "—"}</span> },
    {
      key: "actions", header: "", align: "right",
      render: (e) => (
        <div className="flex justify-end gap-0.5" onClick={(ev) => ev.stopPropagation()}>
          {canDo("expenses", "edit") && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(e)} aria-label={`Edit ${e.description}`}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {canDo("expenses", "delete") && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => setDeleting(e)}
              aria-label={`Delete ${e.description}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Receipt className="h-5 w-5" />}
        title="Expenses"
        description="Operating overheads — rent, utilities, transport, marketing. Every expense links to a money-out payment record."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={expenses.length === 0}>
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
            {canDo("expenses", "create") && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Expense
              </Button>
            )}
          </>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="This Month Total" value={fmtMoney(monthSum)} sub={`${monthCount} expense entries`} icon={<Receipt className="h-4 w-4" />} />
        <StatCard label="This Month Count" value={monthQuery.isLoading ? "…" : monthCount} sub="records this month" icon={<FileText className="h-4 w-4" />} />
        <StatCard
          label="Top Category"
          value={monthTop ? (EXPENSE_CATEGORY_LABELS[monthTop.category] ?? monthTop.category) : "—"}
          sub={monthTop ? `${fmtMoney(monthTop.amount)} this month` : "No expenses yet"}
          tone="warning"
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="Filtered Total"
          value={fmtMoney(filteredSum)}
          sub={hasFilters ? `${filteredTotal} matching records` : "all time"}
          icon={<Receipt className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main column: filters + table */}
        <div className="space-y-4 lg:col-span-2">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search description, paid to…"
                className="h-9 pl-8"
                aria-label="Search expenses"
              />
            </div>
            <div className="w-[180px]">
              <SelectInput
                value={category || "__all"}
                onChange={(v) => setCategory(v === "__all" ? "" : v)}
                options={[
                  { value: "__all", label: "All Categories" },
                  ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] })),
                ]}
              />
            </div>
            <Input
              type="date"
              aria-label="From date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-[150px]"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              aria-label="To date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-[150px]"
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-9 px-2" onClick={clearFilters} aria-label="Clear filters">
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFrom(monthFrom); setTo(ymdIST()) }}>
                This Month
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFrom(`${ymdIST().slice(0, 4)}-01-01`); setTo(ymdIST()) }}>
                This Year
              </Button>
            </div>
          </div>

          <DataTable
            columns={columns}
            rows={expenses}
            loading={listQuery.isLoading}
            emptyTitle={hasFilters ? "No matching expenses" : "No expenses yet"}
            emptyDescription={hasFilters
              ? "Try widening the date range or clearing the category filter."
              : "Record your first expense — rent, transport, packaging and more."}
            emptyAction={canDo("expenses", "create") && !hasFilters ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Expense
              </Button>
            ) : undefined}
            rowClassName={(e) => (focusId === e.id ? "bg-primary/5 ring-1 ring-inset ring-primary" : "")}
          />

          {filteredTotal > expenses.length && (
            <p className="text-xs text-muted-foreground">
              Showing the first {expenses.length} of {filteredTotal} matching expenses — narrow the filters to see more.
            </p>
          )}
        </div>

        {/* Side column: category breakdown */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">By Category</h2>
              <span className="text-xs text-muted-foreground">{hasFilters ? "filtered" : "all time"}</span>
            </div>
            {byCategory.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No expenses in the current selection.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {byCategory.map((c) => {
                  const pct = filteredSum > 0 ? Math.round((c.amount / filteredSum) * 100) : 0
                  return (
                    <div key={c.category}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium">{EXPENSE_CATEGORY_LABELS[c.category] ?? c.category}</span>
                        <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                          {fmtMoney(c.amount)} · {pct}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", EXPENSE_CATEGORY_BAR[c.category] ?? "bg-zinc-400")}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                <div className="border-t pt-2 text-right text-xs font-medium tabular-nums text-muted-foreground">
                  Total {fmtMoney(filteredSum)}
                </div>
              </div>
            )}
          </div>

          <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            Every expense creates a money-out payment (cash / UPI / card / bank) and feeds the Accounts module, P&amp;L operating
            expenses and the cash-flow report automatically.
          </p>
        </div>
      </div>

      {creating && <ExpenseForm onClose={() => setCreating(false)} />}
      {editing && <ExpenseForm expense={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={() => setDeleting(null)}
          title="Delete expense?"
          description={`"${deleting.description}" (${fmtMoney(deleting.amount)}). The linked payment will be voided, not removed — account history is preserved.`}
          confirmLabel="Delete"
          destructive
          loading={deletingBusy}
          onConfirm={del}
        />
      )}
    </div>
  )
}

// ==================== EXPENSE FORM (create / edit) ====================
function ExpenseForm({ expense, onClose }: { expense?: Expense; onClose: () => void }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    category: expense?.category ?? "OTHER",
    description: expense?.description ?? "",
    amount: expense?.amount ?? 0,
    date: expense ? fmtDateIST(expense.date, "yyyy-MM-dd") : ymdIST(),
    method: expense?.method ?? "CASH",
    paidTo: expense?.paidTo ?? "",
    notes: expense?.notes ?? "",
  })

  async function save() {
    if (!form.description.trim()) return toast({ title: "Description is required", variant: "destructive" })
    if (!form.amount || form.amount <= 0) return toast({ title: "Amount must be greater than zero", variant: "destructive" })
    setSaving(true)
    try {
      if (expense) {
        // Date & method belong to the linked payment record and are not editable server-side
        await api.put(`expenses/${expense.id}`, {
          category: form.category,
          description: form.description.trim(),
          amount: form.amount,
          paidTo: form.paidTo.trim(),
          notes: form.notes.trim(),
        })
      } else {
        await api.post("expenses", {
          category: form.category,
          description: form.description.trim(),
          amount: form.amount,
          date: form.date || undefined,
          method: form.method,
          paidTo: form.paidTo.trim(),
          notes: form.notes.trim(),
        })
      }
      toast({
        title: expense ? "Expense updated" : "Expense recorded",
        description: `${form.description.trim()} — ${fmtMoney(form.amount)}`,
      })
      qc.invalidateQueries({ queryKey: ["expenses"] })
      qc.invalidateQueries({ queryKey: ["payments"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Failed to save expense", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit Expense" : "Add Expense"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" required>
            <SelectInput
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
              options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] }))}
            />
          </Field>
          <Field label="Amount (₹)" required>
            <NumberInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} min={0} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description" required>
              <TextInput value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="e.g. Monthly shop rent" autoFocus />
            </Field>
          </div>
          <Field label="Date" hint={expense ? "Locked — belongs to the linked payment" : undefined}>
            <TextInput type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} disabled={!!expense} />
          </Field>
          <Field label="Paid via" hint={expense ? "Locked — belongs to the linked payment" : undefined}>
            <SelectInput
              value={form.method}
              onChange={(v) => setForm({ ...form, method: v })}
              disabled={!!expense}
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
            />
          </Field>
          <Field label="Paid to" hint="Vendor or person">
            <TextInput value={form.paidTo} onChange={(v) => setForm({ ...form, paidTo: v })} placeholder="e.g. Sharma Electricals" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <TextArea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={2} placeholder="Bill number, remarks…" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {expense ? "Save Changes" : "Record Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
