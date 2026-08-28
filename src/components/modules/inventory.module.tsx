"use client"

import { useState, useMemo, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { useApp, canDo } from "@/lib/client/store"
import { PageHeader, StatCard, EmptyState, SectionTitle } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import { StatusBadge, Money, DateCell, ConfirmDialog, Field, TextInput, NumberInput, SelectInput, TextArea, SwitchInput, EntityPicker } from "@/components/shared/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Boxes, ClipboardEdit, ArrowLeftRight, History, Warehouse as WarehouseIcon, Plus, Pencil, Trash2,
  Loader2, Star, PackageX, Download, ChevronLeft, ChevronRight, X, IndianRupee, Package,
} from "lucide-react"
import { fmtMoney, fmtNum, fmtDateTimeIST } from "@/lib/format"
import { MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS, WAREHOUSE_TYPES, WAREHOUSE_TYPE_LABELS } from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// ==================== Local types ====================
interface StockRow {
  variantId: string
  sku: string
  barcode: string | null
  productName: string
  productCode: string
  category: string
  collection: string
  size: string
  color: string
  minStock: number
  totalStock: number
  costPrice: number
  sellingPrice: number
  stockValue: number
  warehouseStock: { warehouseId: string; warehouse: string; quantity: number }[]
}
interface MovementRow {
  id: string
  date: string
  type: string
  quantity: number
  product: string
  sku: string
  variantLabel: string
  referenceType: string | null
  note: string | null
  userName: string | null
}
interface Warehouse {
  id: string
  name: string
  type: string
  address: string | null
  isDefault: boolean
  active: boolean
  itemCount?: number
  totalUnits?: number
}

// ==================== Local maps / helpers ====================
const MOVEMENT_DIR: Record<string, number> = {
  OPENING: 1, PURCHASE: 1, SALE_RETURN: 1, TRANSFER_IN: 1, PRODUCTION_IN: 1,
  SALE: -1, DAMAGE: -1, LOSS: -1, TRANSFER_OUT: -1, PRODUCTION_CONSUME: -1, SUPPLIER_RETURN: -1,
}
const WAREHOUSE_TYPE_COLORS: Record<string, string> = {
  SHOP: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  WAREHOUSE: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  FACTORY: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  BRANCH: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
}

function movementColor(type: string): string {
  const dir = MOVEMENT_DIR[type] ?? 0
  if (dir > 0) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
  if (dir < 0) return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
}

function variantLabel(r: { color: string; size: string }): string {
  const parts = [r.color, r.size].filter((s) => s && s !== "—")
  return parts.length ? parts.join(" / ") : "Default"
}

function whShort(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length > 1) return words.map((w) => w[0]).join("").toUpperCase().slice(0, 4)
  return name.length > 8 ? name.slice(0, 3).toUpperCase() : name
}

function QtyCell({ qty }: { qty: number }) {
  return (
    <span className={cn("font-semibold tabular-nums", qty > 0 ? "text-emerald-600 dark:text-emerald-400" : qty < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
      {qty > 0 ? `+${qty}` : qty}
    </span>
  )
}

// ==================== MODULE ====================
export function InventoryModule() {
  const { moduleParams } = useApp()
  const paramsTab = (moduleParams?.tab as string) ?? ""
  const [tab, setTab] = useState<"stock" | "movements" | "warehouses">(
    paramsTab === "movements" || paramsTab === "warehouses" ? paramsTab : "stock",
  )
  const [filter, setFilter] = useState<"all" | "low" | "out">(paramsTab === "low" ? "low" : "all")
  const [warehouseId, setWarehouseId] = useState("")
  const [detailVariantId, setDetailVariantId] = useState<string | null>((moduleParams?.entityId as string) ?? null)
  const [adjustCtx, setAdjustCtx] = useState<{ variantId?: string; warehouseId?: string } | null>(paramsTab === "adjust" ? {} : null)
  const [transferCtx, setTransferCtx] = useState<{ variantId?: string } | null>(paramsTab === "transfer" ? {} : null)

  // React to sidebar / command-palette / dashboard deep-links
  useState(() => {
    if (moduleParams?.entityId) setDetailVariantId(moduleParams.entityId as string)
    if ((moduleParams?.tab as string) === "adjust") setAdjustCtx({})
    if ((moduleParams?.tab as string) === "transfer") setTransferCtx({})
  })

  // Full stock snapshot (summary + all rows) — used by table, dialogs and variant detail
  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ["inventory", "stock", "all"],
    queryFn: () => api.get(`inventory/stock${qs({ pageSize: 300 })}`),
  })
  const { data: whData } = useQuery({ queryKey: ["warehouses"], queryFn: () => api.get("warehouses") })

  const stockRows: StockRow[] = stockData?.rows ?? []
  const warehouses: Warehouse[] = whData?.warehouses ?? []
  const summary = stockData?.summary

  const lowCount = stockRows.filter((r) => r.totalStock > 0 && r.totalStock <= r.minStock).length
  const outCount = stockRows.filter((r) => r.totalStock <= 0).length

  const filteredRows = useMemo(() => {
    let rows = stockRows
    if (warehouseId) rows = rows.filter((r) => (r.warehouseStock.find((w) => w.warehouseId === warehouseId)?.quantity ?? 0) > 0)
    if (filter === "low") rows = rows.filter((r) => r.totalStock > 0 && r.totalStock <= r.minStock)
    if (filter === "out") rows = rows.filter((r) => r.totalStock <= 0)
    return rows
  }, [stockRows, warehouseId, filter])

  const canEdit = canDo("inventory", "edit")

  const columns: Column<StockRow>[] = [
    {
      key: "productName", header: "Product", sortValue: (r) => r.productName, render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.productName}</p>
          <p className="truncate text-xs text-muted-foreground">{r.productCode} · {variantLabel(r)}</p>
        </div>
      ),
    },
    { key: "sku", header: "SKU", sortValue: (r) => r.sku, render: (r) => <span className="whitespace-nowrap font-mono text-xs">{r.sku}</span> },
    { key: "barcode", header: "Barcode", render: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{r.barcode ?? "—"}</span> },
    { key: "category", header: "Category", sortValue: (r) => r.category, render: (r) => <span className="text-xs">{r.category}</span> },
    { key: "warehouses", header: "Warehouses", render: (r) => <WarehouseBadges row={r} warehouses={warehouses} /> },
    {
      key: "totalStock", header: "Stock", align: "right", sortValue: (r) => r.totalStock, render: (r) => (
        <div>
          <span className={cn("font-bold tabular-nums", r.totalStock <= 0 ? "text-red-600 dark:text-red-400" : r.totalStock <= r.minStock ? "text-amber-600 dark:text-amber-400" : "")}>
            {r.totalStock}
          </span>
          <p className="text-[10px] text-muted-foreground">min {r.minStock}</p>
        </div>
      ),
    },
    { key: "costPrice", header: "Cost", align: "right", sortValue: (r) => r.costPrice, render: (r) => <Money value={r.costPrice} /> },
    { key: "stockValue", header: "Value", align: "right", sortValue: (r) => r.stockValue, render: (r) => <Money value={r.stockValue} className="font-semibold" /> },
  ]

  function exportStockCsv() {
    exportCSV(
      "current-stock",
      ["Product", "Code", "Variant", "SKU", "Barcode", "Category", "Collection", "Total Stock", "Min Stock", "Cost", "Selling", "Stock Value"],
      filteredRows.map((r) => [r.productName, r.productCode, variantLabel(r), r.sku, r.barcode ?? "", r.category, r.collection, r.totalStock, r.minStock, r.costPrice, r.sellingPrice, r.stockValue]),
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Boxes className="h-5 w-5" />}
        title="Inventory Control"
        description="Live stock across shops and warehouses — valuation, low-stock alerts, adjustments, transfers and full movement history."
        actions={
          canEdit ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setTab("stock"); setAdjustCtx({}) }}>
                <ClipboardEdit className="mr-1.5 h-4 w-4" /> Adjust Stock
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setTab("stock"); setTransferCtx({}) }}>
                <ArrowLeftRight className="mr-1.5 h-4 w-4" /> Transfer Stock
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total Variants" value={summary ? fmtNum(summary.totalVariants) : "…"} icon={<Package className="h-4 w-4" />} />
        <StatCard label="Total Units" value={summary ? fmtNum(summary.totalUnits) : "…"} icon={<Boxes className="h-4 w-4" />} />
        <StatCard label="Stock Value" value={summary ? fmtMoney(summary.totalValue, { compact: true }) : "…"} sub="At cost price" icon={<IndianRupee className="h-4 w-4" />} tone="positive" />
        <StatCard label="Low Stock" value={summary?.lowCount ?? "…"} sub="At or below minimum" icon={<PackageX className="h-4 w-4 rotate-45" />} tone="warning" onClick={() => { setTab("stock"); setFilter("low") }} />
        <StatCard label="Out of Stock" value={summary?.outCount ?? "…"} sub="Zero units left" icon={<PackageX className="h-4 w-4" />} tone="negative" onClick={() => { setTab("stock"); setFilter("out") }} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "stock" | "movements" | "warehouses")}>
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
          <TabsTrigger value="stock"><Boxes className="h-4 w-4" /> Current Stock</TabsTrigger>
          <TabsTrigger value="movements"><History className="h-4 w-4" /> Movements</TabsTrigger>
          <TabsTrigger value="warehouses"><WarehouseIcon className="h-4 w-4" /> Warehouses</TabsTrigger>
        </TabsList>

        {/* ==================== CURRENT STOCK ==================== */}
        <TabsContent value="stock" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border bg-card p-0.5">
              {([["all", "All", stockRows.length], ["low", "Low", lowCount], ["out", "Out", outCount]] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {label} <span className="opacity-70 tabular-nums">({count})</span>
                </button>
              ))}
            </div>
            <div className="w-44">
              <SelectInput
                value={warehouseId}
                onChange={setWarehouseId}
                options={[{ value: "", label: "All warehouses" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
                placeholder="All warehouses"
              />
            </div>
            {warehouseId && (
              <button className="text-xs text-muted-foreground underline" onClick={() => setWarehouseId("")}>clear warehouse</button>
            )}
            <div className="ml-auto">
              <Button variant="outline" size="sm" className="h-9" onClick={exportStockCsv}>
                <Download className="mr-1.5 h-4 w-4" /> CSV
              </Button>
            </div>
          </div>

          <DataTable
            columns={columns}
            rows={filteredRows}
            loading={stockLoading}
            onRowClick={(r) => setDetailVariantId(r.variantId)}
            pageSize={15}
            dense
            searchKeys={["productName", "sku", "barcode", "productCode", "color", "size", "category"]}
            searchPlaceholder="Search product, SKU, barcode…"
            emptyTitle={warehouseId || filter !== "all" ? "No matching stock rows" : "No stock yet"}
            emptyDescription="Stock appears here once you add products with variants and opening stock."
            rowClassName={(r) => (r.totalStock <= 0 ? "bg-red-500/5" : r.totalStock <= r.minStock ? "bg-amber-500/5" : "")}
          />
        </TabsContent>

        {/* ==================== MOVEMENTS ==================== */}
        <TabsContent value="movements" className="mt-4">
          <MovementsTab />
        </TabsContent>

        {/* ==================== WAREHOUSES ==================== */}
        <TabsContent value="warehouses" className="mt-4">
          <WarehousesTab />
        </TabsContent>
      </Tabs>

      {detailVariantId && (
        <VariantDetail
          variantId={detailVariantId}
          rows={stockRows}
          warehouses={warehouses}
          loading={stockLoading}
          onClose={() => setDetailVariantId(null)}
          onAdjust={(row) => setAdjustCtx({ variantId: row.variantId })}
          onTransfer={(row) => setTransferCtx({ variantId: row.variantId })}
        />
      )}
      {adjustCtx && (
        <AdjustStockDialog ctx={adjustCtx} stockRows={stockRows} warehouses={warehouses} onClose={() => setAdjustCtx(null)} />
      )}
      {transferCtx && (
        <TransferStockDialog ctx={transferCtx} stockRows={stockRows} warehouses={warehouses} onClose={() => setTransferCtx(null)} />
      )}
    </div>
  )
}

// ==================== Warehouse badges cell ====================
function WarehouseBadges({ row, warehouses }: { row: StockRow; warehouses: Warehouse[] }) {
  const list = warehouses.length
    ? warehouses.map((w) => ({ id: w.id, name: w.name, qty: row.warehouseStock.find((s) => s.warehouseId === w.id)?.quantity ?? 0 }))
    : row.warehouseStock.map((s) => ({ id: s.warehouseId, name: s.warehouse, qty: s.quantity }))
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((w) => (
        <span
          key={w.id}
          title={`${w.name}: ${w.qty} units`}
          className={cn(
            "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
            w.qty > 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-border bg-muted/60 text-muted-foreground",
          )}
        >
          {whShort(w.name)} <span className="ml-1">{w.qty}</span>
        </span>
      ))}
    </div>
  )
}

// ==================== VARIANT DETAIL SHEET ====================
function VariantDetail({ variantId, rows, warehouses, loading, onClose, onAdjust, onTransfer }: {
  variantId: string
  rows: StockRow[]
  warehouses: Warehouse[]
  loading?: boolean
  onClose: () => void
  onAdjust: (row: StockRow) => void
  onTransfer: (row: StockRow) => void
}) {
  const canEdit = canDo("inventory", "edit")
  const row = rows.find((r) => r.variantId === variantId)
  const { data, isLoading } = useQuery({
    queryKey: ["inventory", "movements", "variant", variantId],
    queryFn: () => api.get(`inventory/movements${qs({ variantId, pageSize: 50 })}`),
  })
  const movements: MovementRow[] = data?.movements ?? []

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl thin-scrollbar">
        <SheetHeader className="border-b bg-muted/40 px-5 py-4">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PackageX className="h-5 w-5 rotate-45" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{row?.productName ?? "Variant detail"}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {row ? `${variantLabel(row)} · ${row.sku}${row.barcode ? ` · ${row.barcode}` : ""}` : "Loading…"}
              </p>
            </div>
          </SheetTitle>
        </SheetHeader>

        {!row ? (
          <div className="flex items-center justify-center py-24">
            {loading || isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <EmptyState title="Variant not found" description="This variant may have been deleted." />}
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="Total Stock"
                value={fmtNum(row.totalStock)}
                tone={row.totalStock <= 0 ? "negative" : row.totalStock <= row.minStock ? "warning" : "positive"}
              />
              <StatCard label="Stock Value" value={fmtMoney(row.stockValue)} sub="At cost" />
              <StatCard label="Selling Price" value={fmtMoney(row.sellingPrice)} />
              <StatCard label="Min Stock" value={row.minStock} sub={row.category} />
            </div>

            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => onAdjust(row)}>
                  <ClipboardEdit className="mr-1.5 h-4 w-4" /> Adjust Stock
                </Button>
                <Button size="sm" variant="outline" onClick={() => onTransfer(row)}>
                  <ArrowLeftRight className="mr-1.5 h-4 w-4" /> Transfer
                </Button>
              </div>
            )}

            <div>
              <SectionTitle>Warehouse Breakdown</SectionTitle>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Warehouse</th>
                      <th className="px-3 py-2 font-semibold">Type</th>
                      <th className="px-3 py-2 text-right font-semibold">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(warehouses.length
                      ? warehouses.map((w) => ({ name: w.name, type: w.type as string, qty: row.warehouseStock.find((s) => s.warehouseId === w.id)?.quantity ?? 0 }))
                      : row.warehouseStock.map((s) => ({ name: s.warehouse, type: "", qty: s.quantity }))
                    ).map((w, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{w.name}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{w.type ? WAREHOUSE_TYPE_LABELS[w.type] ?? w.type : "—"}</td>
                        <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", w.qty > 0 ? "" : "text-muted-foreground")}>{w.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <SectionTitle>Recent Movements</SectionTitle>
              {isLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : movements.length === 0 ? (
                <EmptyState title="No movements yet" description="Purchases, sales, transfers and adjustments for this variant will appear here." />
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-lg border thin-scrollbar">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/95 backdrop-blur">
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 text-right font-semibold">Qty</th>
                        <th className="px-3 py-2 font-semibold">Note</th>
                        <th className="px-3 py-2 font-semibold">User</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m) => (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="whitespace-nowrap px-3 py-2 text-xs"><DateCell value={m.date} withTime /></td>
                          <td className="px-3 py-2"><StatusBadge label={MOVEMENT_TYPE_LABELS[m.type] ?? m.type} className={movementColor(m.type)} /></td>
                          <td className="px-3 py-2 text-right"><QtyCell qty={m.quantity} /></td>
                          <td className="max-w-[180px] truncate px-3 py-2 text-xs text-muted-foreground" title={m.note ?? ""}>{m.note ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{m.userName ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ==================== ADJUST STOCK DIALOG ====================
const ADJUST_TYPES = [
  { value: "OPENING", label: "Opening Stock (+)" },
  { value: "DAMAGE", label: "Damage (−)" },
  { value: "LOSS", label: "Loss (−)" },
  { value: "ADJUSTMENT", label: "Set Exact Count" },
]

function AdjustStockDialog({ ctx, stockRows, warehouses, onClose }: {
  ctx: { variantId?: string; warehouseId?: string }
  stockRows: StockRow[]
  warehouses: Warehouse[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const defaultWarehouseId = warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? ""
  const [variantId, setVariantId] = useState(ctx.variantId ?? "")
  const [warehouseId, setWarehouseId] = useState(ctx.warehouseId ?? defaultWarehouseId)
  const [type, setType] = useState<"OPENING" | "DAMAGE" | "LOSS" | "ADJUSTMENT">("OPENING")
  const [qty, setQty] = useState(0)
  const [newQty, setNewQty] = useState(0)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!warehouseId && defaultWarehouseId) setWarehouseId(defaultWarehouseId) }, [defaultWarehouseId, warehouseId])

  const selectedRow = stockRows.find((r) => r.variantId === variantId)
  const currentQty = selectedRow ? (selectedRow.warehouseStock.find((w) => w.warehouseId === warehouseId)?.quantity ?? 0) : null
  const pickerEntities = useMemo(() => stockRows.map((r) => ({ ...r, id: r.variantId })), [stockRows])

  async function save() {
    if (!variantId) return toast({ title: "Select a variant", variant: "destructive" })
    if (!warehouseId) return toast({ title: "Select a warehouse", variant: "destructive" })
    if (type === "ADJUSTMENT" && currentQty !== null && newQty === currentQty) {
      return toast({ title: "No change", description: "New quantity equals current stock", variant: "destructive" })
    }
    if (type !== "ADJUSTMENT" && qty <= 0) return toast({ title: "Enter a quantity greater than zero", variant: "destructive" })
    setSaving(true)
    try {
      const body = type === "ADJUSTMENT"
        ? { variantId, warehouseId, type, newQuantity: Math.round(newQty), note: note.trim() || undefined }
        : { variantId, warehouseId, type, delta: type === "OPENING" ? Math.round(qty) : -Math.round(qty), note: note.trim() || undefined }
      const res = await api.post("inventory/adjust", body)
      toast({ title: "Stock adjusted", description: res?.newQuantity !== undefined ? `New quantity: ${res.newQuantity} units` : undefined })
      qc.invalidateQueries({ queryKey: ["inventory"] })
      qc.invalidateQueries({ queryKey: ["warehouses"] })
      qc.invalidateQueries({ queryKey: ["products"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Adjustment failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Variant" required>
            <EntityPicker
              entities={pickerEntities}
              value={variantId}
              onChange={setVariantId}
              placeholder="Search product, variant, SKU…"
              getLabel={(r: any) => `${r.productName} · ${variantLabel(r)} (${r.sku})`}
            />
          </Field>
          {selectedRow && (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Total stock across warehouses: <b className="text-foreground">{selectedRow.totalStock}</b> · cost {fmtMoney(selectedRow.costPrice)} · min {selectedRow.minStock}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Warehouse" required>
              <SelectInput
                value={warehouseId}
                onChange={setWarehouseId}
                options={warehouses.map((w) => ({ value: w.id, label: w.isDefault ? `${w.name} (default)` : w.name }))}
                placeholder="Select…"
              />
            </Field>
            <Field label="Adjustment type" required>
              <SelectInput value={type} onChange={(v) => setType(v as typeof type)} options={ADJUST_TYPES} />
            </Field>
          </div>
          {type === "ADJUSTMENT" ? (
            <Field
              label="New quantity (physical count)"
              hint={currentQty !== null ? `Current: ${currentQty} → New: ${Math.round(newQty)}` : undefined}
              required
            >
              <NumberInput value={newQty} onChange={setNewQty} min={0} step="1" />
            </Field>
          ) : (
            <Field
              label={type === "OPENING" ? "Quantity to add" : type === "DAMAGE" ? "Units damaged" : "Units lost"}
              hint={currentQty !== null ? `Current in warehouse: ${currentQty}` : undefined}
              required
            >
              <NumberInput value={qty} onChange={setQty} min={0} step="1" />
            </Field>
          )}
          <Field label="Note">
            <TextInput value={note} onChange={setNote} placeholder="Reason / reference (optional)" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Apply Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== TRANSFER STOCK DIALOG ====================
function TransferStockDialog({ ctx, stockRows, warehouses, onClose }: {
  ctx: { variantId?: string }
  stockRows: StockRow[]
  warehouses: Warehouse[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const defaultWarehouseId = warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? ""
  const [variantId, setVariantId] = useState(ctx.variantId ?? "")
  const [fromId, setFromId] = useState(defaultWarehouseId)
  const [toId, setToId] = useState("")
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!fromId && defaultWarehouseId) setFromId(defaultWarehouseId) }, [defaultWarehouseId, fromId])

  const selectedRow = stockRows.find((r) => r.variantId === variantId)
  const available = selectedRow ? (selectedRow.warehouseStock.find((w) => w.warehouseId === fromId)?.quantity ?? 0) : null
  const pickerEntities = useMemo(() => stockRows.map((r) => ({ ...r, id: r.variantId })), [stockRows])

  async function save() {
    if (!variantId) return toast({ title: "Select a variant", variant: "destructive" })
    if (!fromId || !toId) return toast({ title: "Select source and destination warehouses", variant: "destructive" })
    if (fromId === toId) return toast({ title: "Source and destination must be different", variant: "destructive" })
    if (qty < 1) return toast({ title: "Quantity must be at least 1", variant: "destructive" })
    setSaving(true)
    try {
      await api.post("inventory/transfer", { variantId, fromWarehouseId: fromId, toWarehouseId: toId, quantity: Math.round(qty), note: note.trim() || undefined })
      toast({ title: "Stock transferred", description: `${Math.round(qty)} units moved` })
      qc.invalidateQueries({ queryKey: ["inventory"] })
      qc.invalidateQueries({ queryKey: ["warehouses"] })
      qc.invalidateQueries({ queryKey: ["products"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Transfer failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Stock</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Variant" required>
            <EntityPicker
              entities={pickerEntities}
              value={variantId}
              onChange={setVariantId}
              placeholder="Search product, variant, SKU…"
              getLabel={(r: any) => `${r.productName} · ${variantLabel(r)} (${r.sku})`}
            />
          </Field>
          {selectedRow && (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Total stock: <b className="text-foreground">{selectedRow.totalStock}</b>
              {available !== null && <> · available at source: <b className="text-foreground">{available}</b></>}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From warehouse" required>
              <SelectInput
                value={fromId}
                onChange={setFromId}
                options={warehouses.map((w) => ({ value: w.id, label: w.isDefault ? `${w.name} (default)` : w.name }))}
                placeholder="Select…"
              />
            </Field>
            <Field label="To warehouse" required>
              <SelectInput
                value={toId}
                onChange={setToId}
                options={warehouses.filter((w) => w.id !== fromId).map((w) => ({ value: w.id, label: w.name }))}
                placeholder="Select…"
              />
            </Field>
          </div>
          <Field label="Quantity" hint={available !== null ? `Available at source: ${available}` : undefined} required>
            <NumberInput value={qty} onChange={setQty} min={1} step="1" />
          </Field>
          <Field label="Note">
            <TextInput value={note} onChange={setNote} placeholder="Reason / reference (optional)" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== MOVEMENTS TAB ====================
function MovementsTab() {
  const [type, setType] = useState("__all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const pageSize = 50

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["inventory", "movements", "list", type, from, to, page],
    queryFn: () => api.get(`inventory/movements${qs({ type: type === "__all" ? "" : type, from, to, page, pageSize })}`),
  })
  const movements: MovementRow[] = data?.movements ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const columns: Column<MovementRow>[] = [
    { key: "date", header: "Date & Time", sortValue: (m) => m.date, render: (m) => <span className="whitespace-nowrap text-xs"><DateCell value={m.date} withTime /></span> },
    { key: "type", header: "Type", sortValue: (m) => m.type, render: (m) => <StatusBadge label={MOVEMENT_TYPE_LABELS[m.type] ?? m.type} className={movementColor(m.type)} /> },
    {
      key: "product", header: "Product", sortValue: (m) => m.product, render: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{m.product}</p>
          <p className="truncate text-xs text-muted-foreground">{m.variantLabel || "Default"} · {m.sku}</p>
        </div>
      ),
    },
    { key: "quantity", header: "Qty", align: "right", sortValue: (m) => m.quantity, render: (m) => <QtyCell qty={m.quantity} /> },
    { key: "referenceType", header: "Reference", render: (m) => <span className="whitespace-nowrap text-xs text-muted-foreground">{m.referenceType ?? "—"}</span> },
    { key: "note", header: "Note", render: (m) => <span className="block max-w-[220px] truncate text-xs text-muted-foreground" title={m.note ?? ""}>{m.note ?? "—"}</span> },
    { key: "userName", header: "User", render: (m) => <span className="whitespace-nowrap text-xs">{m.userName ?? "—"}</span> },
  ]

  function exportCsv() {
    exportCSV(
      "stock-movements",
      ["Date", "Type", "Product", "Variant", "SKU", "Qty", "Reference", "Note", "User"],
      movements.map((m) => [
        fmtDateTimeIST(m.date), MOVEMENT_TYPE_LABELS[m.type] ?? m.type, m.product, m.variantLabel, m.sku,
        m.quantity, m.referenceType ?? "", m.note ?? "", m.userName ?? "",
      ]),
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-44">
          <SelectInput
            value={type}
            onChange={(v) => { setType(v); setPage(1) }}
            options={[{ value: "__all", label: "All types" }, ...MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_TYPE_LABELS[t] }))]}
            placeholder="All types"
          />
        </div>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className="h-9 w-36" title="From date" />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} className="h-9 w-36" title="To date" />
        {(type !== "__all" || from || to) && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => { setType("__all"); setFrom(""); setTo(""); setPage(1) }}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-9 w-9" disabled={page <= 1} onClick={() => setPage(page - 1)} title="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-1 text-xs tabular-nums text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-9 w-9" disabled={page >= totalPages} onClick={() => setPage(page + 1)} title="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={movements}
        loading={isLoading}
        pageSize={50}
        dense
        searchKeys={["product", "sku", "variantLabel", "note", "userName"]}
        searchPlaceholder="Search product, SKU, note…"
        emptyTitle={type !== "__all" || from || to ? "No movements match filters" : "No stock movements yet"}
        emptyDescription="Every purchase, sale, transfer and adjustment is recorded here."
      />

      <p className="text-xs text-muted-foreground">
        Showing {movements.length} of {fmtNum(total)} movements{isFetching && !isLoading ? " · updating…" : ""}
      </p>
    </div>
  )
}

// ==================== WAREHOUSES TAB ====================
function WarehousesTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["warehouses"], queryFn: () => api.get("warehouses") })
  const warehouses: Warehouse[] = data?.warehouses ?? []
  const [formOpen, setFormOpen] = useState<Warehouse | "new" | null>(null)
  const [deleting, setDeleting] = useState<Warehouse | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const canCreate = canDo("inventory", "create")
  const canEdit = canDo("inventory", "edit")
  const canDelete = canDo("inventory", "delete")

  async function confirmDelete() {
    if (!deleting) return
    setDeleteLoading(true)
    try {
      await api.del(`warehouses/${deleting.id}`)
      toast({ title: "Warehouse deleted" })
      qc.invalidateQueries({ queryKey: ["warehouses"] })
      qc.invalidateQueries({ queryKey: ["inventory"] })
      setDeleting(null)
    } catch (e: any) {
      toast({ title: "Cannot delete", description: e.message, variant: "destructive" })
    } finally {
      setDeleteLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="h-44 animate-pulse bg-muted/30">&nbsp;</CardContent></Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {canCreate && warehouses.length > 0 && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setFormOpen("new")}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Warehouse
          </Button>
        </div>
      )}

      {warehouses.length === 0 ? (
        <EmptyState
          title="No warehouses"
          description="Create your first shop or warehouse location to track stock separately by location."
          icon={<WarehouseIcon className="h-6 w-6" />}
          action={canCreate ? (
            <Button size="sm" onClick={() => setFormOpen("new")}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Warehouse
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => (
            <Card key={w.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate font-semibold">{w.name}</h3>
                      {w.isDefault && <span title="Default warehouse" aria-label="Default warehouse"><Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" /></span>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{w.address ?? "No address"}</p>
                  </div>
                  <StatusBadge label={WAREHOUSE_TYPE_LABELS[w.type] ?? w.type} className={WAREHOUSE_TYPE_COLORS[w.type]} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-md border p-2 text-center">
                    <p className="text-lg font-bold tabular-nums">{fmtNum(w.itemCount ?? 0)}</p>
                    <p className="text-[11px] text-muted-foreground">Items in stock</p>
                  </div>
                  <div className="rounded-md border p-2 text-center">
                    <p className="text-lg font-bold tabular-nums">{fmtNum(w.totalUnits ?? 0)}</p>
                    <p className="text-[11px] text-muted-foreground">Total units</p>
                  </div>
                </div>
                {(canEdit || canDelete) && (
                  <div className="mt-3 flex gap-2">
                    {canEdit && (
                      <Button variant="outline" size="sm" className="h-8 flex-1" onClick={() => setFormOpen(w)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                    )}
                    {canDelete && !w.isDefault && (
                      <Button variant="outline" size="sm" className="h-8 flex-1 text-destructive" onClick={() => setDeleting(w)}>
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {formOpen && (
        <WarehouseForm warehouse={formOpen === "new" ? undefined : formOpen} onClose={() => setFormOpen(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setDeleting(null)}
          title={`Delete ${deleting.name}?`}
          description="Warehouses holding stock cannot be deleted — transfer stock out first. The default warehouse cannot be deleted."
          destructive
          confirmLabel="Delete"
          loading={deleteLoading}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

// ==================== WAREHOUSE FORM ====================
function WarehouseForm({ warehouse, onClose }: { warehouse?: Warehouse; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: warehouse?.name ?? "",
    type: warehouse?.type ?? "SHOP",
    address: warehouse?.address ?? "",
    isDefault: warehouse?.isDefault ?? false,
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim()) return toast({ title: "Warehouse name is required", variant: "destructive" })
    setSaving(true)
    try {
      const body = { name: form.name.trim(), type: form.type, address: form.address.trim() || undefined, isDefault: form.isDefault }
      if (warehouse) await api.put(`warehouses/${warehouse.id}`, body)
      else await api.post("warehouses", body)
      toast({ title: warehouse ? "Warehouse updated" : "Warehouse created" })
      qc.invalidateQueries({ queryKey: ["warehouses"] })
      qc.invalidateQueries({ queryKey: ["inventory"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{warehouse ? `Edit ${warehouse.name}` : "New Warehouse"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name" required>
            <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Main Shop" autoFocus />
          </Field>
          <Field label="Type">
            <SelectInput value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={WAREHOUSE_TYPES.map((t) => ({ value: t, label: WAREHOUSE_TYPE_LABELS[t] }))} />
          </Field>
          <Field label="Address">
            <TextArea value={form.address} onChange={(v) => setForm({ ...form, address: v })} rows={2} placeholder="Optional" />
          </Field>
          <Field label="Default warehouse" hint="Used for opening stock and POS sales">
            <SwitchInput checked={form.isDefault} onChange={(v) => setForm({ ...form, isDefault: v })} label="Set as default" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {warehouse ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
