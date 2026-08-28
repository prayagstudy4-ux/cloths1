"use client"

import { useState, useMemo, useEffect } from "react"
import { useQuery, useQueryClient, useMutation, useQueries } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { useApp, canDo } from "@/lib/client/store"
import { PageHeader, StatCard, EmptyState } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import { StatusBadge, Money, DateCell, ConfirmDialog, Field, TextInput, NumberInput, SelectInput, TextArea, SwitchInput, EntityPicker } from "@/components/shared/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Shirt, Plus, Pencil, Trash2, Loader2, Search, Package, Layers, Palette, Ruler,
  FolderTree, Sparkles, Shapes, Download, IndianRupee,
} from "lucide-react"
import { fmtMoney, fmtNum, fmtDateIST } from "@/lib/format"
import {
  PRODUCT_STATUSES, PRODUCT_STATUS_LABELS, PRODUCT_TYPES, PRODUCT_TYPE_LABELS,
  GENDERS, GENDER_LABELS, COLLECTION_SEASONS, COLLECTION_SEASON_LABELS, MOVEMENT_TYPE_LABELS,
} from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// ==================== Local types ====================
interface StockLevel {
  warehouseId: string
  quantity: number
  warehouse: { id: string; name: string; type: string; isDefault: boolean }
}
interface Variant {
  id: string
  sku: string
  barcode: string | null
  sizeId: string | null
  colorId: string | null
  size: { id: string; name: string } | null
  color: { id: string; name: string; hex?: string } | null
  costPrice: number
  mrp: number
  sellingPrice: number
  stockLevels: StockLevel[]
}
interface Product {
  id: string
  code: string
  name: string
  description: string | null
  categoryId: string | null
  collectionId: string | null
  brand: string | null
  productType: string | null
  gender: string | null
  materialId: string | null
  patternId: string | null
  taxRate: number
  costPrice: number
  mrp: number
  sellingPrice: number
  wholesalePrice: number
  minStock: number
  supplierId: string | null
  status: string
  createdAt: string
  category?: { id: string; name: string } | null
  collection?: { id: string; name: string; season?: string | null } | null
  material?: { id: string; name: string } | null
  pattern?: { id: string; name: string } | null
  supplier?: { id: string; name: string; company: string | null } | null
  variants: Variant[]
}

// ==================== Local maps / helpers ====================
const PRODUCT_STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  DRAFT: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ARCHIVED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
}
const SEASON_COLORS: Record<string, string> = {
  SUMMER: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  WINTER: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  MONSOON: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  FESTIVE: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  SPRING: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  AUTUMN: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  ALL_SEASON: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
}
const MOVEMENT_DIR: Record<string, number> = {
  OPENING: 1, PURCHASE: 1, SALE_RETURN: 1, TRANSFER_IN: 1, PRODUCTION_IN: 1,
  SALE: -1, DAMAGE: -1, LOSS: -1, TRANSFER_OUT: -1, PRODUCTION_CONSUME: -1, SUPPLIER_RETURN: -1,
}

function movementColor(type: string): string {
  const dir = MOVEMENT_DIR[type] ?? 0
  if (dir > 0) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
  if (dir < 0) return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
}

function variantStock(v: Variant): number {
  return (v.stockLevels ?? []).reduce((s, l) => s + l.quantity, 0)
}

function previewSku(code: string, colorName?: string | null, sizeName?: string | null): string {
  const parts = [code || "P000X"]
  if (colorName) parts.push(colorName.slice(0, 3).toUpperCase())
  if (sizeName) parts.push(sizeName.toUpperCase())
  return parts.join("-")
}

function whShort(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length > 1) return words.map((w) => w[0]).join("").toUpperCase().slice(0, 4)
  return name.length > 8 ? name.slice(0, 3).toUpperCase() : name
}

function useDebounced<T>(value: T, ms = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function val(v: string): string | undefined {
  return v && v !== "__none" ? v : undefined
}
function num(v: number | string): number {
  return Number(v) || 0
}

function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

// ==================== MODULE ====================
export function ProductsModule() {
  const { moduleParams } = useApp()
  const [tab, setTab] = useState<string>(moduleParams?.tab === "attributes" ? "attributes" : "products")
  const [creating, setCreating] = useState<boolean>(!!moduleParams?.new)
  const [editing, setEditing] = useState<Product | null>(null)
  const [detailId, setDetailId] = useState<string | null>((moduleParams?.entityId as string) ?? null)

  // React to sidebar / command-palette navigation deep-links
  useState(() => {
    if (moduleParams?.entityId) setDetailId(moduleParams.entityId as string)
    if (moduleParams?.new) setCreating(true)
  })

  // Filters (server-side)
  const [searchInput, setSearchInput] = useState("")
  const search = useDebounced(searchInput)
  const [categoryId, setCategoryId] = useState("__all")
  const [collectionId, setCollectionId] = useState("__all")
  const [status, setStatus] = useState("__all")

  const { data: attrData } = useQuery({ queryKey: ["attributes"], queryFn: () => api.get("attributes/all") })

  const { data, isLoading } = useQuery({
    queryKey: ["products", "list", search, categoryId, collectionId, status],
    queryFn: () => api.get(`products${qs({
      q: search,
      categoryId: categoryId === "__all" ? "" : categoryId,
      collectionId: collectionId === "__all" ? "" : collectionId,
      status: status === "__all" ? "" : status,
      pageSize: 100,
    })}`),
  })

  const products: Product[] = data?.products ?? []
  const categories: any[] = attrData?.categories ?? []
  const collections: any[] = attrData?.collections ?? []

  const variantCount = products.reduce((s, p) => s + (p.variants?.length ?? 0), 0)
  const stockUnits = products.reduce((s, p) => s + (p.variants ?? []).reduce((a, v) => a + variantStock(v), 0), 0)
  const stockValue = products.reduce((s, p) => s + (p.variants ?? []).reduce((a, v) => a + variantStock(v) * v.costPrice, 0), 0)
  const lowProducts = products.filter((p) => (p.variants ?? []).some((v) => { const t = variantStock(v); return t > 0 && t <= p.minStock })).length
  const outProducts = products.filter((p) => (p.variants ?? []).some((v) => variantStock(v) <= 0)).length

  const canCreate = canDo("products", "create")

  const columns: Column<Product>[] = [
    { key: "code", header: "Code", width: "w-16", sortValue: (p) => p.code, render: (p) => <span className="text-xs tabular-nums text-muted-foreground">{p.code}</span> },
    {
      key: "name", header: "Product", sortValue: (p) => p.name, render: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.name}</p>
          <p className="truncate text-xs text-muted-foreground">{p.brand ?? PRODUCT_TYPE_LABELS[p.productType ?? ""] ?? "—"}</p>
        </div>
      ),
    },
    { key: "category", header: "Category", width: "w-28", sortValue: (p) => p.category?.name ?? "", render: (p) => <span className="text-xs">{p.category?.name ?? "—"}</span> },
    { key: "collection", header: "Collection", width: "w-28", sortValue: (p) => p.collection?.name ?? "", render: (p) => <span className="text-xs">{p.collection?.name ?? "—"}</span> },
    {
      key: "gender", header: "Type", width: "w-32", sortValue: (p) => p.gender ?? "", render: (p) => (
        <span className="text-xs text-muted-foreground">
          {p.gender ? GENDER_LABELS[p.gender] ?? p.gender : "—"}{p.productType ? ` · ${PRODUCT_TYPE_LABELS[p.productType] ?? p.productType}` : ""}
        </span>
      ),
    },
    { key: "costPrice", header: "Cost", align: "right", width: "w-20", sortValue: (p) => p.costPrice, render: (p) => <Money value={p.costPrice} /> },
    { key: "mrp", header: "MRP", align: "right", width: "w-20", sortValue: (p) => p.mrp, render: (p) => <Money value={p.mrp} /> },
    { key: "sellingPrice", header: "Selling", align: "right", width: "w-20", sortValue: (p) => p.sellingPrice, render: (p) => <span className="font-semibold"><Money value={p.sellingPrice} /></span> },
    {
      key: "stock", header: "Stock", align: "right", width: "w-20", sortValue: (p) => (p.variants ?? []).reduce((s, v) => s + variantStock(v), 0), render: (p) => {
        const t = (p.variants ?? []).reduce((s, v) => s + variantStock(v), 0)
        return (
          <div>
            <span className={cn("font-bold tabular-nums", t <= 0 ? "text-red-600 dark:text-red-400" : t <= p.minStock ? "text-amber-600 dark:text-amber-400" : "")}>{t}</span>
            <p className="text-[10px] text-muted-foreground">{p.variants?.length ?? 0} variants</p>
          </div>
        )
      },
    },
    { key: "minStock", header: "Min", align: "right", width: "w-12", sortValue: (p) => p.minStock, render: (p) => <span className="text-xs tabular-nums text-muted-foreground">{p.minStock}</span> },
    { key: "status", header: "Status", width: "w-24", sortValue: (p) => p.status, render: (p) => <StatusBadge label={PRODUCT_STATUS_LABELS[p.status] ?? p.status} className={PRODUCT_STATUS_COLORS[p.status]} /> },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Shirt className="h-5 w-5" />}
        title="Products & Catalog"
        description="Product master with size × color variants, pricing tiers, collections and stock attributes for your clothing catalogue."
        actions={
          <>
            <Button
              variant="outline" size="sm"
              onClick={() => exportCSV("products", ["Code", "Name", "Brand", "Category", "Collection", "Gender", "Type", "Cost", "MRP", "Selling", "Wholesale", "Min Stock", "Status"],
                products.map((p) => [p.code, p.name, p.brand ?? "", p.category?.name ?? "", p.collection?.name ?? "", p.gender ?? "", p.productType ?? "", p.costPrice, p.mrp, p.sellingPrice, p.wholesalePrice, p.minStock, p.status]))}
            >
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
            {canCreate && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> New Product
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total Products" value={data?.total ?? "…"} icon={<Package className="h-4 w-4" />} />
        <StatCard label="Variants" value={fmtNum(variantCount)} sub="On this page" icon={<Shirt className="h-4 w-4" />} />
        <StatCard label="Stock Units" value={fmtNum(stockUnits)} sub="On this page" icon={<Package className="h-4 w-4" />} />
        <StatCard label="Stock Value" value={fmtMoney(stockValue, { compact: true })} sub="At cost · this page" icon={<IndianRupee className="h-4 w-4" />} tone="positive" />
        <StatCard label="Low / Out" value={`${lowProducts} / ${outProducts}`} sub="Products on this page" icon={<Package className="h-4 w-4 rotate-45" />} tone={outProducts > 0 ? "negative" : lowProducts > 0 ? "warning" : "default"} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
          <TabsTrigger value="products"><Shirt className="h-4 w-4" /> Products</TabsTrigger>
          <TabsTrigger value="attributes"><FolderTree className="h-4 w-4" /> Categories & Attributes</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4 space-y-3">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, code, brand, SKU, barcode…"
                className="h-9 pl-8"
              />
            </div>
            <div className="w-40">
              <SelectInput value={categoryId} onChange={setCategoryId} options={[{ value: "__all", label: "All categories" }, ...categories.map((c: any) => ({ value: c.id, label: c.name }))]} />
            </div>
            <div className="w-40">
              <SelectInput value={collectionId} onChange={setCollectionId} options={[{ value: "__all", label: "All collections" }, ...collections.map((c: any) => ({ value: c.id, label: c.name }))]} />
            </div>
            <div className="w-32">
              <SelectInput value={status} onChange={setStatus} options={[{ value: "__all", label: "All statuses" }, ...PRODUCT_STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_LABELS[s] }))]} />
            </div>
          </div>

          <DataTable
            columns={columns}
            rows={products}
            loading={isLoading}
            onRowClick={(p) => setDetailId(p.id)}
            pageSize={15}
            emptyTitle={search || categoryId !== "__all" || collectionId !== "__all" || status !== "__all" ? "No matching products" : "No products yet"}
            emptyDescription="Create your first product with variants, pricing and stock to start selling."
            emptyAction={canCreate ? <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1.5 h-4 w-4" /> New Product</Button> : undefined}
            rowClassName={(p) => {
              const t = (p.variants ?? []).reduce((s, v) => s + variantStock(v), 0)
              return t <= 0 && (p.variants?.length ?? 0) > 0 ? "bg-red-500/5" : t <= p.minStock && t > 0 ? "bg-amber-500/5" : ""
            }}
          />
        </TabsContent>

        <TabsContent value="attributes" className="mt-4">
          <AttributesTab />
        </TabsContent>
      </Tabs>

      {creating && <ProductForm onClose={() => setCreating(false)} onCreated={(id) => setDetailId(id)} />}
      {editing && <ProductForm product={editing} onClose={() => setEditing(null)} />}
      {detailId && (
        <ProductDetail
          id={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(p) => { setDetailId(null); setEditing(p) }}
        />
      )}
    </div>
  )
}

// ==================== PRODUCT FORM (create / edit + variant matrix) ====================
function ProductForm({ product, onClose, onCreated }: { product?: Product; onClose: () => void; onCreated?: (id: string) => void }) {
  const qc = useQueryClient()
  const isCreate = !product
  const { data: attrData } = useQuery({ queryKey: ["attributes"], queryFn: () => api.get("attributes/all") })
  const { data: supData } = useQuery({ queryKey: ["suppliers", "picker"], queryFn: () => api.get(`suppliers${qs({ pageSize: 200 })}`) })
  const { data: whData } = useQuery({ queryKey: ["warehouses"], queryFn: () => api.get("warehouses") })

  const categories: any[] = attrData?.categories ?? []
  const collections: any[] = attrData?.collections ?? []
  const sizes: any[] = attrData?.sizes ?? []
  const colors: any[] = attrData?.colors ?? []
  const materials: any[] = attrData?.materials ?? []
  const patterns: any[] = attrData?.patterns ?? []
  const suppliers: any[] = supData?.suppliers ?? []
  const warehouses: any[] = whData?.warehouses ?? []
  const defaultWarehouseId = warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? ""

  const [form, setForm] = useState({
    name: product?.name ?? "",
    code: product?.code ?? "",
    brand: product?.brand ?? "",
    categoryId: product?.categoryId ?? "__none",
    collectionId: product?.collectionId ?? "__none",
    productType: product?.productType ?? "__none",
    gender: product?.gender ?? "__none",
    materialId: product?.materialId ?? "__none",
    patternId: product?.patternId ?? "__none",
    taxRate: product?.taxRate ?? 5,
    costPrice: product?.costPrice ?? 0,
    mrp: product?.mrp ?? 0,
    sellingPrice: product?.sellingPrice ?? 0,
    wholesalePrice: product?.wholesalePrice ?? 0,
    minStock: product?.minStock ?? 5,
    supplierId: product?.supplierId ?? "",
    status: product?.status ?? "ACTIVE",
    description: product?.description ?? "",
  })
  const [saving, setSaving] = useState(false)

  // Variant matrix (create only)
  const [selSizes, setSelSizes] = useState<string[]>([])
  const [selColors, setSelColors] = useState<string[]>([])
  const [openingQty, setOpeningQty] = useState(0)
  const [openingWarehouseId, setOpeningWarehouseId] = useState("")
  useEffect(() => { if (!openingWarehouseId && defaultWarehouseId) setOpeningWarehouseId(defaultWarehouseId) }, [defaultWarehouseId, openingWarehouseId])

  const matrixRows = useMemo(() => {
    const sz = sizes.filter((s) => selSizes.includes(s.id))
    const cl = colors.filter((c) => selColors.includes(c.id))
    if (!sz.length && !cl.length) return []
    if (!sz.length) return cl.map((c) => ({ sizeId: undefined as string | undefined, sizeName: undefined as string | undefined, colorId: c.id, colorName: c.name }))
    if (!cl.length) return sz.map((s) => ({ sizeId: s.id, sizeName: s.name, colorId: undefined as string | undefined, colorName: undefined as string | undefined }))
    return sz.flatMap((s) => cl.map((c) => ({ sizeId: s.id, sizeName: s.name, colorId: c.id, colorName: c.name })))
  }, [sizes, colors, selSizes, selColors])

  async function save() {
    if (!form.name.trim()) return toast({ title: "Product name is required", variant: "destructive" })
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      description: form.description.trim() || undefined,
      categoryId: val(form.categoryId),
      collectionId: val(form.collectionId),
      brand: form.brand.trim() || undefined,
      productType: val(form.productType),
      gender: val(form.gender),
      materialId: val(form.materialId),
      patternId: val(form.patternId),
      taxRate: num(form.taxRate),
      costPrice: num(form.costPrice),
      mrp: num(form.mrp),
      sellingPrice: num(form.sellingPrice),
      wholesalePrice: num(form.wholesalePrice),
      minStock: Math.round(num(form.minStock)),
      supplierId: form.supplierId || undefined,
      status: form.status,
    }
    if (isCreate) {
      payload.variants = matrixRows.map((r) => ({
        sizeId: r.sizeId,
        colorId: r.colorId,
        openingStock: openingQty > 0 && openingWarehouseId ? [{ warehouseId: openingWarehouseId, quantity: Math.round(openingQty) }] : [],
      }))
    }
    setSaving(true)
    try {
      if (product) {
        await api.put(`products/${product.id}`, payload)
        toast({ title: "Product updated" })
      } else {
        const res = await api.post("products", payload)
        toast({ title: "Product created", description: matrixRows.length ? `${matrixRows.length} variants added${openingQty > 0 ? ` with opening stock ${openingQty} each` : ""}` : undefined })
        onCreated?.(res?.product?.id)
      }
      qc.invalidateQueries({ queryKey: ["products"] })
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
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto thin-scrollbar">
        <DialogHeader>
          <DialogTitle>{product ? `Edit ${product.name}` : "New Product"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Product name" required>
              <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Classic Cotton Kurta" autoFocus />
            </Field>
          </div>
          <Field label="Product code" hint={isCreate ? "Leave blank to auto-generate (P0001…)" : "Unique product code"}>
            <TextInput value={form.code} onChange={(v) => setForm({ ...form, code: v })} placeholder={isCreate ? "Auto" : ""} disabled={!isCreate} />
          </Field>
          <Field label="Brand">
            <TextInput value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} placeholder="e.g. VastraCo" />
          </Field>
          <Field label="Category">
            <SelectInput value={form.categoryId} onChange={(v) => setForm({ ...form, categoryId: v })} options={[{ value: "__none", label: "— None —" }, ...categories.map((c: any) => ({ value: c.id, label: c.name }))]} />
          </Field>
          <Field label="Collection">
            <SelectInput value={form.collectionId} onChange={(v) => setForm({ ...form, collectionId: v })} options={[{ value: "__none", label: "— None —" }, ...collections.map((c: any) => ({ value: c.id, label: c.name }))]} />
          </Field>
          <Field label="Product type">
            <SelectInput value={form.productType} onChange={(v) => setForm({ ...form, productType: v })} options={[{ value: "__none", label: "— None —" }, ...PRODUCT_TYPES.map((t) => ({ value: t, label: PRODUCT_TYPE_LABELS[t] }))]} />
          </Field>
          <Field label="For (gender)">
            <SelectInput value={form.gender} onChange={(v) => setForm({ ...form, gender: v })} options={[{ value: "__none", label: "— None —" }, ...GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g] }))]} />
          </Field>
          <Field label="Material">
            <SelectInput value={form.materialId} onChange={(v) => setForm({ ...form, materialId: v })} options={[{ value: "__none", label: "— None —" }, ...materials.map((m: any) => ({ value: m.id, label: m.name }))]} />
          </Field>
          <Field label="Pattern">
            <SelectInput value={form.patternId} onChange={(v) => setForm({ ...form, patternId: v })} options={[{ value: "__none", label: "— None —" }, ...patterns.map((p: any) => ({ value: p.id, label: p.name }))]} />
          </Field>
          <Field label="Cost price (₹)" hint="Purchase / landed cost">
            <NumberInput value={form.costPrice} onChange={(v) => setForm({ ...form, costPrice: v })} min={0} />
          </Field>
          <Field label="MRP (₹)">
            <NumberInput value={form.mrp} onChange={(v) => setForm({ ...form, mrp: v })} min={0} />
          </Field>
          <Field label="Selling price (₹)">
            <NumberInput value={form.sellingPrice} onChange={(v) => setForm({ ...form, sellingPrice: v })} min={0} />
          </Field>
          <Field label="Wholesale price (₹)">
            <NumberInput value={form.wholesalePrice} onChange={(v) => setForm({ ...form, wholesalePrice: v })} min={0} />
          </Field>
          <Field label="Tax rate (%)">
            <NumberInput value={form.taxRate} onChange={(v) => setForm({ ...form, taxRate: v })} min={0} />
          </Field>
          <Field label="Min stock alert" hint="Low-stock threshold">
            <NumberInput value={form.minStock} onChange={(v) => setForm({ ...form, minStock: v })} min={0} step="1" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Supplier">
              <EntityPicker
                entities={suppliers}
                value={form.supplierId}
                onChange={(v) => setForm({ ...form, supplierId: v })}
                placeholder="Search supplier by name / company…"
                getLabel={(s: any) => (s.company ? `${s.company} (${s.name})` : s.name)}
              />
            </Field>
          </div>
          <Field label="Status">
            <SelectInput value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={PRODUCT_STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_LABELS[s] }))} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <TextArea value={form.description} onChange={(v) => setForm({ ...form, description: v })} rows={2} placeholder="Fabric details, fit, care instructions…" />
            </Field>
          </div>
        </div>

        {/* Initial variant matrix — create only */}
        {isCreate && (
          <div className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
              <p className="text-sm font-semibold">Initial Variants <span className="font-normal text-muted-foreground">(optional)</span></p>
              {matrixRows.length > 0 && <Badge variant="secondary" className="tabular-nums">{matrixRows.length} variants</Badge>}
            </div>
            <div className="space-y-3 p-3">
              <Field label="Sizes" hint="Pick sizes × colors to auto-generate variant rows">
                <div className="flex flex-wrap gap-1.5">
                  {sizes.length === 0 && <p className="text-xs text-muted-foreground">No sizes defined — add them in the Categories & Attributes tab.</p>}
                  {sizes.map((s: any) => (
                    <Chip key={s.id} active={selSizes.includes(s.id)} onClick={() => setSelSizes(toggleIn(selSizes, s.id))}>{s.name}</Chip>
                  ))}
                </div>
              </Field>
              <Field label="Colors">
                <div className="flex flex-wrap gap-1.5">
                  {colors.length === 0 && <p className="text-xs text-muted-foreground">No colors defined — add them in the Categories & Attributes tab.</p>}
                  {colors.map((c: any) => (
                    <Chip key={c.id} active={selColors.includes(c.id)} onClick={() => setSelColors(toggleIn(selColors, c.id))}>
                      <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border border-black/20" style={{ backgroundColor: c.hex ?? "#999" }} />
                      {c.name}
                    </Chip>
                  ))}
                </div>
              </Field>

              {matrixRows.length > 0 ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Opening stock (per variant)" hint="Units added to the warehouse below">
                      <NumberInput value={openingQty} onChange={setOpeningQty} min={0} step="1" />
                    </Field>
                    <Field label="Opening warehouse">
                      <SelectInput
                        value={openingWarehouseId}
                        onChange={setOpeningWarehouseId}
                        options={warehouses.map((w: any) => ({ value: w.id, label: w.isDefault ? `${w.name} (default)` : w.name }))}
                        placeholder="Select warehouse…"
                      />
                    </Field>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-md border thin-scrollbar">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-1.5 font-semibold">Size</th>
                          <th className="px-2 py-1.5 font-semibold">Color</th>
                          <th className="px-2 py-1.5 font-semibold">SKU</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Cost</th>
                          <th className="px-2 py-1.5 text-right font-semibold">MRP</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Selling</th>
                          <th className="px-2 py-1.5 text-right font-semibold">Opening</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matrixRows.map((r, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-2 py-1.5">{r.sizeName ?? "—"}</td>
                            <td className="px-2 py-1.5">{r.colorName ?? "—"}</td>
                            <td className="px-2 py-1.5 font-mono">{previewSku(form.code.trim() || "P000X", r.colorName, r.sizeName)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(num(form.costPrice))}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmtMoney(num(form.mrp))}</td>
                            <td className="px-2 py-1.5 text-right font-medium tabular-nums">{fmtMoney(num(form.sellingPrice))}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{openingQty > 0 ? `+${Math.round(openingQty)}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Select sizes and colors above to generate variant rows — prices prefill from this product and SKUs are auto-generated.
                  You can also add variants later from the product page.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCreate ? `Create Product${matrixRows.length ? ` (+${matrixRows.length} variants)` : ""}` : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent",
      )}
    >
      {children}
    </button>
  )
}

// ==================== PRODUCT DETAIL SHEET ====================
function ProductDetail({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (p: Product) => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["products", "detail", id], queryFn: () => api.get(`products/${id}`) })
  const p: Product | undefined = data?.product

  const [priceVariant, setPriceVariant] = useState<Variant | null>(null)
  const [addingVariant, setAddingVariant] = useState(false)
  const [deletingVariant, setDeletingVariant] = useState<Variant | null>(null)
  const [deletingProduct, setDeletingProduct] = useState(false)
  const [variantBusy, setVariantBusy] = useState(false)

  const canEdit = canDo("products", "edit")
  const canDelete = canDo("products", "delete")

  // Per-variant movement history (powers the sales summary)
  const variantIds = useMemo(() => (p?.variants ?? []).map((v) => v.id), [p])
  const movementQueries = useQueries({
    queries: variantIds.map((vid) => ({
      queryKey: ["inventory", "movements", "variant", vid],
      queryFn: () => api.get(`inventory/movements${qs({ variantId: vid, pageSize: 200 })}`),
    })),
  })
  const allMovements = useMemo(
    () => movementQueries.flatMap((q) => (q.data?.movements ?? []) as any[]).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [movementQueries],
  )
  const sales = useMemo(() => {
    let sold = 0, returned = 0, revenue = 0
    ;(p?.variants ?? []).forEach((v, i) => {
      const mv = (movementQueries[i]?.data?.movements ?? []) as any[]
      let vsold = 0, vret = 0
      for (const m of mv) {
        if (m.type === "SALE") vsold += Math.abs(m.quantity)
        else if (m.type === "SALE_RETURN") vret += m.quantity
      }
      sold += vsold
      returned += vret
      revenue += (vsold - vret) * v.sellingPrice
    })
    return { sold, returned, net: sold - returned, revenue }
  }, [p, movementQueries])

  const totalStock = (p?.variants ?? []).reduce((s, v) => s + variantStock(v), 0)
  const stockValue = (p?.variants ?? []).reduce((s, v) => s + variantStock(v) * v.costPrice, 0)
  const retailValue = (p?.variants ?? []).reduce((s, v) => s + variantStock(v) * v.sellingPrice, 0)

  async function deleteVariant() {
    if (!deletingVariant || !p) return
    setVariantBusy(true)
    try {
      await api.del(`products/${p.id}/variants/${deletingVariant.id}`)
      toast({ title: "Variant deleted", description: deletingVariant.sku })
      qc.invalidateQueries({ queryKey: ["products"] })
      qc.invalidateQueries({ queryKey: ["inventory"] })
      setDeletingVariant(null)
    } catch (e: any) {
      toast({ title: "Cannot delete variant", description: e.message, variant: "destructive" })
    } finally {
      setVariantBusy(false)
    }
  }

  async function deleteProduct() {
    if (!p) return
    setVariantBusy(true)
    try {
      const res = await api.del(`products/${p.id}`)
      qc.invalidateQueries({ queryKey: ["products"] })
      qc.invalidateQueries({ queryKey: ["inventory"] })
      toast({ title: res?.archived ? "Product archived" : "Product deleted", description: res?.archived ? "Has sales history — archived instead of deleted" : undefined })
      setDeletingProduct(false)
      onClose()
    } catch (e: any) {
      toast({ title: "Cannot delete", description: e.message, variant: "destructive" })
    } finally {
      setVariantBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-3xl thin-scrollbar">
        <SheetHeader className="border-b bg-muted/40 px-5 py-4">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Shirt className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{p?.name ?? "Loading…"}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {p ? `${p.code}${p.brand ? ` · ${p.brand}` : ""}${p.productType ? ` · ${PRODUCT_TYPE_LABELS[p.productType] ?? p.productType}` : ""}` : ""}
              </p>
            </div>
            {p && <StatusBadge label={PRODUCT_STATUS_LABELS[p.status] ?? p.status} className={PRODUCT_STATUS_COLORS[p.status]} />}
          </SheetTitle>
        </SheetHeader>

        {isLoading || !p ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Variants" value={p.variants.length} icon={<Shirt className="h-4 w-4" />} />
              <StatCard label="Total Stock" value={fmtNum(totalStock)} tone={totalStock <= 0 ? "negative" : totalStock <= p.minStock ? "warning" : "positive"} icon={<Package className="h-4 w-4" />} />
              <StatCard label="Stock Value" value={fmtMoney(stockValue, { compact: true })} sub="At cost" icon={<IndianRupee className="h-4 w-4" />} />
              <StatCard label="Retail Value" value={fmtMoney(retailValue, { compact: true })} sub="At selling price" icon={<IndianRupee className="h-4 w-4" />} tone="primary" />
            </div>

            <div className="flex flex-wrap gap-2">
              {canEdit && <Button size="sm" variant="outline" onClick={() => onEdit(p)}><Pencil className="mr-1.5 h-4 w-4" /> Edit</Button>}
              {canEdit && <Button size="sm" onClick={() => setAddingVariant(true)}><Plus className="mr-1.5 h-4 w-4" /> Add Variant</Button>}
              {canDelete && <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeletingProduct(true)}><Trash2 className="mr-1.5 h-4 w-4" /> Delete</Button>}
            </div>

            <Tabs defaultValue="overview">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="variants">Variants ({p.variants.length})</TabsTrigger>
                <TabsTrigger value="sales">Sales & Movements</TabsTrigger>
              </TabsList>

              {/* ---------- OVERVIEW ---------- */}
              <TabsContent value="overview" className="mt-3">
                <div className="grid gap-x-8 gap-y-2.5 rounded-lg border p-4 text-sm sm:grid-cols-2">
                  <InfoRow label="Category" value={p.category?.name ?? "—"} />
                  <InfoRow label="Collection" value={p.collection?.name ?? "—"} />
                  <InfoRow label="Brand" value={p.brand ?? "—"} />
                  <InfoRow label="Product type" value={p.productType ? PRODUCT_TYPE_LABELS[p.productType] ?? p.productType : "—"} />
                  <InfoRow label="Gender" value={p.gender ? GENDER_LABELS[p.gender] ?? p.gender : "—"} />
                  <InfoRow label="Material" value={p.material?.name ?? "—"} />
                  <InfoRow label="Pattern" value={p.pattern?.name ?? "—"} />
                  <InfoRow label="Supplier" value={p.supplier ? (p.supplier.company ? `${p.supplier.company} (${p.supplier.name})` : p.supplier.name) : "—"} />
                  <InfoRow label="Tax rate" value={`${p.taxRate}%`} />
                  <InfoRow label="Min stock alert" value={p.minStock} />
                  <InfoRow label="Cost / MRP / Selling" value={`${fmtMoney(p.costPrice)} / ${fmtMoney(p.mrp)} / ${fmtMoney(p.sellingPrice)}`} />
                  <InfoRow label="Wholesale price" value={fmtMoney(p.wholesalePrice)} />
                  <InfoRow label="Created" value={<DateCell value={p.createdAt} />} />
                  <InfoRow label="Status" value={<StatusBadge label={PRODUCT_STATUS_LABELS[p.status] ?? p.status} className={PRODUCT_STATUS_COLORS[p.status]} />} />
                </div>
                {p.description && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
                    <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{p.description}</p>
                  </div>
                )}
              </TabsContent>

              {/* ---------- VARIANTS ---------- */}
              <TabsContent value="variants" className="mt-3">
                {p.variants.length === 0 ? (
                  <EmptyState
                    title="No variants yet"
                    description="Add size × color variants with their own SKU, barcode, prices and stock."
                    icon={<Shirt className="h-6 w-6" />}
                    action={canEdit ? <Button size="sm" onClick={() => setAddingVariant(true)}><Plus className="mr-1.5 h-4 w-4" /> Add Variant</Button> : undefined}
                  />
                ) : (
                  <div className="overflow-x-auto rounded-lg border thin-scrollbar">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-2 font-semibold">SKU</th>
                          <th className="px-2 py-2 font-semibold">Barcode</th>
                          <th className="px-2 py-2 font-semibold">Size</th>
                          <th className="px-2 py-2 font-semibold">Color</th>
                          <th className="px-2 py-2 font-semibold">Stock</th>
                          <th className="px-2 py-2 text-right font-semibold">Cost</th>
                          <th className="px-2 py-2 text-right font-semibold">MRP</th>
                          <th className="px-2 py-2 text-right font-semibold">Selling</th>
                          {(canEdit || canDelete) && <th className="px-2 py-2 text-right font-semibold">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {p.variants.map((v) => {
                          const t = variantStock(v)
                          return (
                            <tr key={v.id} className="border-b last:border-0 hover:bg-accent/40">
                              <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">{v.sku}</td>
                              <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">{v.barcode ?? "—"}</td>
                              <td className="px-2 py-2">{v.size?.name ?? "—"}</td>
                              <td className="px-2 py-2">
                                {v.color ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="h-3 w-3 rounded-full border border-black/20" style={{ backgroundColor: v.color.hex ?? "#ccc" }} />
                    {v.color.name}
                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className={cn("font-bold tabular-nums", t <= 0 ? "text-red-600 dark:text-red-400" : t <= p.minStock ? "text-amber-600 dark:text-amber-400" : "")}>{t}</span>
                                  {v.stockLevels.filter((l) => l.warehouse).map((l) => (
                                    <span
                                      key={l.warehouseId}
                                      title={`${l.warehouse.name}: ${l.quantity} units`}
                                      className={cn(
                                        "rounded px-1 py-0.5 text-[10px] font-medium tabular-nums",
                                        l.quantity > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground",
                                      )}
                                    >
                                      {whShort(l.warehouse.name)}·{l.quantity}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums"><Money value={v.costPrice} /></td>
                              <td className="px-2 py-2 text-right tabular-nums"><Money value={v.mrp} /></td>
                              <td className="px-2 py-2 text-right font-medium tabular-nums"><Money value={v.sellingPrice} /></td>
                              {(canEdit || canDelete) && (
                                <td className="px-2 py-2">
                                  <div className="flex justify-end gap-0.5">
                                    {canEdit && (
                                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit prices / barcode" onClick={() => setPriceVariant(v)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {canDelete && (
                                      <Button
                                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                        title={t !== 0 ? "Zero out stock first" : "Delete variant"}
                                        disabled={t !== 0}
                                        onClick={() => setDeletingVariant(v)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* ---------- SALES & MOVEMENTS ---------- */}
              <TabsContent value="sales" className="mt-3 space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Units Sold" value={fmtNum(sales.sold)} tone="positive" />
                  <StatCard label="Units Returned" value={fmtNum(sales.returned)} tone="warning" />
                  <StatCard label="Net Sold" value={fmtNum(sales.net)} />
                  <StatCard label="Est. Revenue" value={fmtMoney(sales.revenue, { compact: true })} sub="Net units × selling price" tone="primary" />
                </div>
                {allMovements.length === 0 ? (
                  <EmptyState title="No movements yet" description="Sales, purchases, transfers and adjustments for this product's variants will appear here." />
                ) : (
                  <div className="max-h-96 overflow-y-auto rounded-lg border thin-scrollbar">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/95 backdrop-blur">
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2 font-semibold">Date</th>
                          <th className="px-3 py-2 font-semibold">Type</th>
                          <th className="px-3 py-2 font-semibold">Variant</th>
                          <th className="px-3 py-2 text-right font-semibold">Qty</th>
                          <th className="px-3 py-2 font-semibold">Note</th>
                          <th className="px-3 py-2 font-semibold">User</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allMovements.slice(0, 100).map((m) => (
                          <tr key={m.id} className="border-b last:border-0">
                            <td className="whitespace-nowrap px-3 py-2 text-xs"><DateCell value={m.date} withTime /></td>
                            <td className="px-3 py-2"><StatusBadge label={MOVEMENT_TYPE_LABELS[m.type] ?? m.type} className={movementColor(m.type)} /></td>
                            <td className="px-3 py-2 text-xs">{m.variantLabel || "Default"}</td>
                            <td className={cn("px-3 py-2 text-right font-semibold tabular-nums", m.quantity > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                              {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                            </td>
                            <td className="max-w-[160px] truncate px-3 py-2 text-xs text-muted-foreground" title={m.note ?? ""}>{m.note ?? "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{m.userName ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>

      {/* Sub-dialogs */}
      {addingVariant && p && <VariantForm product={p} onClose={() => setAddingVariant(false)} />}
      {priceVariant && p && <VariantPriceDialog productId={p.id} variant={priceVariant} onClose={() => setPriceVariant(null)} />}
      {deletingVariant && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setDeletingVariant(null)}
          title={`Delete variant ${deletingVariant.sku}?`}
          description="Only variants with zero stock and no sales history can be deleted."
          destructive
          confirmLabel="Delete"
          loading={variantBusy}
          onConfirm={deleteVariant}
        />
      )}
      {deletingProduct && p && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setDeletingProduct(false)}
          title={`Delete ${p.name}?`}
          description="Products with sales history are archived instead. Products holding stock cannot be deleted."
          destructive
          confirmLabel="Delete"
          loading={variantBusy}
          onConfirm={deleteProduct}
        />
      )}
    </Sheet>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

// ==================== ADD VARIANT DIALOG ====================
function VariantForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: attrData } = useQuery({ queryKey: ["attributes"], queryFn: () => api.get("attributes/all") })
  const { data: whData } = useQuery({ queryKey: ["warehouses"], queryFn: () => api.get("warehouses") })
  const sizes: any[] = attrData?.sizes ?? []
  const colors: any[] = attrData?.colors ?? []
  const warehouses: any[] = whData?.warehouses ?? []

  const [form, setForm] = useState({
    sizeId: "__none",
    colorId: "__none",
    barcode: "",
    costPrice: product.costPrice,
    mrp: product.mrp,
    sellingPrice: product.sellingPrice,
  })
  const [opening, setOpening] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const sizeName = sizes.find((s) => s.id === form.sizeId)?.name
  const colorName = colors.find((c) => c.id === form.colorId)?.name
  const skuPreview = previewSku(product.code, colorName, sizeName)

  async function save() {
    const openingStock = warehouses
      .filter((w) => (opening[w.id] ?? 0) > 0)
      .map((w) => ({ warehouseId: w.id, quantity: Math.round(opening[w.id]) }))
    setSaving(true)
    try {
      await api.post(`products/${product.id}/variants`, {
        sizeId: val(form.sizeId),
        colorId: val(form.colorId),
        barcode: form.barcode.trim() || undefined,
        costPrice: num(form.costPrice),
        mrp: num(form.mrp),
        sellingPrice: num(form.sellingPrice),
        openingStock,
      })
      toast({ title: "Variant added", description: skuPreview })
      qc.invalidateQueries({ queryKey: ["products"] })
      qc.invalidateQueries({ queryKey: ["inventory"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Failed to add variant", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto thin-scrollbar">
        <DialogHeader>
          <DialogTitle>Add Variant — {product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">SKU preview: </span>
            <span className="font-mono font-semibold">{skuPreview}</span>
            <p className="mt-0.5 text-xs text-muted-foreground">Auto-generated — made unique (-2, -3…) if already taken.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Size">
              <SelectInput value={form.sizeId} onChange={(v) => setForm({ ...form, sizeId: v })} options={[{ value: "__none", label: "— No size —" }, ...sizes.map((s: any) => ({ value: s.id, label: s.name }))]} />
            </Field>
            <Field label="Color">
              <SelectInput value={form.colorId} onChange={(v) => setForm({ ...form, colorId: v })} options={[{ value: "__none", label: "— No color —" }, ...colors.map((c: any) => ({ value: c.id, label: c.name }))]} />
            </Field>
            <Field label="Barcode">
              <TextInput value={form.barcode} onChange={(v) => setForm({ ...form, barcode: v })} placeholder="Optional" />
            </Field>
            <Field label="Cost price (₹)">
              <NumberInput value={form.costPrice} onChange={(v) => setForm({ ...form, costPrice: v })} min={0} />
            </Field>
            <Field label="MRP (₹)">
              <NumberInput value={form.mrp} onChange={(v) => setForm({ ...form, mrp: v })} min={0} />
            </Field>
            <Field label="Selling price (₹)">
              <NumberInput value={form.sellingPrice} onChange={(v) => setForm({ ...form, sellingPrice: v })} min={0} />
            </Field>
          </div>
          {warehouses.length > 0 && (
            <div className="rounded-md border">
              <p className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">Opening stock (optional)</p>
              <div className="divide-y">
                {warehouses.map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm">{w.name}{w.isDefault ? <span className="text-muted-foreground"> (default)</span> : ""}</span>
                    <div className="w-28">
                      <NumberInput value={opening[w.id] ?? 0} onChange={(v) => setOpening({ ...opening, [w.id]: v })} min={0} step="1" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add Variant</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== VARIANT PRICE DIALOG ====================
function VariantPriceDialog({ productId, variant, onClose }: { productId: string; variant: Variant; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    barcode: variant.barcode ?? "",
    costPrice: variant.costPrice,
    mrp: variant.mrp,
    sellingPrice: variant.sellingPrice,
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await api.put(`products/${productId}/variants/${variant.id}`, {
        barcode: form.barcode.trim() || undefined,
        costPrice: num(form.costPrice),
        mrp: num(form.mrp),
        sellingPrice: num(form.sellingPrice),
      })
      toast({ title: "Variant updated", description: variant.sku })
      qc.invalidateQueries({ queryKey: ["products"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Variant — {variant.sku}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Barcode"><TextInput value={form.barcode} onChange={(v) => setForm({ ...form, barcode: v })} placeholder="Optional" /></Field>
          </div>
          <Field label="Cost price (₹)"><NumberInput value={form.costPrice} onChange={(v) => setForm({ ...form, costPrice: v })} min={0} /></Field>
          <Field label="MRP (₹)"><NumberInput value={form.mrp} onChange={(v) => setForm({ ...form, mrp: v })} min={0} /></Field>
          <div className="sm:col-span-2">
            <Field label="Selling price (₹)"><NumberInput value={form.sellingPrice} onChange={(v) => setForm({ ...form, sellingPrice: v })} min={0} /></Field>
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

// ==================== CATEGORIES & ATTRIBUTES TAB ====================
function useAttrCrud(table: string) {
  const qc = useQueryClient()
  function invalidate() {
    qc.invalidateQueries({ queryKey: ["attributes"] })
    qc.invalidateQueries({ queryKey: ["products"] })
  }
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`attributes/${table}`, body),
    onSuccess: () => { toast({ title: "Added" }); invalidate() },
    onError: (e: any) => toast({ title: "Could not add", description: e.message, variant: "destructive" }),
  })
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.put(`attributes/${table}/${id}`, body),
    onSuccess: () => { toast({ title: "Updated" }); invalidate() },
    onError: (e: any) => toast({ title: "Could not update", description: e.message, variant: "destructive" }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`attributes/${table}/${id}`),
    onSuccess: () => { toast({ title: "Deleted" }); invalidate() },
    onError: (e: any) => toast({ title: "Could not delete", description: e.message, variant: "destructive" }),
  })
  return { add, update, remove }
}

function AttributesTab() {
  const { data, isLoading } = useQuery({ queryKey: ["attributes"], queryFn: () => api.get("attributes/all") })
  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="h-48 animate-pulse bg-muted/30">&nbsp;</CardContent></Card>
        ))}
      </div>
    )
  }
  const categories: any[] = data?.categories ?? []
  const collections: any[] = data?.collections ?? []
  const sizes: any[] = data?.sizes ?? []
  const colors: any[] = data?.colors ?? []
  const materials: any[] = data?.materials ?? []
  const patterns: any[] = data?.patterns ?? []

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <CategoriesSection items={categories} />
      <CollectionsSection items={collections} />
      <SizesSection items={sizes} />
      <ColorsSection items={colors} />
      <NameSection title="Materials" table="materials" items={materials} icon={<Layers className="h-4 w-4" />} hint="Fabrics — Cotton, Linen, Rayon, Denim…" />
      <NameSection title="Patterns" table="patterns" items={patterns} icon={<Shapes className="h-4 w-4" />} hint="Designs — Solid, Striped, Printed, Embroidered…" />
    </div>
  )
}

function AttrCard({ title, icon, count, addForm, children }: {
  title: string
  icon: React.ReactNode
  count: number
  addForm?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
          <h3 className="text-sm font-semibold">{title}</h3>
          <Badge variant="secondary" className="tabular-nums">{count}</Badge>
        </div>
        {addForm}
        {count === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            No {title.toLowerCase()} defined yet{addForm ? " — add the first one above" : ""}
          </p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto thin-scrollbar pr-0.5">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

function AttrRow({ label, meta, swatch, badge, onEdit, onDelete, canEdit, canDelete }: {
  label: React.ReactNode
  meta?: React.ReactNode
  swatch?: React.ReactNode
  badge?: React.ReactNode
  onEdit?: () => void
  onDelete?: () => void
  canEdit?: boolean
  canDelete?: boolean
}) {
  return (
    <div className="group flex items-center gap-2 rounded-md border px-2.5 py-1.5">
      {swatch}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      {badge}
      {(canEdit || canDelete) && (
        <div className="flex shrink-0 items-center gap-0.5">
          {canEdit && (
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Edit" onClick={onEdit}>
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" title="Delete" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function EditRow({ children, onSave, onCancel, saving }: {
  children: React.ReactNode
  onSave: () => void
  onCancel: () => void
  saving?: boolean
}) {
  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-2">
      {children}
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" className="h-7" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-7" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Save
        </Button>
      </div>
    </div>
  )
}

// ---------- Categories ----------
function CategoriesSection({ items }: { items: any[] }) {
  const { add, update, remove } = useAttrCrud("categories")
  const canCreate = canDo("products", "create")
  const canEdit = canDo("products", "edit")
  const canDelete = canDo("products", "delete")
  const [name, setName] = useState("")
  const [parentId, setParentId] = useState("")
  const [editing, setEditing] = useState<any | null>(null)
  const [deleting, setDeleting] = useState<any | null>(null)

  const parentOptions = [{ value: "", label: "Top-level" }, ...items.map((i) => ({ value: i.id, label: i.name }))]

  function submitAdd() {
    if (!name.trim()) return toast({ title: "Category name is required", variant: "destructive" })
    add.mutate({ name: name.trim(), parentId: parentId || undefined, sortOrder: items.length + 1 }, {
      onSuccess: () => { setName(""); setParentId("") },
    })
  }

  return (
    <AttrCard
      title="Categories"
      icon={<FolderTree className="h-4 w-4" />}
      count={items.length}
      addForm={canCreate ? (
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAdd()} placeholder="New category name" className="h-8 min-w-[140px] flex-1" />
          <Select value={parentId} onValueChange={setParentId}>
            <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Parent" /></SelectTrigger>
            <SelectContent>
              {parentOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8" onClick={submitAdd} disabled={add.isPending}><Plus className="h-3.5 w-3.5" />Add</Button>
        </div>
      ) : undefined}
    >
      {items.map((c) => (
        editing?.id === c.id ? (
          <EditRow key={c.id} saving={update.isPending} onCancel={() => setEditing(null)} onSave={() => {
            if (!editing.name.trim()) return toast({ title: "Name is required", variant: "destructive" })
            update.mutate({ id: c.id, body: { name: editing.name.trim(), parentId: editing.parentId || undefined, sortOrder: Number(editing.sortOrder) || 0 } }, { onSuccess: () => setEditing(null) })
          }}>
            <div className="flex flex-wrap gap-2">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Name" className="h-8 min-w-[110px] flex-1" />
              <Select value={editing.parentId ?? ""} onValueChange={(v) => setEditing({ ...editing, parentId: v })}>
                <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="Parent" /></SelectTrigger>
                <SelectContent>
                  {parentOptions.filter((o) => o.value !== c.id).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })} className="h-8 w-16" title="Sort order" />
            </div>
          </EditRow>
        ) : (
          <AttrRow
            key={c.id}
            label={c.name}
            meta={c.parentId ? `Under: ${items.find((x) => x.id === c.parentId)?.name ?? "—"}` : "Top-level category"}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => setEditing({ ...c, parentId: c.parentId ?? "", sortOrder: c.sortOrder ?? 0 })}
            onDelete={() => setDeleting(c)}
          />
        )
      ))}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setDeleting(null)}
          title={`Delete "${deleting.name}"?`}
          description="Categories in use by products cannot be deleted."
          destructive
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        />
      )}
    </AttrCard>
  )
}

// ---------- Collections ----------
function CollectionsSection({ items }: { items: any[] }) {
  const { add, update, remove } = useAttrCrud("collections")
  const canCreate = canDo("products", "create")
  const canEdit = canDo("products", "edit")
  const canDelete = canDo("products", "delete")
  const [name, setName] = useState("")
  const [season, setSeason] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [editing, setEditing] = useState<any | null>(null)
  const [deleting, setDeleting] = useState<any | null>(null)

  function submitAdd() {
    if (!name.trim()) return toast({ title: "Collection name is required", variant: "destructive" })
    add.mutate({
      name: name.trim(),
      season: season || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      active: true,
    }, {
      onSuccess: () => { setName(""); setSeason(""); setStartDate(""); setEndDate("") },
    })
  }

  return (
    <AttrCard
      title="Collections"
      icon={<Sparkles className="h-4 w-4" />}
      count={items.length}
      addForm={canCreate ? (
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAdd()} placeholder="New collection name" className="h-8 min-w-[130px] flex-1" />
          <Select value={season} onValueChange={setSeason}>
            <SelectTrigger className="h-8 w-[130px]"><SelectValue placeholder="Season" /></SelectTrigger>
            <SelectContent>
              {COLLECTION_SEASONS.map((s) => <SelectItem key={s} value={s}>{COLLECTION_SEASON_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 w-[140px]" title="Start date" />
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 w-[140px]" title="End date" />
          <Button size="sm" className="h-8" onClick={submitAdd} disabled={add.isPending}><Plus className="h-3.5 w-3.5" />Add</Button>
        </div>
      ) : undefined}
    >
      {items.map((c) => (
        editing?.id === c.id ? (
          <EditRow key={c.id} saving={update.isPending} onCancel={() => setEditing(null)} onSave={() => {
            if (!editing.name.trim()) return toast({ title: "Name is required", variant: "destructive" })
            update.mutate({ id: c.id, body: { name: editing.name.trim(), season: editing.season || undefined, active: !!editing.active } }, { onSuccess: () => setEditing(null) })
          }}>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Name" className="h-8 min-w-[110px] flex-1" />
              <Select value={editing.season ?? ""} onValueChange={(v) => setEditing({ ...editing, season: v })}>
                <SelectTrigger className="h-8 w-[120px]"><SelectValue placeholder="Season" /></SelectTrigger>
                <SelectContent>
                  {COLLECTION_SEASONS.map((s) => <SelectItem key={s} value={s}>{COLLECTION_SEASON_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <SwitchInput checked={!!editing.active} onChange={(v) => setEditing({ ...editing, active: v })} label="Active" />
            </div>
          </EditRow>
        ) : (
          <AttrRow
            key={c.id}
            label={c.name}
            meta={
              <>
                {c.startDate || c.endDate ? `${c.startDate ? fmtDateIST(c.startDate) : "?"} → ${c.endDate ? fmtDateIST(c.endDate) : "?"}` : "No date range"}
                {!c.active && " · Inactive"}
              </>
            }
            badge={c.season ? <StatusBadge label={COLLECTION_SEASON_LABELS[c.season] ?? c.season} className={SEASON_COLORS[c.season] ?? SEASON_COLORS.ALL_SEASON} /> : undefined}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => setEditing({ ...c })}
            onDelete={() => setDeleting(c)}
          />
        )
      ))}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setDeleting(null)}
          title={`Delete "${deleting.name}"?`}
          description="Collections in use by products cannot be deleted."
          destructive
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        />
      )}
    </AttrCard>
  )
}

// ---------- Sizes ----------
function SizesSection({ items }: { items: any[] }) {
  const { add, update, remove } = useAttrCrud("sizes")
  const canCreate = canDo("products", "create")
  const canEdit = canDo("products", "edit")
  const canDelete = canDo("products", "delete")
  const [name, setName] = useState("")
  const [editing, setEditing] = useState<any | null>(null)
  const [deleting, setDeleting] = useState<any | null>(null)

  function submitAdd() {
    if (!name.trim()) return toast({ title: "Size name is required", variant: "destructive" })
    add.mutate({ name: name.trim(), sortOrder: items.length + 1 }, { onSuccess: () => setName("") })
  }

  return (
    <AttrCard
      title="Sizes"
      icon={<Ruler className="h-4 w-4" />}
      count={items.length}
      addForm={canCreate ? (
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAdd()} placeholder="New size (e.g. XL, 32)" className="h-8 flex-1" />
          <Button size="sm" className="h-8" onClick={submitAdd} disabled={add.isPending}><Plus className="h-3.5 w-3.5" />Add</Button>
        </div>
      ) : undefined}
    >
      {items.map((s, i) => (
        editing?.id === s.id ? (
          <EditRow key={s.id} saving={update.isPending} onCancel={() => setEditing(null)} onSave={() => {
            if (!editing.name.trim()) return toast({ title: "Name is required", variant: "destructive" })
            update.mutate({ id: s.id, body: { name: editing.name.trim(), sortOrder: Number(editing.sortOrder) || 0 } }, { onSuccess: () => setEditing(null) })
          }}>
            <div className="flex items-center gap-2">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Name" className="h-8 flex-1" />
              <Input type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })} className="h-8 w-20" title="Sort order" />
            </div>
          </EditRow>
        ) : (
          <AttrRow
            key={s.id}
            label={
              <span className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                {s.name}
              </span>
            }
            meta={`Sort order: ${s.sortOrder ?? 0}`}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => setEditing({ ...s, sortOrder: s.sortOrder ?? 0 })}
            onDelete={() => setDeleting(s)}
          />
        )
      ))}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setDeleting(null)}
          title={`Delete size "${deleting.name}"?`}
          description="Sizes in use by product variants cannot be deleted."
          destructive
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        />
      )}
    </AttrCard>
  )
}

// ---------- Colors ----------
function ColorsSection({ items }: { items: any[] }) {
  const { add, update, remove } = useAttrCrud("colors")
  const canCreate = canDo("products", "create")
  const canEdit = canDo("products", "edit")
  const canDelete = canDo("products", "delete")
  const [name, setName] = useState("")
  const [hex, setHex] = useState("#16a34a")
  const [editing, setEditing] = useState<any | null>(null)
  const [deleting, setDeleting] = useState<any | null>(null)

  function submitAdd() {
    if (!name.trim()) return toast({ title: "Color name is required", variant: "destructive" })
    add.mutate({ name: name.trim(), hex }, { onSuccess: () => setName("") })
  }

  return (
    <AttrCard
      title="Colors"
      icon={<Palette className="h-4 w-4" />}
      count={items.length}
      addForm={canCreate ? (
        <div className="flex gap-2">
          <Input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="h-8 w-10 cursor-pointer p-0.5" title="Pick color" />
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAdd()} placeholder="New color name" className="h-8 flex-1" />
          <Input value={hex} onChange={(e) => setHex(e.target.value)} className="h-8 w-24 font-mono text-xs" placeholder="#hex" />
          <Button size="sm" className="h-8" onClick={submitAdd} disabled={add.isPending}><Plus className="h-3.5 w-3.5" />Add</Button>
        </div>
      ) : undefined}
    >
      {items.map((c) => (
        editing?.id === c.id ? (
          <EditRow key={c.id} saving={update.isPending} onCancel={() => setEditing(null)} onSave={() => {
            if (!editing.name.trim()) return toast({ title: "Name is required", variant: "destructive" })
            update.mutate({ id: c.id, body: { name: editing.name.trim(), hex: editing.hex || "#000000" } }, { onSuccess: () => setEditing(null) })
          }}>
            <div className="flex items-center gap-2">
              <Input type="color" value={editing.hex ?? "#000000"} onChange={(e) => setEditing({ ...editing, hex: e.target.value })} className="h-8 w-10 cursor-pointer p-0.5" />
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Name" className="h-8 flex-1" />
              <Input value={editing.hex ?? ""} onChange={(e) => setEditing({ ...editing, hex: e.target.value })} className="h-8 w-24 font-mono text-xs" />
            </div>
          </EditRow>
        ) : (
          <AttrRow
            key={c.id}
            label={c.name}
            meta={c.hex ?? ""}
            swatch={<span className="h-4 w-4 shrink-0 rounded-full border border-black/20" style={{ backgroundColor: c.hex ?? "#000" }} />}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => setEditing({ ...c })}
            onDelete={() => setDeleting(c)}
          />
        )
      ))}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setDeleting(null)}
          title={`Delete color "${deleting.name}"?`}
          description="Colors in use by product variants cannot be deleted."
          destructive
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        />
      )}
    </AttrCard>
  )
}

// ---------- Materials / Patterns ----------
function NameSection({ title, table, items, icon, hint }: {
  title: string
  table: string
  items: any[]
  icon: React.ReactNode
  hint?: string
}) {
  const { add, update, remove } = useAttrCrud(table)
  const canCreate = canDo("products", "create")
  const canEdit = canDo("products", "edit")
  const canDelete = canDo("products", "delete")
  const [name, setName] = useState("")
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<any | null>(null)

  function submitAdd() {
    if (!name.trim()) return toast({ title: `${title.slice(0, -1)} name is required`, variant: "destructive" })
    add.mutate({ name: name.trim() }, { onSuccess: () => setName("") })
  }

  return (
    <AttrCard
      title={title}
      icon={icon}
      count={items.length}
      addForm={canCreate ? (
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitAdd()} placeholder={`New ${title.toLowerCase()} name`} className="h-8 flex-1" />
          <Button size="sm" className="h-8" onClick={submitAdd} disabled={add.isPending}><Plus className="h-3.5 w-3.5" />Add</Button>
        </div>
      ) : undefined}
    >
      {hint && <p className="px-1 pb-1 text-xs text-muted-foreground">{hint}</p>}
      {items.map((m) => (
        editing?.id === m.id ? (
          <EditRow key={m.id} saving={update.isPending} onCancel={() => setEditing(null)} onSave={() => {
            if (!editing || !editing.name.trim()) return toast({ title: "Name is required", variant: "destructive" })
            update.mutate({ id: m.id, body: { name: editing.name.trim() } }, { onSuccess: () => setEditing(null) })
          }}>
            <Input value={editing?.name ?? ""} onChange={(e) => setEditing(editing ? { ...editing, name: e.target.value } : { id: m.id, name: e.target.value })} placeholder="Name" className="h-8" autoFocus />
          </EditRow>
        ) : (
          <AttrRow
            key={m.id}
            label={m.name}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={() => setEditing({ id: m.id, name: m.name })}
            onDelete={() => setDeleting(m)}
          />
        )
      ))}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(v) => !v && setDeleting(null)}
          title={`Delete "${deleting.name}"?`}
          description={`${title} in use by products cannot be deleted.`}
          destructive
          confirmLabel="Delete"
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        />
      )}
    </AttrCard>
  )
}
