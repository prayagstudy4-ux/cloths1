"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { useApp, canDo } from "@/lib/client/store"
import { PageHeader, StatCard, SectionTitle, EmptyState } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import { StatusBadge, Money, DateCell, Field, TextInput, NumberInput, TextArea } from "@/components/shared/fields"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Landmark, Banknote, QrCode, CreditCard, Wallet, IndianRupee, ArrowDownRight, ArrowUpRight,
  CheckCircle2, Lock, LockOpen, Loader2, FileSpreadsheet, PackageX, UserRoundPlus, TrendingUp,
  AlertTriangle, Calculator,
} from "lucide-react"
import { fmtMoney, fmtDateIST, fmtDateTimeIST, ymdIST, monthStartIST } from "@/lib/format"
import {
  PAYMENT_CATEGORY_LABELS, DATE_PRESETS, DATE_PRESET_LABELS, EXPENSE_CATEGORY_LABELS,
  SALE_PAYMENT_STATUS_COLORS,
} from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// ==================== Types ====================
interface CashSession {
  id: string
  openingAmount: number
  openedAt: string
  openedBy: string
  closingAmount: number | null
  expectedAmount: number | null
  difference: number | null
  closedAt: string | null
  closedBy: string | null
  status: string
  notes: string | null
}

interface BreakdownRow {
  number: string
  direction: string
  category: string
  amount: number
  party: string
  time: string
}

interface OverviewData {
  balances: { cash: number; upi: number; card: number; bank: number; total: number }
  receivables: { total: number; count: number; top: { id: string; name: string; phone: string | null; outstanding: number }[] }
  customerAdvances: { total: number; count: number }
  payables: {
    suppliers: { total: number; count: number; top: { id: string; name: string; outstanding: number }[] }
    contractors: { total: number; count: number; top: { id: string; name: string; outstanding: number }[] }
  }
  stockValue: number
}

interface PnlData {
  period: { from: string; to: string; preset: string }
  revenue: { gross: number; returns: number; refundsPaid: number; net: number; orderCount: number }
  cogs: number
  grossProfit: number
  operatingExpenses: { total: number; byCategory: Record<string, number> }
  productionCost: number
  netProfit: number
}

// ==================== MODULE ROOT ====================
export function AccountsModule() {
  const { moduleParams, setActiveModule } = useApp()
  const [tab, setTab] = useState<string>(() => {
    const t = moduleParams?.tab as string | undefined
    return t === "register" || t === "pnl" ? t : "overview"
  })

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Landmark className="h-5 w-5" />}
        title="Accounts & Books"
        description="Where the money sits, who owes what, daily cash register discipline and honest profit & loss."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setActiveModule("payments", { tab: "qr" })}>
              <QrCode className="mr-1.5 h-4 w-4" /> UPI / QR
            </Button>
            <Button size="sm" onClick={() => setActiveModule("payments", { tab: "receive" })}>
              <IndianRupee className="mr-1.5 h-4 w-4" /> Receive Payment
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="register">Cash Register</TabsTrigger>
          <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="register" className="mt-4">
          <CashRegisterTab />
        </TabsContent>
        <TabsContent value="pnl" className="mt-4">
          <PnLTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ==================== TAB 1: OVERVIEW ====================
function OverviewTab() {
  const { setActiveModule } = useApp()
  const { data, isLoading } = useQuery({
    queryKey: ["accounts", "overview"],
    queryFn: () => api.get("accounts/overview"),
  })

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    )
  }

  const o: OverviewData = data
  const payablesTotal = o.payables.suppliers.total + o.payables.contractors.total

  return (
    <div className="space-y-4">
      {/* Balance cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Cash in Hand" value={fmtMoney(o.balances.cash)} sub="Register + drawer" icon={<Banknote className="h-4 w-4" />} />
        <StatCard label="UPI" value={fmtMoney(o.balances.upi)} sub="Collected via UPI" icon={<QrCode className="h-4 w-4" />} />
        <StatCard label="Card" value={fmtMoney(o.balances.card)} sub="Card machine settlements" icon={<CreditCard className="h-4 w-4" />} />
        <StatCard label="Bank" value={fmtMoney(o.balances.bank)} sub="Transfers & cheques" icon={<Landmark className="h-4 w-4" />} />
        <StatCard label="Total Balance" value={fmtMoney(o.balances.total)} sub="All payment modes" tone="primary" icon={<Wallet className="h-4 w-4" />} />
      </div>

      {/* Position cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Receivables" value={fmtMoney(o.receivables.total)} sub={`${o.receivables.count} customers with dues`} tone="warning" icon={<ArrowDownRight className="h-4 w-4" />} onClick={() => setActiveModule("customers")} />
        <StatCard label="Payables" value={fmtMoney(payablesTotal)} sub={`${o.payables.suppliers.count} suppliers · ${o.payables.contractors.count} contractors`} tone="negative" icon={<ArrowUpRight className="h-4 w-4" />} onClick={() => setActiveModule("suppliers")} />
        <StatCard label="Stock Value" value={fmtMoney(o.stockValue)} sub="At cost price" icon={<PackageX className="h-4 w-4 rotate-45" />} onClick={() => setActiveModule("inventory")} />
        <StatCard label="Customer Advances" value={fmtMoney(o.customerAdvances.total)} sub={`${o.customerAdvances.count} customers paid upfront`} tone="positive" icon={<UserRoundPlus className="h-4 w-4" />} />
      </div>

      {/* Receivables detail */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><ArrowDownRight className="h-4 w-4 text-amber-500" /> Receivables — customers who owe you</span>
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{fmtMoney(o.receivables.total)}</span>
          </CardTitle>
          <CardDescription>Top {o.receivables.top.length} outstanding accounts{o.receivables.count > o.receivables.top.length ? ` of ${o.receivables.count}` : ""}. Collect before extending more udhaar.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {o.receivables.top.length === 0 ? (
            <EmptyState title="No outstanding receivables" description="Every customer is settled up. Nice." icon={<CheckCircle2 className="h-6 w-6 text-emerald-500" />} />
          ) : (
            <div className="overflow-x-auto thin-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-semibold">Customer</th>
                    <th className="hidden px-4 py-2 font-semibold sm:table-cell">Phone</th>
                    <th className="px-4 py-2 text-right font-semibold">Outstanding</th>
                    <th className="px-4 py-2 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {o.receivables.top.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-2.5">
                        <button className="font-medium hover:underline" onClick={() => setActiveModule("customers", { entityId: c.id })}>{c.name}</button>
                      </td>
                      <td className="hidden px-4 py-2.5 tabular-nums text-muted-foreground sm:table-cell">{c.phone ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right"><Money value={c.outstanding} className="font-semibold text-amber-600 dark:text-amber-400" /></td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" variant="outline" onClick={() => setActiveModule("payments", { tab: "receive", customerId: c.id })}>
                          <IndianRupee className="mr-1.5 h-3.5 w-3.5" /> Receive
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {o.receivables.count > o.receivables.top.length && (
                <p className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                  …and {o.receivables.count - o.receivables.top.length} more customers with smaller dues.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payables */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PayablesCard
          title="Payables — suppliers"
          total={o.payables.suppliers.total}
          count={o.payables.suppliers.count}
          rows={o.payables.suppliers.top}
          onView={(id) => setActiveModule("suppliers", { entityId: id })}
          viewLabel="View Supplier"
        />
        <PayablesCard
          title="Payables — contractors"
          total={o.payables.contractors.total}
          count={o.payables.contractors.count}
          rows={o.payables.contractors.top}
          onView={null}
        />
      </div>
    </div>
  )
}

function PayablesCard({ title, total, count, rows, onView, viewLabel }: {
  title: string
  total: number
  count: number
  rows: { id: string; name: string; outstanding: number }[]
  onView: ((id: string) => void) | null
  viewLabel?: string
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-red-500" /> {title}</span>
          <span className="text-sm font-semibold text-red-600 dark:text-red-400">{fmtMoney(total)}</span>
        </CardTitle>
        <CardDescription>{count} account{count === 1 ? "" : "s"} with balance due.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState title="Nothing due" description="All settled." icon={<CheckCircle2 className="h-6 w-6 text-emerald-500" />} />
        ) : (
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 text-right font-semibold">Outstanding</th>
                  {onView && <th className="px-4 py-2 text-right font-semibold" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-4 py-2.5 text-right"><Money value={-r.outstanding} className="font-semibold" /></td>
                    {onView && (
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" variant="ghost" onClick={() => onView(r.id)}>{viewLabel ?? "View"}</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ==================== TAB 2: CASH REGISTER ====================
function CashRegisterTab() {
  const qc = useQueryClient()
  const canOpen = canDo("accounts", "create")
  const canClose = canDo("accounts", "edit")

  const [openingAmount, setOpeningAmount] = useState(0)
  const [countedAmount, setCountedAmount] = useState(0)
  const [closeNotes, setCloseNotes] = useState("")
  const [opening, setOpening] = useState(false)
  const [closing, setClosing] = useState(false)
  const [result, setResult] = useState<CashSession | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["cash-register"],
    queryFn: () => api.get("cash-register"),
  })
  const current: CashSession | null = data?.current ?? null
  const history: CashSession[] = data?.history ?? []
  const breakdown: BreakdownRow[] = data?.breakdown ?? []
  const cashIn: number = data?.cashIn ?? 0
  const cashOut: number = data?.cashOut ?? 0
  const expected: number = data?.expected ?? 0

  function refresh() {
    for (const key of ["cash-register", "status", "accounts", "dashboard"]) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }

  async function openRegister() {
    if (!canOpen) return
    if (openingAmount < 0) return
    setOpening(true)
    try {
      await api.post("cash-register/open", { openingAmount })
      toast({ title: "Register opened", description: `Opening float ${fmtMoney(openingAmount)}.` })
      setOpeningAmount(0)
      refresh()
    } catch (e: any) {
      toast({ title: "Could not open register", description: e.message, variant: "destructive" })
    } finally { setOpening(false) }
  }

  async function closeRegister() {
    if (!canClose) return
    setClosing(true)
    try {
      const res = await api.post("cash-register/close", {
        countedAmount,
        notes: closeNotes || undefined,
      })
      setResult(res.session)
      toast({ title: "Register closed", description: `Counted ${fmtMoney(res.session.closingAmount ?? 0)} of expected ${fmtMoney(res.session.expectedAmount ?? 0)}.` })
      setCountedAmount(0); setCloseNotes("")
      refresh()
    } catch (e: any) {
      toast({ title: "Could not close register", description: e.message, variant: "destructive" })
    } finally { setClosing(false) }
  }

  const historyColumns: Column<CashSession>[] = [
    { key: "openedAt", header: "Date", render: (s) => (
        <div>
          <DateCell value={s.openedAt} />
          <p className="text-xs text-muted-foreground">{fmtDateIST(s.openedAt, "hh:mm a")} → {s.closedAt ? fmtDateIST(s.closedAt, "hh:mm a") : "—"}</p>
        </div>
      ), sortValue: (s) => s.openedAt },
    { key: "openedBy", header: "Opened By", render: (s) => s.openedBy },
    { key: "openingAmount", header: "Opening", align: "right", render: (s) => fmtMoney(s.openingAmount), sortValue: (s) => s.openingAmount },
    { key: "expectedAmount", header: "Expected", align: "right", render: (s) => <Money value={s.expectedAmount} />, sortValue: (s) => s.expectedAmount ?? 0 },
    { key: "closingAmount", header: "Counted", align: "right", render: (s) => <Money value={s.closingAmount} />, sortValue: (s) => s.closingAmount ?? 0 },
    { key: "difference", header: "Difference", align: "right", render: (s) => <Money value={s.difference} colored className="font-semibold" />, sortValue: (s) => s.difference ?? 0 },
    { key: "closedBy", header: "Closed By", render: (s) => s.closedBy ?? "—" },
    { key: "notes", header: "Notes", render: (s) => <span className="text-xs text-muted-foreground">{s.notes ?? "—"}</span> },
  ]

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-80 rounded-lg" />
      ) : !current ? (
        <Card className="mx-auto max-w-lg">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <LockOpen className="h-4 w-4 text-primary" /> Open Register
            </CardTitle>
            <CardDescription>
              Start the day by counting the cash float in the drawer. Every cash payment afterwards is tracked against this session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Opening cash (₹)" required hint="Count the drawer before opening — this becomes your baseline.">
              <NumberInput value={openingAmount} onChange={setOpeningAmount} min={0} placeholder="0.00" />
            </Field>
            <Button onClick={openRegister} disabled={opening || !canOpen}>
              {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockOpen className="mr-2 h-4 w-4" />}
              Open Register
            </Button>
            {!canOpen && <p className="text-xs text-muted-foreground">Opening a register requires accounts · create permission.</p>}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  <Banknote className="h-4 w-4" />
                </span>
                Register Open
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
              </span>
            </CardTitle>
            <CardDescription>
              Opened <b>{fmtDateTimeIST(current.openedAt)}</b> by <b>{current.openedBy}</b> · Opening float <b>{fmtMoney(current.openingAmount)}</b>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 lg:grid-cols-3">
              {/* Breakdown */}
              <div className="space-y-3 lg:col-span-2">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Opening" value={fmtMoney(current.openingAmount)} />
                  <StatCard label="Cash In" value={fmtMoney(cashIn)} tone="positive" icon={<ArrowDownRight className="h-4 w-4" />} />
                  <StatCard label="Cash Out" value={fmtMoney(cashOut)} tone="negative" icon={<ArrowUpRight className="h-4 w-4" />} />
                  <StatCard label="Expected in Drawer" value={fmtMoney(expected)} tone="primary" icon={<Calculator className="h-4 w-4" />} />
                </div>

                <div>
                  <SectionTitle>Live cash movement this session</SectionTitle>
                  {breakdown.length === 0 ? (
                    <EmptyState title="No cash movement yet" description="Cash payments recorded while this register is open will appear here." />
                  ) : (
                    <div className="max-h-96 overflow-y-auto rounded-lg border thin-scrollbar">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2 font-semibold">Time</th>
                            <th className="px-3 py-2 font-semibold">Number</th>
                            <th className="hidden px-3 py-2 font-semibold sm:table-cell">Category</th>
                            <th className="hidden px-3 py-2 font-semibold md:table-cell">Party</th>
                            <th className="px-3 py-2 text-right font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {breakdown.map((b, i) => (
                            <tr key={b.number + i} className="border-b last:border-0">
                              <td className="whitespace-nowrap px-3 py-2 text-xs"><DateCell value={b.time} withTime /></td>
                              <td className="px-3 py-2 font-mono text-xs font-medium">{b.number}</td>
                              <td className="hidden px-3 py-2 text-xs sm:table-cell">{PAYMENT_CATEGORY_LABELS[b.category] ?? b.category}</td>
                              <td className="hidden max-w-[160px] truncate px-3 py-2 text-xs md:table-cell">{b.party}</td>
                              <td className="px-3 py-2 text-right">
                                <Money value={b.direction === "IN" ? b.amount : -b.amount} colored className="font-medium" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Close form */}
              <div className="space-y-3 rounded-lg border p-4">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Lock className="h-4 w-4" /> Close Register
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Count the physical cash in the drawer and enter the total. Differences are logged and flagged.
                  </p>
                </div>
                <Field label="Counted cash (₹)" required>
                  <NumberInput value={countedAmount} onChange={setCountedAmount} min={0} placeholder="0.00" />
                </Field>
                <div className="flex items-baseline justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Expected</span>
                  <Money value={expected} className="font-semibold" />
                </div>
                <Field label="Notes (optional)">
                  <TextArea value={closeNotes} onChange={setCloseNotes} rows={2} placeholder="e.g. ₹50 short — customer change error" />
                </Field>
                <Button className="w-full" onClick={closeRegister} disabled={closing || !canClose}>
                  {closing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                  Close Register
                </Button>
                {!canClose && <p className="text-xs text-muted-foreground">Closing a register requires accounts · edit permission.</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <div>
        <SectionTitle
          action={
            history.length > 0 ? (
              <Button
                variant="outline" size="sm"
                onClick={() => exportCSV(
                  "cash-register-history",
                  ["Date", "Opened By", "Opening", "Expected", "Counted", "Difference", "Closed By", "Notes"],
                  history.map((s) => [
                    fmtDateIST(s.openedAt), s.openedBy, s.openingAmount,
                    s.expectedAmount ?? 0, s.closingAmount ?? 0, s.difference ?? 0,
                    s.closedBy ?? "", s.notes ?? "",
                  ]),
                )}
              >
                <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Export CSV
              </Button>
            ) : undefined
          }
        >
          Closed Sessions
        </SectionTitle>
        <DataTable
          columns={historyColumns}
          rows={history}
          pageSize={10}
          dense
          emptyTitle="No closed sessions yet"
          emptyDescription="Open the register in the morning and close it at night — a history of counts builds here."
          rowClassName={(s) => (Math.abs(s.difference ?? 0) >= 100 ? "bg-red-500/5" : Math.abs(s.difference ?? 0) >= 1 ? "bg-amber-500/5" : "")}
        />
      </div>

      {/* Close result dialog */}
      {result && (
        <Dialog open onOpenChange={(v) => !v && setResult(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {Math.abs(result.difference ?? 0) < 0.01
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  : <AlertTriangle className="h-5 w-5 text-amber-500" />}
                Register Closed
              </DialogTitle>
              <DialogDescription>Session from {fmtDateTimeIST(result.openedAt)} · closed by {result.closedBy}.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-lg border p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Expected</span><Money value={result.expectedAmount} className="font-medium" /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Counted</span><Money value={result.closingAmount} className="font-medium" /></div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">Difference</span>
                <Money value={result.difference} colored className="text-base font-bold" />
              </div>
              {Math.abs(result.difference ?? 0) < 0.01 ? (
                <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  Perfect count — drawer matches the books. ✓
                </p>
              ) : (
                <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  {(result.difference ?? 0) > 0
                    ? "Excess cash in the drawer — check for unrecorded sales or change errors."
                    : "Shortage recorded — the difference has been logged and flagged for review."}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setResult(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ==================== TAB 3: PROFIT & LOSS ====================
function PnLTab() {
  const [preset, setPreset] = useState("this_month")
  const [from, setFrom] = useState(ymdIST(monthStartIST()))
  const [to, setTo] = useState(ymdIST())

  const queryParams = preset === "custom" ? { preset, from, to } : { preset }
  const { data, isLoading } = useQuery({
    queryKey: ["accounts", "pnl", queryParams],
    queryFn: () => api.get(`accounts/pnl${qs(queryParams)}`),
  })
  const pnl: PnlData | undefined = data

  function exportPnl() {
    if (!pnl) return
    exportCSV(
      "profit-and-loss",
      ["Profit & Loss", `${fmtDateIST(pnl.period.from)} – ${fmtDateIST(pnl.period.to)}`],
      [
        ["Gross Sales", pnl.revenue.gross],
        ["Less: Returns", -pnl.revenue.returns],
        ["Net Revenue", pnl.revenue.net],
        ["Cost of Goods Sold", -pnl.cogs],
        ["Gross Profit", pnl.grossProfit],
        ...Object.entries(pnl.operatingExpenses.byCategory)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => [`Expense: ${EXPENSE_CATEGORY_LABELS[k] ?? k}`, v]),
        ["Total Operating Expenses", -pnl.operatingExpenses.total],
        ["Production / Job Work Cost", -pnl.productionCost],
        ["Net Profit", pnl.netProfit],
      ],
    )
  }

  const expenseLines = pnl
    ? Object.entries(pnl.operatingExpenses.byCategory).sort((a, b) => b[1] - a[1])
    : []

  return (
    <div className="space-y-4">
      {/* Preset selector */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              aria-pressed={preset === p}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                preset === p ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {DATE_PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-end gap-2">
            <div className="w-40"><Field label="From"><TextInput type="date" value={from} onChange={setFrom} /></Field></div>
            <div className="w-40"><Field label="To"><TextInput type="date" value={to} onChange={setTo} /></Field></div>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {pnl && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {fmtDateIST(pnl.period.from)} – {fmtDateIST(pnl.period.to)}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={exportPnl} disabled={!pnl}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Statement */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" /> Profit &amp; Loss Statement
          </CardTitle>
          <CardDescription>
            {pnl ? `${fmtDateIST(pnl.period.from)} – ${fmtDateIST(pnl.period.to)} · ${pnl.revenue.orderCount} completed invoice${pnl.revenue.orderCount === 1 ? "" : "s"}` : "Loading…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || !pnl ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
            </div>
          ) : (
            <div className="mx-auto max-w-2xl">
              {/* Revenue */}
              <PLSectionHeader>Revenue</PLSectionHeader>
              <PLRow label="Gross Sales" amount={pnl.revenue.gross} />
              <PLRow label="Less: Returns" amount={-pnl.revenue.returns} level={1} paren />
              {pnl.revenue.refundsPaid > 0 && (
                <PLRow label={`of which refunded in cash/UPI: ${fmtMoney(pnl.revenue.refundsPaid)}`} amount={0} level={2} muted zeroAsDash />
              )}
              <PLRow label="Net Revenue" amount={pnl.revenue.net} bold rule="top" />

              {/* COGS */}
              <PLSectionHeader>Cost of Goods Sold</PLSectionHeader>
              <PLRow label="Cost of Goods Sold" amount={-pnl.cogs} paren />
              <PLRow label="Gross Profit" amount={pnl.grossProfit} bold rule="double" />

              {/* Operating expenses */}
              <PLSectionHeader>Operating Expenses</PLSectionHeader>
              {expenseLines.length === 0 ? (
                <PLRow label="No expenses recorded in this period" amount={0} muted zeroAsDash />
              ) : (
                expenseLines.map(([cat, v]) => (
                  <PLRow key={cat} label={EXPENSE_CATEGORY_LABELS[cat] ?? cat} amount={v} level={1} />
                ))
              )}
              <PLRow label="Total Operating Expenses" amount={-pnl.operatingExpenses.total} bold rule="top" paren />

              {/* Production */}
              <PLSectionHeader>Production &amp; Job Work</PLSectionHeader>
              <PLRow label="Completed job work cost" amount={-pnl.productionCost} paren />
              {pnl.productionCost > 0 && (
                <p className="pl-5 text-xs text-muted-foreground">Job work completed in this period (tailoring, printing, embroidery…).</p>
              )}

              {/* Net profit */}
              <div className={cn(
                "mt-4 flex items-baseline justify-between rounded-lg border-2 p-4",
                pnl.netProfit >= 0 ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30",
              )}>
                <span className="text-sm font-bold uppercase tracking-wide">Net Profit</span>
                <span className={cn(
                  "text-3xl font-bold tabular-nums",
                  pnl.netProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400",
                )}>
                  {fmtMoney(pnl.netProfit)}
                </span>
              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                Production costs = completed job work value; salaries are included in operating expenses.
                Net profit = gross profit − operating expenses − production costs.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PLSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
      {children}
    </p>
  )
}

function PLRow({ label, amount, level = 0, bold, rule, muted, paren, zeroAsDash }: {
  label: string
  amount: number
  level?: number
  bold?: boolean
  rule?: "top" | "double"
  muted?: boolean
  paren?: boolean
  zeroAsDash?: boolean
}) {
  const negative = amount < 0
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-1.5 text-sm",
        bold && "font-semibold",
        rule === "top" && "mt-1 border-t",
        rule === "double" && "mt-2 border-t-2 pt-2",
        muted && "text-muted-foreground",
      )}
      style={{ paddingLeft: level * 18 }}
    >
      <span className="min-w-0">{label}</span>
      <span className={cn("shrink-0 tabular-nums", bold && "font-semibold", negative ? "text-red-600 dark:text-red-400" : "")}>
        {zeroAsDash && amount === 0 ? "—" : paren && negative ? `(${fmtMoney(Math.abs(amount))})` : fmtMoney(amount)}
      </span>
    </div>
  )
}
