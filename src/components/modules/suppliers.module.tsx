"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { useApp, canDo } from "@/lib/client/store"
import { PageHeader, StatCard, EmptyState } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import {
  StatusBadge, Money, DateCell, ConfirmDialog, Field, TextInput, SelectInput, TextArea, NumberInput,
} from "@/components/shared/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  PackagePlus, Truck, IndianRupee, Package, Phone, Mail, MapPin, Pencil, Loader2, Trash2,
} from "lucide-react"
import { fmtMoney, fmtDateIST } from "@/lib/format"
import {
  PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS,
  PURCHASE_STATUS_LABELS, PURCHASE_STATUS_COLORS,
} from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// Supplier type values used by the backend (no shared map exists yet — kept local to this module)
const SUPPLIER_TYPES = ["FABRIC", "FINISHED_GOODS", "ACCESSORIES", "PACKAGING", "OTHER"] as const
const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  FABRIC: "Fabric", FINISHED_GOODS: "Finished Goods", ACCESSORIES: "Accessories", PACKAGING: "Packaging", OTHER: "Other",
}

interface Supplier {
  id: string; code: string; name: string; company: string | null; phone: string | null; email: string | null
  address: string | null; gstin: string | null; type: string | null
  openingBalance: number; outstanding: number; notes: string | null; createdAt: string
}

export function SuppliersModule() {
  const { moduleParams } = useApp()
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [creating, setCreating] = useState(!!moduleParams?.new)
  const [deleting, setDeleting] = useState<Supplier | null>(null)
  const [detailId, setDetailId] = useState<string | null>((moduleParams?.entityId as string) ?? null)
  const [typeFilter, setTypeFilter] = useState("ALL")

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", "list"],
    queryFn: () => api.get(`suppliers${qs({ pageSize: 200 })}`),
  })

  const all: Supplier[] = data?.suppliers ?? []
  const suppliers = typeFilter === "ALL" ? all : all.filter((s) => s.type === typeFilter)
  const totalOutstanding = suppliers.reduce((s, c) => s + Math.max(0, c.outstanding), 0)
  const canCreate = canDo("suppliers", "create")

  const columns: Column<Supplier>[] = [
    { key: "code", header: "Code", width: "w-16", render: (s) => <span className="text-xs text-muted-foreground">{s.code}</span>, sortValue: (s) => s.code },
    {
      key: "name", header: "Supplier",
      render: (s) => (
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {s.name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{s.name}</p>
            {s.company && <p className="truncate text-xs text-muted-foreground">{s.company}</p>}
          </div>
        </div>
      ),
      sortValue: (s) => s.name,
    },
    { key: "phone", header: "Phone", render: (s) => <span className="tabular-nums">{s.phone ?? "—"}</span>, sortValue: (s) => s.phone ?? "" },
    {
      key: "type", header: "Type",
      render: (s) => s.type
        ? <StatusBadge label={SUPPLIER_TYPE_LABELS[s.type] ?? s.type} className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" />
        : <span className="text-muted-foreground">—</span>,
      sortValue: (s) => s.type ?? "",
    },
    { key: "gstin", header: "GSTIN", render: (s) => <span className="tabular-nums text-xs">{s.gstin ?? "—"}</span>, sortValue: (s) => s.gstin ?? "" },
    {
      key: "outstanding", header: "Outstanding", align: "right",
      render: (s) => <Money value={s.outstanding} colored className="font-semibold" />,
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Truck className="h-5 w-5" />}
        title="Suppliers"
        description="Vendor master for fabric, finished goods and packaging suppliers — purchase history, payables and udhaar ledger."
        actions={
          <>
            <Button
              variant="outline" size="sm"
              onClick={() => exportCSV(
                "suppliers",
                ["Code", "Name", "Company", "Phone", "Email", "Type", "GSTIN", "Outstanding"],
                suppliers.map((s) => [s.code, s.name, s.company ?? "", s.phone ?? "", s.email ?? "", s.type ?? "", s.gstin ?? "", s.outstanding]),
              )}
            >
              Export CSV
            </Button>
            {canCreate && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Package className="mr-1.5 h-4 w-4" /> New Supplier
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Suppliers" value={data?.total ?? "…"} icon={<Truck className="h-4 w-4" />} />
        <StatCard
          label="With Outstanding"
          value={suppliers.filter((s) => s.outstanding > 0).length}
          sub="On this page"
          tone="warning"
          icon={<IndianRupee className="h-4 w-4" />}
        />
        <StatCard label="Outstanding Payable" value={fmtMoney(totalOutstanding)} sub="On this page" tone="warning" icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard
          label="GST Registered"
          value={suppliers.filter((s) => !!s.gstin).length}
          sub="On this page"
          icon={<Package className="h-4 w-4" />}
        />
      </div>

      <DataTable
        columns={columns}
        rows={suppliers}
        loading={isLoading}
        onRowClick={(s) => setDetailId(s.id)}
        searchKeys={["code", "name", "company", "phone", "gstin"]}
        searchPlaceholder="Search name, company, phone, GSTIN…"
        emptyTitle={typeFilter !== "ALL" ? "No suppliers of this type" : "No suppliers yet"}
        emptyDescription="Add your first supplier to start raising purchase orders and tracking payables."
        emptyAction={canCreate ? (
          <Button size="sm" onClick={() => setCreating(true)}><Package className="mr-1.5 h-4 w-4" /> New Supplier</Button>
        ) : undefined}
        rowClassName={(s) => (s.outstanding > 0 ? "bg-amber-500/5" : "")}
        toolbar={
          <div className="w-44">
            <SelectInput
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "ALL", label: "All Types" },
                ...SUPPLIER_TYPES.map((t) => ({ value: t, label: SUPPLIER_TYPE_LABELS[t] })),
              ]}
            />
          </div>
        }
      />

      {typeFilter !== "ALL" && (
        <p className="text-xs text-muted-foreground">
          Filtered by type: {SUPPLIER_TYPE_LABELS[typeFilter] ?? typeFilter}{" "}
          <button className="underline" onClick={() => setTypeFilter("ALL")}>clear</button>
        </p>
      )}

      {creating && <SupplierForm onClose={() => setCreating(false)} />}
      {editing && <SupplierForm supplier={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteConfirm supplier={deleting} onClose={() => setDeleting(null)} />}
      {detailId && (
        <SupplierDetail
          id={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(s) => { setDetailId(null); setEditing(s) }}
        />
      )}
    </div>
  )
}

// ==================== FORM ====================
function SupplierForm({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: supplier?.name ?? "",
    company: supplier?.company ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    gstin: supplier?.gstin ?? "",
    type: supplier?.type ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
  })
  const [openingBalance, setOpeningBalance] = useState(0)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim()) return toast({ title: "Supplier name is required", variant: "destructive" })
    setSaving(true)
    try {
      if (supplier) {
        await api.put(`suppliers/${supplier.id}`, form)
      } else {
        await api.post("suppliers", { ...form, openingBalance })
      }
      toast({ title: supplier ? "Supplier updated" : "Supplier created" })
      qc.invalidateQueries({ queryKey: ["suppliers"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{supplier ? `Edit ${supplier.name}` : "New Supplier"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Supplier name" required>
              <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Contact person or firm" autoFocus />
            </Field>
          </div>
          <Field label="Company"><TextInput value={form.company} onChange={(v) => setForm({ ...form, company: v })} placeholder="Company / firm name" /></Field>
          <Field label="Phone"><TextInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="98XXXXXXXX" /></Field>
          <Field label="Email"><TextInput value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="billing@supplier.com" /></Field>
          <Field label="GSTIN"><TextInput value={form.gstin} onChange={(v) => setForm({ ...form, gstin: v })} placeholder="27AAECM5521K1Z3" /></Field>
          <Field label="Supplier type">
            <SelectInput
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v })}
              placeholder="Select type…"
              options={SUPPLIER_TYPES.map((t) => ({ value: t, label: SUPPLIER_TYPE_LABELS[t] }))}
            />
          </Field>
          {!supplier && (
            <Field label="Opening balance (₹)" hint="Amount already owed to this supplier">
              <NumberInput value={openingBalance} min={0} onChange={setOpeningBalance} />
            </Field>
          )}
          <div className="sm:col-span-2"><Field label="Address"><TextInput value={form.address} onChange={(v) => setForm({ ...form, address: v })} /></Field></div>
          <div className="sm:col-span-2">
            <Field label="Notes"><TextArea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={2} placeholder="Lead time, terms, remarks…" /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteConfirm({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  async function del() {
    setLoading(true)
    try {
      await api.del(`suppliers/${supplier.id}`)
      toast({ title: "Supplier deleted" })
      qc.invalidateQueries({ queryKey: ["suppliers"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Cannot delete", description: e.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }
  return <ConfirmDialog open onOpenChange={onClose} title={`Delete ${supplier.name}?`} destructive confirmLabel="Delete"
    description="Suppliers with purchase history cannot be deleted (data integrity)." onConfirm={del} loading={loading} />
}

// ==================== DETAIL ====================
function SupplierDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (s: Supplier) => void }) {
  const { setActiveModule } = useApp()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", id],
    queryFn: () => api.get(`suppliers/${id}`),
  })
  const s: (Supplier & { purchases?: any[]; payments?: any[]; ledger?: any[]; products?: any[]; stats?: { totalPurchases: number; totalPaid: number; outstanding: number } }) | undefined = data?.supplier
  const purchaseList: any[] = s?.purchases ?? []
  const paymentList: any[] = s?.payments ?? []
  const productList: any[] = s?.products ?? []
  const ledgerList: any[] = s?.ledger ?? []

  const canCreatePurchase = canDo("purchases", "create")
  const [voidingPayment, setVoidingPayment] = useState<any | null>(null)
  const canVoidPayment = canDo("payments", "void")

  async function voidPayment() {
    if (!voidingPayment) return
    try {
      await api.post(`payments/${voidingPayment.id}/void`, { reason: "Voided from supplier record" })
      toast({ title: "Payment voided", description: `${voidingPayment.number} reversed.` })
      qc.invalidateQueries({ queryKey: ["suppliers", id] })
      qc.invalidateQueries({ queryKey: ["payments"] })
    } catch (e: any) {
      toast({ title: "Could not void payment", description: e.message, variant: "destructive" })
    } finally {
      setVoidingPayment(null)
    }
  }

  return (
    <>
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl thin-scrollbar">
        <SheetHeader className="border-b bg-muted/40 px-5 py-4">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              {s?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{s?.name ?? "Loading…"}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {s?.code}{s?.type ? ` · ${SUPPLIER_TYPE_LABELS[s.type] ?? s.type}` : ""}{s?.company ? ` · ${s.company}` : ""}
              </p>
            </div>
          </SheetTitle>
        </SheetHeader>

        {isLoading || !s ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5 p-5">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Total Purchases" value={fmtMoney(s.stats?.totalPurchases ?? 0)} />
              <StatCard label="Total Paid" value={fmtMoney(s.stats?.totalPaid ?? 0)} tone="positive" />
              <StatCard
                label="Outstanding"
                value={fmtMoney(s.outstanding)}
                tone={s.outstanding > 0 ? "warning" : "default"}
              />
              <StatCard
                label="Purchase Orders"
                value={purchaseList.length}
                sub={`Last: ${purchaseList[0]?.orderDate ? fmtDateIST(purchaseList[0].orderDate) : "—"}`}
              />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {canCreatePurchase && (
                <Button size="sm" onClick={() => setActiveModule("purchases", { new: 1, supplierId: s.id })}>
                  <PackagePlus className="mr-1.5 h-4 w-4" /> New Purchase
                </Button>
              )}
              {s.outstanding > 0 && (
                <Button size="sm" variant="outline" onClick={() => setActiveModule("purchases", { supplierId: s.id })}>
                  <IndianRupee className="mr-1.5 h-4 w-4" /> Pay Outstanding
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onEdit(s)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            </div>

            {/* Contact */}
            <div className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
              <span className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" /> {s.phone ?? "—"}</span>
              <span className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5 shrink-0" /> {s.email ?? "—"}</span>
              <span className="col-span-2 flex items-center gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" /> {s.address ?? "—"}</span>
              <span>GSTIN: <b className="tabular-nums">{s.gstin ?? "—"}</b></span>
              <span>Type: <b>{s.type ? (SUPPLIER_TYPE_LABELS[s.type] ?? s.type) : "—"}</b></span>
              {s.openingBalance > 0 && <span>Opening balance: <b>{fmtMoney(s.openingBalance)}</b></span>}
              {s.notes && <p className="col-span-2 rounded bg-muted p-2 text-xs">{s.notes}</p>}
            </div>

            {/* Tabs */}
            <Tabs defaultValue="ledger">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="ledger">Ledger</TabsTrigger>
                <TabsTrigger value="purchases">Purchases ({purchaseList.length})</TabsTrigger>
                <TabsTrigger value="payments">Payments ({paymentList.length})</TabsTrigger>
                <TabsTrigger value="products">Products ({productList.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="ledger" className="mt-3">
                <LedgerTable entries={ledgerList} />
              </TabsContent>

              <TabsContent value="purchases" className="mt-3">
                {purchaseList.length === 0 ? (
                  <EmptyState title="No purchases" description="Purchase orders raised with this supplier will appear here." />
                ) : (
                  <div className="space-y-1">
                    {purchaseList.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => setActiveModule("purchases", { entityId: p.id })}
                        className="flex w-full items-center gap-3 rounded-md border p-2.5 text-left hover:bg-accent"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{p.number}</p>
                          <p className="text-xs text-muted-foreground">
                            <DateCell value={p.orderDate} /> · {p.items?.length ?? 0} items
                          </p>
                        </div>
                        {p.dueAmount > 0 && (
                          <span className="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                            {fmtMoney(p.dueAmount)}
                          </span>
                        )}
                        <Money value={p.total} className="text-sm font-semibold" />
                        <StatusBadge
                          label={PURCHASE_STATUS_LABELS[p.status] ?? p.status}
                          className={PURCHASE_STATUS_COLORS[p.status]}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments" className="mt-3">
                {paymentList.length === 0 ? (
                  <EmptyState title="No payments" description="Supplier payments recorded against purchases will appear here." />
                ) : (
                  <div className="space-y-1">
                    {paymentList.map((p: any) => (
                      <div key={p.id} className="flex items-center gap-3 rounded-md border p-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{p.number} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            <DateCell value={p.date} />
                            {p.transactionId ? ` · ${p.transactionId}` : ""}
                            {p.notes ? ` · ${p.notes}` : ""}
                          </p>
                        </div>
                        <Money value={-p.amount} className="text-sm font-semibold" />
                        <StatusBadge label={PAYMENT_STATUS_LABELS[p.status] ?? p.status} className={PAYMENT_STATUS_COLORS[p.status]} />
                        {canVoidPayment && p.status === "VERIFIED" && (
                          <button
                            type="button"
                            aria-label={`Void payment ${p.number}`}
                            onClick={() => setVoidingPayment(p)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="products" className="mt-3">
                {productList.length === 0 ? (
                  <EmptyState title="No products supplied" description="Products linked to this supplier will appear here." />
                ) : (
                  <div className="space-y-1">
                    {productList.map((pr: any) => (
                      <button
                        key={pr.id}
                        onClick={() => setActiveModule("products", { entityId: pr.id })}
                        className="flex w-full items-center gap-3 rounded-md border p-2.5 text-left hover:bg-accent"
                      >
                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{pr.name}</p>
                          <p className="text-xs text-muted-foreground">{pr.code}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>

    <ConfirmDialog
      open={!!voidingPayment}
      onOpenChange={(v) => !v && setVoidingPayment(null)}
      title={`Void payment ${voidingPayment?.number ?? ""}?`}
      description="The payment will be marked void. Allocations to purchases and the supplier ledger are reversed. This is recorded in the audit log."
      confirmLabel="Void Payment"
      destructive
      onConfirm={voidPayment}
    />
    </>
  )
}

// ==================== LEDGER TABLE (same pattern as customers module) ====================
function LedgerTable({ entries }: { entries: any[] }) {
  if (!entries?.length) {
    return <EmptyState title="No ledger entries" description="Purchases and payments will appear here as a running account statement." />
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-semibold">Date</th>
            <th className="px-3 py-2 font-semibold">Description</th>
            <th className="px-3 py-2 text-right font-semibold">Debit</th>
            <th className="px-3 py-2 text-right font-semibold">Credit</th>
            <th className="px-3 py-2 text-right font-semibold">Balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.id ?? i} className="border-b last:border-0">
              <td className="whitespace-nowrap px-3 py-2 text-xs"><DateCell value={e.date} /></td>
              <td className="px-3 py-2">{e.description}</td>
              <td className="px-3 py-2 text-right tabular-nums">{e.debit > 0 ? fmtMoney(e.debit) : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{e.credit > 0 ? fmtMoney(e.credit) : "—"}</td>
              <td className={cn("px-3 py-2 text-right font-medium tabular-nums", e.balanceAfter > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                {fmtMoney(e.balanceAfter)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
