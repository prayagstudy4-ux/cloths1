"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { useApp, canDo } from "@/lib/client/store"
import { PageHeader, StatCard, EmptyState, SectionTitle } from "@/components/shared/basics"
import { DataTable, Column, exportCSV } from "@/components/shared/DataTable"
import { StatusBadge, Money, DateCell, ConfirmDialog, Field, TextInput, NumberInput, SelectInput, TextArea, EntityPicker } from "@/components/shared/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  ShoppingCart, ScanBarcode, Trash2, Plus, Minus, Printer, IndianRupee, QrCode,
  ClipboardList, FileText, RotateCcw, ArrowRightLeft, Ban, Loader2, Search, UserPlus, CheckCircle2, Package,
} from "lucide-react"
import { fmtMoney, fmtDateIST } from "@/lib/format"
import {
  SALE_PAYMENT_STATUS_COLORS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, DELIVERY_STATUS_LABELS,
  QUOTATION_STATUS_LABELS, QUOTATION_STATUS_COLORS, PAYMENT_METHOD_LABELS, RETURN_TYPE_LABELS,
  REFUND_METHOD_LABELS, PAYMENT_METHODS,
} from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// ============================================================
// MAIN MODULE
// ============================================================
export function SalesModule() {
  const { moduleParams } = useApp()
  const [tab, setTab] = useState<string>((moduleParams?.tab as string) ?? "pos")
  const [posReset, setPosReset] = useState(0)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (moduleParams?.tab) setTab(moduleParams.tab as string)
  }, [moduleParams?.tab])

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<ShoppingCart className="h-5 w-5" />}
        title="Sales & Orders"
        description="Point of sale, invoices, customer orders, quotations, returns and exchanges — all connected to inventory and ledgers."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
          <TabsTrigger value="pos">POS — New Sale</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
          <TabsTrigger value="returns">Returns & Exchanges</TabsTrigger>
        </TabsList>
        <TabsContent value="pos" className="mt-4">
          <PosTab key={posReset} onComplete={() => setPosReset((n) => n + 1)} />
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab />
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <OrdersTab />
        </TabsContent>
        <TabsContent value="quotations" className="mt-4">
          <QuotationsTab />
        </TabsContent>
        <TabsContent value="returns" className="mt-4">
          <ReturnsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================
// POS TAB
// ============================================================
interface CartLine {
  variantId: string
  productName: string
  variantLabel: string
  sku: string
  unitPrice: number
  quantity: number
  discount: number
  taxRate: number
  stock: number
}

function PosTab({ onComplete }: { onComplete: () => void }) {
  const qc = useQueryClient()
  const { moduleParams, setActiveModule } = useApp()
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerId, setCustomerId] = useState<string>((moduleParams?.customerId as string) ?? "")
  const [extraDiscount, setExtraDiscount] = useState(0)
  const [payments, setPayments] = useState<{ method: string; amount: number }[]>([])
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [lastSaleId, setLastSaleId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { const t = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(t) }, [search])

  const { data: business } = useQuery({ queryKey: ["pos", "business"], queryFn: () => api.get("business") })
  const { data: customersData } = useQuery({ queryKey: ["pos", "customers"], queryFn: () => api.get("customers?pageSize=200") })
  const { data: warehousesData } = useQuery({ queryKey: ["pos", "warehouses"], queryFn: () => api.get("warehouses") })
  const { data: productsData, isFetching } = useQuery({
    queryKey: ["pos", "products", debounced],
    queryFn: () => api.get(`products?pageSize=30&q=${encodeURIComponent(debounced)}&status=ACTIVE`),
  })

  const customers = customersData?.customers ?? []
  const customer = customers.find((c: any) => c.id === customerId)
  const isWholesale = customer?.type === "WHOLESALE" || customer?.type === "DISTRIBUTOR"

  // flatten variants with stock for display
  const variantRows = useMemo(() => {
    const rows: any[] = []
    for (const p of productsData?.products ?? []) {
      for (const v of p.variants ?? []) {
        const stock = (v.stockLevels ?? []).reduce((s: number, l: any) => s + l.quantity, 0)
        rows.push({
          variantId: v.id, productId: p.id, name: p.name, brand: p.brand,
          label: [v.color?.name, v.size?.name].filter(Boolean).join(" / ") || "Default",
          sku: v.sku, barcode: v.barcode,
          price: isWholesale ? (p.wholesalePrice || v.sellingPrice || p.sellingPrice) : (v.sellingPrice || p.sellingPrice),
          mrp: v.mrp || p.mrp, cost: v.costPrice || p.costPrice,
          taxRate: p.taxRate ?? 5, stock,
          colorHex: v.color?.hex,
        })
      }
    }
    return rows
  }, [productsData, isWholesale])

  // barcode / sku exact match on Enter
  function onSearchEnter() {
    const q = search.trim().toLowerCase()
    if (!q) return
    const exact = variantRows.find((r) => r.sku.toLowerCase() === q || (r.barcode ?? "").toLowerCase() === q)
    if (exact) { addToCart(exact); setSearch("") }
  }

  function addToCart(row: any) {
    setCart((c) => {
      const existing = c.find((l) => l.variantId === row.variantId)
      if (existing) {
        if (existing.quantity + 1 > row.stock) { toast({ title: "Insufficient stock", description: `${row.name} (${row.label}) has only ${row.stock} in stock`, variant: "destructive" }); return c }
        return c.map((l) => (l.variantId === row.variantId ? { ...l, quantity: l.quantity + 1 } : l))
      }
      if (row.stock < 1) { toast({ title: "Out of stock", description: `${row.name} (${row.label})`, variant: "destructive" }); return c }
      return [{
        variantId: row.variantId, productName: row.name, variantLabel: row.label, sku: row.sku,
        unitPrice: row.price, quantity: 1, discount: 0, taxRate: row.taxRate ?? 5, stock: row.stock,
      }, ...c]
    })
    searchRef.current?.focus()
  }

  function updateLine(variantId: string, patch: Partial<CartLine>) {
    setCart((c) => c.map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)))
  }

  // totals
  const totals = useMemo(() => {
    let subtotal = 0, itemDiscount = 0, tax = 0
    for (const l of cart) {
      const lineSub = l.unitPrice * l.quantity - l.discount
      subtotal += l.unitPrice * l.quantity
      itemDiscount += l.discount
      tax += (lineSub * (l.taxRate || 0)) / 100
    }
    const total = Math.max(0, subtotal - itemDiscount + tax - extraDiscount)
    return { subtotal, itemDiscount, tax, total }
  }, [cart, extraDiscount])

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const due = Math.max(0, totals.total - totalPaid)
  const change = Math.max(0, totalPaid - totals.total)

  function setQuickPayment(method: string, amount?: number) {
    setPayments((p) => {
      const rest = p.filter((x) => x.method !== method)
      const amt = amount ?? Math.max(0, totals.total - p.filter((x) => x.method !== method).reduce((s, x) => s + x.amount, 0))
      if (amt <= 0) return rest
      return [...rest, { method, amount: Math.round(amt * 100) / 100 }]
    })
  }

  async function completeSale() {
    if (!cart.length) return toast({ title: "Cart is empty", variant: "destructive" })
    if (due > 0.009 && !customerId) {
      return toast({ title: "Credit sale needs a customer", description: "Select a customer or record full payment.", variant: "destructive" })
    }
    setSaving(true)
    try {
      const appliedPayments = payments
        .filter((p) => p.amount > 0)
        .map((p) => ({ ...p, amount: Math.min(p.amount, totals.total) }))
      const res = await api.post("sales", {
        customerId: customerId || undefined,
        type: isWholesale ? "WHOLESALE" : "RETAIL",
        items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount, taxRate: l.taxRate })),
        extraDiscount,
        payments: appliedPayments,
        notes: notes || undefined,
      })
      setLastSaleId(res.sale.id)
      qc.invalidateQueries({ queryKey: ["dashboard"] })
      qc.invalidateQueries({ queryKey: ["sales"] })
      toast({ title: `Sale complete — ${res.sale.invoiceNumber}`, description: `Total ${fmtMoney(res.sale.total)} · ${res.sale.paymentStatus}` })
    } catch (e: any) {
      toast({ title: "Sale failed", description: e.message, variant: "destructive" })
    } finally { setSaving(false) }
  }

  function resetPos() {
    setCart([]); setPayments([]); setExtraDiscount(0); setNotes(""); setCustomerId("")
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* LEFT: product search + cart */}
      <div className="space-y-4">
        {/* Search / scan */}
        <div className="relative">
          <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSearchEnter() }}
            placeholder="Scan barcode or search products by name / SKU… then press Enter"
            className="h-12 pl-10 text-base"
          />
          {isFetching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>

        {/* Product grid */}
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto thin-scrollbar sm:grid-cols-3 xl:grid-cols-4">
          {variantRows.slice(0, 24).map((r) => (
            <button
              key={r.variantId}
              onClick={() => addToCart(r)}
              disabled={r.stock < 1}
              className={cn(
                "group rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow",
                r.stock < 1 && "opacity-40 cursor-not-allowed",
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <p className="line-clamp-2 text-xs font-semibold leading-tight">{r.name}</p>
                {r.colorHex && <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full border" style={{ background: r.colorHex }} />}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{r.label}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-sm font-bold text-primary">{fmtMoney(r.price)}</span>
                <span className={cn("text-[10px] font-medium", r.stock <= 5 ? "text-amber-600" : "text-muted-foreground")}>
                  {r.stock <= 0 ? "OUT" : `${r.stock} left`}
                </span>
              </div>
            </button>
          ))}
          {!variantRows.length && !isFetching && (
            <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
              {debounced ? `No products match “${debounced}”` : "Type to search products, or scan a barcode"}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Cart ({cart.length} items)</h3>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={resetPos}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
          {cart.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Cart is empty — click a product above or scan a barcode
            </div>
          ) : (
            <div className="divide-y">
              {cart.map((l) => (
                <div key={l.variantId} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.productName}</p>
                    <p className="text-xs text-muted-foreground">{l.variantLabel} · {fmtMoney(l.unitPrice)} each</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateLine(l.variantId, { quantity: Math.max(1, l.quantity - 1) })}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number" value={l.quantity} min={1}
                      onChange={(e) => updateLine(l.variantId, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="h-7 w-14 text-center tabular-nums"
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                    />
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateLine(l.variantId, { quantity: l.quantity + 1 })}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="w-20 text-right">
                    <input
                      type="number" value={l.discount || ""} placeholder="Disc" min={0}
                      onChange={(e) => updateLine(l.variantId, { discount: Math.max(0, parseFloat(e.target.value) || 0) })}
                      className="w-full rounded border bg-transparent px-1.5 py-1 text-right text-xs tabular-nums"
                      title="Line discount (₹)"
                    />
                  </div>
                  <span className="w-24 text-right text-sm font-semibold tabular-nums">
                    {fmtMoney(l.unitPrice * l.quantity - l.discount)}
                  </span>
                  <button onClick={() => setCart((c) => c.filter((x) => x.variantId !== l.variantId))} className="text-muted-foreground hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: checkout panel */}
      <div className="space-y-3">
        {/* Customer */}
        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Customer</h3>
            <button onClick={() => setActiveModule("customers", { new: "1" })} className="text-xs text-primary hover:underline flex items-center gap-1">
              <UserPlus className="h-3 w-3" /> New
            </button>
          </div>
          <EntityPicker
            entities={customers} value={customerId} onChange={setCustomerId}
            placeholder="Walk-in customer — click to select…"
            getLabel={(c) => `${c.name} (${c.type.toLowerCase()})${c.outstanding > 0 ? ` · ₹${c.outstanding.toFixed(0)} due` : ""}`}
          />
          {isWholesale && <p className="mt-2 rounded bg-primary/10 px-2 py-1 text-xs text-primary font-medium">Wholesale pricing applied</p>}
        </div>

        {/* Totals */}
        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{fmtMoney(totals.subtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Item discounts</span><span className="tabular-nums">−{fmtMoney(totals.itemDiscount)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Tax (GST)</span><span className="tabular-nums">{fmtMoney(totals.tax)}</span></div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Extra discount</span>
              <input
                type="number" min={0} value={extraDiscount || ""}
                onChange={(e) => setExtraDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-24 rounded border bg-transparent px-2 py-1 text-right text-sm tabular-nums"
                placeholder="₹"
              />
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span><span className="tabular-nums text-primary">{fmtMoney(totals.total)}</span>
            </div>
          </div>
        </div>

        {/* Payments */}
        <div className="rounded-lg border bg-card p-3 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold">Payment</h3>
          <div className="grid grid-cols-4 gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                onClick={() => setQuickPayment(m)}
                className={cn(
                  "rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                  payments.some((p) => p.method === m) ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50",
                )}
              >
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-2">
            {payments.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 text-xs font-medium">{PAYMENT_METHOD_LABELS[p.method]}</span>
                <Input
                  type="number" value={p.amount} min={0} step="0.01"
                  onChange={(e) => setPayments((ps) => ps.map((x, xi) => (xi === i ? { ...x, amount: Math.max(0, parseFloat(e.target.value) || 0) } : x)))}
                  className="h-8 flex-1 text-right tabular-nums"
                />
                <button onClick={() => setPayments((ps) => ps.filter((_, xi) => xi !== i))} className="text-muted-foreground hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          {/* quick cash amounts */}
          <div className="mt-2 flex flex-wrap gap-1">
            {[100, 200, 500, 1000, 2000].map((v) => (
              <button key={v} onClick={() => setQuickPayment("CASH", v)} className="rounded border px-2 py-0.5 text-xs hover:border-primary/50">
                ₹{v}
              </button>
            ))}
            <button onClick={() => setQuickPayment("CASH", Math.ceil(totals.total / 10) * 10)} className="rounded border px-2 py-0.5 text-xs hover:border-primary/50">
              Round up
            </button>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="tabular-nums font-medium">{fmtMoney(Math.min(totalPaid, totals.total))}</span></div>
            {due > 0.009 && (
              <div className="flex justify-between text-amber-600 dark:text-amber-400 font-semibold">
                <span>{customerId ? "Credit (udhaar)" : "Balance due"}</span><span className="tabular-nums">{fmtMoney(due)}</span>
              </div>
            )}
            {change > 0 && (
              <div className="flex justify-between text-emerald-600 font-semibold"><span>Change to return</span><span className="tabular-nums">{fmtMoney(change)}</span></div>
            )}
          </div>
        </div>

        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sale note (optional)" className="h-9" />

        <Button
          size="lg" className="h-12 w-full text-base font-semibold"
          disabled={!cart.length || saving}
          onClick={completeSale}
        >
          {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
          Complete Sale — {fmtMoney(totals.total)}
        </Button>
      </div>

      {/* Invoice preview after sale */}
      {lastSaleId && (
        <InvoiceDetail
          id={lastSaleId}
          onClose={() => { setLastSaleId(null); resetPos(); onComplete() }}
          autoPrint={false}
        />
      )}
    </div>
  )
}

// ============================================================
// INVOICES TAB
// ============================================================
function InvoicesTab() {
  const { moduleParams, setActiveModule } = useApp()
  const [detailId, setDetailId] = useState<string | null>((moduleParams?.entityId as string) ?? null)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (moduleParams?.entityId && (!moduleParams?.tab || moduleParams?.tab === "invoices")) setDetailId(moduleParams.entityId as string)
  }, [moduleParams?.entityId, moduleParams?.tab])

  const { data, isLoading } = useQuery({
    queryKey: ["sales", page, search, status],
    queryFn: () => api.get(`sales${qs({ page, pageSize: 50, q: search, status })}`),
  })
  const sales = data?.sales ?? []

  const columns: Column<any>[] = [
    { key: "invoiceNumber", header: "Invoice", render: (s) => <span className="font-semibold">{s.invoiceNumber}</span> },
    { key: "date", header: "Date", render: (s) => <DateCell value={s.date} /> },
    { key: "customer", header: "Customer", render: (s) => s.customer?.name ?? <span className="text-muted-foreground">Walk-in</span> },
    { key: "type", header: "Type", render: (s) => <Badge variant="outline" className="text-[10px]">{s.type === "WHOLESALE" ? "Wholesale" : "Retail"}</Badge> },
    { key: "items", header: "Items", align: "right", render: (s) => s.items?.reduce((a: number, i: any) => a + i.quantity, 0) ?? 0 },
    { key: "total", header: "Total", align: "right", render: (s) => <Money value={s.total} className="font-semibold" /> },
    { key: "paidAmount", header: "Paid", align: "right", render: (s) => <Money value={s.paidAmount} /> },
    { key: "dueAmount", header: "Due", align: "right", render: (s) => s.dueAmount > 0 ? <span className="font-semibold text-amber-600">{fmtMoney(s.dueAmount)}</span> : "—" },
    { key: "paymentStatus", header: "Status", render: (s) => <StatusBadge label={s.paymentStatus} className={SALE_PAYMENT_STATUS_COLORS[s.paymentStatus]} /> },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search invoice # or customer…" className="pl-8 h-9" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="h-9 rounded-md border bg-transparent px-2 text-sm">
          <option value="">All statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="VOID">Voided</option>
        </select>
        <Button variant="outline" size="sm" className="ml-auto h-9" onClick={() =>
          exportCSV("invoices", ["Invoice", "Date", "Customer", "Type", "Total", "Paid", "Due", "Status"],
            sales.map((s: any) => [s.invoiceNumber, fmtDateIST(s.date), s.customer?.name ?? "Walk-in", s.type, s.total, s.paidAmount, s.dueAmount, s.paymentStatus]))}>
          Export CSV
        </Button>
      </div>
      <DataTable
        columns={columns} rows={sales} loading={isLoading}
        onRowClick={(s) => setDetailId(s.id)}
        emptyTitle="No invoices yet"
        emptyDescription="Complete your first sale from the POS tab."
        emptyAction={<Button size="sm" onClick={() => setActiveModule("sales", { tab: "pos" })}><ShoppingCart className="mr-1.5 h-4 w-4" /> Start a Sale</Button>}
        rowClassName={(s) => (s.status === "VOID" ? "opacity-50" : s.dueAmount > 0 ? "bg-amber-500/5" : "")}
      />
      {data?.total > 50 && (
        <p className="text-xs text-muted-foreground">Showing latest 50 of {data.total} invoices — use search to narrow down</p>
      )}
      {detailId && <InvoiceDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

// ============================================================
// INVOICE DETAIL + PRINT + QR
// ============================================================
function InvoiceDetail({ id, onClose, autoPrint }: { id: string; onClose: () => void; autoPrint?: boolean }) {
  const qc = useQueryClient()
  const { setActiveModule } = useApp()
  const [voiding, setVoiding] = useState(false)
  const [voidReason, setVoidReason] = useState("")
  const [qrData, setQrData] = useState<any>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [printFormat, setPrintFormat] = useState<"A4" | "80" | "58">("A4")

  const { data, isLoading } = useQuery({ queryKey: ["sales", id], queryFn: () => api.get(`sales/${id}`) })
  const { data: businessData } = useQuery({ queryKey: ["business"], queryFn: () => api.get("business") })
  const sale = data?.sale
  const business = businessData?.business

  async function generateQr() {
    if (!sale) return
    setQrLoading(true)
    try {
      const res = await api.post("payments/qr", { amount: sale.dueAmount, saleId: sale.id, customerId: sale.customerId })
      setQrData(res.qr)
    } catch (e: any) {
      toast({ title: "QR failed", description: e.message, variant: "destructive" })
    } finally { setQrLoading(false) }
  }

  async function voidSale() {
    if (!sale) return
    try {
      await api.post(`sales/${sale.id}/void`, { reason: voidReason || "No reason provided" })
      toast({ title: "Invoice voided", description: "Stock restored, payments voided, ledger reversed" })
      qc.invalidateQueries({ queryKey: ["sales"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
      setVoiding(false)
      onClose()
    } catch (e: any) {
      toast({ title: "Void failed", description: e.message, variant: "destructive" })
    }
  }

  function printInvoice(format: "A4" | "80" | "58") {
    setPrintFormat(format)
    setTimeout(() => window.print(), 150)
  }

  return (
    <>
      <Sheet open onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl thin-scrollbar">
          <SheetHeader className="border-b bg-muted/40 px-5 py-4">
            <SheetTitle className="flex items-center justify-between">
              <span>{sale?.invoiceNumber ?? "Loading…"}</span>
              {sale && <StatusBadge label={sale.paymentStatus} className={SALE_PAYMENT_STATUS_COLORS[sale.paymentStatus]} />}
            </SheetTitle>
          </SheetHeader>
          {isLoading || !sale ? (
            <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4 p-5">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Total" value={fmtMoney(sale.total)} />
                <StatCard label="Paid" value={fmtMoney(sale.paidAmount)} tone="positive" />
                <StatCard label="Due" value={fmtMoney(sale.dueAmount)} tone={sale.dueAmount > 0 ? "warning" : "default"} />
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => printInvoice("A4")}><Printer className="mr-1.5 h-4 w-4" /> Print A4</Button>
                <Button size="sm" variant="outline" onClick={() => printInvoice("80")}>Print 80mm</Button>
                <Button size="sm" variant="outline" onClick={() => printInvoice("58")}>Print 58mm</Button>
                {sale.dueAmount > 0.009 && sale.status !== "VOID" && (
                  <Button size="sm" onClick={() => setActiveModule("payments", { tab: "receive", customerId: sale.customerId, saleId: sale.id })}>
                    <IndianRupee className="mr-1.5 h-4 w-4" /> Collect Payment
                  </Button>
                )}
                {sale.dueAmount > 0.009 && sale.status !== "VOID" && (
                  <Button size="sm" variant="outline" onClick={generateQr} disabled={qrLoading}>
                    <QrCode className="mr-1.5 h-4 w-4" /> {qrLoading ? "Generating…" : "UPI QR for Due"}
                  </Button>
                )}
                {sale.status !== "VOID" && canDo("sales", "void") && (
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => setVoiding(true)}>
                    <Ban className="mr-1.5 h-4 w-4" /> Void
                  </Button>
                )}
              </div>

              {/* QR panel */}
              {qrData && (
                <div className="rounded-lg border-2 border-dashed border-primary/40 p-4 text-center">
                  <p className="text-sm font-semibold">Pay {fmtMoney(qrData.amount)} via UPI</p>
                  <p className="text-xs text-muted-foreground">{qrData.code} · customer can scan with any UPI app</p>
                  {qrData.qrDataUrl && (
                    <img src={qrData.qrDataUrl} alt="UPI QR" className="mx-auto mt-3 h-48 w-48 rounded-lg border bg-white p-2" />
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    After the customer pays, verify the money arrived in your UPI app, then confirm in
                    <button className="mx-1 text-primary underline" onClick={() => setActiveModule("payments", { tab: "qr" })}>Payments → UPI/QR</button>.
                  </p>
                </div>
              )}

              {/* Info */}
              <div className="grid gap-1 rounded-lg border p-4 text-sm sm:grid-cols-2">
                <span className="text-muted-foreground">Date: <b className="text-foreground"><DateCell value={sale.date} withTime /></b></span>
                <span className="text-muted-foreground">Customer: <b className="text-foreground">{sale.customer?.name ?? "Walk-in"}</b></span>
                <span className="text-muted-foreground">Type: <b className="text-foreground">{sale.type === "WHOLESALE" ? "Wholesale" : "Retail"}</b></span>
                <span className="text-muted-foreground">Salesperson: <b className="text-foreground">{sale.salespersonName ?? "—"}</b></span>
                {sale.notes && <p className="sm:col-span-2 text-muted-foreground">Note: {sale.notes}</p>}
                {sale.voidedAt && <p className="sm:col-span-2 text-red-600">VOIDED on <DateCell value={sale.voidedAt} /> — {sale.voidReason}</p>}
              </div>

              {/* Items */}
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sale.items?.map((i: any) => (
                      <tr key={i.id} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium">{i.productName}</p>
                          <p className="text-xs text-muted-foreground">{i.variantLabel}{i.returnedQty > 0 && <span className="text-red-500"> · {i.returnedQty} returned</span>}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{i.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(i.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(i.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals + payments */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 rounded-lg border p-4 text-sm">
                  <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{fmtMoney(sale.subtotal)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Discounts</span><span className="tabular-nums">−{fmtMoney(sale.itemDiscount + sale.extraDiscount)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Tax</span><span className="tabular-nums">{fmtMoney(sale.taxAmount)}</span></div>
                  <Separator />
                  <div className="flex justify-between font-bold"><span>Total</span><span className="tabular-nums">{fmtMoney(sale.total)}</span></div>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Payments</p>
                  {sale.payments?.filter((p: any) => p.status !== "VOID").map((p: any) => (
                    <div key={p.id} className="flex justify-between py-1 text-sm">
                      <span>{PAYMENT_METHOD_LABELS[p.method]} · {p.number}</span>
                      <Money value={p.amount} className="font-medium" />
                    </div>
                  )) ?? null}
                  {sale.returns?.length > 0 && (
                    <div className="mt-2 border-t pt-2">
                      <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Returns</p>
                      {sale.returns.map((r: any) => (
                        <div key={r.id} className="flex justify-between py-1 text-sm">
                          <span>{r.number} · {RETURN_TYPE_LABELS[r.type]}</span>
                          <span className="text-red-600">−{fmtMoney(r.totalValue)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Hidden print area */}
      {sale && (
        <div id="print-area" className={`print-${printFormat}`} style={{ display: "none" }}>
          <InvoiceDocument sale={sale} business={business} format={printFormat} />
        </div>
      )}

      {/* Void dialog */}
      <Dialog open={voiding} onOpenChange={setVoiding}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Void invoice {sale?.invoiceNumber}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will reverse stock, void payments and reverse ledger entries. The invoice is preserved in history (non-destructive).
          </p>
          <Field label="Reason">
            <TextInput value={voidReason} onChange={setVoidReason} placeholder="e.g. billing mistake" />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoiding(false)}>Cancel</Button>
            <Button variant="destructive" onClick={voidSale}>Void Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================
// INVOICE PRINT DOCUMENT
// ============================================================
export function InvoiceDocument({ sale, business, format }: { sale: any; business?: any; format: "A4" | "80" | "58" }) {
  const thermal = format !== "A4"
  const width = format === "80" ? 300 : format === "58" ? 210 : 700
  if (thermal) {
    return (
      <div style={{ fontFamily: "monospace", fontSize: 11, width: "100%", color: "#000" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontWeight: 700, fontSize: 13 }}>{business?.brandName ?? business?.name ?? "Clothing Shop"}</p>
          {business?.address && <p style={{ fontSize: 10 }}>{business.address}</p>}
          {business?.phone && <p style={{ fontSize: 10 }}>Ph: {business.phone}</p>}
          {business?.gstin && <p style={{ fontSize: 10 }}>GSTIN: {business.gstin}</p>}
          <p style={{ fontSize: 10, marginTop: 4 }}>--------------------------------</p>
          <p style={{ fontWeight: 700 }}>{sale.invoiceNumber}</p>
          <p style={{ fontSize: 10 }}>{fmtDateIST(sale.date, "dd/MM/yyyy hh:mm a")}</p>
          <p style={{ fontSize: 10 }}>{sale.customer?.name ?? "Walk-in"}</p>
          <p style={{ fontSize: 10, marginTop: 4 }}>--------------------------------</p>
        </div>
        {sale.items?.map((i: any) => (
          <div key={i.id} style={{ fontSize: 10 }}>
            <p style={{ fontWeight: 600 }}>{i.productName} ({i.variantLabel})</p>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{i.quantity} × {i.unitPrice.toFixed(2)}</span>
              <span>{i.lineTotal.toFixed(2)}</span>
            </div>
          </div>
        ))}
        <p style={{ fontSize: 10, marginTop: 4 }}>--------------------------------</p>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>TOTAL</span><span>₹{sale.total.toFixed(2)}</span>
        </div>
        {sale.paidAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
            <span>PAID ({sale.payments?.filter((p: any) => p.status !== "VOID").map((p: any) => p.method).join(",")})</span>
            <span>₹{sale.paidAmount.toFixed(2)}</span>
          </div>
        )}
        {sale.dueAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700 }}>
            <span>DUE</span><span>₹{sale.dueAmount.toFixed(2)}</span>
          </div>
        )}
        <p style={{ textAlign: "center", fontSize: 10, marginTop: 6 }}>
          {business?.invoiceFooter ?? "Thank you! Visit again."}
        </p>
      </div>
    )
  }
  return (
    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: "#000", width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: 12, marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{business?.brandName ?? business?.name ?? "Clothing Shop"}</h1>
          {business?.address && <p style={{ margin: "4px 0 0", fontSize: 11 }}>{business.address}{business?.city ? `, ${business.city}` : ""}</p>}
          {business?.phone && <p style={{ margin: 0, fontSize: 11 }}>Phone: {business.phone}{business?.email ? ` · ${business.email}` : ""}</p>}
          {business?.gstin && <p style={{ margin: 0, fontSize: 11 }}>GSTIN: {business.gstin}</p>}
        </div>
        <div style={{ textAlign: "right" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: 1 }}>Tax Invoice</h2>
          <p style={{ margin: "6px 0 0", fontWeight: 700 }}>{sale.invoiceNumber}</p>
          <p style={{ margin: 0, fontSize: 11 }}>Date: {fmtDateIST(sale.date, "dd/MM/yyyy")}</p>
          <p style={{ margin: 0, fontSize: 11 }}>{sale.type === "WHOLESALE" ? "WHOLESALE" : "RETAIL"}</p>
        </div>
      </div>
      {/* Customer */}
      <div style={{ marginBottom: 12, fontSize: 11 }}>
        <p style={{ margin: 0, fontWeight: 700, textTransform: "uppercase", fontSize: 10, color: "#555" }}>Billed To</p>
        <p style={{ margin: "2px 0 0", fontWeight: 700, fontSize: 13 }}>{sale.customer?.name ?? "Walk-in Customer"}</p>
        {sale.customer?.address && <p style={{ margin: 0 }}>{sale.customer.address}</p>}
        {sale.customer?.phone && <p style={{ margin: 0 }}>Ph: {sale.customer.phone}</p>}
      </div>
      {/* Items */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: "#f0f0f0" }}>
            <th style={{ border: "1px solid #999", padding: "5px 6px", textAlign: "left" }}>#</th>
            <th style={{ border: "1px solid #999", padding: "5px 6px", textAlign: "left" }}>Item (Size / Color)</th>
            <th style={{ border: "1px solid #999", padding: "5px 6px", textAlign: "right" }}>Qty</th>
            <th style={{ border: "1px solid #999", padding: "5px 6px", textAlign: "right" }}>Price</th>
            <th style={{ border: "1px solid #999", padding: "5px 6px", textAlign: "right" }}>Disc</th>
            <th style={{ border: "1px solid #999", padding: "5px 6px", textAlign: "right" }}>Tax</th>
            <th style={{ border: "1px solid #999", padding: "5px 6px", textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((i: any, idx: number) => (
            <tr key={i.id}>
              <td style={{ border: "1px solid #999", padding: "4px 6px" }}>{idx + 1}</td>
              <td style={{ border: "1px solid #999", padding: "4px 6px" }}>
                <b>{i.productName}</b>
                <span style={{ color: "#555" }}> — {i.variantLabel}</span>
                {i.returnedQty > 0 && <span style={{ color: "#c00" }}> ({i.returnedQty} returned)</span>}
              </td>
              <td style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "right" }}>{i.quantity}</td>
              <td style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "right" }}>{i.unitPrice.toFixed(2)}</td>
              <td style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "right" }}>{i.discount ? i.discount.toFixed(2) : "—"}</td>
              <td style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "right" }}>{i.taxAmount ? i.taxAmount.toFixed(2) : "—"}</td>
              <td style={{ border: "1px solid #999", padding: "4px 6px", textAlign: "right", fontWeight: 600 }}>{i.lineTotal.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <table style={{ fontSize: 11, minWidth: 260 }}>
          <tbody>
            <tr><td style={{ padding: "2px 6px", textAlign: "right" }}>Subtotal</td><td style={{ padding: "2px 6px", textAlign: "right" }}>{sale.subtotal.toFixed(2)}</td></tr>
            {(sale.itemDiscount + sale.extraDiscount) > 0 && (
              <tr><td style={{ padding: "2px 6px", textAlign: "right" }}>Discount</td><td style={{ padding: "2px 6px", textAlign: "right" }}>−{(sale.itemDiscount + sale.extraDiscount).toFixed(2)}</td></tr>
            )}
            {sale.taxAmount > 0 && (
              <tr><td style={{ padding: "2px 6px", textAlign: "right" }}>GST</td><td style={{ padding: "2px 6px", textAlign: "right" }}>{sale.taxAmount.toFixed(2)}</td></tr>
            )}
            <tr style={{ borderTop: "1.5px solid #000" }}>
              <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 800, fontSize: 13 }}>TOTAL</td>
              <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 800, fontSize: 13 }}>₹ {sale.total.toFixed(2)}</td>
            </tr>
            <tr><td style={{ padding: "2px 6px", textAlign: "right" }}>Paid</td><td style={{ padding: "2px 6px", textAlign: "right" }}>{sale.paidAmount.toFixed(2)}</td></tr>
            {sale.dueAmount > 0 && (
              <tr><td style={{ padding: "2px 6px", textAlign: "right", fontWeight: 700 }}>Balance Due</td><td style={{ padding: "2px 6px", textAlign: "right", fontWeight: 700 }}>₹ {sale.dueAmount.toFixed(2)}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Payment mode */}
      <p style={{ fontSize: 10, marginTop: 8 }}>
        <b>Payment:</b>{" "}
        {sale.payments?.filter((p: any) => p.status !== "VOID").map((p: any) => `${p.method} ₹${p.amount.toFixed(0)}`).join(" · ") || "CREDIT"}
        {" "}| <b>Status:</b> {sale.paymentStatus}
      </p>
      {/* Terms + footer */}
      <div style={{ marginTop: 16, fontSize: 10, color: "#444" }}>
        {business?.invoiceTerms && <p style={{ margin: 0 }}><b>Terms:</b> {business.invoiceTerms}</p>}
        <p style={{ textAlign: "center", marginTop: 14, fontWeight: 600, borderTop: "1px solid #999", paddingTop: 8 }}>
          {business?.invoiceFooter ?? "Thank you for your business!"}
        </p>
      </div>
    </div>
  )
}

// ============================================================
// ORDERS TAB
// ============================================================
function OrdersTab() {
  const { moduleParams, setActiveModule } = useApp()
  const qc = useQueryClient()
  const [detailId, setDetailId] = useState<string | null>((moduleParams?.entityId as string) ?? null)
  const [creating, setCreating] = useState(!!moduleParams?.new)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (moduleParams?.entityId && moduleParams?.tab === "orders") setDetailId(moduleParams.entityId as string)
  }, [moduleParams?.entityId, moduleParams?.tab])

  const { data, isLoading } = useQuery({
    queryKey: ["orders", search, status],
    queryFn: () => api.get(`orders${qs({ q: search, status, pageSize: 100 })}`),
  })
  const orders = data?.orders ?? []

  const columns: Column<any>[] = [
    { key: "number", header: "Order", render: (o) => <span className="font-semibold">{o.number}</span> },
    { key: "orderDate", header: "Date", render: (o) => <DateCell value={o.orderDate} /> },
    { key: "customer", header: "Customer", render: (o) => o.customer?.name ?? "—" },
    { key: "items", header: "Items", align: "right", render: (o) => o.items?.length ?? 0 },
    { key: "total", header: "Total", align: "right", render: (o) => <Money value={o.total} className="font-semibold" /> },
    { key: "deliveryStatus", header: "Delivery", render: (o) => <Badge variant="outline" className="text-[10px]">{DELIVERY_STATUS_LABELS[o.deliveryStatus] ?? o.deliveryStatus}</Badge> },
    { key: "status", header: "Status", render: (o) => <StatusBadge label={ORDER_STATUS_LABELS[o.status] ?? o.status} className={ORDER_STATUS_COLORS[o.status]} /> },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order # or customer…" className="pl-8 h-9" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm">
          <option value="">All statuses</option>
          {["CONFIRMED", "PROCESSING", "PACKED", "READY", "DISPATCHED", "DELIVERED", "CANCELLED"].map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
          ))}
        </select>
        {canDo("orders", "create") && (
          <Button size="sm" className="ml-auto h-9" onClick={() => setCreating(true)}>
            <ClipboardList className="mr-1.5 h-4 w-4" /> New Order
          </Button>
        )}
      </div>

      <DataTable
        columns={columns} rows={orders} loading={isLoading}
        onRowClick={(o) => setDetailId(o.id)}
        emptyTitle="No orders yet"
        emptyDescription="Create customer orders (with delivery tracking) — convert them to invoices when fulfilled."
        emptyAction={canDo("orders", "create") ? <Button size="sm" onClick={() => setCreating(true)}><ClipboardList className="mr-1.5 h-4 w-4" /> New Order</Button> : undefined}
        rowClassName={(o) => (o.status === "CANCELLED" ? "opacity-50" : "")}
      />

      {creating && <OrderForm onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setDetailId(id) }} />}
      {detailId && <OrderDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

function OrderForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [customerId, setCustomerId] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [discountAmount, setDiscountAmount] = useState(0)
  const [deliveryDate, setDeliveryDate] = useState("")
  const [deliveryAddress, setAddress] = useState("")
  const [courier, setCourier] = useState("")
  const [notes, setNotes] = useState("")
  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState(false)

  const { data: customersData } = useQuery({ queryKey: ["customers"], queryFn: () => api.get("customers?pageSize=200") })
  const { data: productsData } = useQuery({
    queryKey: ["order-products", search],
    queryFn: () => api.get(`products?pageSize=15&q=${encodeURIComponent(search)}&status=ACTIVE`),
    enabled: search.length > 0,
  })

  const variantRows = useMemo(() => {
    const rows: any[] = []
    for (const p of productsData?.products ?? []) for (const v of p.variants ?? []) {
      rows.push({
        variantId: v.id, name: p.name, label: [v.color?.name, v.size?.name].filter(Boolean).join(" / "),
        price: v.sellingPrice || p.sellingPrice,
      })
    }
    return rows
  }, [productsData])

  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  async function submit() {
    if (!customerId) return toast({ title: "Select a customer", variant: "destructive" })
    if (!items.length) return toast({ title: "Add at least one item", variant: "destructive" })
    setSaving(true)
    try {
      const res = await api.post("orders", {
        customerId, items, discountAmount,
        deliveryDate: deliveryDate || undefined, deliveryAddress: deliveryAddress || undefined,
        courier: courier || undefined, notes: notes || undefined,
      })
      toast({ title: `Order ${res.order.number} created` })
      onCreated(res.order.id)
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto thin-scrollbar">
        <DialogHeader><DialogTitle>New Customer Order</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Customer" required>
              <EntityPicker entities={customersData?.customers ?? []} value={customerId} onChange={(id) => {
                setCustomerId(id)
                const c = customersData?.customers?.find((x: any) => x.id === id)
                if (c?.address) setAddress(c.address)
              }} placeholder="Search customer…" getLabel={(c) => `${c.name} (${c.phone ?? "no phone"})`} />
            </Field>
          </div>
        </div>

        {/* item search */}
        <Field label="Add items">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="pl-8 h-9" />
          </div>
        </Field>
        {search && (
          <div className="max-h-40 overflow-y-auto rounded-md border thin-scrollbar">
            {variantRows.map((r) => (
              <button key={r.variantId} onClick={() => {
                setItems((its) => {
                  const ex = its.find((i) => i.variantId === r.variantId)
                  if (ex) return its.map((i) => i.variantId === r.variantId ? { ...i, quantity: i.quantity + 1 } : i)
                  return [...its, { variantId: r.variantId, quantity: 1, unitPrice: r.price }]
                })
                setSearch("")
              }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent">
                <span>{r.name} <span className="text-muted-foreground">— {r.label}</span></span>
                <span className="font-medium">{fmtMoney(r.price)}</span>
              </button>
            ))}
          </div>
        )}

        {/* items list */}
        {items.length > 0 && (
          <div className="rounded-md border">
            {items.map((i, idx) => (
              <div key={i.variantId} className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-0">
                <span className="flex-1">Item {idx + 1} · {fmtMoney(i.unitPrice)}</span>
                <Input type="number" value={i.quantity} min={1} onChange={(e) => setItems((its) => its.map((x) => x.variantId === i.variantId ? { ...x, quantity: Math.max(1, parseInt(e.target.value) || 1) } : x))} className="h-7 w-16 text-center" />
                <span className="w-20 text-right font-medium">{fmtMoney(i.unitPrice * i.quantity)}</span>
                <button onClick={() => setItems((its) => its.filter((x) => x.variantId !== i.variantId))} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2 text-sm font-semibold">
              <span>Subtotal</span><span>{fmtMoney(subtotal)}</span>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Discount (₹)"><NumberInput value={discountAmount} onChange={setDiscountAmount} min={0} /></Field>
          <Field label="Delivery date"><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" /></Field>
          <div className="sm:col-span-2"><Field label="Delivery address"><TextInput value={deliveryAddress} onChange={setAddress} placeholder="Customer address for delivery" /></Field></div>
          <Field label="Courier (optional)"><TextInput value={courier} onChange={setCourier} placeholder="e.g. Delhivery" /></Field>
          <div className="sm:col-span-2"><Field label="Notes"><TextArea value={notes} onChange={setNotes} rows={2} /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !customerId || !items.length}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { setActiveModule } = useApp()
  const [invoicing, setInvoicing] = useState(false)
  const [invoicePayments, setInvoicePayments] = useState<{ method: string; amount: number }[]>([])
  const [busy, setBusy] = useState(false)

  const { data } = useQuery({ queryKey: ["orders", id], queryFn: () => api.get(`orders/${id}`) })
  const order = data?.order
  const total = order?.total ?? 0

  async function update(patch: any) {
    setBusy(true)
    try {
      await api.put(`orders/${id}`, patch)
      qc.invalidateQueries({ queryKey: ["orders"] })
      toast({ title: "Order updated" })
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }) }
    finally { setBusy(false) }
  }

  async function createInvoice() {
    setBusy(true)
    try {
      const res = await api.post(`orders/${id}/invoice`, { payments: invoicePayments.filter((p) => p.amount > 0) })
      toast({ title: `Invoice ${res.sale.invoiceNumber} created`, description: "Stock deducted, order marked delivered" })
      qc.invalidateQueries({ queryKey: ["sales"] })
      qc.invalidateQueries({ queryKey: ["orders"] })
      setInvoicing(false)
      setActiveModule("sales", { tab: "invoices", entityId: res.sale.id })
      onClose()
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }) }
    finally { setBusy(false) }
  }

  const nextStatuses: Record<string, string[]> = {
    DRAFT: ["CONFIRMED"], CONFIRMED: ["PROCESSING", "CANCELLED"], PROCESSING: ["PACKED", "CANCELLED"],
    PACKED: ["READY", "DISPATCHED", "CANCELLED"], READY: ["DISPATCHED", "CANCELLED"],
    DISPATCHED: ["DELIVERED", "RETURNED"],
  }

  return (
    <>
      <Sheet open onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl thin-scrollbar">
          <SheetHeader className="border-b bg-muted/40 px-5 py-4">
            <SheetTitle className="flex items-center justify-between">
              <span>{order?.number ?? "Loading…"}</span>
              {order && <StatusBadge label={ORDER_STATUS_LABELS[order.status]} className={ORDER_STATUS_COLORS[order.status]} />}
            </SheetTitle>
          </SheetHeader>
          {order ? (
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Order Total" value={fmtMoney(order.total)} />
                <StatCard label="Items" value={order.items?.length ?? 0} />
              </div>

              {/* status flow */}
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {(nextStatuses[order.status] ?? []).map((s) => (
                    <Button key={s} size="sm" variant={s === "CANCELLED" ? "destructive" : "default"} className="h-7 text-xs"
                      disabled={busy} onClick={() => update({ status: s })}>
                      {s === "CANCELLED" ? "Cancel Order" : `Mark ${ORDER_STATUS_LABELS[s]}`}
                    </Button>
                  ))}
                  {!order.saleId && order.status !== "CANCELLED" && canDo("sales", "create") && (
                    <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => { setInvoicePayments([{ method: "CASH", amount: total }]); setInvoicing(true) }}>
                      Convert to Invoice
                    </Button>
                  )}
                  {order.saleId && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setActiveModule("sales", { tab: "invoices", entityId: order.saleId }); onClose() }}>
                      View Invoice
                    </Button>
                  )}
                </div>
              </div>

              {/* info */}
              <div className="grid gap-1 rounded-lg border p-4 text-sm sm:grid-cols-2">
                <span className="text-muted-foreground">Customer: <b className="text-foreground">{order.customer?.name}</b></span>
                <span className="text-muted-foreground">Ordered: <b className="text-foreground"><DateCell value={order.orderDate} /></b></span>
                {order.deliveryDate && <span className="text-muted-foreground">Delivery by: <b className="text-foreground"><DateCell value={order.deliveryDate} /></b></span>}
                {order.courier && <span className="text-muted-foreground">Courier: <b className="text-foreground">{order.courier} {order.trackingNumber ? `(${order.trackingNumber})` : ""}</b></span>}
                {order.deliveryAddress && <span className="sm:col-span-2 text-muted-foreground">Address: {order.deliveryAddress}</span>}
                {order.notes && <p className="sm:col-span-2 text-muted-foreground">Notes: {order.notes}</p>}
              </div>

              {/* delivery editor */}
              {order.status !== "CANCELLED" && canDo("orders", "edit") && <DeliveryEditor order={order} onSaved={() => qc.invalidateQueries({ queryKey: ["orders", id] })} />}

              {/* items */}
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items?.map((i: any) => (
                      <tr key={i.id} className="border-b last:border-0">
                        <td className="px-3 py-2"><b>{i.productName}</b><p className="text-xs text-muted-foreground">{i.variantLabel}</p></td>
                        <td className="px-3 py-2 text-right tabular-nums">{i.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(i.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(i.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        </SheetContent>
      </Sheet>

      {/* Convert to invoice dialog */}
      <Dialog open={invoicing} onOpenChange={setInvoicing}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Invoice from {order?.number}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Stock will be deducted and the order marked delivered. Choose payment received now:
          </p>
          <div className="space-y-2">
            {invoicePayments.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 text-xs font-medium">{PAYMENT_METHOD_LABELS[p.method]}</span>
                <Input type="number" value={p.amount} onChange={(e) => setInvoicePayments((ps) => ps.map((x, xi) => xi === i ? { ...x, amount: Math.max(0, parseFloat(e.target.value) || 0) } : x))} className="h-8 flex-1 text-right" />
              </div>
            ))}
            <div className="flex gap-1.5">
              {PAYMENT_METHODS.filter((m) => !invoicePayments.some((p) => p.method === m)).map((m) => (
                <button key={m} onClick={() => setInvoicePayments((ps) => [...ps, { method: m, amount: 0 }])} className="rounded border px-2 py-1 text-xs hover:border-primary/50">
                  + {PAYMENT_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Leave amounts at 0 for full credit sale (customer owes {fmtMoney(total)}).</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoicing(false)}>Cancel</Button>
            <Button onClick={createInvoice} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DeliveryEditor({ order, onSaved }: { order: any; onSaved: () => void }) {
  const [courier, setCourier] = useState(order.courier ?? "")
  const [trackingNumber, setTracking] = useState(order.trackingNumber ?? "")
  const [deliveryStatus, setDeliveryStatus] = useState(order.deliveryStatus)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.put(`orders/${order.id}`, { courier, trackingNumber, deliveryStatus })
      onSaved()
      toast({ title: "Delivery details saved" })
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }) }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Delivery / Dispatch</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <TextInput value={courier} onChange={setCourier} placeholder="Courier" />
        <TextInput value={trackingNumber} onChange={setTracking} placeholder="Tracking number" />
        <select value={deliveryStatus} onChange={(e) => setDeliveryStatus(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm">
          {["PENDING", "PACKED", "DISPATCHED", "IN_TRANSIT", "DELIVERED", "FAILED", "RETURNED"].map((s) => (
            <option key={s} value={s}>{DELIVERY_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>
      <Button size="sm" className="mt-2 h-8" onClick={save} disabled={saving}>Save Delivery Info</Button>
    </div>
  )
}

// ============================================================
// QUOTATIONS TAB
// ============================================================
function QuotationsTab() {
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState("")
  const [detailId, setDetailId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["quotations", search],
    queryFn: () => api.get(`quotations${qs({ q: search, pageSize: 100 })}`),
  })
  const quotations = data?.quotations ?? []

  async function convert(id: string) {
    try {
      const res = await api.post(`quotations/${id}/convert`)
      toast({ title: `Order ${res.order.number} created`, description: "Quotation converted" })
      qc.invalidateQueries({ queryKey: ["quotations"] })
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }) }
  }

  const columns: Column<any>[] = [
    { key: "number", header: "Quotation", render: (q) => <span className="font-semibold">{q.number}</span> },
    { key: "date", header: "Date", render: (q) => <DateCell value={q.date} /> },
    { key: "customer", header: "Customer", render: (q) => q.customer?.name ?? "—" },
    { key: "items", header: "Items", align: "right", render: (q) => q.items?.length ?? 0 },
    { key: "total", header: "Total", align: "right", render: (q) => <Money value={q.total} className="font-semibold" /> },
    { key: "validUntil", header: "Valid Until", render: (q) => q.validUntil ? <DateCell value={q.validUntil} /> : "—" },
    { key: "status", header: "Status", render: (q) => <StatusBadge label={QUOTATION_STATUS_LABELS[q.status]} className={QUOTATION_STATUS_COLORS[q.status]} /> },
    {
      key: "actions", header: "", align: "right", render: (q) => (
        q.status !== "CONVERTED" && q.status !== "REJECTED" ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); convert(q.id) }}>
            <ArrowRightLeft className="mr-1 h-3 w-3" /> To Order
          </Button>
        ) : null
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search quotation # or customer…" className="pl-8 h-9" />
        </div>
        {canDo("orders", "create") && (
          <Button size="sm" className="ml-auto h-9" onClick={() => setCreating(true)}>
            <FileText className="mr-1.5 h-4 w-4" /> New Quotation
          </Button>
        )}
      </div>
      <DataTable
        columns={columns} rows={quotations} loading={isLoading}
        onRowClick={(q) => setDetailId(q.id)}
        emptyTitle="No quotations yet"
        emptyDescription="Create price quotations for customers — convert to orders when accepted."
        emptyAction={canDo("orders", "create") ? <Button size="sm" onClick={() => setCreating(true)}><FileText className="mr-1.5 h-4 w-4" /> New Quotation</Button> : undefined}
      />
      {creating && <QuotationForm onClose={() => setCreating(false)} />}
      {detailId && <QuotationDetail id={detailId} onClose={() => setDetailId(null)} onConvert={convert} />}
    </div>
  )
}

function QuotationForm({ onClose }: { onClose: () => void }) {
  const [customerId, setCustomerId] = useState("")
  const [items, setItems] = useState<any[]>([])
  const [discountAmount, setDiscountAmount] = useState(0)
  const [validUntil, setValidUntil] = useState("")
  const [notes, setNotes] = useState("")
  const [search, setSearch] = useState("")
  const [saving, setSaving] = useState(false)

  const { data: customersData } = useQuery({ queryKey: ["customers"], queryFn: () => api.get("customers?pageSize=200") })
  const { data: productsData } = useQuery({
    queryKey: ["quote-products", search],
    queryFn: () => api.get(`products?pageSize=15&q=${encodeURIComponent(search)}&status=ACTIVE`),
    enabled: search.length > 0,
  })
  const variantRows = useMemo(() => {
    const rows: any[] = []
    for (const p of productsData?.products ?? []) for (const v of p.variants ?? []) {
      rows.push({ variantId: v.id, name: p.name, label: [v.color?.name, v.size?.name].filter(Boolean).join(" / "), price: v.sellingPrice || p.sellingPrice })
    }
    return rows
  }, [productsData])
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  async function submit() {
    if (!customerId) return toast({ title: "Select a customer", variant: "destructive" })
    if (!items.length) return toast({ title: "Add at least one item", variant: "destructive" })
    setSaving(true)
    try {
      const res = await api.post("quotations", { customerId, items, discountAmount, validUntil: validUntil || undefined, notes: notes || undefined })
      toast({ title: `Quotation ${res.quotation.number} created` })
      onClose()
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto thin-scrollbar">
        <DialogHeader><DialogTitle>New Quotation</DialogTitle></DialogHeader>
        <Field label="Customer" required>
          <EntityPicker entities={customersData?.customers ?? []} value={customerId} onChange={setCustomerId} placeholder="Search customer…" getLabel={(c) => c.name} />
        </Field>
        <Field label="Add items">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="pl-8 h-9" />
          </div>
        </Field>
        {search && (
          <div className="max-h-40 overflow-y-auto rounded-md border thin-scrollbar">
            {variantRows.map((r) => (
              <button key={r.variantId} onClick={() => {
                setItems((its) => {
                  const ex = its.find((i) => i.variantId === r.variantId)
                  if (ex) return its.map((i) => i.variantId === r.variantId ? { ...i, quantity: i.quantity + 1 } : i)
                  return [...its, { variantId: r.variantId, quantity: 1, unitPrice: r.price }]
                })
                setSearch("")
              }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent">
                <span>{r.name} <span className="text-muted-foreground">— {r.label}</span></span>
                <span className="font-medium">{fmtMoney(r.price)}</span>
              </button>
            ))}
          </div>
        )}
        {items.length > 0 && (
          <div className="rounded-md border">
            {items.map((i) => (
              <div key={i.variantId} className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-0">
                <span className="flex-1">{fmtMoney(i.unitPrice)} each</span>
                <Input type="number" value={i.quantity} min={1} onChange={(e) => setItems((its) => its.map((x) => x.variantId === i.variantId ? { ...x, quantity: Math.max(1, parseInt(e.target.value) || 1) } : x))} className="h-7 w-16 text-center" />
                <span className="w-20 text-right font-medium">{fmtMoney(i.unitPrice * i.quantity)}</span>
                <button onClick={() => setItems((its) => its.filter((x) => x.variantId !== i.variantId))} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2 text-sm font-semibold"><span>Subtotal</span><span>{fmtMoney(subtotal)}</span></div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Discount (₹)"><NumberInput value={discountAmount} onChange={setDiscountAmount} min={0} /></Field>
          <Field label="Valid until"><input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" /></Field>
          <div className="sm:col-span-2"><Field label="Notes"><TextArea value={notes} onChange={setNotes} rows={2} /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !customerId || !items.length}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Quotation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function QuotationDetail({ id, onClose, onConvert }: { id: string; onClose: () => void; onConvert: (id: string) => void }) {
  const { data } = useQuery({ queryKey: ["quotations", id], queryFn: () => api.get(`quotations/${id}`) })
  const q = data?.quotation
  const qc = useQueryClient()

  async function setStatus(status: string) {
    try {
      await api.put(`quotations/${id}`, { status })
      qc.invalidateQueries({ queryKey: ["quotations"] })
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }) }
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg thin-scrollbar">
        <SheetHeader className="border-b bg-muted/40 px-5 py-4">
          <SheetTitle className="flex items-center justify-between">
            <span>{q?.number ?? "Loading…"}</span>
            {q && <StatusBadge label={QUOTATION_STATUS_LABELS[q.status]} className={QUOTATION_STATUS_COLORS[q.status]} />}
          </SheetTitle>
        </SheetHeader>
        {q ? (
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Total" value={fmtMoney(q.total)} />
              <StatCard label="Items" value={q.items?.length ?? 0} />
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p><b>{q.customer?.name}</b></p>
              <p className="text-muted-foreground">Quoted <DateCell value={q.date} />{q.validUntil ? <> · valid until <DateCell value={q.validUntil} /></> : null}</p>
            </div>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Total</th>
                </tr></thead>
                <tbody>
                  {q.items?.map((i: any) => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="px-3 py-2"><b>{i.productName}</b><p className="text-xs text-muted-foreground">{i.variantLabel}</p></td>
                      <td className="px-3 py-2 text-right tabular-nums">{i.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(i.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {q.notes && <p className="rounded bg-muted p-2 text-xs">{q.notes}</p>}
            {q.status !== "CONVERTED" && q.status !== "REJECTED" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onConvert(id)}><ArrowRightLeft className="mr-1.5 h-4 w-4" /> Convert to Order</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus("ACCEPTED")}>Mark Accepted</Button>
                <Button size="sm" variant="outline" className="text-red-600" onClick={() => setStatus("REJECTED")}>Reject</Button>
              </div>
            )}
            {q.convertedOrderId && <p className="text-xs text-muted-foreground">✓ Converted to order</p>}
          </div>
        ) : <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin" /></div>}
      </SheetContent>
    </Sheet>
  )
}

// ============================================================
// RETURNS TAB
// ============================================================
function ReturnsTab() {
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState("")
  const [type, setType] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["returns", search, type],
    queryFn: () => api.get(`returns${qs({ q: search, type, pageSize: 100 })}`),
  })
  const returns = data?.returns ?? []

  const columns: Column<any>[] = [
    { key: "number", header: "Return #", render: (r) => <span className="font-semibold">{r.number}</span> },
    { key: "createdAt", header: "Date", render: (r) => <DateCell value={r.createdAt} /> },
    { key: "type", header: "Type", render: (r) => <StatusBadge label={RETURN_TYPE_LABELS[r.type]} className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" /> },
    { key: "customer", header: "Customer", render: (r) => r.customer?.name ?? "—" },
    { key: "sale", header: "Invoice", render: (r) => r.sale?.invoiceNumber ?? "—" },
    { key: "totalValue", header: "Returned Value", align: "right", render: (r) => <Money value={r.totalValue} /> },
    { key: "refundAmount", header: "Refund", align: "right", render: (r) => r.refundAmount > 0 ? <span className="text-red-600 font-medium">−{fmtMoney(r.refundAmount)}</span> : "—" },
    { key: "exchangeDue", header: "Exch. Due", align: "right", render: (r) => r.exchangeDue > 0 ? <span className="text-amber-600 font-medium">{fmtMoney(r.exchangeDue)}</span> : "—" },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search return # or customer…" className="pl-8 h-9" />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm">
          <option value="">All types</option>
          <option value="CUSTOMER_RETURN">Returns</option>
          <option value="EXCHANGE">Exchanges</option>
        </select>
        {canDo("sales", "create") && (
          <Button size="sm" className="ml-auto h-9" onClick={() => setCreating(true)}>
            <RotateCcw className="mr-1.5 h-4 w-4" /> New Return / Exchange
          </Button>
        )}
      </div>
      <DataTable
        columns={columns} rows={returns} loading={isLoading}
        emptyTitle="No returns yet"
        emptyDescription="Process customer returns and exchanges — stock and ledgers update automatically."
        emptyAction={canDo("sales", "create") ? <Button size="sm" onClick={() => setCreating(true)}><RotateCcw className="mr-1.5 h-4 w-4" /> New Return / Exchange</Button> : undefined}
      />
      {creating && <ReturnForm onClose={() => setCreating(false)} />}
    </div>
  )
}

function ReturnForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { setActiveModule } = useApp()
  const [saleId, setSaleId] = useState("")
  const [type, setType] = useState<"CUSTOMER_RETURN" | "EXCHANGE">("CUSTOMER_RETURN")
  const [returnItems, setReturnItems] = useState<Record<string, number>>({}) // saleItemId -> qty
  const [exchangeSearch, setExchangeSearch] = useState("")
  const [exchangeItems, setExchangeItems] = useState<any[]>([])
  const [refundMethod, setRefundMethod] = useState("STORE_CREDIT")
  const [exchangePaidAmount, setExchangePaidAmount] = useState(0)
  const [exchangePaidMethod, setExchangePaidMethod] = useState("CASH")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [invoiceSearch, setInvoiceSearch] = useState("")

  // invoice picker
  const { data: salesData } = useQuery({
    queryKey: ["return-sales", invoiceSearch],
    queryFn: () => api.get(`sales${qs({ q: invoiceSearch, status: "COMPLETED", pageSize: 20 })}`),
  })
  const { data: saleData } = useQuery({
    queryKey: ["return-sale", saleId],
    queryFn: () => api.get(`sales/${saleId}`),
    enabled: !!saleId,
  })
  const sale = saleData?.sale

  // exchange product search
  const { data: exProducts } = useQuery({
    queryKey: ["ex-products", exchangeSearch],
    queryFn: () => api.get(`products?pageSize=10&q=${encodeURIComponent(exchangeSearch)}&status=ACTIVE`),
    enabled: type === "EXCHANGE" && exchangeSearch.length > 0,
  })
  const exVariants = useMemo(() => {
    const rows: any[] = []
    for (const p of exProducts?.products ?? []) for (const v of p.variants ?? []) {
      rows.push({ variantId: v.id, name: p.name, label: [v.color?.name, v.size?.name].filter(Boolean).join(" / "), price: v.sellingPrice || p.sellingPrice })
    }
    return rows
  }, [exProducts])

  const returnTotal = useMemo(() => {
    if (!sale) return 0
    let sum = 0
    for (const [itemId, qty] of Object.entries(returnItems)) {
      const item = sale.items?.find((i: any) => i.id === itemId)
      if (item) sum += (item.lineTotal / item.quantity) * qty
    }
    return sum
  }, [sale, returnItems])

  const exchangeTotal = exchangeItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const difference = exchangeTotal - returnTotal

  async function submit() {
    const items = Object.entries(returnItems).filter(([, q]) => q > 0).map(([saleItemId, quantity]) => ({ saleItemId, quantity }))
    if (!items.length) return toast({ title: "Select at least one item to return", variant: "destructive" })
    if (type === "EXCHANGE" && !exchangeItems.length) return toast({ title: "Exchange needs new items", variant: "destructive" })
    setSaving(true)
    try {
      const res = await api.post("returns", {
        type, saleId: saleId || undefined, customerId: sale?.customerId ?? undefined,
        items, exchangeItems: type === "EXCHANGE" ? exchangeItems : [],
        refundMethod: difference < 0 ? refundMethod : "NONE",
        exchangePaidAmount: difference > 0 ? exchangePaidAmount : 0,
        exchangePaidMethod,
        notes: notes || undefined,
      })
      toast({ title: `Return ${res.return.number} processed`, description: "Stock updated, ledger adjusted" })
      qc.invalidateQueries({ queryKey: ["returns"] })
      qc.invalidateQueries({ queryKey: ["sales"] })
      onClose()
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto thin-scrollbar">
        <DialogHeader><DialogTitle>New Return / Exchange</DialogTitle></DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Invoice (optional — for walk-in without invoice skip)" required={false}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} placeholder="Search invoice #…" className="pl-8 h-9" />
              </div>
            </Field>
            <div className="mt-1 max-h-32 overflow-y-auto rounded-md border thin-scrollbar">
              {(salesData?.sales ?? []).map((s: any) => (
                <button key={s.id} onClick={() => { setSaleId(s.id); setReturnItems({}) }}
                  className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent", saleId === s.id && "bg-accent")}>
                  <span>{s.invoiceNumber} · {s.customer?.name ?? "Walk-in"} · <DateCell value={s.date} /></span>
                  <span className="font-medium">{fmtMoney(s.total)}</span>
                </button>
              ))}
            </div>
          </div>

          <Field label="Type">
            <SelectInput value={type} onChange={(v) => setType(v as any)} options={[
              { value: "CUSTOMER_RETURN", label: "Return (refund/credit)" },
              { value: "EXCHANGE", label: "Exchange (swap items)" },
            ]} />
          </Field>
        </div>

        {/* return items from invoice */}
        {sale && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Items to return (from {sale.invoiceNumber})</p>
            <div className="rounded-md border">
              {sale.items?.map((i: any) => {
                const returnable = i.quantity - i.returnedQty
                if (returnable <= 0) return null
                return (
                  <div key={i.id} className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.productName}</p>
                      <p className="text-xs text-muted-foreground">{i.variantLabel} · returnable: {returnable}</p>
                    </div>
                    <Input
                      type="number" min={0} max={returnable} value={returnItems[i.id] ?? ""}
                      onChange={(e) => setReturnItems((r) => ({ ...r, [i.id]: Math.min(returnable, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      className="h-8 w-16 text-center" placeholder="0"
                    />
                  </div>
                )
              })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Return value: <b>{fmtMoney(returnTotal)}</b></p>
          </div>
        )}

        {/* exchange items */}
        {type === "EXCHANGE" && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">New items to give</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={exchangeSearch} onChange={(e) => setExchangeSearch(e.target.value)} placeholder="Search products…" className="pl-8 h-9" />
            </div>
            {exchangeSearch && (
              <div className="mt-1 max-h-32 overflow-y-auto rounded-md border thin-scrollbar">
                {exVariants.map((r) => (
                  <button key={r.variantId} onClick={() => {
                    setExchangeItems((its) => {
                      const ex = its.find((i) => i.variantId === r.variantId)
                      if (ex) return its.map((i) => i.variantId === r.variantId ? { ...i, quantity: i.quantity + 1 } : i)
                      return [...its, { variantId: r.variantId, quantity: 1, unitPrice: r.price }]
                    })
                    setExchangeSearch("")
                  }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent">
                    <span>{r.name} <span className="text-muted-foreground">— {r.label}</span></span>
                    <span className="font-medium">{fmtMoney(r.price)}</span>
                  </button>
                ))}
              </div>
            )}
            {exchangeItems.length > 0 && (
              <div className="mt-1 rounded-md border">
                {exchangeItems.map((i) => (
                  <div key={i.variantId} className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-0">
                    <span className="flex-1">{fmtMoney(i.unitPrice)} each</span>
                    <Input type="number" value={i.quantity} min={1} onChange={(e) => setExchangeItems((its) => its.map((x) => x.variantId === i.variantId ? { ...x, quantity: Math.max(1, parseInt(e.target.value) || 1) } : x))} className="h-7 w-16 text-center" />
                    <span className="w-20 text-right font-medium">{fmtMoney(i.unitPrice * i.quantity)}</span>
                    <button onClick={() => setExchangeItems((its) => its.filter((x) => x.variantId !== i.variantId))} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Exchange value: <b>{fmtMoney(exchangeTotal)}</b></p>
          </div>
        )}

        {/* settlement */}
        <div className="rounded-md border bg-muted/30 p-3">
          {type === "CUSTOMER_RETURN" || difference < 0 ? (
            <>
              <p className="text-sm font-medium">
                {difference < 0
                  ? <>Customer gets back <b className="text-emerald-600">{fmtMoney(-difference)}</b></>
                  : <>Customer gets back <b className="text-emerald-600">{fmtMoney(returnTotal)}</b></>}
              </p>
              <Field label="Refund method">
                <SelectInput value={refundMethod} onChange={setRefundMethod} options={[
                  { value: "CASH_REFUND", label: "Cash refund" },
                  { value: "UPI_REFUND", label: "UPI refund" },
                  { value: "STORE_CREDIT", label: "Store credit (udhaar adjust)" },
                ]} />
              </Field>
            </>
          ) : difference > 0 ? (
            <>
              <p className="text-sm font-medium">Customer pays extra <b className="text-amber-600">{fmtMoney(difference)}</b></p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Collect now (₹)"><NumberInput value={exchangePaidAmount} onChange={setExchangePaidAmount} min={0} /></Field>
                <Field label="Method"><SelectInput value={exchangePaidMethod} onChange={setExchangePaidMethod}
                  options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} /></Field>
              </div>
              <p className="text-xs text-muted-foreground">Remaining {fmtMoney(Math.max(0, difference - exchangePaidAmount))} goes to customer account (credit).</p>
            </>
          ) : (
            <p className="text-sm font-medium">Even exchange — no payment difference</p>
          )}
        </div>

        <Field label="Notes"><TextArea value={notes} onChange={setNotes} rows={2} /></Field>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !Object.values(returnItems).some((q) => q > 0)}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Process {type === "EXCHANGE" ? "Exchange" : "Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
