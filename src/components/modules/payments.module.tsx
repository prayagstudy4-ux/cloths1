"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { useApp, canDo } from "@/lib/client/store"
import { PageHeader, StatCard, SectionTitle, EmptyState } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import { StatusBadge, Money, DateCell, Field, TextInput, NumberInput, SelectInput, TextArea, EntityPicker } from "@/components/shared/fields"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CreditCard, IndianRupee, ArrowDownRight, ArrowUpRight, QrCode, Wallet, Banknote, Landmark,
  CheckCircle2, Printer, Ban, Loader2, Search, RotateCcw, ShieldAlert, UserCheck, FileSpreadsheet,
} from "lucide-react"
import { fmtMoney, fmtDateIST, fmtDateTimeIST, ymdIST, monthStartIST, istDateFromYMD } from "@/lib/format"
import {
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  PAYMENT_CATEGORIES, PAYMENT_CATEGORY_LABELS, SALE_PAYMENT_STATUS_COLORS,
} from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// ==================== Types ====================
interface PaymentRow {
  id: string
  number: string
  direction: string
  category: string
  method: string
  amount: number
  date: string
  status: string
  transactionId: string | null
  provider: string | null
  notes: string | null
  createdByName: string | null
  voidedAt: string | null
  verifiedAt: string | null
  verifiedBy: string | null
  createdAt: string
  customerId: string | null
  customer?: { id: string; name: string; phone?: string | null } | null
  supplierId: string | null
  supplier?: { id: string; name: string } | null
  saleId: string | null
  sale?: { id: string; invoiceNumber: string; paymentStatus: string } | null
}

interface QrPaymentRow {
  id: string
  code: string
  amount: number
  note: string | null
  upiId: string
  status: string
  transactionId: string | null
  createdAt: string
  verifiedAt: string | null
  verifiedBy: string | null
  saleId?: string | null
  sale?: { id: string; invoiceNumber: string; paymentStatus: string } | null
  customerId?: string | null
  customer?: { id: string; name: string } | null
  payment?: PaymentRow | null
  qrDataUrl?: string
  qrImageUrl?: string | null
  upiUrl?: string
}

interface SaleOption {
  id: string
  invoiceNumber: string
  date: string
  total: number
  dueAmount: number
  paymentStatus: string
  customerId: string | null
  customer?: { id: string; name: string } | null
}

// ==================== Shared bits ====================
const METHOD_BADGE: Record<string, string> = {
  CASH: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  UPI: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  CARD: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  BANK: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
}

const QR_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending", VERIFIED: "Verified", CANCELLED: "Cancelled", EXPIRED: "Expired", UNMATCHED: "Unmatched",
}
const QR_STATUS_COLORS: Record<string, string> = {
  PENDING: PAYMENT_STATUS_COLORS.PENDING,
  VERIFIED: PAYMENT_STATUS_COLORS.VERIFIED,
  CANCELLED: PAYMENT_STATUS_COLORS.VOID,
  EXPIRED: PAYMENT_STATUS_COLORS.VOID,
  UNMATCHED: PAYMENT_STATUS_COLORS.UNMATCHED,
}

const METHOD_ICON: Record<string, React.ReactNode> = {
  CASH: <Banknote className="h-4 w-4" />,
  UPI: <QrCode className="h-4 w-4" />,
  CARD: <CreditCard className="h-4 w-4" />,
  BANK: <Landmark className="h-4 w-4" />,
}

function isDueSale(s: SaleOption) {
  return s.paymentStatus === "PARTIAL" || s.paymentStatus === "UNPAID"
}

/** Shared invalidations after any payment-mutating action */
function invalidatePaymentData(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ["payments", "sales", "customers", "dashboard", "accounts", "cash-register", "status"]) {
    qc.invalidateQueries({ queryKey: [key] })
  }
}

// ==================== MODULE ROOT ====================
export function PaymentsModule() {
  const { moduleParams, setActiveModule } = useApp()
  const [tab, setTab] = useState<string>(() => {
    const t = moduleParams?.tab as string | undefined
    return t === "receive" || t === "qr" || t === "reconciliation" ? t : "all"
  })
  const [detailId, setDetailId] = useState<string | null>((moduleParams?.entityId as string) ?? null)
  const [prefillCustomer, setPrefillCustomer] = useState<string>((moduleParams?.customerId as string) ?? "")

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<CreditCard className="h-5 w-5" />}
        title="Payments"
        description="Record receipts, collect via UPI QR, and reconcile every rupee that enters or leaves the shop."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setActiveModule("sales", { tab: "pos" })}>
              <Wallet className="mr-1.5 h-4 w-4" /> New Sale
            </Button>
            <Button size="sm" onClick={() => { setPrefillCustomer(""); setTab("receive") }}>
              <IndianRupee className="mr-1.5 h-4 w-4" /> Receive Payment
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
          <TabsTrigger value="all">All Payments</TabsTrigger>
          <TabsTrigger value="receive">Receive Payment</TabsTrigger>
          <TabsTrigger value="qr">UPI / QR</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <AllPaymentsTab
            detailId={detailId}
            onDetailId={setDetailId}
            onNavigateTab={setTab}
            onReceiveMore={(cid) => { setPrefillCustomer(cid); setTab("receive") }}
          />
        </TabsContent>
        <TabsContent value="receive" className="mt-4">
          <ReceivePaymentTab initialCustomerId={prefillCustomer} onNavigateTab={setTab} />
        </TabsContent>
        <TabsContent value="qr" className="mt-4">
          <UPIQRTab />
        </TabsContent>
        <TabsContent value="reconciliation" className="mt-4">
          <ReconciliationTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ==================== TAB 1: ALL PAYMENTS ====================
function AllPaymentsTab({ detailId, onDetailId, onNavigateTab, onReceiveMore }: {
  detailId: string | null
  onDetailId: (id: string | null) => void
  onNavigateTab: (t: string) => void
  onReceiveMore: (customerId: string) => void
}) {
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [method, setMethod] = useState("")
  const [status, setStatus] = useState("")
  const [direction, setDirection] = useState("")
  const [category, setCategory] = useState("")
  const [from, setFrom] = useState(ymdIST(monthStartIST()))
  const [to, setTo] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const params = {
    q: debounced, method, status, direction, category,
    from: from ? istDateFromYMD(from).toISOString() : "",
    to: to ? istDateFromYMD(to, true).toISOString() : "",
    pageSize: 100,
  }
  const { data, isLoading } = useQuery({
    queryKey: ["payments", "list", params],
    queryFn: () => api.get(`payments${qs(params)}`),
  })
  const { data: unmatchedData } = useQuery({
    queryKey: ["payments", "unmatched-count"],
    queryFn: () => api.get(`payments${qs({ status: "UNMATCHED", pageSize: 1 })}`),
  })

  // Deep-link support: payments has no GET /:id endpoint, resolve from the latest 300 rows
  const payments: PaymentRow[] = data?.payments ?? []
  const inList = !!detailId && payments.some((p) => p.id === detailId)
  const { data: findData, isSuccess: findDone } = useQuery({
    queryKey: ["payments", "find", detailId],
    queryFn: () => api.get(`payments${qs({ pageSize: 300 })}`),
    enabled: !!detailId && !inList,
  })
  useEffect(() => {
    if (detailId && findDone && !inList) {
      const found = (findData?.payments ?? []).some((p: PaymentRow) => p.id === detailId)
      if (!found) {
        toast({ title: "Payment not found", description: "It may have been removed.", variant: "destructive" })
        onDetailId(null)
      }
    }
  }, [detailId, findDone, inList, findData, onDetailId])

  const detail = useMemo<PaymentRow | null>(() => {
    if (!detailId) return null
    return payments.find((p) => p.id === detailId)
      ?? (findData?.payments ?? []).find((p: PaymentRow) => p.id === detailId)
      ?? null
  }, [detailId, payments, findData])

  const hasFilters = !!(method || status || direction || category || debounced || from || to)

  const columns: Column<PaymentRow>[] = [
    {
      key: "number", header: "Number", width: "w-24",
      render: (p) => (
        <span className={cn("font-medium", p.status === "VOID" && "text-muted-foreground line-through")}>{p.number}</span>
      ),
    },
    { key: "date", header: "Date", render: (p) => <DateCell value={p.date} />, sortValue: (p) => p.date },
    {
      key: "direction", header: "Type", align: "center",
      render: (p) => p.direction === "IN" ? (
        <span className="inline-flex items-center justify-center text-emerald-600 dark:text-emerald-400" title="Money in">
          <ArrowDownRight className="h-4 w-4" /><span className="sr-only">Money in</span>
        </span>
      ) : (
        <span className="inline-flex items-center justify-center text-red-600 dark:text-red-400" title="Money out">
          <ArrowUpRight className="h-4 w-4" /><span className="sr-only">Money out</span>
        </span>
      ),
      sortValue: (p) => p.direction,
    },
    {
      key: "party", header: "Party",
      render: (p) => p.customer?.name ?? p.supplier?.name ?? <span className="text-muted-foreground">—</span>,
    },
    { key: "category", header: "Category", render: (p) => PAYMENT_CATEGORY_LABELS[p.category] ?? p.category },
    {
      key: "method", header: "Method",
      render: (p) => <StatusBadge label={PAYMENT_METHOD_LABELS[p.method] ?? p.method} className={METHOD_BADGE[p.method]} />,
    },
    {
      key: "amount", header: "Amount", align: "right",
      render: (p) => <Money value={p.direction === "IN" ? p.amount : -p.amount} colored className="font-semibold" />,
      sortValue: (p) => p.amount,
    },
    {
      key: "status", header: "Status",
      render: (p) => <StatusBadge label={PAYMENT_STATUS_LABELS[p.status] ?? p.status} className={PAYMENT_STATUS_COLORS[p.status]} />,
    },
    {
      key: "transactionId", header: "Txn / Ref",
      render: (p) => p.transactionId
        ? <span className="font-mono text-xs">{p.transactionId}</span>
        : <span className="text-muted-foreground">—</span>,
    },
  ]

  function exportPayments() {
    exportCSV(
      "payments",
      ["Number", "Date", "Direction", "Party", "Category", "Method", "Amount", "Status", "Transaction ID"],
      payments.map((p) => [
        p.number, fmtDateIST(p.date), p.direction === "IN" ? "IN" : "OUT",
        p.customer?.name ?? p.supplier?.name ?? "",
        PAYMENT_CATEGORY_LABELS[p.category] ?? p.category,
        PAYMENT_METHOD_LABELS[p.method] ?? p.method,
        p.amount, PAYMENT_STATUS_LABELS[p.status] ?? p.status, p.transactionId ?? "",
      ]),
    )
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total Received" value={isLoading ? "…" : fmtMoney(data?.sumVerified ?? 0)}
          sub="Verified · filtered period" tone="positive" icon={<ArrowDownRight className="h-4 w-4" />}
        />
        <StatCard
          label="Payments" value={isLoading ? "…" : (data?.total ?? 0)} sub="Matching filters"
          icon={<IndianRupee className="h-4 w-4" />}
        />
        <StatCard
          label="Unmatched" value={unmatchedData?.total ?? 0} sub="Awaiting assignment" tone="warning"
          icon={<UserCheck className="h-4 w-4" />} onClick={() => onNavigateTab("reconciliation")}
        />
        <StatCard
          label="Money Out" value={fmtMoney(payments.filter((p) => p.direction === "OUT").reduce((s, p) => s + p.amount, 0))}
          sub="On this page" icon={<ArrowUpRight className="h-4 w-4" />}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <InputBox value={search} onChange={(v) => setSearch(v)} placeholder="Search number, txn, party…" />
        </div>
        <div className="w-36"><Field label="Method">
          <SelectInput value={method} onChange={setMethod} placeholder="All methods"
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} />
        </Field></div>
        <div className="w-36"><Field label="Status">
          <SelectInput value={status} onChange={setStatus} placeholder="All statuses"
            options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABELS[s] }))} />
        </Field></div>
        <div className="w-36"><Field label="Direction">
          <SelectInput value={direction} onChange={setDirection} placeholder="All"
            options={[{ value: "IN", label: "Money In" }, { value: "OUT", label: "Money Out" }]} />
        </Field></div>
        <div className="w-44"><Field label="Category">
          <SelectInput value={category} onChange={setCategory} placeholder="All categories"
            options={PAYMENT_CATEGORIES.map((c) => ({ value: c, label: PAYMENT_CATEGORY_LABELS[c] }))} />
        </Field></div>
        <div className="w-40"><Field label="From">
          <TextInput type="date" value={from} onChange={setFrom} />
        </Field></div>
        <div className="w-40"><Field label="To">
          <TextInput type="date" value={to} onChange={setTo} />
        </Field></div>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => {
            setSearch(""); setMethod(""); setStatus(""); setDirection(""); setCategory("")
            setFrom(ymdIST(monthStartIST())); setTo("")
          }}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
        )}
        <Button variant="outline" size="sm" className="ml-auto h-9" onClick={exportPayments} disabled={payments.length === 0}>
          <FileSpreadsheet className="mr-1.5 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {(data?.total ?? 0) > payments.length && (
        <p className="text-xs text-muted-foreground">
          Showing the latest {payments.length} of {data?.total} payments — narrow the filters to see older entries.
        </p>
      )}

      <DataTable
        columns={columns}
        rows={payments}
        loading={isLoading}
        onRowClick={(p) => onDetailId(p.id)}
        emptyTitle={hasFilters ? "No matching payments" : "No payments yet"}
        emptyDescription="Record receipts, pay suppliers, or collect via UPI QR — every payment lands here."
        rowClassName={(p) => (p.status === "UNMATCHED" ? "bg-orange-500/5" : p.status === "VOID" ? "opacity-60" : "")}
      />

      {detail && <PaymentDetailSheet payment={detail} onClose={() => onDetailId(null)} onReceiveMore={onReceiveMore} />}
    </div>
  )
}

/** small local wrapper so the filter bar search box matches the design system */
function InputBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 w-full rounded-md border border-input bg-transparent px-3 pl-8 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
    />
  )
}

// ==================== PAYMENT DETAIL SHEET ====================
function PaymentDetailSheet({ payment, onClose, onReceiveMore }: { payment: PaymentRow; onClose: () => void; onReceiveMore: (customerId: string) => void }) {
  const qc = useQueryClient()
  const { setActiveModule } = useApp()
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const canVoid = canDo("payments", "void")

  async function doVoid() {
    if (!reason.trim()) return toast({ title: "Enter a reason", description: "Why is this payment being voided?", variant: "destructive" })
    setLoading(true)
    try {
      await api.post(`payments/${payment.id}/void`, { reason })
      toast({ title: "Payment voided", description: `${payment.number} reversed.` })
      invalidatePaymentData(qc)
      setVoiding(false)
      onClose()
    } catch (e: any) {
      toast({ title: "Could not void payment", description: e.message, variant: "destructive" })
    } finally { setLoading(false) }
  }

  const info: { label: string; value: React.ReactNode }[] = [
    { label: "Date", value: <DateCell value={payment.date} /> },
    {
      label: "Party", value: payment.customer ? (
        <button className="text-primary underline-offset-2 hover:underline" onClick={() => setActiveModule("customers", { entityId: payment.customer!.id })}>
          {payment.customer.name}
        </button>
      ) : payment.supplier ? (
        <button className="text-primary underline-offset-2 hover:underline" onClick={() => setActiveModule("suppliers", { entityId: payment.supplier!.id })}>
          {payment.supplier.name}
        </button>
      ) : "—",
    },
    {
      label: "Invoice", value: payment.sale ? (
        <button className="text-primary underline-offset-2 hover:underline" onClick={() => setActiveModule("sales", { tab: "invoices", entityId: payment.sale!.id })}>
          {payment.sale.invoiceNumber}
        </button>
      ) : "—",
    },
    { label: "Transaction ID", value: payment.transactionId ? <span className="font-mono text-xs">{payment.transactionId}</span> : "—" },
    { label: "Provider", value: payment.provider ?? "Manual" },
    { label: "Recorded by", value: payment.createdByName ?? "—" },
    { label: "Created", value: <DateCell value={payment.createdAt} withTime /> },
    ...(payment.verifiedAt ? [{ label: "Verified", value: <>{fmtDateTimeIST(payment.verifiedAt)}{payment.verifiedBy ? ` · ${payment.verifiedBy}` : ""}</> }] : []),
    ...(payment.voidedAt ? [{ label: "Voided", value: <span className="text-red-600 dark:text-red-400">{fmtDateTimeIST(payment.voidedAt)}</span> }] : []),
  ]

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl thin-scrollbar">
        <SheetHeader className="border-b bg-muted/40 px-5 py-4">
          <SheetTitle className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              payment.direction === "IN" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
            )}>
              {payment.direction === "IN" ? <ArrowDownRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-lg font-semibold">{payment.number}</p>
              <p className="text-xs font-normal text-muted-foreground">
                {payment.direction === "IN" ? "Money in" : "Money out"} · {PAYMENT_CATEGORY_LABELS[payment.category] ?? payment.category}
              </p>
            </div>
            <StatusBadge label={PAYMENT_STATUS_LABELS[payment.status] ?? payment.status} className={cn("ml-auto", PAYMENT_STATUS_COLORS[payment.status])} />
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 p-5">
          {/* Amount hero */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Amount</p>
              <Money value={payment.direction === "IN" ? payment.amount : -payment.amount} colored className="text-3xl font-bold" />
            </div>
            <StatusBadge label={PAYMENT_METHOD_LABELS[payment.method] ?? payment.method} className={cn("px-3 py-1 text-xs", METHOD_BADGE[payment.method])} />
          </div>

          {/* Info grid */}
          <div className="grid gap-x-4 gap-y-2.5 rounded-lg border p-4 text-sm sm:grid-cols-2">
            {info.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <span className="shrink-0 text-xs text-muted-foreground">{row.label}</span>
                <span className="text-right font-medium">{row.value}</span>
              </div>
            ))}
          </div>

          {payment.notes && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
              {payment.notes}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {canVoid && payment.status !== "VOID" && (
              <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950" onClick={() => setVoiding(true)}>
                <Ban className="mr-1.5 h-4 w-4" /> Void Payment
              </Button>
            )}
            {payment.customerId && (
              <Button variant="outline" size="sm" onClick={() => setActiveModule("customers", { entityId: payment.customerId! })}>
                View Customer
              </Button>
            )}
            {payment.saleId && (
              <Button variant="outline" size="sm" onClick={() => setActiveModule("sales", { tab: "invoices", entityId: payment.saleId! })}>
                View Invoice
              </Button>
            )}
            {payment.customerId && (
              <Button size="sm" onClick={() => { onClose(); onReceiveMore(payment.customerId!) }}>
                <IndianRupee className="mr-1.5 h-4 w-4" /> Receive More
              </Button>
            )}
          </div>
          {payment.status !== "VOID" && !canVoid && (
            <p className="text-xs text-muted-foreground">Voiding requires payments · void permission.</p>
          )}
        </div>
      </SheetContent>

      {/* Void confirm dialog with reason */}
      {voiding && (
        <Dialog open onOpenChange={(v) => !v && setVoiding(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Void payment {payment.number}?</DialogTitle>
              <DialogDescription>
                The payment will be marked void. Allocations to invoices and customer ledgers are reversed.
                This is recorded in the audit log.
              </DialogDescription>
            </DialogHeader>
            <Field label="Reason" required hint="e.g. Entered twice, wrong amount, cheque bounced…">
              <TextArea value={reason} onChange={setReason} rows={2} placeholder="Why is this payment being voided?" />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVoiding(false)} disabled={loading}>Cancel</Button>
              <Button variant="destructive" onClick={doVoid} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Void Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Sheet>
  )
}

// ==================== TAB 2: RECEIVE PAYMENT ====================
function ReceivePaymentTab({ initialCustomerId, onNavigateTab }: {
  initialCustomerId?: string
  onNavigateTab: (t: string) => void
}) {
  const qc = useQueryClient()
  const canCreate = canDo("payments", "create")
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "")
  const [saleId, setSaleId] = useState("")
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState("CASH")
  const [transactionId, setTransactionId] = useState("")
  const [date, setDate] = useState(ymdIST())
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState<PaymentRow | null>(null)
  const [receiptInfo, setReceiptInfo] = useState<{ customer?: string; invoice?: string }>({})

  const { data: customersData } = useQuery({
    queryKey: ["customers", "picker"],
    queryFn: () => api.get(`customers${qs({ pageSize: 200 })}`),
  })
  const customers: any[] = customersData?.customers ?? []
  const selectedCustomer = customers.find((c) => c.id === customerId)

  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["sales", "due", customerId],
    queryFn: () => api.get(`sales${qs({ customerId, pageSize: 200 })}`),
    enabled: !!customerId,
  })
  const dueInvoices: SaleOption[] = (salesData?.sales ?? []).filter(isDueSale)
  const selectedInvoice = dueInvoices.find((s) => s.id === saleId)

  function pickInvoice(id: string) {
    setSaleId(id)
    const inv = dueInvoices.find((s) => s.id === id)
    if (inv) setAmount(Number((inv.dueAmount ?? 0).toFixed(2)))
  }

  function resetForm() {
    setCustomerId(""); setSaleId(""); setAmount(0); setMethod("CASH")
    setTransactionId(""); setDate(ymdIST()); setNotes("")
  }

  async function submit() {
    if (!canCreate) return
    if (amount <= 0) return toast({ title: "Enter an amount", variant: "destructive" })
    if (!customerId && !saleId) {
      return toast({ title: "Select a customer", description: "Choose who this payment is from — or pick an invoice directly.", variant: "destructive" })
    }
    setSaving(true)
    try {
      const res = await api.post("payments", {
        customerId: customerId || undefined,
        saleId: saleId || undefined,
        amount, method,
        transactionId: transactionId || undefined,
        date, notes: notes || undefined,
      })
      setReceipt(res.payment)
      setReceiptInfo({
        customer: selectedCustomer?.name ?? selectedInvoice?.customer?.name,
        invoice: selectedInvoice?.invoiceNumber,
      })
      toast({
        title: "Payment recorded",
        description: `${res.payment.number} · ${fmtMoney(amount)} via ${PAYMENT_METHOD_LABELS[method]}`,
      })
      invalidatePaymentData(qc)
      resetForm()
    } catch (e: any) {
      toast({ title: "Could not record payment", description: e.message, variant: "destructive" })
    } finally { setSaving(false) }
  }

  // ---------- Receipt confirmation ----------
  if (receipt) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Payment Recorded</h3>
            <p className="font-mono text-sm text-muted-foreground">{receipt.number}</p>
          </div>
          <div className="my-1 w-full border-t border-dashed" />
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">Amount received</span>
              <Money value={receipt.amount} className="text-xl font-bold" />
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Method</span>
              <StatusBadge label={PAYMENT_METHOD_LABELS[receipt.method] ?? receipt.method} className={METHOD_BADGE[receipt.method]} /></div>
            {receiptInfo.customer && <div className="flex justify-between"><span className="text-muted-foreground">From</span><span className="font-medium">{receiptInfo.customer}</span></div>}
            {receiptInfo.invoice && <div className="flex justify-between"><span className="text-muted-foreground">Against invoice</span><span className="font-mono text-xs font-medium">{receiptInfo.invoice}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{fmtDateIST(receipt.date)}</span></div>
            {receipt.transactionId && <div className="flex justify-between"><span className="text-muted-foreground">Txn ID</span><span className="font-mono text-xs">{receipt.transactionId}</span></div>}
          </div>
          <div className="my-1 w-full border-t border-dashed" />
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => { setReceipt(null); setReceiptInfo({}) }}>
              <IndianRupee className="mr-1.5 h-4 w-4" /> Record Another
            </Button>
            <Button variant="ghost" onClick={() => { setReceipt(null); setReceiptInfo({}); onNavigateTab("all") }}>
              View All Payments
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ---------- Form ----------
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Receive Payment</CardTitle>
          <CardDescription>
            Quick cash counter workflow — pick the customer, apply against a due invoice (optional), take the money, done.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canCreate && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              You don&apos;t have permission to record payments. Ask an owner or manager to grant <b>payments · create</b>.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Customer" required>
                <EntityPicker
                  entities={customers}
                  value={customerId}
                  onChange={(id) => { setCustomerId(id); setSaleId("") }}
                  getLabel={(c) => `${c.name}${c.phone ? ` · ${c.phone}` : ""}`}
                  placeholder="Search customer by name or phone…"
                />
              </Field>
              {selectedCustomer && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Outstanding: <Money value={selectedCustomer.outstanding} colored /> · Walk-in without a bill? Just leave the invoice empty.
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <Field
                label="Apply to invoice"
                hint={customerId
                  ? dueInvoices.length > 0
                    ? `${dueInvoices.length} due invoice${dueInvoices.length > 1 ? "s" : ""} — picking one auto-fills the due amount`
                    : salesLoading ? "Loading invoices…" : "No due invoices for this customer"
                  : "Select a customer to see their due invoices"}
              >
                <SelectInput
                  value={saleId}
                  onChange={pickInvoice}
                  disabled={!customerId || dueInvoices.length === 0}
                  placeholder={customerId && dueInvoices.length === 0 ? "No due invoices" : "Select invoice (optional)"}
                  options={dueInvoices.map((s) => ({
                    value: s.id,
                    label: `${s.invoiceNumber} — ₹${(s.dueAmount ?? 0).toFixed(2)} due`,
                  }))}
                />
              </Field>
            </div>

            <Field label="Amount (₹)" required>
              <NumberInput value={amount} onChange={setAmount} min={0} placeholder="0.00" />
            </Field>
            <Field label="Date">
              <TextInput type="date" value={date} onChange={setDate} />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Payment method" required>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m} type="button" onClick={() => setMethod(m)}
                      aria-pressed={method === m}
                      className={cn(
                        "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors",
                        method === m ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {METHOD_ICON[m]}
                      {PAYMENT_METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <Field label="Transaction / reference ID" hint="Optional — UPI ref no., cheque no. etc.">
              <TextInput value={transactionId} onChange={setTransactionId} placeholder="e.g. 4235XXXXXX21" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <TextArea value={notes} onChange={setNotes} rows={2} placeholder="Optional remarks…" />
              </Field>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {selectedInvoice && (
              <p className="mr-auto text-xs text-muted-foreground">
                Paying <b>{selectedInvoice.invoiceNumber}</b> · due <Money value={selectedInvoice.dueAmount} />
              </p>
            )}
            <Button variant="outline" onClick={resetForm}>Clear</Button>
            <Button onClick={submit} disabled={saving || !canCreate}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Record Payment
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ==================== TAB 3: UPI / QR ====================
function UPIQRTab() {
  return (
    <div className="space-y-4">
      <DynamicQRSection />
      <div className="grid gap-4 lg:grid-cols-2">
        <ShopQRSection />
        <RecordUPISection />
      </div>
      <RecentQRSection />
    </div>
  )
}

// ---------- Dynamic QR ----------
function DynamicQRSection() {
  const qc = useQueryClient()
  const canCreate = canDo("payments", "create")
  const [amount, setAmount] = useState(0)
  const [saleId, setSaleId] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [note, setNote] = useState("")
  const [creating, setCreating] = useState(false)
  const [activeQR, setActiveQR] = useState<QrPaymentRow | null>(null)

  const { data: customersData } = useQuery({
    queryKey: ["customers", "picker"],
    queryFn: () => api.get(`customers${qs({ pageSize: 200 })}`),
  })
  const customers: any[] = customersData?.customers ?? []

  const { data: salesData } = useQuery({
    queryKey: ["sales", "due-all"],
    queryFn: () => api.get(`sales${qs({ pageSize: 200 })}`),
  })
  const dueSales: SaleOption[] = (salesData?.sales ?? []).filter(isDueSale)
  const selectedSale = dueSales.find((s) => s.id === saleId)

  function pickSale(id: string) {
    setSaleId(id)
    const s = dueSales.find((x) => x.id === id)
    if (s) {
      setAmount(Number((s.dueAmount ?? 0).toFixed(2)))
      if (!customerId && s.customerId) setCustomerId(s.customerId)
    }
  }

  async function generate() {
    if (!canCreate) return
    if (amount <= 0) return toast({ title: "Enter an amount", description: "How much should the customer pay?", variant: "destructive" })
    setCreating(true)
    try {
      const res = await api.post("payments/qr", {
        amount,
        saleId: saleId || undefined,
        customerId: customerId || undefined,
        note: note || undefined,
      })
      setActiveQR(res.qr)
      qc.invalidateQueries({ queryKey: ["payments", "qr"] })
      toast({ title: "QR generated", description: `${res.qr.code} · ${fmtMoney(res.qr.amount)} — show it to the customer.` })
    } catch (e: any) {
      toast({ title: "Could not generate QR", description: e.message, variant: "destructive" })
    } finally { setCreating(false) }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="h-4 w-4 text-primary" /> Dynamic QR — collect a specific amount
        </CardTitle>
        <CardDescription>
          Generate a QR for the exact amount. The customer scans &amp; pays; you verify the money arrived, then confirm —
          no auto-success, ever.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Form */}
          <div className="space-y-4">
            <Field label="Amount (₹)" required>
              <NumberInput value={amount} onChange={setAmount} min={0} placeholder="0.00" />
            </Field>
            <Field label="Invoice (optional)" hint={selectedSale ? `${selectedSale.invoiceNumber} · customer will be attached automatically` : "Picking a due invoice fills the amount & links the payment"}>
              <EntityPicker
                entities={dueSales}
                value={saleId}
                onChange={pickSale}
                getLabel={(s) => `${s.invoiceNumber} — ₹${(s.dueAmount ?? 0).toFixed(2)} due${s.customer?.name ? ` (${s.customer.name})` : ""}`}
                placeholder="Search due invoices…"
              />
            </Field>
            <Field label="Customer (optional)" hint={selectedSale && !customerId ? "Taken from the invoice" : undefined}>
              <EntityPicker
                entities={customers}
                value={customerId}
                onChange={setCustomerId}
                getLabel={(c) => `${c.name}${c.phone ? ` · ${c.phone}` : ""}`}
                placeholder="Search customer…"
              />
            </Field>
            <Field label="Note on QR (optional)">
              <TextInput value={note} onChange={setNote} placeholder="Shown in the customer's UPI app" />
            </Field>
            <Button onClick={generate} disabled={creating || !canCreate} className="w-full sm:w-auto">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
              Generate QR
            </Button>
            {!canCreate && <p className="text-xs text-muted-foreground">Generating QR codes requires payments · create permission.</p>}
          </div>

          {/* QR display */}
          {activeQR ? (
            <ActiveQRPanel qrInitial={activeQR} onReset={() => setActiveQR(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <QrCode className="h-8 w-8" />
              </div>
              <p className="max-w-xs text-sm text-muted-foreground">
                Fill the amount and generate a QR. It appears here, then waits for payment — you confirm only after
                checking your UPI app or bank statement.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ActiveQRPanel({ qrInitial, onReset }: { qrInitial: QrPaymentRow; onReset: () => void }) {
  const qc = useQueryClient()
  const canCreate = canDo("payments", "create")
  const [txn, setTxn] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Poll status every 3s while PENDING
  const { data: pollData } = useQuery({
    queryKey: ["payments", "qr", qrInitial.id],
    queryFn: () => api.get(`payments/qr/${qrInitial.id}`),
    refetchInterval: (query) => ((query.state.data as any)?.qr?.status === "PENDING" ? 3000 : false),
  })
  const qr: QrPaymentRow = useMemo(
    () => ({ ...qrInitial, ...(pollData?.qr ?? {}) }),
    [qrInitial, pollData],
  )

  async function confirmPayment() {
    setConfirming(true)
    try {
      const res = await api.post(`payments/qr/${qrInitial.id}/confirm`, { transactionId: txn || undefined })
      toast({ title: "Payment confirmed", description: `${res.payment.number} · ${fmtMoney(qr.amount)} recorded.` })
      invalidatePaymentData(qc)
    } catch (e: any) {
      toast({ title: "Could not confirm", description: e.message, variant: "destructive" })
    } finally { setConfirming(false) }
  }

  async function cancelQR() {
    setCancelling(true)
    try {
      await api.post(`payments/qr/${qrInitial.id}/cancel`)
      toast({ title: "QR cancelled", description: `${qr.code} — no payment was recorded.` })
      qc.invalidateQueries({ queryKey: ["payments", "qr", qrInitial.id] })
      qc.invalidateQueries({ queryKey: ["payments", "qr"] })
    } catch (e: any) {
      toast({ title: "Could not cancel", description: e.message, variant: "destructive" })
    } finally { setCancelling(false) }
  }

  // ----- Verified -----
  if (qr.status === "VERIFIED") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/30">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h3 className="text-lg font-semibold">Payment verified &amp; recorded</h3>
        <p className="text-sm text-muted-foreground">
          {fmtMoney(qr.amount)} received via UPI{qr.verifiedBy ? ` · verified by ${qr.verifiedBy}` : ""}
        </p>
        <div className="w-full max-w-xs space-y-2 rounded-lg border bg-card p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment</span>
            <span className="font-mono font-medium">{qr.payment?.number ?? "—"}</span>
          </div>
          {qr.transactionId && (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Txn ID</span>
              <span className="truncate font-mono text-xs">{qr.transactionId}</span>
            </div>
          )}
          {qr.sale && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Invoice {qr.sale.invoiceNumber}</span>
              <StatusBadge label={qr.sale.paymentStatus} className={SALE_PAYMENT_STATUS_COLORS[qr.sale.paymentStatus]} />
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="mr-2 h-4 w-4" /> Generate New QR
        </Button>
      </div>
    )
  }

  // ----- Cancelled / Expired -----
  if (qr.status === "CANCELLED" || qr.status === "EXPIRED") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <Ban className="h-7 w-7" />
        </div>
        <h3 className="font-semibold">{qr.status === "CANCELLED" ? "QR cancelled" : "QR expired"}</h3>
        <p className="max-w-xs text-sm text-muted-foreground">
          {qr.code} · {fmtMoney(qr.amount)} — no payment was recorded. Generate a fresh QR to try again.
        </p>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="mr-2 h-4 w-4" /> Generate New QR
        </Button>
      </div>
    )
  }

  // ----- Pending (default) -----
  return (
    <div>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <img
            src={qr.provider === "RAZORPAY" ? (qr.qrImageUrl || qrInitial.qrDataUrl) : qrInitial.qrDataUrl}
            alt={`UPI QR code to pay ${fmtMoney(qr.amount)}`}
            className="h-56 w-56"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{qr.code}</span>
          <StatusBadge label={QR_STATUS_LABELS[qr.status] ?? qr.status} className={QR_STATUS_COLORS[qr.status]} />
        </div>
        <p className="text-3xl font-bold tabular-nums">{fmtMoney(qr.amount)}</p>
        <p className="text-xs text-muted-foreground">
          {qr.sale ? `Invoice ${qr.sale.invoiceNumber}` : "No invoice linked"}
          {qr.customer ? ` · ${qr.customer.name}` : ""}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{qr.upiId}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Waiting for payment… checking every 3 s
        </p>
      </div>

      {/* Confirm section */}
      <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Verify the amount arrived in your UPI app / bank statement, then confirm.
            <b> Never confirm before checking.</b>
          </p>
        </div>
        <Field label="UPI transaction / reference ID" hint="Optional — copy from your UPI app's payment history for clean books.">
          <TextInput value={txn} onChange={setTxn} placeholder="e.g. 4235XXXXXX21" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button onClick={confirmPayment} disabled={confirming || cancelling || !canCreate} className="bg-emerald-600 hover:bg-emerald-700">
            {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Confirm Payment Received
          </Button>
          <Button variant="outline" onClick={cancelQR} disabled={confirming || cancelling}>
            {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
            Cancel QR
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------- Shop QR (permanent) ----------
function ShopQRSection() {
  const { business } = useApp()
  const [show, setShow] = useState(false)
  const { data, isLoading, error } = useQuery({
    queryKey: ["payments", "shop-qr"],
    queryFn: () => api.get("payments/shop-qr"),
    enabled: show,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4 text-primary" /> Shop QR (permanent)
        </CardTitle>
        <CardDescription>Your static UPI QR — print it and keep it at the counter. Customers scan and enter any amount.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!show ? (
          <Button variant="outline" onClick={() => setShow(true)}>
            <QrCode className="mr-2 h-4 w-4" /> Show Shop QR
          </Button>
        ) : isLoading ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Skeleton className="h-52 w-52 rounded-xl" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            {(error as Error).message} — configure your UPI ID in Business Profile / Settings first.
          </div>
        ) : (
          <div id="print-area" className="flex flex-col items-center gap-2 text-center">
            {business?.name && <p className="text-base font-semibold">{business.name}</p>}
            <div className="rounded-xl border bg-white p-3">
              <img src={data.qrDataUrl} alt={`Permanent shop UPI QR for ${data.upiId}`} className="h-52 w-52" />
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scan &amp; pay any amount</p>
            <p className="font-mono text-sm font-semibold">{data.upiId}</p>
            <p className="text-xs text-muted-foreground">Payee: {data.payee}</p>
            <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print QR
            </Button>
            <p className="max-w-xs text-xs text-muted-foreground print:hidden">
              Money received on this QR should be recorded under “Record UPI Payment” and then reconciled.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Record unmatched UPI payment ----------
function RecordUPISection() {
  const qc = useQueryClient()
  const canCreate = canDo("payments", "create")
  const [amount, setAmount] = useState(0)
  const [transactionId, setTransactionId] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!canCreate) return
    if (amount <= 0) return toast({ title: "Enter an amount", variant: "destructive" })
    setSaving(true)
    try {
      const res = await api.post("payments", {
        unmatched: true,
        amount,
        method: "UPI",
        transactionId: transactionId || undefined,
        notes: notes || undefined,
      })
      toast({
        title: "UPI payment recorded",
        description: `${res.payment.number} — assign it to a customer from the Reconciliation tab.`,
      })
      invalidatePaymentData(qc)
      setAmount(0); setTransactionId(""); setNotes("")
    } catch (e: any) {
      toast({ title: "Could not record payment", description: e.message, variant: "destructive" })
    } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" /> Record UPI Payment (unmatched)
        </CardTitle>
        <CardDescription>
          Money arrived on the shop QR or UPI app but you&apos;re not sure from whom? Record it here — it lands in
          Reconciliation for assignment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (₹)" required>
            <NumberInput value={amount} onChange={setAmount} min={0} placeholder="0.00" />
          </Field>
          <Field label="Method">
            <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
              <QrCode className="h-4 w-4 text-teal-600 dark:text-teal-400" /> UPI (fixed)
            </div>
          </Field>
          <div className="sm:col-span-2">
            <Field label="UPI transaction / reference ID" hint="From your UPI app or bank statement — helps matching later.">
              <TextInput value={transactionId} onChange={setTransactionId} placeholder="e.g. 4235XXXXXX21" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes (optional)">
              <TextInput value={notes} onChange={setNotes} placeholder="e.g. seen in GPay — possibly Ramesh Kumar" />
            </Field>
          </div>
        </div>
        <Button onClick={save} disabled={saving || !canCreate}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
          Record &amp; Reconcile Later
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------- Recent QR payments ----------
function RecentQRSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["payments", "qr", "list"],
    queryFn: () => api.get("payments/qr"),
  })
  const qrs: QrPaymentRow[] = data?.qrs ?? []

  const columns: Column<QrPaymentRow>[] = [
    { key: "code", header: "Code", render: (q) => <span className="font-mono font-medium">{q.code}</span> },
    { key: "createdAt", header: "Created", render: (q) => <DateCell value={q.createdAt} withTime />, sortValue: (q) => q.createdAt },
    { key: "amount", header: "Amount", align: "right", render: (q) => <Money value={q.amount} className="font-semibold" />, sortValue: (q) => q.amount },
    { key: "note", header: "Note", render: (q) => q.note ?? <span className="text-muted-foreground">—</span> },
    {
      key: "sale", header: "Invoice",
      render: (q) => q.sale
        ? <span className="font-mono text-xs">{q.sale.invoiceNumber}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    { key: "customer", header: "Customer", render: (q) => q.customer?.name ?? <span className="text-muted-foreground">—</span> },
    {
      key: "transactionId", header: "Txn ID",
      render: (q) => q.transactionId ? <span className="font-mono text-xs">{q.transactionId}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "status", header: "Status",
      render: (q) => <StatusBadge label={QR_STATUS_LABELS[q.status] ?? q.status} className={QR_STATUS_COLORS[q.status]} />,
    },
    { key: "verifiedBy", header: "Verified By", render: (q) => q.verifiedBy ?? <span className="text-muted-foreground">—</span> },
  ]

  return (
    <div>
      <SectionTitle>Recent QR Payments</SectionTitle>
      <DataTable
        columns={columns}
        rows={qrs}
        loading={isLoading}
        dense
        pageSize={10}
        emptyTitle="No QR payments yet"
        emptyDescription="Generate a dynamic QR above — its status will be tracked here."
        rowClassName={(q) => (q.status === "PENDING" ? "bg-amber-500/5" : "")}
      />
    </div>
  )
}

// ==================== TAB 4: RECONCILIATION ====================
function ReconciliationTab() {
  const qc = useQueryClient()
  const [assigning, setAssigning] = useState<PaymentRow | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ["payments", "unmatched"],
    queryFn: () => api.get(`payments${qs({ status: "UNMATCHED", pageSize: 100 })}`),
  })
  const payments: PaymentRow[] = data?.payments ?? []
  const totalUnmatched = payments.reduce((s, p) => s + p.amount, 0)

  const columns: Column<PaymentRow>[] = [
    { key: "number", header: "Number", render: (p) => <span className="font-medium">{p.number}</span> },
    { key: "date", header: "Date", render: (p) => <DateCell value={p.date} />, sortValue: (p) => p.date },
    { key: "amount", header: "Amount", align: "right", render: (p) => <Money value={p.amount} className="font-semibold" />, sortValue: (p) => p.amount },
    {
      key: "method", header: "Method",
      render: (p) => <StatusBadge label={PAYMENT_METHOD_LABELS[p.method] ?? p.method} className={METHOD_BADGE[p.method]} />,
    },
    {
      key: "transactionId", header: "Txn ID",
      render: (p) => p.transactionId ? <span className="font-mono text-xs">{p.transactionId}</span> : <span className="text-muted-foreground">—</span>,
    },
    { key: "notes", header: "Notes", render: (p) => <span className="text-xs text-muted-foreground">{p.notes ?? "—"}</span> },
    {
      key: "actions", header: "", align: "right",
      render: (p) => (
        <Button size="sm" variant="outline" onClick={() => setAssigning(p)}>
          <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Assign
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Awaiting Assignment" value={payments.length} sub="Unmatched payments" tone="warning" icon={<UserCheck className="h-4 w-4" />} />
        <StatCard label="Unmatched Value" value={fmtMoney(totalUnmatched)} tone="warning" icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard label="Reconciliation Status" value={payments.length === 0 ? "Clean ✓" : "Needs attention"} sub={payments.length === 0 ? "Every payment is accounted for" : "Assign payments to close the books"} tone={payments.length === 0 ? "positive" : "default"} icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      {payments.length === 0 && !isLoading ? (
        <EmptyState
          title="All payments reconciled ✓"
          description="No unmatched payments right now. UPI receipts recorded without a customer will show up here."
          icon={<CheckCircle2 className="h-6 w-6 text-emerald-500" />}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={payments}
          loading={isLoading}
          onRowClick={(p) => setAssigning(p)}
          emptyTitle="All payments reconciled ✓"
          emptyDescription="No unmatched payments right now."
          rowClassName={() => "bg-orange-500/5"
          }
        />
      )}

      {assigning && <AssignDialog payment={assigning} onClose={() => setAssigning(null)} />}
    </div>
  )
}

// ---------- Assign dialog ----------
function AssignDialog({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState("")
  const [saleId, setSaleId] = useState("")
  const [saving, setSaving] = useState(false)

  const { data: customersData } = useQuery({
    queryKey: ["customers", "picker"],
    queryFn: () => api.get(`customers${qs({ pageSize: 200 })}`),
  })
  const customers: any[] = customersData?.customers ?? []

  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["sales", "due", customerId],
    queryFn: () => api.get(`sales${qs({ customerId, pageSize: 200 })}`),
    enabled: !!customerId,
  })
  const dueInvoices: SaleOption[] = (salesData?.sales ?? []).filter(isDueSale)

  async function assign() {
    if (!customerId && !saleId) {
      return toast({ title: "Select a customer", description: "Pick who this money is from (an invoice alone also works).", variant: "destructive" })
    }
    setSaving(true)
    try {
      const res = await api.post(`payments/${payment.id}/assign`, {
        customerId: customerId || undefined,
        saleId: saleId || undefined,
      })
      toast({
        title: "Payment assigned",
        description: `${payment.number} → recorded as ${res.payment.number} and verified.`,
      })
      invalidatePaymentData(qc)
      onClose()
    } catch (e: any) {
      toast({ title: "Could not assign", description: e.message, variant: "destructive" })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign unmatched payment</DialogTitle>
          <DialogDescription>Link this receipt to a customer (and optionally a due invoice) to complete reconciliation.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3 text-sm">
          <div>
            <p className="font-mono font-medium">{payment.number}</p>
            <p className="text-xs text-muted-foreground">
              <DateCell value={payment.date} /> · {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
              {payment.transactionId ? ` · ${payment.transactionId}` : ""}
            </p>
          </div>
          <Money value={payment.amount} className="text-lg font-bold" />
        </div>

        <Field label="Customer" required>
          <EntityPicker
            entities={customers}
            value={customerId}
            onChange={(id) => { setCustomerId(id); setSaleId("") }}
            getLabel={(c) => `${c.name}${c.phone ? ` · ${c.phone}` : ""}`}
            placeholder="Search customer by name or phone…"
          />
        </Field>

        <Field
          label="Apply to invoice (optional)"
          hint={customerId
            ? dueInvoices.length > 0
              ? `${dueInvoices.length} due invoice${dueInvoices.length > 1 ? "s" : ""}`
              : salesLoading ? "Loading invoices…" : "No due invoices — will be recorded as an advance / on-account payment"
            : "Select a customer first"}
        >
          <SelectInput
            value={saleId}
            onChange={setSaleId}
            disabled={!customerId || dueInvoices.length === 0}
            placeholder={customerId && dueInvoices.length === 0 ? "No due invoices" : "Select invoice (optional)"}
            options={dueInvoices.map((s) => ({ value: s.id, label: `${s.invoiceNumber} — ₹${(s.dueAmount ?? 0).toFixed(2)} due` }))}
          />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={assign} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Assign Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
