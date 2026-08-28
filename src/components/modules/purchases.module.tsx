"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { useApp, canDo } from "@/lib/client/store"
import { PageHeader, StatCard, EmptyState, SectionTitle } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import {
  StatusBadge, Money, DateCell, ConfirmDialog, Field, TextInput, SelectInput, TextArea,
  NumberInput, EntityPicker, SwitchInput,
} from "@/components/shared/fields"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import {
  PackagePlus, Truck, IndianRupee, ClipboardList, Plus, X, Loader2, PackageCheck, Ban, Search,
} from "lucide-react"
import { fmtMoney, fmtDateIST, ymdIST } from "@/lib/format"
import {
  PURCHASE_STATUSES, PURCHASE_STATUS_LABELS, PURCHASE_STATUS_COLORS,
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  SALE_PAYMENT_STATUS_COLORS,
} from "@/lib/constants"
import { toast } from "@/hooks/use-toast"

interface PurchaseRow {
  id: string
  number: string
  status: string
  orderDate: string
  expectedDate: string | null
  receivedAt: string | null
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  paidAmount: number
  dueAmount: number
  paymentStatus: string
  notes: string | null
  createdByName: string | null
  supplier?: { id: string; name: string; company?: string | null } | null
  items?: any[]
  payments?: any[]
}

const PAY_LABELS: Record<string, string> = { PAID: "Paid", PARTIAL: "Partial", UNPAID: "Unpaid", VOID: "Void" }

export function PurchasesModule() {
  const { moduleParams } = useApp()
  const [detailId, setDetailId] = useState<string | null>((moduleParams?.entityId as string) ?? null)
  const [creating, setCreating] = useState(!!moduleParams?.new)
  const [supplierFilter, setSupplierFilter] = useState<string>((moduleParams?.supplierId as string) ?? "")
  const [statusFilter, setStatusFilter] = useState("ALL")

  const { data, isLoading } = useQuery({
    queryKey: ["purchases", "list", statusFilter, supplierFilter],
    queryFn: () => api.get(`purchases${qs({ pageSize: 200, status: statusFilter === "ALL" ? "" : statusFilter, supplierId: supplierFilter })}`),
  })

  // Resolve supplier name for the active filter chip
  const { data: chipSupplier } = useQuery({
    queryKey: ["suppliers", supplierFilter],
    queryFn: () => api.get(`suppliers/${supplierFilter}`),
    enabled: !!supplierFilter,
  })

  const purchases: PurchaseRow[] = data?.purchases ?? []
  const sum = data?.sum ?? { total: 0, due: 0 }

  const columns: Column<PurchaseRow>[] = [
    {
      key: "number", header: "PO #", width: "w-28",
      render: (p) => <span className="font-medium">{p.number}</span>,
      sortValue: (p) => p.number,
    },
    {
      key: "supplier", header: "Supplier",
      render: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.supplier?.name ?? "—"}</p>
          {p.supplier?.company && <p className="truncate text-xs text-muted-foreground">{p.supplier.company}</p>}
        </div>
      ),
      sortValue: (p) => p.supplier?.name ?? "",
    },
    { key: "orderDate", header: "Order Date", render: (p) => <DateCell value={p.orderDate} />, sortValue: (p) => p.orderDate },
    { key: "expectedDate", header: "Expected", render: (p) => <DateCell value={p.expectedDate} />, sortValue: (p) => p.expectedDate ?? "" },
    {
      key: "status", header: "Status",
      render: (p) => <StatusBadge label={PURCHASE_STATUS_LABELS[p.status] ?? p.status} className={PURCHASE_STATUS_COLORS[p.status]} />,
      sortValue: (p) => p.status,
    },
    { key: "total", header: "Total", align: "right", render: (p) => <Money value={p.total} /> },
    { key: "paidAmount", header: "Paid", align: "right", render: (p) => (p.paidAmount > 0 ? <Money value={p.paidAmount} /> : <span className="text-muted-foreground">—</span>) },
    {
      key: "dueAmount", header: "Due", align: "right",
      render: (p) => p.dueAmount > 0.009
        ? <span className="font-semibold text-amber-600 tabular-nums dark:text-amber-400">{fmtMoney(p.dueAmount)}</span>
        : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "paymentStatus", header: "Payment",
      render: (p) => <StatusBadge label={PAY_LABELS[p.paymentStatus] ?? p.paymentStatus} className={SALE_PAYMENT_STATUS_COLORS[p.paymentStatus]} />,
      sortValue: (p) => p.paymentStatus,
    },
  ]

  const canCreate = canDo("purchases", "create")

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<PackagePlus className="h-5 w-5" />}
        title="Purchases"
        description="Supplier purchase orders and direct purchases — receive goods into stock, track payables and settle dues."
        actions={
          <>
            <Button
              variant="outline" size="sm"
              onClick={() => exportPurchases(purchases)}
            >
              Export CSV
            </Button>
            {canCreate && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> New Purchase
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Purchase Value"
          value={isLoading ? "…" : fmtMoney(sum.total)}
          sub="Received purchases · all time"
          icon={<PackagePlus className="h-4 w-4" />}
        />
        <StatCard
          label="Outstanding Payable"
          value={isLoading ? "…" : fmtMoney(sum.due)}
          sub="Due to suppliers (received)"
          tone="warning"
          icon={<IndianRupee className="h-4 w-4" />}
        />
        <StatCard
          label="Purchase Orders"
          value={data?.total ?? "…"}
          sub="All statuses"
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <StatCard
          label="Open POs"
          value={purchases.filter((p) => p.status === "ORDERED").length}
          sub="Awaiting delivery · this page"
          tone="primary"
          icon={<Truck className="h-4 w-4" />}
        />
      </div>

      <DataTable
        columns={columns}
        rows={purchases}
        loading={isLoading}
        onRowClick={(p) => setDetailId(p.id)}
        searchKeys={["number", "supplier.name", "supplier.company"]}
        searchPlaceholder="Search PO # or supplier…"
        emptyTitle={statusFilter !== "ALL" || supplierFilter ? "No matching purchases" : "No purchases yet"}
        emptyDescription="Create a purchase order to track incoming supplier stock, or record a direct purchase."
        emptyAction={canCreate ? (
          <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1.5 h-4 w-4" /> New Purchase</Button>
        ) : undefined}
        rowClassName={(p) => (p.status === "CANCELLED" ? "opacity-60" : p.dueAmount > 0.009 ? "bg-amber-500/5" : "")}
        toolbar={
          <>
            <div className="w-44">
              <SelectInput
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "ALL", label: "All Statuses" },
                  ...PURCHASE_STATUSES.map((s) => ({ value: s, label: PURCHASE_STATUS_LABELS[s] })),
                ]}
              />
            </div>
            {supplierFilter && (
              <div className="flex h-9 items-center gap-1.5 rounded-md border bg-amber-500/10 px-2.5 text-xs">
                <Truck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span className="max-w-40 truncate font-medium">{chipSupplier?.supplier?.name ?? "Supplier"}</span>
                <button
                  onClick={() => setSupplierFilter("")}
                  className="rounded p-0.5 hover:bg-accent"
                  aria-label="Clear supplier filter"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        }
      />

      {creating && (
        <NewPurchaseDialog
          initialSupplierId={supplierFilter || undefined}
          onClose={() => setCreating(false)}
          onCreated={(id) => setDetailId(id)}
        />
      )}
      {detailId && <PurchaseDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

function exportPurchases(rows: PurchaseRow[]) {
  exportCSV(
    "purchases",
    ["PO #", "Supplier", "Order Date", "Expected", "Status", "Total", "Paid", "Due", "Payment"],
    rows.map((p) => [
      p.number, p.supplier?.name ?? "", p.orderDate?.slice(0, 10) ?? "", p.expectedDate?.slice(0, 10) ?? "",
      PURCHASE_STATUS_LABELS[p.status] ?? p.status, p.total, p.paidAmount, p.dueAmount, p.paymentStatus,
    ]),
  )
}

// ==================== DETAIL SHEET ====================
function PurchaseDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { setActiveModule } = useApp()
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [busy, setBusy] = useState<"receive" | "cancel" | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["purchases", id],
    queryFn: () => api.get(`purchases/${id}`),
  })
  const p: PurchaseRow | undefined = data?.purchase

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["purchases"] })
    qc.invalidateQueries({ queryKey: ["suppliers"] })
    qc.invalidateQueries({ queryKey: ["payments"] })
  }

  async function receiveGoods() {
    setBusy("receive")
    try {
      await api.post(`purchases/${id}/receive`)
      toast({ title: "Goods received", description: `${p?.number} — stock increased and payable recorded.` })
      setReceiveOpen(false)
      invalidate()
    } catch (e: any) {
      toast({ title: "Could not receive goods", description: e.message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  async function cancelPO() {
    setBusy("cancel")
    try {
      await api.post(`purchases/${id}/cancel`)
      toast({ title: "Purchase order cancelled", description: `${p?.number} has been cancelled.` })
      setCancelOpen(false)
      invalidate()
    } catch (e: any) {
      toast({ title: "Could not cancel", description: e.message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const canReceive = !!p && (p.status === "ORDERED" || p.status === "PARTIAL_RECEIVED") && canDo("purchases", "edit")
  const canPay = !!p && p.dueAmount > 0.009 && p.status !== "ORDERED" && p.status !== "CANCELLED" && canDo("purchases", "pay")
  const canCancel = !!p && p.status === "ORDERED" && p.paidAmount <= 0.009 && canDo("purchases", "edit")
  const itemsList: any[] = p?.items ?? []
  const paymentsList: any[] = p?.payments ?? []
  const pendingUnits = itemsList.reduce((s, it: any) => s + Math.max(0, it.quantity - it.receivedQty), 0)

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-3xl thin-scrollbar">
        <SheetHeader className="border-b bg-muted/40 px-5 py-4">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PackagePlus className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                {p?.number ?? "Loading…"}
                {p && <StatusBadge label={PURCHASE_STATUS_LABELS[p.status] ?? p.status} className={PURCHASE_STATUS_COLORS[p.status]} />}
              </p>
              {p?.supplier && (
                <p className="truncate text-xs font-normal text-muted-foreground">
                  <button
                    className="underline-offset-2 hover:underline"
                    onClick={() => setActiveModule("suppliers", { entityId: p.supplier!.id })}
                  >
                    {p.supplier.name}
                  </button>
                  {p.supplier.company ? ` · ${p.supplier.company}` : ""}
                </p>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        {isLoading || !p ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5 p-5">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Total" value={fmtMoney(p.total)} sub={`${itemsList.length} item(s)`} />
              <StatCard label="Paid" value={fmtMoney(p.paidAmount)} tone="positive" />
              <StatCard label="Due" value={fmtMoney(p.dueAmount)} tone={p.dueAmount > 0.009 ? "warning" : "default"} />
              <StatCard
                label="Received"
                value={p.receivedAt ? fmtDateIST(p.receivedAt) : pendingUnits > 0 ? `${pendingUnits} pending` : "—"}
                sub={p.status === "ORDERED" ? "Not yet received" : undefined}
              />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {canReceive && (
                <Button size="sm" onClick={() => setReceiveOpen(true)}>
                  <PackageCheck className="mr-1.5 h-4 w-4" /> Receive Goods
                </Button>
              )}
              {canPay && (
                <Button size="sm" onClick={() => setPayOpen(true)}>
                  <IndianRupee className="mr-1.5 h-4 w-4" /> Pay Supplier
                </Button>
              )}
              {canCancel && (
                <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>
                  <Ban className="mr-1.5 h-4 w-4" /> Cancel PO
                </Button>
              )}
              {!canReceive && !canPay && !canCancel && (
                <p className="text-sm text-muted-foreground">
                  {p.status === "CANCELLED" ? "This purchase order was cancelled." : "No actions available for this purchase."}
                </p>
              )}
            </div>

            {/* Meta */}
            <div className="grid gap-x-4 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
              <span className="text-muted-foreground">Ordered: <b className="text-foreground">{fmtDateIST(p.orderDate)}</b></span>
              <span className="text-muted-foreground">Expected: <b className="text-foreground">{p.expectedDate ? fmtDateIST(p.expectedDate) : "—"}</b></span>
              <span className="text-muted-foreground">Received: <b className="text-foreground">{p.receivedAt ? fmtDateIST(p.receivedAt) : "—"}</b></span>
              <span className="text-muted-foreground">Created by: <b className="text-foreground">{p.createdByName ?? "—"}</b></span>
              {p.notes && <p className="col-span-2 rounded bg-muted p-2 text-xs">{p.notes}</p>}
            </div>

            {/* Items */}
            <div>
              <SectionTitle>Items ({itemsList.length})</SectionTitle>
              <div className="overflow-hidden rounded-lg border">
                <div className="overflow-x-auto thin-scrollbar">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Product</th>
                        <th className="px-3 py-2 font-semibold">Variant</th>
                        <th className="px-3 py-2 text-right font-semibold">Qty</th>
                        <th className="px-3 py-2 text-right font-semibold">Received</th>
                        <th className="px-3 py-2 text-right font-semibold">Unit Cost</th>
                        <th className="px-3 py-2 text-right font-semibold">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(itemsList).map((it: any) => (
                        <tr key={it.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium">{it.productName}</td>
                          <td className="px-3 py-2 text-muted-foreground">{it.variantLabel}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {it.receivedQty}
                            {it.receivedQty < it.quantity && (
                              <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">({it.quantity - it.receivedQty} pending)</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <Money value={it.unitCost} />
                            {it.taxRate > 0 && <span className="ml-1 text-xs text-muted-foreground">+{it.taxRate}%</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums"><Money value={it.lineTotal} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                <div className="ml-auto max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmtMoney(p.subtotal)}</span></div>
                  {p.discountAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="tabular-nums text-emerald-600 dark:text-emerald-400">− {fmtMoney(p.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">Tax (GST)</span><span className="tabular-nums">{fmtMoney(p.taxAmount)}</span></div>
                  <div className="flex justify-between border-t pt-1.5">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold tabular-nums">{fmtMoney(p.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payments */}
            <div>
              <SectionTitle>Payment History ({paymentsList.length})</SectionTitle>
              {paymentsList.length === 0 ? (
                <EmptyState title="No payments yet" description="Payments made against this purchase will appear here." />
              ) : (
                <div className="space-y-1">
                  {paymentsList.map((pay: any) => (
                    <div key={pay.id} className="flex items-center gap-3 rounded-md border p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{pay.number} · {PAYMENT_METHOD_LABELS[pay.method] ?? pay.method}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <DateCell value={pay.date} />
                          {pay.transactionId ? ` · ${pay.transactionId}` : ""}
                          {pay.notes ? ` · ${pay.notes}` : ""}
                        </p>
                      </div>
                      <Money value={pay.amount} className="text-sm font-semibold" />
                      <StatusBadge
                        label={PAYMENT_STATUS_LABELS[pay.status] ?? pay.status}
                        className={PAYMENT_STATUS_COLORS[pay.status]}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>

      {p && (
        <>
          <ConfirmDialog
            open={receiveOpen}
            onOpenChange={setReceiveOpen}
            title={`Receive goods for ${p.number}?`}
            description={
              <>
                Receiving will add <b>{pendingUnits}</b> pending unit(s) to stock in the default warehouse and record{" "}
                <b>{fmtMoney(p.total)}</b> as payable to {p.supplier?.name ?? "the supplier"}. Variant cost prices are updated
                to this PO&apos;s rates. This cannot be undone.
              </>
            }
            confirmLabel="Receive Goods"
            onConfirm={receiveGoods}
            loading={busy === "receive"}
          />
          <ConfirmDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            title={`Cancel purchase order ${p.number}?`}
            description="The PO will be marked cancelled. This is only possible while it is Ordered with no payments and no stock received."
            confirmLabel="Cancel PO"
            destructive
            onConfirm={cancelPO}
            loading={busy === "cancel"}
          />
          {payOpen && (
            <PaySupplierDialog
              purchase={p}
              onClose={() => setPayOpen(false)}
              onDone={() => { setPayOpen(false); invalidate() }}
            />
          )}
        </>
      )}
    </Sheet>
  )
}

// ==================== PAY SUPPLIER DIALOG ====================
function PaySupplierDialog({ purchase, onClose, onDone }: { purchase: PurchaseRow; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(purchase.dueAmount)
  const [method, setMethod] = useState("CASH")
  const [date, setDate] = useState(ymdIST())
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  async function pay() {
    if (amount <= 0) return toast({ title: "Enter a valid amount", variant: "destructive" })
    setSaving(true)
    try {
      await api.post(`purchases/${purchase.id}/pay`, { amount, method, date, notes })
      toast({
        title: "Payment recorded",
        description: `${fmtMoney(amount)} paid to ${purchase.supplier?.name ?? "supplier"} via ${PAYMENT_METHOD_LABELS[method] ?? method}.`,
      })
      onDone()
    } catch (e: any) {
      toast({ title: "Payment failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay Supplier — {purchase.number}</DialogTitle>
          <DialogDescription>
            {purchase.supplier?.name ?? "Supplier"} · Due <b>{fmtMoney(purchase.dueAmount)}</b> of {fmtMoney(purchase.total)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (₹)" required hint={`Due: ${fmtMoney(purchase.dueAmount)}`}>
            <NumberInput value={amount} min={0} onChange={setAmount} />
          </Field>
          <Field label="Payment method" required>
            <SelectInput
              value={method}
              onChange={setMethod}
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
            />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={setDate} />
          </Field>
          <Field label="Reference / notes">
            <TextInput value={notes} onChange={setNotes} placeholder="UTR, cheque no…" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={pay} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== NEW PURCHASE DIALOG ====================
interface LineItem {
  variantId: string
  productName: string
  variantLabel: string
  sku: string | null
  quantity: number
  unitCost: number
  taxRate: number
}

interface PickedVariant {
  variantId: string
  productName: string
  variantLabel: string
  sku: string | null
  costPrice: number
  taxRate: number
}

function NewPurchaseDialog({
  onClose, onCreated, initialSupplierId,
}: {
  onClose: () => void
  onCreated: (purchaseId: string) => void
  initialSupplierId?: string
}) {
  const qc = useQueryClient()
  const [supplierId, setSupplierId] = useState(initialSupplierId ?? "")
  const [expectedDate, setExpectedDate] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineItem[]>([])
  const [discount, setDiscount] = useState(0)
  const [payNow, setPayNow] = useState(false)
  const [payNowAmount, setPayNowAmount] = useState(0)
  const [payNowMethod, setPayNowMethod] = useState("CASH")
  const [saving, setSaving] = useState<"po" | "receive" | null>(null)

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers", "picker"],
    queryFn: () => api.get(`suppliers${qs({ pageSize: 200 })}`),
  })
  const suppliers: any[] = suppliersData?.suppliers ?? []

  const subtotal = lines.reduce((s, l) => s + l.unitCost * l.quantity, 0)
  const tax = lines.reduce((s, l) => s + (l.unitCost * l.quantity * (l.taxRate || 0)) / 100, 0)
  const total = Math.max(0, subtotal - discount + tax)

  function addLine(v: PickedVariant) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variantId === v.variantId)
      if (i >= 0) {
        const copy = [...prev]
        copy[i] = { ...copy[i], quantity: copy[i].quantity + 1 }
        return copy
      }
      return [
        ...prev,
        {
          variantId: v.variantId,
          productName: v.productName,
          variantLabel: v.variantLabel,
          sku: v.sku,
          quantity: 1,
          unitCost: v.costPrice,
          taxRate: v.taxRate,
        },
      ]
    })
  }

  function updateLine(idx: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  function togglePayNow(v: boolean) {
    setPayNow(v)
    if (v) setPayNowAmount(Math.round(total * 100) / 100)
  }

  async function submit(receiveNow: boolean) {
    if (!supplierId) return toast({ title: "Select a supplier", variant: "destructive" })
    if (!lines.length) return toast({ title: "Add at least one item", variant: "destructive" })
    if (lines.some((l) => l.quantity < 1)) return toast({ title: "Every line needs a quantity of at least 1", variant: "destructive" })
    setSaving(receiveNow ? "receive" : "po")
    try {
      const body: Record<string, unknown> = {
        supplierId,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitCost: l.unitCost, taxRate: l.taxRate })),
        discountAmount: discount,
        notes: notes || undefined,
      }
      if (expectedDate) body.expectedDate = expectedDate
      if (receiveNow) {
        body.receiveNow = true
        if (payNow && payNowAmount > 0) {
          body.payNowAmount = payNowAmount
          body.payNowMethod = payNowMethod
        }
      }
      const res = await api.post("purchases", body)
      toast({
        title: receiveNow ? "Direct purchase recorded" : "Purchase order created",
        description: `${res.purchase?.number ?? "Purchase"} · ${fmtMoney(res.purchase?.total ?? total)}${receiveNow ? " — stock updated" : ""}`,
      })
      qc.invalidateQueries({ queryKey: ["purchases"] })
      qc.invalidateQueries({ queryKey: ["suppliers"] })
      qc.invalidateQueries({ queryKey: ["payments"] })
      qc.invalidateQueries({ queryKey: ["inventory"] })
      onClose()
      if (res.purchase?.id) onCreated(res.purchase.id)
    } catch (e: any) {
      toast({ title: "Failed to create purchase", description: e.message, variant: "destructive" })
    } finally {
      setSaving(null)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Purchase</DialogTitle>
          <DialogDescription>
            Raise a purchase order to track incoming stock, or record a direct purchase that is received into inventory right away.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier" required>
            <EntityPicker
              entities={suppliers}
              value={supplierId}
              onChange={setSupplierId}
              getLabel={(s: any) => (s.company ? `${s.name} — ${s.company}` : s.name)}
              placeholder="Search supplier…"
            />
          </Field>
          <Field label="Expected date" hint="When the supplier should deliver">
            <TextInput type="date" value={expectedDate} onChange={setExpectedDate} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <TextArea value={notes} onChange={setNotes} rows={2} placeholder="Transport details, terms…" />
            </Field>
          </div>
        </div>

        {/* Line items */}
        <div className="space-y-2">
          <SectionTitle>Items</SectionTitle>
          <VariantPicker onPick={addLine} />

          {lines.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
              Search above to add product variants — cost price and GST are prefilled from the product.
            </p>
          ) : (
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={l.variantId} className="rounded-md border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.productName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {l.variantLabel}{l.sku ? ` · ${l.sku}` : ""}
                      </p>
                    </div>
                    <button
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                      onClick={() => removeLine(idx)}
                      aria-label={`Remove ${l.productName}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label="Qty">
                      <NumberInput value={l.quantity} min={1} step="1" onChange={(v) => updateLine(idx, { quantity: Math.max(1, Math.round(v)) })} />
                    </Field>
                    <Field label="Unit cost (₹)">
                      <NumberInput value={l.unitCost} min={0} onChange={(v) => updateLine(idx, { unitCost: v })} />
                    </Field>
                    <Field label="Tax %">
                      <NumberInput value={l.taxRate} min={0} onChange={(v) => updateLine(idx, { taxRate: v })} />
                    </Field>
                    <div className="flex flex-col justify-end pb-1">
                      <p className="text-xs text-muted-foreground">Line total</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {fmtMoney(l.unitCost * l.quantity * (1 + (l.taxRate || 0) / 100))}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="ml-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">{fmtMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax (GST)</span>
                <span className="tabular-nums">{fmtMoney(tax)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Discount ₹</span>
                <div className="w-28">
                  <NumberInput value={discount} min={0} onChange={setDiscount} />
                </div>
              </div>
              <div className="flex justify-between border-t pt-1.5">
                <span className="font-semibold">Total</span>
                <span className="font-bold tabular-nums">{fmtMoney(total)}</span>
              </div>
            </div>
          </div>

          {/* Pay now (direct purchase only) */}
          <div className="rounded-lg border p-3">
            <SwitchInput
              checked={payNow}
              onChange={togglePayNow}
              label="Pay supplier now (applies to “Create & Receive”)"
            />
            {payNow && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Pay now (₹)" hint={`Invoice total: ${fmtMoney(total)}`}>
                  <NumberInput value={payNowAmount} min={0} onChange={setPayNowAmount} />
                </Field>
                <Field label="Method">
                  <SelectInput
                    value={payNowMethod}
                    onChange={setPayNowMethod}
                    options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
                  />
                </Field>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving !== null}>Cancel</Button>
          <Button variant="outline" onClick={() => submit(false)} disabled={saving !== null}>
            {saving === "po" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create PO
          </Button>
          <Button onClick={() => submit(true)} disabled={saving !== null}>
            {saving === "receive" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create &amp; Receive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== VARIANT PICKER (searches products, picks variant) ====================
function VariantPicker({ onPick }: { onPick: (v: PickedVariant) => void }) {
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const { data, isFetching } = useQuery({
    queryKey: ["products", "purchase-picker", debounced],
    queryFn: () => api.get(`products${qs({ q: debounced, pageSize: 50 })}`),
    enabled: open && debounced.length > 0,
  })
  const products: any[] = data?.products ?? []

  function pick(prod: any, v: any) {
    onPick({
      variantId: v.id,
      productName: prod.name,
      variantLabel: [v.color?.name, v.size?.name].filter(Boolean).join(" / ") || "Default",
      sku: v.sku,
      costPrice: v.costPrice || prod.costPrice || 0,
      taxRate: prod.taxRate ?? 0,
    })
    setQ("")
    setDebounced("")
    setOpen(false)
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Add item — search product name, code or SKU…"
          className="h-9 pl-8"
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-lg thin-scrollbar">
          {debounced.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">Type to search products…</p>
          ) : isFetching ? (
            <p className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching products…
            </p>
          ) : products.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">No products match “{debounced}”</p>
          ) : (
            products.map((prod) => (
              <div key={prod.id} className="border-b last:border-0">
                <p className="bg-muted/50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {prod.name}{prod.code ? ` · ${prod.code}` : ""}
                </p>
                {(prod.variants ?? []).length === 0 ? (
                  <p className="px-3 py-1.5 text-xs text-muted-foreground">No variants</p>
                ) : (
                  (prod.variants ?? []).map((v: any) => (
                    <button
                      key={v.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                      onMouseDown={(ev) => { ev.preventDefault(); pick(prod, v) }}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{[v.color?.name, v.size?.name].filter(Boolean).join(" / ") || "Default"}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{v.sku}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">₹{v.costPrice ?? 0}</span>
                    </button>
                  ))
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
