"use client"

import { useState } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { useApp } from "@/lib/client/store"
import { PageHeader, StatCard, EmptyState } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import { StatusBadge, Money, DateCell, ConfirmDialog, Field, TextInput, SelectInput, TextArea, NumberInput } from "@/components/shared/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Users, UserPlus, IndianRupee, ShoppingCart, Phone, Mail, MapPin, Trash2, Pencil, Loader2 } from "lucide-react"
import { fmtMoney, fmtDateIST } from "@/lib/format"
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS, SALE_PAYMENT_STATUS_COLORS, ORDER_STATUS_COLORS } from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface Customer {
  id: string; code: string; name: string; phone: string | null; email: string | null
  address: string | null; city: string | null; type: string; creditLimit: number
  discountPercent: number; outstanding: number; notes: string | null; createdAt: string
}

export function CustomersModule() {
  const { moduleParams, setActiveModule } = useApp()
  const [editing, setEditing] = useState<Customer | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Customer | null>(null)
  const [detailId, setDetailId] = useState<string | null>((moduleParams?.entityId as string) ?? null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")

  // react to sidebar navigation with entityId
  useState(() => {
    if (moduleParams?.entityId) setDetailId(moduleParams.entityId as string)
    if (moduleParams?.new) setCreating(true)
  })

  const { data, isLoading } = useQuery({
    queryKey: ["customers", page, search, typeFilter],
    queryFn: () => api.get(`customers${qs({ page, pageSize: 50, q: search, type: typeFilter })}`),
  })

  const customers: Customer[] = data?.customers ?? []
  const totalOutstanding = customers.reduce((s, c) => s + Math.max(0, c.outstanding), 0)

  const columns: Column<Customer>[] = [
    { key: "code", header: "Code", width: "w-16", render: (c) => <span className="text-xs text-muted-foreground">{c.code}</span> },
    { key: "name", header: "Customer", render: (c) => (
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{c.name?.[0]?.toUpperCase()}</div>
        <span className="font-medium">{c.name}</span>
      </div>
    ) },
    { key: "phone", header: "Phone", render: (c) => <span className="tabular-nums">{c.phone ?? "—"}</span> },
    { key: "city", header: "City", render: (c) => c.city ?? "—" },
    { key: "type", header: "Type", render: (c) => <StatusBadge label={CUSTOMER_TYPE_LABELS[c.type] ?? c.type} className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" /> },
    { key: "creditLimit", header: "Credit Limit", align: "right", render: (c) => c.creditLimit > 0 ? fmtMoney(c.creditLimit) : "—" },
    { key: "outstanding", header: "Outstanding", align: "right", render: (c) => (
      <Money value={c.outstanding} colored className="font-semibold" />
    ) },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Users className="h-5 w-5" />}
        title="Customers"
        description="CRM for retail, wholesale, VIP and distributor customers — purchase history, credit limits and udhaar ledger."
        actions={
          <>
            <Button
              variant="outline" size="sm"
              onClick={() => exportCSV("customers", ["Code", "Name", "Phone", "City", "Type", "Credit Limit", "Outstanding"],
                customers.map((c) => [c.code, c.name, c.phone ?? "", c.city ?? "", c.type, c.creditLimit, c.outstanding]))}
            >
              Export CSV
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" /> New Customer
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Customers" value={data?.total ?? "…"} icon={<Users className="h-4 w-4" />} />
        <StatCard label="With Outstanding" value={customers.filter((c) => c.outstanding > 0).length} sub="On this page" tone="warning" icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard label="Page Outstanding" value={fmtMoney(totalOutstanding)} tone="warning" icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard label="Wholesale / VIP" value={customers.filter((c) => c.type === "WHOLESALE" || c.type === "VIP").length} sub="On this page" icon={<ShoppingCart className="h-4 w-4" />} />
      </div>

      <DataTable
        columns={columns}
        rows={customers}
        loading={isLoading}
        onRowClick={(c) => setDetailId(c.id)}
        searchPlaceholder="Search name, phone, code…"
        emptyTitle={search || typeFilter ? "No matching customers" : "No customers yet"}
        emptyDescription="Add your first customer to start recording sales and credit."
        emptyAction={<Button size="sm" onClick={() => setCreating(true)}><UserPlus className="mr-1.5 h-4 w-4" /> New Customer</Button>}
        rowClassName={(c) => c.outstanding > 0 ? "bg-amber-500/5" : ""}
      />

      {typeFilter && (
        <p className="text-xs text-muted-foreground">Filtered by type: {CUSTOMER_TYPE_LABELS[typeFilter]} <button className="underline" onClick={() => setTypeFilter("")}>clear</button></p>
      )}

      {creating && <CustomerForm onClose={() => setCreating(false)} />}
      {editing && <CustomerForm customer={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteConfirm customer={deleting} onClose={() => setDeleting(null)} />}
      {detailId && <CustomerDetail id={detailId} onClose={() => setDetailId(null)} onEdit={(c) => { setDetailId(null); setEditing(c) }} />}
    </div>
  )
}

// ==================== FORM ====================
function CustomerForm({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: customer?.name ?? "", phone: customer?.phone ?? "", email: customer?.email ?? "",
    address: customer?.address ?? "", city: customer?.city ?? "", type: customer?.type ?? "RETAIL",
    creditLimit: customer?.creditLimit ?? 0, discountPercent: customer?.discountPercent ?? 0,
    notes: customer?.notes ?? "",
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim()) return toast({ title: "Name is required", variant: "destructive" })
    setSaving(true)
    try {
      if (customer) await api.put(`customers/${customer.id}`, form)
      else await api.post("customers", form)
      toast({ title: customer ? "Customer updated" : "Customer created" })
      qc.invalidateQueries({ queryKey: ["customers"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{customer ? `Edit ${customer.name}` : "New Customer"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Full name" required><TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Customer name" autoFocus /></Field></div>
          <Field label="Phone"><TextInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="98XXXXXXXX" /></Field>
          <Field label="Email"><TextInput value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="email@example.com" /></Field>
          <Field label="City"><TextInput value={form.city} onChange={(v) => setForm({ ...form, city: v })} /></Field>
          <Field label="Customer type">
            <SelectInput value={form.type} onChange={(v) => setForm({ ...form, type: v })}
              options={CUSTOMER_TYPES.map((t) => ({ value: t, label: CUSTOMER_TYPE_LABELS[t] }))} />
          </Field>
          <Field label="Credit limit (₹)" hint="0 = no credit"><NumberInput value={form.creditLimit} onChange={(v) => setForm({ ...form, creditLimit: v })} min={0} /></Field>
          <Field label="Default discount %"><NumberInput value={form.discountPercent} onChange={(v) => setForm({ ...form, discountPercent: v })} min={0} /></Field>
          <div className="sm:col-span-2"><Field label="Address"><TextInput value={form.address} onChange={(v) => setForm({ ...form, address: v })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Notes"><TextArea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={2} placeholder="Preferences, measurements, remarks…" /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteConfirm({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  async function del() {
    setLoading(true)
    try {
      await api.del(`customers/${customer.id}`)
      toast({ title: "Customer deleted" })
      qc.invalidateQueries({ queryKey: ["customers"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Cannot delete", description: e.message, variant: "destructive" })
    } finally { setLoading(false) }
  }
  return <ConfirmDialog open onOpenChange={onClose} title={`Delete ${customer.name}?`} destructive confirmLabel="Delete"
    description="Customers with sales history cannot be deleted (data integrity)." onConfirm={del} loading={loading} />
}

// ==================== DETAIL ====================
function CustomerDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (c: Customer) => void }) {
  const qc = useQueryClient()
  const { setActiveModule } = useApp()
  const { data, isLoading } = useQuery({
    queryKey: ["customers", id],
    queryFn: () => api.get(`customers/${id}`),
  })
  const c = data?.customer

  async function remind() {
    toast({ title: "Reminder noted", description: `Payment reminder for ${c?.name} — ₹${(c?.outstanding ?? 0).toFixed(2)} due` })
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl thin-scrollbar">
        <SheetHeader className="border-b bg-muted/40 px-5 py-4">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              {c?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="text-lg font-semibold">{c?.name ?? "Loading…"}</p>
              <p className="text-xs font-normal text-muted-foreground">{c?.code} · {c ? CUSTOMER_TYPE_LABELS[c.type] : ""}</p>
            </div>
          </SheetTitle>
        </SheetHeader>

        {isLoading || !c ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5 p-5">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Total Purchases" value={fmtMoney(c.stats.totalPurchases)} />
              <StatCard label="Total Paid" value={fmtMoney(c.stats.totalPaid)} tone="positive" />
              <StatCard label="Outstanding" value={fmtMoney(c.outstanding)} tone={c.outstanding > 0 ? "warning" : "default"} />
              <StatCard label="Orders" value={c.stats.totalOrders} sub={`Last: ${c.stats.lastPurchase ? fmtDateIST(c.stats.lastPurchase) : "—"}`} />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setActiveModule("sales", { tab: "pos", customerId: c.id })}>
                <ShoppingCart className="mr-1.5 h-4 w-4" /> New Sale
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveModule("payments", { tab: "receive", customerId: c.id })}>
                <IndianRupee className="mr-1.5 h-4 w-4" /> Receive Payment
              </Button>
              {c.outstanding > 0 && (
                <Button size="sm" variant="outline" onClick={remind}>
                  Payment Reminder
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => onEdit(c)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            </div>

            {/* Contact */}
            <div className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
              <span className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {c.phone ?? "—"}</span>
              <span className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {c.email ?? "—"}</span>
              <span className="col-span-2 flex items-center gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {c.address ?? "—"}{c.city ? `, ${c.city}` : ""}</span>
              {c.creditLimit > 0 && <span>Credit limit: <b>{fmtMoney(c.creditLimit)}</b></span>}
              {c.discountPercent > 0 && <span>Default discount: <b>{c.discountPercent}%</b></span>}
              {c.notes && <p className="col-span-2 rounded bg-muted p-2 text-xs">{c.notes}</p>}
            </div>

            {/* Tabs */}
            <Tabs defaultValue="ledger">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="ledger">Ledger</TabsTrigger>
                <TabsTrigger value="sales">Invoices ({c.sales.length})</TabsTrigger>
                <TabsTrigger value="orders">Orders ({c.orders.length})</TabsTrigger>
                <TabsTrigger value="payments">Payments ({c.payments.length})</TabsTrigger>
                <TabsTrigger value="returns">Returns ({c.returns.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="ledger" className="mt-3">
                <LedgerTable entries={c.ledger} />
              </TabsContent>

              <TabsContent value="sales" className="mt-3">
                {c.sales.length === 0 ? <EmptyState title="No invoices" /> : (
                  <div className="space-y-1">
                    {c.sales.map((s: any) => (
                      <button key={s.id} onClick={() => setActiveModule("sales", { tab: "invoices", entityId: s.id })}
                        className="flex w-full items-center gap-3 rounded-md border p-2.5 text-left hover:bg-accent">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{s.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground"><DateCell value={s.date} /> · {s.items.length} items</p>
                        </div>
                        <Money value={s.total} className="text-sm font-semibold" />
                        <StatusBadge label={s.paymentStatus} className={SALE_PAYMENT_STATUS_COLORS[s.paymentStatus]} />
                      </button>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="orders" className="mt-3">
                {c.orders.length === 0 ? <EmptyState title="No orders" /> : (
                  <div className="space-y-1">
                    {c.orders.map((o: any) => (
                      <button key={o.id} onClick={() => setActiveModule("sales", { tab: "orders", entityId: o.id })}
                        className="flex w-full items-center gap-3 rounded-md border p-2.5 text-left hover:bg-accent">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{o.number}</p>
                          <p className="text-xs text-muted-foreground"><DateCell value={o.orderDate} /></p>
                        </div>
                        <Money value={o.total} className="text-sm font-semibold" />
                        <StatusBadge label={o.status} className={ORDER_STATUS_COLORS[o.status]} />
                      </button>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments" className="mt-3">
                {c.payments.length === 0 ? <EmptyState title="No payments" /> : (
                  <div className="space-y-1">
                    {c.payments.map((p: any) => (
                      <div key={p.id} className="flex items-center gap-3 rounded-md border p-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{p.number} · {p.method}</p>
                          <p className="text-xs text-muted-foreground"><DateCell value={p.date} />{p.transactionId ? ` · ${p.transactionId}` : ""}</p>
                        </div>
                        <Money value={p.amount} colored={p.direction === "IN"} className="text-sm font-semibold" />
                        <StatusBadge label={p.status} className={p.status === "VERIFIED" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"} />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="returns" className="mt-3">
                {c.returns.length === 0 ? <EmptyState title="No returns" /> : (
                  <div className="space-y-1">
                    {c.returns.map((r: any) => (
                      <div key={r.id} className="flex items-center gap-3 rounded-md border p-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{r.number} · {r.type === "EXCHANGE" ? "Exchange" : "Return"}</p>
                          <p className="text-xs text-muted-foreground"><DateCell value={r.createdAt} /></p>
                        </div>
                        <Money value={r.refundAmount > 0 ? -r.refundAmount : r.exchangeDue} colored className="text-sm font-semibold" />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ==================== LEDGER TABLE (shared pattern) ====================
export function LedgerTable({ entries, title }: { entries: any[]; title?: string }) {
  if (!entries?.length) return <EmptyState title="No ledger entries" description="Transactions will appear here as a running account statement." />
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
      {title && <p className="bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">{title}</p>}
    </div>
  )
}
