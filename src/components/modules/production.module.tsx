"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/client/api"
import { useApp, canDo } from "@/lib/client/store"
import { PageHeader, StatCard, EmptyState } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import {
  StatusBadge, Money, DateCell, ConfirmDialog, Field, TextInput, NumberInput, SelectInput, TextArea, EntityPicker,
} from "@/components/shared/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import {
  Factory, Scissors, HardHat, Package, PackagePlus, PackageCheck, Plus, Pencil, Trash2, Loader2,
  IndianRupee, CalendarClock, CheckCircle2, XCircle, AlertTriangle, ArrowRight, Phone, MapPin,
  Wallet, Layers, Boxes, ClipboardList, Search, Check, X, Banknote, Timer,
} from "lucide-react"
import { fmtMoney, fmtNum, fmtDateIST, ymdIST } from "@/lib/format"
import {
  PRODUCTION_STAGES, PRODUCTION_STAGE_LABELS, CONTRACTOR_TYPES, CONTRACTOR_TYPE_LABELS,
  JOBWORK_STATUSES, JOBWORK_STATUS_LABELS, RAW_MATERIAL_TYPES, RAW_MATERIAL_TYPE_LABELS,
  RAW_MATERIAL_UNITS, RAW_MATERIAL_UNIT_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
} from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// ==================== TYPES ====================
interface Contractor {
  id: string; name: string; type: string; phone: string | null; address: string | null
  rate: number; outstanding: number; active: boolean; notes: string | null; createdAt: string
  stats?: { totalWorks: number; activeWorks: number; completedWorks: number; totalEarned: number; outstanding: number }
  jobWorks?: JobWork[]; payments?: PaymentRec[]
}
interface PaymentRec {
  id: string; number: string; date: string; method: string; amount: number
  direction: string; status: string; notes: string | null; contractorId?: string | null
}
interface JobWork {
  id: string; number: string; contractorId: string; contractor?: Contractor
  productId: string | null; variantId: string | null; description: string
  quantity: number; completedQty: number; rate: number; totalAmount: number; status: string
  dueDate: string | null; assignedAt: string; completedAt: string | null; notes: string | null; createdByName: string | null
}
interface PlanLine { variantId: string; qty: number }
interface ProductionOrder {
  id: string; number: string; productId: string; designName: string | null; contractorId: string | null
  contractor?: Contractor | null; quantity: number; stage: string; status: string
  planLines?: string | null; plan?: PlanLine[]; costEstimate: number; notes: string | null
  startDate: string; targetDate: string | null; completedAt: string | null; createdByName: string | null
}
interface RawMaterial {
  id: string; name: string; type: string; unit: string; quantity: number; minQuantity: number
  costPerUnit: number; supplierId: string | null; notes: string | null; updatedAt: string; createdAt: string
}
interface VariantLite { id: string; sku: string | null; size?: { name: string } | null; color?: { name: string } | null }
interface ProductLite { id: string; name: string; code: string; status: string; variants?: VariantLite[] }

type DetailRef = { type: "order" | "jobwork" | "contractor"; id: string }

// ==================== CONSTANTS / HELPERS ====================
const STAGES: readonly string[] = PRODUCTION_STAGES

const TAB_ALIASES: Record<string, string> = {
  orders: "orders", order: "orders", production: "orders", "production-orders": "orders",
  jobwork: "jobwork", jobworks: "jobwork", job: "jobwork", "job-work": "jobwork", "job-works": "jobwork",
  contractors: "contractors", contractor: "contractors",
  materials: "materials", material: "materials", "raw-materials": "materials", rawmaterials: "materials",
}

function normalizeTab(t: unknown): string {
  return TAB_ALIASES[String(t ?? "").toLowerCase()] ?? "orders"
}

const ORDER_STATUS_LABEL: Record<string, string> = { IN_PROGRESS: "In Progress", COMPLETED: "Completed", CANCELLED: "Cancelled" }
const ORDER_STATUS_BADGE: Record<string, string> = {
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  COMPLETED: "bg-emerald-600 text-white",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}

const JOBWORK_STATUS_BADGE: Record<string, string> = {
  ASSIGNED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  PROCESSING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  COMPLETED: "bg-emerald-600 text-white",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}

const CONTRACTOR_TYPE_BADGE: Record<string, string> = {
  TAILOR: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  STITCHING: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  PRINTING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  EMBROIDERY: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  JOB_WORKER: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  FABRIC_SUPPLIER: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  OTHER: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
}

const RAW_MATERIAL_TYPE_BADGE: Record<string, string> = {
  FABRIC: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  THREAD: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  BUTTON: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ZIPPER: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  LABEL: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  PACKAGING: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  OTHER: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
}

function parsePlan(o: ProductionOrder): PlanLine[] {
  const raw = (o as any).plan ?? o.planLines
  if (Array.isArray(raw)) return raw as PlanLine[]
  if (typeof raw === "string" && raw) {
    try { return JSON.parse(raw) as PlanLine[] } catch { return [] }
  }
  return []
}

function variantShortLabel(v: VariantLite): string {
  const parts = [v.size?.name, v.color?.name].filter(Boolean).join(" · ")
  return parts || v.sku || "Default variant"
}

function isOverdue(dateStr: string | null | undefined, active: boolean): boolean {
  return !!dateStr && active && new Date(dateStr) < new Date()
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 pt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

// Money owed TO someone (contractor payable): amber when due, red when overpaid (advance), muted when settled
function OutstandingMoney({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        "tabular-nums font-semibold",
        value > 0 ? "text-amber-600 dark:text-amber-400" : value < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
        className,
      )}
    >
      {fmtMoney(value)}
    </span>
  )
}

// Compact horizontal stage indicator for order cards
function StageDots({ stage, status }: { stage: string; status: string }) {
  const idx = STAGES.indexOf(stage)
  const done = status === "COMPLETED"
  const cancelled = status === "CANCELLED"
  const pct = done ? 100 : Math.round((Math.max(0, idx) / (STAGES.length - 1)) * 100)
  return (
    <div>
      <div className="flex items-center" aria-label={`Stage ${idx + 1} of ${STAGES.length}: ${PRODUCTION_STAGE_LABELS[stage] ?? stage}`}>
        {STAGES.map((s, i) => (
          <Fragment key={s}>
            {i > 0 && <div className={cn("h-0.5 min-w-[6px] flex-1", !cancelled && (done || i <= idx) ? "bg-primary" : "bg-muted")} />}
            <div
              className={cn(
                "h-2 w-2 shrink-0 rounded-full transition-colors",
                cancelled ? "bg-muted-foreground/40" :
                  done || i < idx ? "bg-primary" :
                    i === idx ? "bg-primary ring-2 ring-primary/25 ring-offset-1" : "bg-muted-foreground/30",
              )}
            />
          </Fragment>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px]">
        <span className="font-medium">
          {cancelled ? `Cancelled at ${PRODUCTION_STAGE_LABELS[stage] ?? stage}` :
            done ? "All stages complete" :
              `Stage ${idx + 1}/${STAGES.length} · ${PRODUCTION_STAGE_LABELS[stage] ?? stage}`}
        </span>
        <span className="tabular-nums text-muted-foreground">{pct}%</span>
      </div>
    </div>
  )
}

// Full vertical stepper for the order detail sheet
function StageStepper({ stage, status }: { stage: string; status: string }) {
  const idx = STAGES.indexOf(stage)
  return (
    <ol className="relative">
      {STAGES.map((s, i) => {
        const isDone = status === "COMPLETED" || i < idx
        const isCurrent = status === "IN_PROGRESS" && i === idx
        const isCancelledAt = status === "CANCELLED" && i === idx
        return (
          <li key={s} className="relative flex gap-3 pb-3.5 last:pb-0">
            {i < STAGES.length - 1 && (
              <span className={cn("absolute left-[11px] top-7 h-[calc(100%-16px)] w-0.5", isDone ? "bg-primary/50" : "bg-border")} />
            )}
            <span
              className={cn(
                "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                isCancelledAt ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
                  isDone ? "bg-primary text-primary-foreground" :
                    isCurrent ? "border-2 border-primary bg-primary/10 text-primary" :
                      "bg-muted text-muted-foreground",
              )}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : isCancelledAt ? <X className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("text-sm leading-6", isCurrent || isCancelledAt ? "font-semibold" : "text-muted-foreground")}>
                {PRODUCTION_STAGE_LABELS[s] ?? s}
              </p>
              {isCurrent && <p className="text-xs font-medium text-primary">Current stage</p>}
              {isCancelledAt && <p className="text-xs text-red-600 dark:text-red-400">Order cancelled at this stage</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ==================== MODULE ROOT ====================
export function ProductionModule() {
  const { moduleParams } = useApp()
  const qc = useQueryClient()
  const [tab, setTab] = useState(() => normalizeTab(moduleParams?.tab))

  // detail sheet + deep-link resolution
  const [detail, setDetail] = useState<DetailRef | null>(null)
  const [resolveId, setResolveId] = useState<string | null>(null)
  const [materialEditId, setMaterialEditId] = useState<string | null>(null)

  // dialog states (root-level so any tab / detail can trigger them)
  const [newOrder, setNewOrder] = useState(false)
  const [newJobWork, setNewJobWork] = useState<{ contractorId?: string } | null>(null)
  const [newContractor, setNewContractor] = useState(false)
  const [newMaterial, setNewMaterial] = useState(false)
  const [editingContractor, setEditingContractor] = useState<Contractor | null>(null)
  const [editingMaterial, setEditingMaterial] = useState<RawMaterial | null>(null)
  const [addStockTo, setAddStockTo] = useState<RawMaterial | null>(null)
  const [deletingContractor, setDeletingContractor] = useState<Contractor | null>(null)
  const [deletingMaterial, setDeletingMaterial] = useState<RawMaterial | null>(null)

  // Apply module params (deep links from sidebar, command palette, other modules) once per
  // distinct params object. Deferred a tick so we never cascade renders synchronously.
  const appliedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!moduleParams) return
    const key = JSON.stringify(moduleParams)
    if (appliedRef.current === key) return
    appliedRef.current = key
    const timer = setTimeout(() => {
      const t = moduleParams.tab ? normalizeTab(moduleParams.tab) : null
      if (t) setTab(t)
      const eid = moduleParams.entityId as string | undefined
      if (eid) {
        if (t === "orders") setDetail({ type: "order", id: eid })
        else if (t === "jobwork") setDetail({ type: "jobwork", id: eid })
        else if (t === "contractors") setDetail({ type: "contractor", id: eid })
        else if (t === "materials") setMaterialEditId(eid)
        else setResolveId(eid)
      }
      if (moduleParams.new) {
        if (t === "jobwork") setNewJobWork({})
        else if (t === "contractors") setNewContractor(true)
        else if (t === "materials") setNewMaterial(true)
        else setNewOrder(true)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [moduleParams])

  // Data queries — all lists are fetched unfiltered so summary stats stay stable
  const ordersQuery = useQuery({
    queryKey: ["production"],
    queryFn: () => api.get("production"),
    enabled: tab === "orders",
  })
  const jobworksQuery = useQuery({
    queryKey: ["jobworks"],
    queryFn: () => api.get("jobworks"),
    enabled: tab === "jobwork",
  })
  const contractorsQuery = useQuery({
    queryKey: ["contractors"],
    queryFn: () => api.get("contractors"),
    enabled: tab === "contractors",
  })
  const materialsQuery = useQuery({
    queryKey: ["raw-materials"],
    queryFn: () => api.get("raw-materials"),
    enabled: tab === "materials",
  })
  const productsQuery = useQuery({
    queryKey: ["products", "lookup"],
    queryFn: () => api.get("products?pageSize=200"),
    enabled: tab === "orders" || tab === "jobwork" || !!detail,
  })

  // Product / variant lookups (orders & job works only expose productId)
  const products: ProductLite[] = useMemo(() => productsQuery.data?.products ?? [], [productsQuery.data])
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const variantById = useMemo(() => {
    const m = new Map<string, { variant: VariantLite; product: ProductLite }>()
    for (const p of products) for (const v of p.variants ?? []) m.set(v.id, { variant: v, product: p })
    return m
  }, [products])
  const productName = useCallback(
    (id: string | null | undefined) => (id ? productById.get(id)?.name ?? "—" : "—"),
    [productById],
  )
  const variantLabel = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "—"
      const e = variantById.get(id)
      if (!e) return "Linked variant"
      return `${e.product.name} — ${variantShortLabel(e.variant)}`
    },
    [variantById],
  )

  // Resolve an entityId that arrived without a tab (e.g. Ctrl+K global search hits
  // contractors / job works under the production module). Loads the shared list queries
  // through the cache so the resolved tab renders instantly afterwards.
  useEffect(() => {
    if (!resolveId) return
    let cancelled = false
    ;(async () => {
      try {
        const [prodRes, jwRes, conRes, matRes] = await Promise.all([
          qc.ensureQueryData({ queryKey: ["production"], queryFn: () => api.get("production") }),
          qc.ensureQueryData({ queryKey: ["jobworks"], queryFn: () => api.get("jobworks") }),
          qc.ensureQueryData({ queryKey: ["contractors"], queryFn: () => api.get("contractors") }),
          qc.ensureQueryData({ queryKey: ["raw-materials"], queryFn: () => api.get("raw-materials") }),
        ] as const)
        if (cancelled) return
        const orders: any[] = (prodRes as any)?.orders ?? []
        const jws: any[] = (jwRes as any)?.jobWorks ?? []
        const cons: any[] = (conRes as any)?.contractors ?? []
        const mats: any[] = (matRes as any)?.materials ?? []
        if (orders.some((o) => o.id === resolveId)) { setDetail({ type: "order", id: resolveId }); setTab("orders") }
        else if (jws.some((j) => j.id === resolveId)) { setDetail({ type: "jobwork", id: resolveId }); setTab("jobwork") }
        else if (cons.some((c) => c.id === resolveId)) { setDetail({ type: "contractor", id: resolveId }); setTab("contractors") }
        else if (mats.some((m) => m.id === resolveId)) { setMaterialEditId(resolveId); setTab("materials") }
        else {
          toast({ title: "Record not found", description: "The linked production record no longer exists.", variant: "destructive" })
        }
      } catch {
        // network/permission hiccup — the module stays usable
      } finally {
        if (!cancelled) setResolveId(null)
      }
    })()
    return () => { cancelled = true }
  }, [resolveId, qc])

  const canCreate = canDo("production", "create")
  const canEdit = canDo("production", "edit")

  const primaryAction =
    tab === "jobwork" ? { label: "New Job Work", icon: <Scissors className="mr-1.5 h-4 w-4" />, onClick: () => setNewJobWork({}) } :
      tab === "contractors" ? { label: "New Contractor", icon: <HardHat className="mr-1.5 h-4 w-4" />, onClick: () => setNewContractor(true) } :
        tab === "materials" ? { label: "New Material", icon: <PackagePlus className="mr-1.5 h-4 w-4" />, onClick: () => setNewMaterial(true) } :
          { label: "New Production Order", icon: <Plus className="mr-1.5 h-4 w-4" />, onClick: () => setNewOrder(true) }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Factory className="h-5 w-5" />}
        title="Production"
        description="Track production orders from design to packaging, manage contractor job work and raw material stock."
        actions={
          <>
            <Button
              variant="outline" size="sm"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ["production"] })
                qc.invalidateQueries({ queryKey: ["jobworks"] })
                qc.invalidateQueries({ queryKey: ["contractors"] })
                qc.invalidateQueries({ queryKey: ["raw-materials"] })
              }}
            >
              Refresh
            </Button>
            {canCreate && (
              <Button size="sm" onClick={primaryAction.onClick}>
                {primaryAction.icon} {primaryAction.label}
              </Button>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
          <TabsTrigger value="orders" className="gap-1.5"><Factory className="h-4 w-4" /> Production Orders</TabsTrigger>
          <TabsTrigger value="jobwork" className="gap-1.5"><Scissors className="h-4 w-4" /> Job Work</TabsTrigger>
          <TabsTrigger value="contractors" className="gap-1.5"><HardHat className="h-4 w-4" /> Contractors</TabsTrigger>
          <TabsTrigger value="materials" className="gap-1.5"><Package className="h-4 w-4" /> Raw Materials</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <OrdersTab
            orders={ordersQuery.data?.orders ?? []}
            summary={ordersQuery.data?.summary}
            loading={ordersQuery.isLoading}
            productName={productName}
            onOpen={(id) => setDetail({ type: "order", id })}
            onNew={() => setNewOrder(true)}
            canCreate={canCreate}
          />
        </TabsContent>

        <TabsContent value="jobwork" className="mt-4">
          <JobWorkTab
            jobWorks={jobworksQuery.data?.jobWorks ?? []}
            summary={jobworksQuery.data?.summary}
            loading={jobworksQuery.isLoading}
            variantLabel={variantLabel}
            onOpen={(id) => setDetail({ type: "jobwork", id })}
            onNew={() => setNewJobWork({})}
            canCreate={canCreate}
          />
        </TabsContent>

        <TabsContent value="contractors" className="mt-4">
          <ContractorsTab
            contractors={contractorsQuery.data?.contractors ?? []}
            loading={contractorsQuery.isLoading}
            onOpen={(id) => setDetail({ type: "contractor", id })}
            onNew={() => setNewContractor(true)}
            canCreate={canCreate}
          />
        </TabsContent>

        <TabsContent value="materials" className="mt-4">
          <MaterialsTab
            materials={materialsQuery.data?.materials ?? []}
            summary={materialsQuery.data?.summary}
            loading={materialsQuery.isLoading}
            onNew={() => setNewMaterial(true)}
            onEdit={setEditingMaterial}
            onAddStock={setAddStockTo}
            onDelete={setDeletingMaterial}
            canCreate={canCreate}
            canEdit={canEdit}
            canDelete={canDo("production", "delete")}
            materialEditId={materialEditId}
            onEditIdConsumed={() => setMaterialEditId(null)}
          />
        </TabsContent>
      </Tabs>

      {/* ===== Detail sheets ===== */}
      {detail?.type === "order" && (
        <ProductionOrderDetail
          id={detail.id}
          onClose={() => setDetail(null)}
          canEdit={canEdit}
          productName={productName}
          variantLabel={variantLabel}
        />
      )}
      {detail?.type === "jobwork" && (
        <JobWorkDetail
          id={detail.id}
          onClose={() => setDetail(null)}
          canEdit={canEdit}
          productName={productName}
          variantLabel={variantLabel}
          onOpenContractor={(id) => setDetail({ type: "contractor", id })}
        />
      )}
      {detail?.type === "contractor" && (
        <ContractorDetail
          id={detail.id}
          onClose={() => setDetail(null)}
          onEdit={setEditingContractor}
          onDelete={setDeletingContractor}
          onAssignJobWork={(contractorId) => setNewJobWork({ contractorId })}
          onOpenJobWork={(id) => setDetail({ type: "jobwork", id })}
          canPay={canDo("production", "pay")}
        />
      )}

      {/* ===== Create / edit dialogs ===== */}
      {newOrder && <NewProductionOrderDialog onClose={() => setNewOrder(false)} />}
      {newJobWork && <NewJobWorkDialog prefill={newJobWork} onClose={() => setNewJobWork(null)} />}
      {newContractor && <ContractorForm onClose={() => setNewContractor(false)} />}
      {editingContractor && <ContractorForm contractor={editingContractor} onClose={() => setEditingContractor(null)} />}
      {newMaterial && <MaterialForm onClose={() => setNewMaterial(false)} />}
      {editingMaterial && <MaterialForm material={editingMaterial} onClose={() => setEditingMaterial(null)} />}
      {addStockTo && <AddStockDialog material={addStockTo} onClose={() => setAddStockTo(null)} />}

      {/* ===== Delete confirmations ===== */}
      {deletingContractor && (
        <DeleteContractorConfirm contractor={deletingContractor} onClose={() => setDeletingContractor(null)} />
      )}
      {deletingMaterial && (
        <DeleteMaterialConfirm material={deletingMaterial} onClose={() => setDeletingMaterial(null)} />
      )}
    </div>
  )
}

// ==================== TAB: PRODUCTION ORDERS ====================
function OrdersTab({
  orders, summary, loading, productName, onOpen, onNew, canCreate,
}: {
  orders: ProductionOrder[]
  summary?: { active: number; completed: number }
  loading: boolean
  productName: (id: string | null | undefined) => string
  onOpen: (id: string) => void
  onNew: () => void
  canCreate: boolean
}) {
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [q, setQ] = useState("")

  const filtered = orders.filter((o) => {
    if (statusFilter !== "ALL" && o.status !== statusFilter) return false
    if (q) {
      const hay = `${o.number} ${productName(o.productId)} ${o.designName ?? ""} ${o.contractor?.name ?? ""}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  const activePieces = orders.filter((o) => o.status === "IN_PROGRESS").reduce((s, o) => s + o.quantity, 0)
  const overdueCount = orders.filter((o) => isOverdue(o.targetDate, o.status === "IN_PROGRESS")).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active Orders" value={summary?.active ?? "…"} sub="In production now" icon={<Factory className="h-4 w-4" />} tone="primary" />
        <StatCard label="Completed Orders" value={summary?.completed ?? "…"} sub="Finished stock added" icon={<CheckCircle2 className="h-4 w-4" />} tone="positive" />
        <StatCard label="Pieces In Production" value={fmtNum(activePieces)} sub="Across active orders" icon={<Layers className="h-4 w-4" />} />
        <StatCard label="Overdue Targets" value={overdueCount} sub="Active past target date" icon={<Timer className="h-4 w-4" />} tone={overdueCount > 0 ? "negative" : "default"} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search number, product, design…" className="h-9 pl-8" />
        </div>
        <div className="w-44">
          <SelectInput
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "ALL", label: "All Statuses" },
              { value: "IN_PROGRESS", label: "In Progress" },
              { value: "COMPLETED", label: "Completed" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
        </div>
        <Button
          variant="outline" size="sm" className="ml-auto h-9"
          disabled={!filtered.length}
          onClick={() => exportCSV("production-orders",
            ["Number", "Product", "Design", "Qty", "Stage", "Status", "Contractor", "Target Date", "Cost Estimate"],
            filtered.map((o) => [o.number, productName(o.productId), o.designName ?? "", o.quantity, PRODUCTION_STAGE_LABELS[o.stage] ?? o.stage, ORDER_STATUS_LABEL[o.status] ?? o.status, o.contractor?.name ?? "", o.targetDate ? fmtDateIST(o.targetDate) : "", o.costEstimate]))}
        >
          Export CSV
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Factory className="h-6 w-6" />}
          title={q || statusFilter !== "ALL" ? "No matching production orders" : "No production orders yet"}
          description={q || statusFilter !== "ALL"
            ? "Try clearing the search or status filter."
            : "Create a production order to track a batch from design through packaging."}
          action={canCreate && !q && statusFilter === "ALL" ? (
            <Button size="sm" onClick={onNew}><Plus className="mr-1.5 h-4 w-4" /> New Production Order</Button>
          ) : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((o) => {
            const overdue = isOverdue(o.targetDate, o.status === "IN_PROGRESS")
            return (
              <button
                key={o.id}
                onClick={() => onOpen(o.id)}
                className="group rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-muted-foreground">{o.number}</p>
                    <p className="mt-0.5 truncate font-medium">{productName(o.productId)}</p>
                    {o.designName && <p className="truncate text-xs italic text-muted-foreground">{o.designName}</p>}
                  </div>
                  <StatusBadge label={ORDER_STATUS_LABEL[o.status] ?? o.status} className={ORDER_STATUS_BADGE[o.status]} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" />
                    <b className="text-foreground">{fmtNum(o.quantity)}</b> pcs
                  </span>
                  <span className="flex min-w-0 items-center gap-1">
                    <HardHat className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{o.contractor?.name ?? "In-house"}</span>
                  </span>
                  <span className={cn("flex items-center gap-1", overdue && "font-medium text-red-600 dark:text-red-400")}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    <DateCell value={o.targetDate} />
                  </span>
                </div>
                <div className="mt-3 border-t pt-3">
                  <StageDots stage={o.stage} status={o.status} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {statusFilter !== "ALL" && (
        <p className="text-xs text-muted-foreground">
          Filtered by status: {ORDER_STATUS_LABEL[statusFilter]} ·{" "}
          <button className="underline" onClick={() => setStatusFilter("ALL")}>clear</button>
        </p>
      )}
    </div>
  )
}

// ==================== ORDER DETAIL SHEET ====================
function ProductionOrderDetail({
  id, onClose, canEdit, productName, variantLabel,
}: {
  id: string
  onClose: () => void
  canEdit: boolean
  productName: (id: string | null | undefined) => string
  variantLabel: (id: string | null | undefined) => string
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["production", id], queryFn: () => api.get(`production/${id}`) })
  const o: ProductionOrder | undefined = data?.order

  const [jumpStage, setJumpStage] = useState("")
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null) // "COMPLETED" confirm guard

  const stageMut = useMutation({
    mutationFn: (stage?: string) => api.post(`production/${id}/stage`, stage ? { stage } : {}),
    onSuccess: (res: any) => {
      const st = res?.order?.stage as string
      toast({
        title: st === "COMPLETED" ? "Order completed" : "Stage updated",
        description: st === "COMPLETED"
          ? `${res?.order?.number} finished — plan quantities added to finished stock.`
          : `${res?.order?.number} is now at ${PRODUCTION_STAGE_LABELS[st] ?? st}.`,
      })
      qc.invalidateQueries({ queryKey: ["production"] })
      qc.invalidateQueries({ queryKey: ["inventory"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: any) => toast({ title: "Stage change failed", description: e.message, variant: "destructive" }),
  })

  const cancelMut = useMutation({
    mutationFn: () => api.post(`production/${id}/cancel`),
    onSuccess: () => {
      toast({ title: "Production order cancelled" })
      qc.invalidateQueries({ queryKey: ["production"] })
    },
    onError: (e: any) => toast({ title: "Cancel failed", description: e.message, variant: "destructive" }),
  })

  if (isLoading || !o) {
    return (
      <Sheet open onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl thin-scrollbar">
          <SheetHeader className="border-b bg-muted/40 px-5 py-4">
            <SheetTitle>Production order</SheetTitle>
          </SheetHeader>
          <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        </SheetContent>
      </Sheet>
    )
  }

  const idx = STAGES.indexOf(o.stage)
  const nextStage = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null
  const plan = parsePlan(o)
  const active = o.status === "IN_PROGRESS"
  const forwardStages = STAGES.slice(idx + 1).map((s) => ({ value: s, label: PRODUCTION_STAGE_LABELS[s] ?? s }))

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl thin-scrollbar">
        <SheetHeader className="border-b bg-muted/40 px-5 py-4">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Factory className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                <span className="font-mono">{o.number}</span>
                <StatusBadge label={ORDER_STATUS_LABEL[o.status] ?? o.status} className={ORDER_STATUS_BADGE[o.status]} />
              </p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {productName(o.productId)}{o.designName ? ` · ${o.designName}` : ""}
              </p>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 p-5">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Quantity" value={fmtNum(o.quantity)} sub="pieces planned" />
            <StatCard label="Cost Estimate" value={fmtMoney(o.costEstimate)} icon={<Banknote className="h-4 w-4" />} />
            <StatCard
              label="Stage"
              value={o.status === "COMPLETED" ? "9/9" : `${Math.max(1, idx + 1)}/9`}
              sub={PRODUCTION_STAGE_LABELS[o.stage] ?? o.stage}
              tone="primary"
            />
            <StatCard
              label={o.status === "COMPLETED" ? "Completed On" : "Target Date"}
              value={o.status === "COMPLETED" ? (o.completedAt ? fmtDateIST(o.completedAt) : "—") : (o.targetDate ? fmtDateIST(o.targetDate) : "—")}
              sub={isOverdue(o.targetDate, active) ? "Overdue" : undefined}
              tone={isOverdue(o.targetDate, active) ? "negative" : "default"}
            />
          </div>

          {/* Stage progress */}
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Stage Progress</p>
              {active && <span className="text-xs text-muted-foreground">{idx + 1} of {STAGES.length} complete</span>}
            </div>
            <StageStepper stage={o.stage} status={o.status} />

            {active && canEdit && (
              <div className="mt-4 space-y-3 border-t pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  {nextStage && (
                    <Button
                      size="sm"
                      disabled={stageMut.isPending}
                      onClick={() => (nextStage === "COMPLETED" ? setConfirmTarget("__ADVANCE__") : stageMut.mutate(undefined))}
                    >
                      {stageMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1.5 h-4 w-4" />}
                      {nextStage === "COMPLETED" ? "Complete Order" : `Advance to ${PRODUCTION_STAGE_LABELS[nextStage] ?? nextStage}`}
                    </Button>
                  )}
                  {forwardStages.length > 1 && (
                    <div className="flex items-center gap-2">
                      <div className="w-48">
                        <SelectInput value={jumpStage} onChange={setJumpStage} placeholder="Jump to stage…" options={forwardStages} />
                      </div>
                      <Button
                        size="sm" variant="outline"
                        disabled={!jumpStage || stageMut.isPending}
                        onClick={() => (jumpStage === "COMPLETED" ? setConfirmTarget("COMPLETED") : stageMut.mutate(jumpStage))}
                      >
                        Jump
                      </Button>
                    </div>
                  )}
                  <Button
                    size="sm" variant="ghost" className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={cancelMut.isPending}
                    onClick={() => setConfirmTarget("__CANCEL__")}
                  >
                    <XCircle className="mr-1.5 h-4 w-4" /> Cancel Order
                  </Button>
                </div>
                {plan.length > 0 && (
                  <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      Reaching <b>Completed</b> adds finished stock automatically:{" "}
                      {plan.map((l) => `${fmtNum(l.qty)} × ${variantLabel(l.variantId)}`).join(", ")}.
                    </p>
                  </div>
                )}
              </div>
            )}
            {o.status === "CANCELLED" && (
              <div className="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>This order was cancelled — no finished stock will be added.</p>
              </div>
            )}
          </div>

          {/* Finished goods plan */}
          <div className="rounded-lg border p-4">
            <p className="mb-2 text-sm font-semibold">Finished Goods Plan</p>
            {plan.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No variant plan on this order — completing it will not add finished stock automatically.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Variant</th>
                      <th className="px-3 py-2 text-right font-semibold">Qty to Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.map((l, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2">{variantLabel(l.variantId)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtNum(l.qty)}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30">
                      <td className="px-3 py-2 text-xs font-medium text-muted-foreground">Total planned</td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs font-semibold">{fmtNum(plan.reduce((s, l) => s + l.qty, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Info panel */}
          <div className="rounded-lg border px-4">
            <InfoRow label="Product" value={productName(o.productId)} />
            <InfoRow label="Design" value={o.designName ?? "—"} />
            <InfoRow label="Contractor" value={o.contractor?.name ?? "In-house"} />
            <InfoRow label="Cost Estimate" value={<Money value={o.costEstimate} />} />
            <InfoRow label="Started" value={<DateCell value={o.startDate} />} />
            <InfoRow label="Target Date" value={<DateCell value={o.targetDate} />} />
            {o.completedAt && <InfoRow label="Completed" value={<DateCell value={o.completedAt} />} />}
            <InfoRow label="Created By" value={o.createdByName ?? "—"} />
            {o.notes && <InfoRow label="Notes" value={<span className="font-normal">{o.notes}</span>} />}
          </div>
        </div>
      </SheetContent>

      {/* Completing adds stock — confirm first */}
      <ConfirmDialog
        open={confirmTarget === "__ADVANCE__" || confirmTarget === "COMPLETED"}
        onOpenChange={(v) => !v && setConfirmTarget(null)}
        title={`Complete ${o.number}?`}
        description={
          <>
            This marks the order as completed and adds finished stock to inventory
            {plan.length > 0 ? `: ${plan.map((l) => `${fmtNum(l.qty)} × ${variantLabel(l.variantId)}`).join(", ")}.` : "."}
          </>
        }
        confirmLabel="Complete Order"
        loading={stageMut.isPending}
        onConfirm={() => { stageMut.mutate(confirmTarget === "COMPLETED" ? "COMPLETED" : undefined); setConfirmTarget(null) }}
      />
      <ConfirmDialog
        open={confirmTarget === "__CANCEL__"}
        onOpenChange={(v) => !v && setConfirmTarget(null)}
        title={`Cancel ${o.number}?`}
        description="The order will be stopped at its current stage. No finished stock will be added."
        confirmLabel="Cancel Order"
        destructive
        loading={cancelMut.isPending}
        onConfirm={() => { cancelMut.mutate(); setConfirmTarget(null) }}
      />
    </Sheet>
  )
}

// ==================== NEW PRODUCTION ORDER DIALOG ====================
function NewProductionOrderDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["products", "lookup"],
    queryFn: () => api.get("products?pageSize=200"),
  })
  const { data: contractorsData } = useQuery({ queryKey: ["contractors"], queryFn: () => api.get("contractors") })

  const products: ProductLite[] = productsData?.products ?? []
  const contractors: Contractor[] = contractorsData?.contractors ?? []

  const [form, setForm] = useState({
    productId: "", designName: "", quantity: 100, contractorId: "", targetDate: "", costEstimate: 0, notes: "",
  })
  const [planQty, setPlanQty] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const product = products.find((p) => p.id === form.productId)
  const variants = product?.variants ?? []
  const plannedTotal = Object.values(planQty).reduce((s, n) => s + n, 0)
  const multiVariant = variants.length > 1

  async function save() {
    if (!form.productId) return toast({ title: "Product is required", variant: "destructive" })
    if (!form.quantity || form.quantity < 1) return toast({ title: "Quantity must be at least 1", variant: "destructive" })
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        productId: form.productId,
        quantity: Math.round(form.quantity),
        designName: form.designName || undefined,
        contractorId: form.contractorId || undefined,
        targetDate: form.targetDate || undefined,
        costEstimate: form.costEstimate || undefined,
        notes: form.notes || undefined,
      }
      if (variants.length === 1) {
        body.planLines = [{ variantId: variants[0].id, qty: Math.round(form.quantity) }]
      } else if (multiVariant) {
        const lines = Object.entries(planQty).filter(([, qty]) => qty > 0).map(([variantId, qty]) => ({ variantId, qty: Math.round(qty) }))
        if (lines.length) body.planLines = lines
      }
      const res = await api.post("production", body)
      toast({ title: `Production order ${res?.order?.number ?? ""} created`, description: "Track its progress from the Production Orders tab." })
      qc.invalidateQueries({ queryKey: ["production"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Failed to create order", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Production Order</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Product" required hint={productsLoading ? "Loading products…" : undefined}>
              <EntityPicker
                entities={products.filter((p) => p.status !== "ARCHIVED")}
                value={form.productId}
                onChange={(id) => { setForm({ ...form, productId: id }); setPlanQty({}) }}
                getLabel={(p: any) => `${p.name}${p.code ? ` (${p.code})` : ""}`}
                placeholder="Search product…"
              />
            </Field>
          </div>
          <Field label="Design name" hint="Batch / design reference">
            <TextInput value={form.designName} onChange={(v) => setForm({ ...form, designName: v })} placeholder="e.g. Festive Batch A" />
          </Field>
          <Field label="Quantity (pcs)" required>
            <NumberInput value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} min={1} step="1" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Contractor" hint="Optional — assign job work later if in-house">
              <EntityPicker
                entities={contractors}
                value={form.contractorId}
                onChange={(id) => setForm({ ...form, contractorId: id })}
                getLabel={(c: any) => `${c.name} · ${CONTRACTOR_TYPE_LABELS[c.type] ?? c.type}`}
                placeholder="Search contractor…"
              />
            </Field>
          </div>
          <Field label="Target date">
            <TextInput type="date" value={form.targetDate} onChange={(v) => setForm({ ...form, targetDate: v })} />
          </Field>
          <Field label="Cost estimate (₹)">
            <NumberInput value={form.costEstimate} onChange={(v) => setForm({ ...form, costEstimate: v })} min={0} />
          </Field>

          {/* Finished goods plan */}
          <div className="sm:col-span-2 rounded-lg border bg-muted/30 p-3">
            <p className="mb-2 text-sm font-semibold">Finished Goods Plan</p>
            {!form.productId ? (
              <p className="text-xs text-muted-foreground">Pick a product to plan which variants receive finished stock on completion.</p>
            ) : variants.length === 0 ? (
              <p className="text-xs text-muted-foreground">This product has no variants — completing the order will not add finished stock automatically.</p>
            ) : variants.length === 1 ? (
              <p className="text-xs text-muted-foreground">
                All <b>{fmtNum(form.quantity)}</b> units will be added to stock as <b>{variantShortLabel(variants[0])}</b> when the order completes.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Split the {fmtNum(form.quantity)} units across variants:</p>
                <div className="grid max-h-56 gap-2 overflow-y-auto thin-scrollbar sm:grid-cols-2">
                  {variants.map((v) => (
                    <Field key={v.id} label={variantShortLabel(v)} hint={v.sku ?? undefined}>
                      <NumberInput value={planQty[v.id] ?? 0} onChange={(n) => setPlanQty({ ...planQty, [v.id]: n })} min={0} step="1" />
                    </Field>
                  ))}
                </div>
                <p className={cn("text-xs", plannedTotal !== Math.round(form.quantity) ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                  Planned {fmtNum(plannedTotal)} of {fmtNum(form.quantity)} units
                  {plannedTotal !== Math.round(form.quantity) && " — total does not match order quantity"}
                </p>
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <Field label="Notes">
              <TextArea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={2} placeholder="Fabric details, trim instructions…" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== TAB: JOB WORK ====================
function JobWorkTab({
  jobWorks, summary, loading, variantLabel, onOpen, onNew, canCreate,
}: {
  jobWorks: JobWork[]
  summary?: { pending: number; completed: number; outstandingPayable: number }
  loading: boolean
  variantLabel: (id: string | null | undefined) => string
  onOpen: (id: string) => void
  onNew: () => void
  canCreate: boolean
}) {
  const [statusFilter, setStatusFilter] = useState("ALL")
  const filtered = statusFilter === "ALL" ? jobWorks : jobWorks.filter((j) => j.status === statusFilter)
  const activeCount = jobWorks.filter((j) => j.status === "ASSIGNED" || j.status === "PROCESSING").length

  const columns: Column<JobWork>[] = [
    {
      key: "number", header: "Number", width: "w-28",
      render: (j) => <span className="font-mono text-xs font-semibold text-muted-foreground">{j.number}</span>,
      sortValue: (j) => j.number,
    },
    {
      key: "description", header: "Description",
      render: (j) => (
        <div className="min-w-0 max-w-[260px]">
          <p className="truncate font-medium">{j.description}</p>
          {j.variantId && <p className="truncate text-xs text-muted-foreground">{variantLabel(j.variantId)}</p>}
        </div>
      ),
    },
    { key: "contractor.name", header: "Contractor", render: (j) => j.contractor?.name ?? "—", sortValue: (j) => j.contractor?.name ?? "" },
    {
      key: "progress", header: "Progress", width: "w-32",
      render: (j) => {
        const pct = j.quantity > 0 ? Math.round((j.completedQty / j.quantity) * 100) : 0
        return (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs tabular-nums">
              <span className="font-medium">{j.completedQty}/{j.quantity}</span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        )
      },
      sortValue: (j) => (j.quantity > 0 ? j.completedQty / j.quantity : 0),
    },
    { key: "rate", header: "Rate/pc", align: "right", render: (j) => fmtMoney(j.rate), sortValue: (j) => j.rate },
    { key: "totalAmount", header: "Earned", align: "right", render: (j) => <Money value={j.totalAmount} />, sortValue: (j) => j.totalAmount },
    {
      key: "dueDate", header: "Due Date",
      render: (j) => (
        <span className={cn(isOverdue(j.dueDate, j.status === "ASSIGNED" || j.status === "PROCESSING") && "font-medium text-red-600 dark:text-red-400")}>
          <DateCell value={j.dueDate} />
        </span>
      ),
      sortValue: (j) => j.dueDate ?? "",
    },
    {
      key: "status", header: "Status",
      render: (j) => <StatusBadge label={JOBWORK_STATUS_LABELS[j.status] ?? j.status} className={JOBWORK_STATUS_BADGE[j.status]} />,
    },
    {
      key: "createdByName", header: "Created By",
      render: (j) => <span className="text-xs text-muted-foreground">{j.createdByName ?? "—"}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Pending Pieces" value={fmtNum(summary?.pending ?? 0)} sub="Assigned + processing" icon={<ClipboardList className="h-4 w-4" />} tone="warning" />
        <StatCard label="Completed Pieces" value={fmtNum(summary?.completed ?? 0)} sub="All-time" icon={<PackageCheck className="h-4 w-4" />} tone="positive" />
        <StatCard label="Outstanding Payable" value={fmtMoney(summary?.outstandingPayable ?? 0)} sub="Contractor earnings" icon={<Wallet className="h-4 w-4" />} tone="warning" />
        <StatCard label="Active Job Works" value={activeCount} sub="Open with contractors" icon={<Scissors className="h-4 w-4" />} />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        loading={loading}
        onRowClick={(j) => onOpen(j.id)}
        searchKeys={["number", "description", "contractor.name"]}
        searchPlaceholder="Search number, description, contractor…"
        exportName="job-work"
        emptyTitle={statusFilter !== "ALL" ? "No job work with this status" : "No job work yet"}
        emptyDescription="Assign stitching, printing or embroidery work to contractors and track piece-by-piece progress."
        emptyAction={canCreate && statusFilter === "ALL" ? (
          <Button size="sm" onClick={onNew}><Plus className="mr-1.5 h-4 w-4" /> New Job Work</Button>
        ) : undefined}
        rowClassName={(j) => (j.status === "CANCELLED" ? "opacity-60" : "")}
        toolbar={
          <div className="w-44">
            <SelectInput
              value={statusFilter}
              onChange={setStatusFilter}
              options={[{ value: "ALL", label: "All Statuses" }, ...JOBWORK_STATUSES.map((s) => ({ value: s, label: JOBWORK_STATUS_LABELS[s] }))]}
            />
          </div>
        }
      />
    </div>
  )
}

// ==================== JOB WORK DETAIL SHEET ====================
function JobWorkDetail({
  id, onClose, canEdit, productName, variantLabel, onOpenContractor,
}: {
  id: string
  onClose: () => void
  canEdit: boolean
  productName: (id: string | null | undefined) => string
  variantLabel: (id: string | null | undefined) => string
  onOpenContractor: (id: string) => void
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["jobworks", id], queryFn: () => api.get(`jobworks/${id}`) })
  const j: JobWork | undefined = data?.jobWork

  // contractor payment history (contractor detail returns ALL payments — filter client-side)
  const { data: contractorData } = useQuery({
    queryKey: ["contractors", j?.contractorId],
    queryFn: () => api.get(`contractors/${j!.contractorId}`),
    enabled: !!j?.contractorId,
  })
  const contractorPayments = useMemo(
    () => (contractorData?.contractor?.payments ?? []).filter((p: PaymentRec) => p.contractorId === j?.contractorId),
    [contractorData, j?.contractorId],
  )

  const [progressOverride, setProgressOverride] = useState<number | null>(null)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [receiveOverride, setReceiveOverride] = useState<number | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  // derived from server data unless the user is mid-edit (keeps inputs in sync after refetches)
  const completedQty = j?.completedQty ?? 0
  const progressQty = progressOverride ?? completedQty
  const receiveQty = receiveOverride ?? Math.max(0, completedQty)

  const progressMut = useMutation({
    mutationFn: (completedQty: number) => api.post(`jobworks/${id}/progress`, { completedQty }),
    onSuccess: (res: any) => {
      setProgressOverride(null)
      toast({ title: "Progress updated", description: `Earned so far: ${fmtMoney(res?.jobWork?.totalAmount ?? 0)} (${res?.jobWork?.completedQty}/${res?.jobWork?.quantity} pcs).` })
      qc.invalidateQueries({ queryKey: ["jobworks"] })
      qc.invalidateQueries({ queryKey: ["contractors"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  })

  const receiveMut = useMutation({
    mutationFn: (quantity: number) => api.post(`jobworks/${id}/receive-goods`, { quantity }),
    onSuccess: (res: any) => {
      setReceiveOpen(false)
      setReceiveOverride(null)
      toast({ title: "Finished goods received", description: `${res?.quantity ?? 0} pcs added to inventory as PRODUCTION_IN.` })
      qc.invalidateQueries({ queryKey: ["jobworks"] })
      qc.invalidateQueries({ queryKey: ["inventory"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: any) => toast({ title: "Receive failed", description: e.message, variant: "destructive" }),
  })

  const cancelMut = useMutation({
    mutationFn: () => api.post(`jobworks/${id}/cancel`),
    onSuccess: () => {
      toast({ title: "Job work cancelled" })
      qc.invalidateQueries({ queryKey: ["jobworks"] })
    },
    onError: (e: any) => toast({ title: "Cancel failed", description: e.message, variant: "destructive" }),
  })

  if (isLoading || !j) {
    return (
      <Sheet open onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl thin-scrollbar">
          <SheetHeader className="border-b bg-muted/40 px-5 py-4"><SheetTitle>Job work</SheetTitle></SheetHeader>
          <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        </SheetContent>
      </Sheet>
    )
  }

  const pct = j.quantity > 0 ? Math.round((j.completedQty / j.quantity) * 100) : 0
  const cancellable = j.status === "ASSIGNED" || j.status === "PROCESSING"
  const contractor = contractorData?.contractor

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl thin-scrollbar">
        <SheetHeader className="border-b bg-muted/40 px-5 py-4">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Scissors className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                <span className="font-mono">{j.number}</span>
                <StatusBadge label={JOBWORK_STATUS_LABELS[j.status] ?? j.status} className={JOBWORK_STATUS_BADGE[j.status]} />
              </p>
              <p className="truncate text-xs font-normal text-muted-foreground">
                {j.description} · {j.contractor?.name ?? "Contractor"}
              </p>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 p-5">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Quantity" value={fmtNum(j.quantity)} sub="pcs assigned" />
            <StatCard label="Completed" value={fmtNum(j.completedQty)} sub={`${pct}% done`} tone="primary" />
            <StatCard label="Rate / pc" value={fmtMoney(j.rate)} />
            <StatCard label="Earned" value={fmtMoney(j.totalAmount)} sub="Contractor payable" tone="warning" icon={<Wallet className="h-4 w-4" />} />
          </div>

          {/* Progress */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Progress</p>
              <span className="text-sm tabular-nums text-muted-foreground">{j.completedQty} / {j.quantity} pcs ({pct}%)</span>
            </div>
            <Progress value={pct} />
            {canEdit && j.status !== "CANCELLED" && (
              <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                <div className="w-40">
                  <Field label="Completed pieces">
                    <NumberInput value={progressQty} onChange={setProgressOverride} min={0} step="1" />
                  </Field>
                </div>
                <Button
                  size="sm"
                  disabled={progressMut.isPending || progressQty === j.completedQty}
                  onClick={() => progressMut.mutate(Math.round(progressQty))}
                >
                  {progressMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1.5 h-4 w-4" />}
                  Update Progress
                </Button>
                <p className="w-full text-xs text-muted-foreground">
                  Each newly completed piece earns the contractor {fmtMoney(j.rate)} — updates flow into their payable balance.
                </p>
              </div>
            )}
          </div>

          {/* Finished goods */}
          <div className="rounded-lg border p-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
              <PackageCheck className="h-4 w-4" /> Finished Goods
            </p>
            {j.variantId ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Linked variant: <b className="text-foreground">{variantLabel(j.variantId)}</b> — receive completed pieces into
                  inventory as finished stock.
                </p>
                {canEdit && (
                  <Button
                    size="sm" variant="outline" className="mt-2"
                    disabled={j.completedQty < 1}
                    onClick={() => { setReceiveOverride(null); setReceiveOpen(true) }}
                  >
                    <PackagePlus className="mr-1.5 h-4 w-4" /> Receive Finished Goods
                  </Button>
                )}
                {j.completedQty < 1 && <p className="mt-1 text-xs text-muted-foreground">Available once progress is recorded.</p>}
              </>
            ) : (
              <div className="flex gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  This job work is not linked to a product variant. Finished goods for such batches are received into stock
                  through <b>production orders</b> instead.
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onOpenContractor(j.contractorId)}>
              <HardHat className="mr-1.5 h-4 w-4" /> Contractor &amp; Payments
            </Button>
            {canEdit && cancellable && (
              <Button
                size="sm" variant="ghost" className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmCancel(true)}
              >
                <XCircle className="mr-1.5 h-4 w-4" /> Cancel Job Work
              </Button>
            )}
          </div>

          {/* Info panel */}
          <div className="rounded-lg border px-4">
            <InfoRow label="Contractor" value={j.contractor?.name ?? "—"} />
            <InfoRow label="Contractor Rate" value={j.contractor ? `${fmtMoney(j.contractor.rate)} / pc` : "—"} />
            <InfoRow label="Payable Balance" value={contractor ? <OutstandingMoney value={contractor.outstanding} /> : "—"} />
            {j.productId && <InfoRow label="Product" value={productName(j.productId)} />}
            <InfoRow label="Assigned" value={<DateCell value={j.assignedAt} />} />
            <InfoRow label="Due Date" value={<DateCell value={j.dueDate} />} />
            {j.completedAt && <InfoRow label="Completed" value={<DateCell value={j.completedAt} />} />}
            <InfoRow label="Created By" value={j.createdByName ?? "—"} />
            {j.notes && <InfoRow label="Notes" value={<span className="font-normal">{j.notes}</span>} />}
          </div>

          {/* Payment history (contractor-level) */}
          <div>
            <p className="mb-2 text-sm font-semibold">Payment History — {j.contractor?.name ?? "Contractor"}</p>
            {contractorPayments.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No payments recorded yet. Earnings from progress updates accumulate as contractor payable.
              </p>
            ) : (
              <div className="space-y-1">
                {contractorPayments.slice(0, 6).map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-md border p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{p.number} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}</p>
                      <p className="text-xs text-muted-foreground">
                        <DateCell value={p.date} />{p.notes ? ` · ${p.notes}` : ""}
                      </p>
                    </div>
                    <Money value={p.amount} className="text-sm font-semibold" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>

      {/* Receive goods dialog */}
      <Dialog open={receiveOpen} onOpenChange={(v) => !v && setReceiveOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receive Finished Goods</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Add completed pieces of <b>{variantLabel(j.variantId)}</b> to inventory (recorded as PRODUCTION_IN movement).
            </p>
            <Field label="Quantity to receive" required hint={`Up to ${fmtNum(j.completedQty)} completed pcs available`}>
              <NumberInput value={receiveQty} onChange={setReceiveOverride} min={1} step="1" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)}>Cancel</Button>
            <Button disabled={receiveMut.isPending || receiveQty < 1} onClick={() => receiveMut.mutate(Math.round(receiveQty))}>
              {receiveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Receive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel ${j.number}?`}
        description={`Work assigned to ${j.contractor?.name ?? "the contractor"} will be marked cancelled. Completed pieces stay billed.`}
        confirmLabel="Cancel Job Work"
        destructive
        loading={cancelMut.isPending}
        onConfirm={() => { cancelMut.mutate(); setConfirmCancel(false) }}
      />
    </Sheet>
  )
}

// ==================== NEW JOB WORK DIALOG ====================
function NewJobWorkDialog({ prefill, onClose }: { prefill?: { contractorId?: string }; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: contractorsData } = useQuery({ queryKey: ["contractors"], queryFn: () => api.get("contractors") })
  const { data: productsData } = useQuery({ queryKey: ["products", "lookup"], queryFn: () => api.get("products?pageSize=200") })

  const contractors: Contractor[] = contractorsData?.contractors ?? []
  const products: ProductLite[] = productsData?.products ?? []

  const [form, setForm] = useState({
    contractorId: prefill?.contractorId ?? "",
    productId: "",
    variantId: "",
    description: "",
    quantity: 50,
    rate: 0,
    dueDate: "",
    notes: "",
  })
  const [saving, setSaving] = useState(false)

  const product = products.find((p) => p.id === form.productId)
  const variants = product?.variants ?? []

  function pickContractor(id: string) {
    const c = contractors.find((x) => x.id === id)
    setForm((f) => ({ ...f, contractorId: id, rate: c && c.rate > 0 ? c.rate : f.rate }))
  }
  function pickProduct(id: string) {
    const p = products.find((x) => x.id === id)
    setForm((f) => ({ ...f, productId: id, variantId: "", description: p ? p.name : "" }))
  }

  async function save() {
    if (!form.contractorId) return toast({ title: "Contractor is required", variant: "destructive" })
    if (!form.quantity || form.quantity < 1) return toast({ title: "Quantity must be at least 1", variant: "destructive" })
    if (!form.productId && !form.description.trim()) return toast({ title: "Description is required", variant: "destructive" })
    setSaving(true)
    try {
      await api.post("jobworks", {
        contractorId: form.contractorId,
        productId: form.productId || undefined,
        variantId: form.variantId || undefined,
        description: form.description.trim() || product?.name || "Job work",
        quantity: Math.round(form.quantity),
        rate: form.rate || 0,
        dueDate: form.dueDate || undefined,
        notes: form.notes || undefined,
      })
      toast({ title: "Job work assigned", description: "Track piece-by-piece progress from the Job Work tab." })
      qc.invalidateQueries({ queryKey: ["jobworks"] })
      qc.invalidateQueries({ queryKey: ["contractors"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Failed to create job work", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Job Work</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Contractor" required hint={contractors.length === 0 ? "No contractors yet — add one in the Contractors tab." : undefined}>
              <EntityPicker
                entities={contractors}
                value={form.contractorId}
                onChange={pickContractor}
                getLabel={(c: any) => `${c.name} · ${CONTRACTOR_TYPE_LABELS[c.type] ?? c.type}`}
                placeholder="Search contractor…"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Product" hint="Optional — links the work to a product">
              <EntityPicker
                entities={products.filter((p) => p.status !== "ARCHIVED")}
                value={form.productId}
                onChange={pickProduct}
                getLabel={(p: any) => `${p.name}${p.code ? ` (${p.code})` : ""}`}
                placeholder="Search product…"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description" required={!form.productId} hint={form.productId ? "Follows the linked product name." : undefined}>
              <TextInput
                value={form.description}
                onChange={(v) => setForm({ ...form, description: v })}
                placeholder="e.g. Kurta neck embroidery"
                disabled={!!form.productId}
              />
            </Field>
          </div>
          <Field label="Quantity (pcs)" required>
            <NumberInput value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} min={1} step="1" />
          </Field>
          <Field label="Rate / pc (₹)" hint="Prefilled from contractor default">
            <NumberInput value={form.rate} onChange={(v) => setForm({ ...form, rate: v })} min={0} />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Link variant"
              hint={form.productId
                ? "Optional — enables receiving finished goods into stock"
                : "Pick a product first to link a variant"}
            >
              <EntityPicker
                entities={variants}
                value={form.variantId}
                onChange={(id) => setForm({ ...form, variantId: id })}
                getLabel={(v: any) => `${variantShortLabel(v)}${v.sku ? ` · ${v.sku}` : ""}`}
                placeholder={form.productId ? "Search variant…" : "Pick a product first…"}
                disabled={!form.productId}
              />
            </Field>
          </div>
          <Field label="Due date">
            <TextInput type="date" value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <TextArea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={2} placeholder="Instructions for the contractor…" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Assign Job Work</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== TAB: CONTRACTORS ====================
function ContractorsTab({
  contractors, loading, onOpen, onNew, canCreate,
}: {
  contractors: Contractor[]
  loading: boolean
  onOpen: (id: string) => void
  onNew: () => void
  canCreate: boolean
}) {
  const totalActive = contractors.reduce((s, c) => s + (c.stats?.activeWorks ?? 0), 0)
  const totalEarned = contractors.reduce((s, c) => s + (c.stats?.totalEarned ?? 0), 0)
  const totalOutstanding = contractors.reduce((s, c) => s + Math.max(0, c.outstanding), 0)

  const columns: Column<Contractor>[] = [
    {
      key: "name", header: "Contractor",
      render: (c) => (
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {c.name?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{c.name}</p>
            {!c.active && <p className="text-xs text-muted-foreground">inactive</p>}
          </div>
        </div>
      ),
      sortValue: (c) => c.name,
    },
    {
      key: "type", header: "Type",
      render: (c) => <StatusBadge label={CONTRACTOR_TYPE_LABELS[c.type] ?? c.type} className={CONTRACTOR_TYPE_BADGE[c.type]} />,
    },
    { key: "phone", header: "Phone", render: (c) => <span className="tabular-nums">{c.phone ?? "—"}</span> },
    { key: "rate", header: "Rate/pc", align: "right", render: (c) => (c.rate > 0 ? fmtMoney(c.rate) : "—"), sortValue: (c) => c.rate },
    { key: "stats.activeWorks", header: "Active Works", align: "center", render: (c) => c.stats?.activeWorks ?? 0, sortValue: (c) => c.stats?.activeWorks ?? 0 },
    { key: "stats.completedWorks", header: "Completed", align: "center", render: (c) => c.stats?.completedWorks ?? 0, sortValue: (c) => c.stats?.completedWorks ?? 0 },
    { key: "stats.totalEarned", header: "Earned", align: "right", render: (c) => <Money value={c.stats?.totalEarned ?? 0} />, sortValue: (c) => c.stats?.totalEarned ?? 0 },
    {
      key: "outstanding", header: "Outstanding", align: "right",
      render: (c) => <OutstandingMoney value={c.outstanding} />,
      sortValue: (c) => c.outstanding,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Contractors" value={contractors.length} icon={<HardHat className="h-4 w-4" />} />
        <StatCard label="Active Works" value={totalActive} sub="With contractors now" icon={<ClipboardList className="h-4 w-4" />} tone="warning" />
        <StatCard label="Total Earned" value={fmtMoney(totalEarned)} sub="All-time job work" icon={<Wallet className="h-4 w-4" />} tone="positive" />
        <StatCard label="Total Outstanding" value={fmtMoney(totalOutstanding)} sub="Payable to contractors" icon={<IndianRupee className="h-4 w-4" />} tone="negative" />
      </div>

      <DataTable
        columns={columns}
        rows={contractors}
        loading={loading}
        onRowClick={(c) => onOpen(c.id)}
        searchKeys={["name", "phone", "type"]}
        searchPlaceholder="Search name, phone, type…"
        exportName="contractors"
        emptyTitle="No contractors yet"
        emptyDescription="Add tailors, stitching and printing contractors to assign job work."
        emptyAction={canCreate ? (
          <Button size="sm" onClick={onNew}><Plus className="mr-1.5 h-4 w-4" /> New Contractor</Button>
        ) : undefined}
        rowClassName={(c) => (c.outstanding > 0 ? "bg-amber-500/5" : "")}
      />
    </div>
  )
}

// ==================== CONTRACTOR DETAIL SHEET ====================
function ContractorDetail({
  id, onClose, onEdit, onDelete, onAssignJobWork, onOpenJobWork, canPay,
}: {
  id: string
  onClose: () => void
  onEdit: (c: Contractor) => void
  onDelete: (c: Contractor) => void
  onAssignJobWork: (contractorId: string) => void
  onOpenJobWork: (id: string) => void
  canPay: boolean
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["contractors", id], queryFn: () => api.get(`contractors/${id}`) })
  const c: Contractor | undefined = data?.contractor
  const [payOpen, setPayOpen] = useState(false)

  // NOTE: GET contractors/:id currently returns ALL payments (server bug) — filter client-side
  const jobWorks = c?.jobWorks ?? []
  const payments = useMemo(
    () => (c?.payments ?? []).filter((p) => p.contractorId === id),
    [c?.payments, id],
  )
  const activeWorks = jobWorks.filter((j) => j.status === "ASSIGNED" || j.status === "PROCESSING").length
  const completedWorks = jobWorks.filter((j) => j.status === "COMPLETED").length
  const totalEarned = jobWorks.reduce((s, j) => s + j.totalAmount, 0)

  if (isLoading || !c) {
    return (
      <Sheet open onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl thin-scrollbar">
          <SheetHeader className="border-b bg-muted/40 px-5 py-4"><SheetTitle>Contractor</SheetTitle></SheetHeader>
          <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl thin-scrollbar">
        <SheetHeader className="border-b bg-muted/40 px-5 py-4">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              {c.name?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                {c.name}
                <StatusBadge label={CONTRACTOR_TYPE_LABELS[c.type] ?? c.type} className={CONTRACTOR_TYPE_BADGE[c.type]} />
              </p>
              <p className="text-xs font-normal text-muted-foreground">
                {c.phone ?? "No phone"} · {fmtMoney(c.rate)}/pc default rate
              </p>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 p-5">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Active Works" value={activeWorks} tone="warning" />
            <StatCard label="Completed" value={completedWorks} tone="positive" />
            <StatCard label="Total Earned" value={fmtMoney(totalEarned)} />
            <StatCard
              label="Outstanding" value={fmtMoney(c.outstanding)}
              tone={c.outstanding > 0 ? "warning" : c.outstanding < 0 ? "negative" : "positive"}
              sub={c.outstanding > 0 ? "Payable to contractor" : c.outstanding < 0 ? "Advance paid" : "Settled"}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {canPay && (
              <Button size="sm" onClick={() => setPayOpen(true)}>
                <Wallet className="mr-1.5 h-4 w-4" /> Pay Contractor
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onAssignJobWork(c.id)}>
              <Scissors className="mr-1.5 h-4 w-4" /> Assign Job Work
            </Button>
            <Button size="sm" variant="outline" onClick={() => onEdit(c)}>
              <Pencil className="mr-1.5 h-4 w-4" /> Edit
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onDelete(c)}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete
            </Button>
          </div>

          {/* Contact info */}
          <div className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
            <span className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {c.phone ?? "—"}</span>
            <span className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {c.address ?? "—"}</span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Banknote className="h-3.5 w-3.5" /> Default rate <b className="text-foreground">{fmtMoney(c.rate)}</b>/pc
            </span>
            {c.notes && <p className="col-span-2 rounded bg-muted p-2 text-xs">{c.notes}</p>}
          </div>

          {/* History tabs */}
          <Tabs defaultValue="jobworks">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="jobworks">Job Works ({jobWorks.length})</TabsTrigger>
              <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="jobworks" className="mt-3">
              {jobWorks.length === 0 ? (
                <EmptyState title="No job work assigned" description="Assign work from the Job Work tab or the button above." />
              ) : (
                <div className="space-y-1">
                  {jobWorks.map((j) => {
                    const pct = j.quantity > 0 ? Math.round((j.completedQty / j.quantity) * 100) : 0
                    return (
                      <button
                        key={j.id}
                        onClick={() => onOpenJobWork(j.id)}
                        className="flex w-full items-center gap-3 rounded-md border p-2.5 text-left hover:bg-accent"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{j.number} · {j.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {j.completedQty}/{j.quantity} pcs · due <DateCell value={j.dueDate} />
                          </p>
                        </div>
                        <div className="hidden w-24 sm:block">
                          <Progress value={pct} className="h-1.5" />
                        </div>
                        <Money value={j.totalAmount} className="text-sm font-semibold" />
                        <StatusBadge label={JOBWORK_STATUS_LABELS[j.status] ?? j.status} className={JOBWORK_STATUS_BADGE[j.status]} />
                      </button>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="payments" className="mt-3">
              {payments.length === 0 ? (
                <EmptyState title="No payments yet" description="Earnings from job work progress accumulate as payable balance." />
              ) : (
                <div className="space-y-1">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-md border p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{p.number} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}</p>
                        <p className="text-xs text-muted-foreground">
                          <DateCell value={p.date} />{p.notes ? ` · ${p.notes}` : ""}
                        </p>
                      </div>
                      <Money value={p.amount} className="text-sm font-semibold" />
                      <StatusBadge label={p.status === "VERIFIED" ? "Verified" : p.status} className={p.status === "VERIFIED" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"} />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>

      {payOpen && <PayContractorDialog contractor={c} onClose={() => setPayOpen(false)} />}
    </Sheet>
  )
}

// ==================== PAY CONTRACTOR DIALOG ====================
function PayContractorDialog({ contractor, onClose }: { contractor: Contractor; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    amount: contractor.outstanding > 0 ? contractor.outstanding : 0, // quick-pay prefill
    method: "CASH", date: ymdIST(), notes: "",
  })
  const [saving, setSaving] = useState(false)
  const exceeds = form.amount > contractor.outstanding

  async function save() {
    if (!form.amount || form.amount <= 0) return toast({ title: "Amount must be greater than zero", variant: "destructive" })
    setSaving(true)
    try {
      await api.post(`contractors/${contractor.id}/pay`, {
        amount: form.amount,
        method: form.method,
        date: form.date || undefined,
        notes: form.notes || undefined,
      })
      toast({ title: "Payment recorded", description: `${fmtMoney(form.amount)} paid to ${contractor.name}.` })
      qc.invalidateQueries({ queryKey: ["contractors"] })
      qc.invalidateQueries({ queryKey: ["payments"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Payment failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {contractor.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Outstanding payable: <b className={cn("font-semibold", contractor.outstanding > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>{fmtMoney(contractor.outstanding)}</b>
          </p>
          <Field label="Amount (₹)" required>
            <div className="flex gap-2">
              <NumberInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} min={0} />
              {contractor.outstanding > 0 && (
                <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setForm({ ...form, amount: contractor.outstanding })}>
                  Full {fmtMoney(contractor.outstanding)}
                </Button>
              )}
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Method">
              <SelectInput value={form.method} onChange={(v) => setForm({ ...form, method: v })}
                options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} />
            </Field>
            <Field label="Date">
              <TextInput type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
            </Field>
          </div>
          <Field label="Notes">
            <TextArea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={2} placeholder="Advance, settlement, reference…" />
          </Field>
          {exceeds && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Amount exceeds outstanding — the balance will go negative (recorded as advance).
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record Payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== CONTRACTOR FORM (create / edit) ====================
function ContractorForm({ contractor, onClose }: { contractor?: Contractor; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: contractor?.name ?? "",
    type: contractor?.type ?? "TAILOR",
    phone: contractor?.phone ?? "",
    address: contractor?.address ?? "",
    rate: contractor?.rate ?? 0,
    notes: contractor?.notes ?? "",
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim()) return toast({ title: "Name is required", variant: "destructive" })
    setSaving(true)
    try {
      if (contractor) await api.put(`contractors/${contractor.id}`, form)
      else await api.post("contractors", form)
      toast({ title: contractor ? "Contractor updated" : "Contractor added" })
      qc.invalidateQueries({ queryKey: ["contractors"] })
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
          <DialogTitle>{contractor ? `Edit ${contractor.name}` : "New Contractor"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name" required>
              <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Contractor / firm name" autoFocus />
            </Field>
          </div>
          <Field label="Type">
            <SelectInput value={form.type} onChange={(v) => setForm({ ...form, type: v })}
              options={CONTRACTOR_TYPES.map((t) => ({ value: t, label: CONTRACTOR_TYPE_LABELS[t] }))} />
          </Field>
          <Field label="Phone">
            <TextInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="98XXXXXXXX" />
          </Field>
          <Field label="Default rate / pc (₹)" hint="Prefills new job work">
            <NumberInput value={form.rate} onChange={(v) => setForm({ ...form, rate: v })} min={0} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <TextInput value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="Street, city" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <TextArea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={2} placeholder="Specialities, capacity, remarks…" />
            </Field>
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

function DeleteContractorConfirm({ contractor, onClose }: { contractor: Contractor; onClose: () => void }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  async function del() {
    setLoading(true)
    try {
      await api.del(`contractors/${contractor.id}`)
      toast({ title: "Contractor deleted" })
      qc.invalidateQueries({ queryKey: ["contractors"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Cannot delete", description: e.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }
  return (
    <ConfirmDialog
      open onOpenChange={onClose}
      title={`Delete ${contractor.name}?`}
      destructive confirmLabel="Delete" loading={loading}
      description="Contractors with job work history cannot be deleted (data integrity)."
      onConfirm={del}
    />
  )
}

// ==================== TAB: RAW MATERIALS ====================
function MaterialsTab({
  materials, summary, loading, onNew, onEdit, onAddStock, onDelete,
  canCreate, canEdit, canDelete, materialEditId, onEditIdConsumed,
}: {
  materials: RawMaterial[]
  summary?: { totalValue: number; lowCount: number }
  loading: boolean
  onNew: () => void
  onEdit: (m: RawMaterial) => void
  onAddStock: (m: RawMaterial) => void
  onDelete: (m: RawMaterial) => void
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  materialEditId: string | null
  onEditIdConsumed: () => void
}) {
  const [typeFilter, setTypeFilter] = useState("ALL")
  const filtered = typeFilter === "ALL" ? materials : materials.filter((m) => m.type === typeFilter)

  // deep-link: open edit dialog for a specific material once its data is available
  useEffect(() => {
    if (!materialEditId || loading) return
    const m = materials.find((x) => x.id === materialEditId)
    if (m) onEdit(m)
    onEditIdConsumed()
  }, [materialEditId, materials, loading, onEdit, onEditIdConsumed])

  const isLow = (m: RawMaterial) => m.quantity <= m.minQuantity
  const lowValue = materials.filter(isLow).reduce((s, m) => s + m.quantity * m.costPerUnit, 0)

  const columns: Column<RawMaterial>[] = [
    {
      key: "name", header: "Material",
      render: (m) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{m.name}</span>
          {isLow(m) && <StatusBadge label="Low" className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" />}
        </div>
      ),
      sortValue: (m) => m.name,
    },
    {
      key: "type", header: "Type",
      render: (m) => <StatusBadge label={RAW_MATERIAL_TYPE_LABELS[m.type] ?? m.type} className={RAW_MATERIAL_TYPE_BADGE[m.type]} />,
    },
    {
      key: "quantity", header: "In Stock", align: "right",
      render: (m) => (
        <span className={cn("tabular-nums font-medium", isLow(m) && "text-red-600 dark:text-red-400")}>
          {fmtNum(m.quantity)} <span className="text-xs font-normal text-muted-foreground">{RAW_MATERIAL_UNIT_LABELS[m.unit] ?? m.unit}</span>
        </span>
      ),
      sortValue: (m) => m.quantity,
    },
    {
      key: "minQuantity", header: "Min Level", align: "right",
      render: (m) => <span className="tabular-nums text-muted-foreground">{fmtNum(m.minQuantity)}</span>,
      sortValue: (m) => m.minQuantity,
    },
    { key: "costPerUnit", header: "Cost/Unit", align: "right", render: (m) => fmtMoney(m.costPerUnit), sortValue: (m) => m.costPerUnit },
    {
      key: "value", header: "Stock Value", align: "right",
      render: (m) => <Money value={m.quantity * m.costPerUnit} className="font-semibold" />,
      sortValue: (m) => m.quantity * m.costPerUnit,
    },
    ...(canEdit || canDelete ? [{
      key: "actions", header: "", align: "right" as const, width: "w-28",
      render: (m: RawMaterial) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Add stock" onClick={() => onAddStock(m)}>
              <PackagePlus className="h-4 w-4" />
            </Button>
          )}
          {canEdit && (
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => onEdit(m)}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => onDelete(m)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    }] : []),
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Inventory Value" value={fmtMoney(summary?.totalValue ?? 0)} sub="At cost" icon={<IndianRupee className="h-4 w-4" />} tone="primary" />
        <StatCard label="Low-Stock Materials" value={summary?.lowCount ?? 0} sub="At or below min level" icon={<AlertTriangle className="h-4 w-4" />} tone={(summary?.lowCount ?? 0) > 0 ? "warning" : "default"} />
        <StatCard label="Total Materials" value={materials.length} icon={<Boxes className="h-4 w-4" />} />
        <StatCard label="Low-Stock Value" value={fmtMoney(lowValue)} sub="Value needing restock" icon={<Package className="h-4 w-4" />} tone={lowValue > 0 ? "negative" : "default"} />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        loading={loading}
        onRowClick={(m) => canEdit ? onEdit(m) : undefined}
        searchKeys={["name"]}
        searchPlaceholder="Search material…"
        exportName="raw-materials"
        emptyTitle={typeFilter !== "ALL" ? "No materials of this type" : "No raw materials yet"}
        emptyDescription="Track fabric, thread, buttons and packaging stock with reorder levels."
        emptyAction={canCreate && typeFilter === "ALL" ? (
          <Button size="sm" onClick={onNew}><Plus className="mr-1.5 h-4 w-4" /> New Material</Button>
        ) : undefined}
        rowClassName={(m) => (isLow(m) ? "bg-amber-500/5" : "")}
        toolbar={
          <div className="w-44">
            <SelectInput
              value={typeFilter}
              onChange={setTypeFilter}
              options={[{ value: "ALL", label: "All Types" }, ...RAW_MATERIAL_TYPES.map((t) => ({ value: t, label: RAW_MATERIAL_TYPE_LABELS[t] }))]}
            />
          </div>
        }
      />
      {typeFilter !== "ALL" && (
        <p className="text-xs text-muted-foreground">
          Filtered by type: {RAW_MATERIAL_TYPE_LABELS[typeFilter]} ·{" "}
          <button className="underline" onClick={() => setTypeFilter("ALL")}>clear</button>
        </p>
      )}
    </div>
  )
}

// ==================== MATERIAL FORM (create / edit) ====================
function MaterialForm({ material, onClose }: { material?: RawMaterial; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: material?.name ?? "",
    type: material?.type ?? "FABRIC",
    unit: material?.unit ?? "METER",
    quantity: material?.quantity ?? 0,
    minQuantity: material?.minQuantity ?? 0,
    costPerUnit: material?.costPerUnit ?? 0,
    notes: material?.notes ?? "",
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name.trim()) return toast({ title: "Material name is required", variant: "destructive" })
    setSaving(true)
    try {
      if (material) await api.put(`raw-materials/${material.id}`, form)
      else await api.post("raw-materials", form)
      toast({ title: material ? "Material updated" : "Material added" })
      qc.invalidateQueries({ queryKey: ["raw-materials"] })
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
          <DialogTitle>{material ? `Edit ${material.name}` : "New Raw Material"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Material name" required>
              <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Cotton fabric — 180 GSM" autoFocus />
            </Field>
          </div>
          <Field label="Type">
            <SelectInput value={form.type} onChange={(v) => setForm({ ...form, type: v })}
              options={RAW_MATERIAL_TYPES.map((t) => ({ value: t, label: RAW_MATERIAL_TYPE_LABELS[t] }))} />
          </Field>
          <Field label="Unit">
            <SelectInput value={form.unit} onChange={(v) => setForm({ ...form, unit: v })}
              options={RAW_MATERIAL_UNITS.map((u) => ({ value: u, label: RAW_MATERIAL_UNIT_LABELS[u] }))} />
          </Field>
          <Field label="Quantity" hint={material ? "Current stock — use Add Stock to receive" : undefined}>
            <NumberInput value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} min={0} />
          </Field>
          <Field label="Minimum level" hint="Low-stock alert threshold">
            <NumberInput value={form.minQuantity} onChange={(v) => setForm({ ...form, minQuantity: v })} min={0} />
          </Field>
          <Field label="Cost per unit (₹)">
            <NumberInput value={form.costPerUnit} onChange={(v) => setForm({ ...form, costPerUnit: v })} min={0} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <TextArea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={2} placeholder="Supplier, quality, remarks…" />
            </Field>
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

// ==================== ADD STOCK DIALOG ====================
function AddStockDialog({ material, onClose }: { material: RawMaterial; onClose: () => void }) {
  const qc = useQueryClient()
  const [add, setAdd] = useState(0)
  const [saving, setSaving] = useState(false)
  const newQty = Math.round((material.quantity + add) * 100) / 100

  async function save() {
    if (add <= 0) return toast({ title: "Enter quantity to add", variant: "destructive" })
    setSaving(true)
    try {
      await api.put(`raw-materials/${material.id}`, { quantity: newQty })
      toast({ title: "Stock updated", description: `${material.name}: ${fmtNum(material.quantity)} → ${fmtNum(newQty)} ${RAW_MATERIAL_UNIT_LABELS[material.unit] ?? material.unit}.` })
      qc.invalidateQueries({ queryKey: ["raw-materials"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Stock — {material.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-center text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Current</p>
              <p className="font-semibold tabular-nums">{fmtNum(material.quantity)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Adding</p>
              <p className="font-semibold tabular-nums text-primary">+{fmtNum(add)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">New Total</p>
              <p className="font-semibold tabular-nums">{fmtNum(newQty)}</p>
            </div>
          </div>
          <Field label={`Quantity to add (${RAW_MATERIAL_UNIT_LABELS[material.unit] ?? material.unit})`} required>
            <NumberInput value={add} onChange={setAdd} min={0} />
          </Field>
          <p className="text-xs text-muted-foreground">
            Min level: {fmtNum(material.minQuantity)} · Cost {fmtMoney(material.costPerUnit)}/unit · Value added {fmtMoney(add * material.costPerUnit)}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || add <= 0}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add Stock</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteMaterialConfirm({ material, onClose }: { material: RawMaterial; onClose: () => void }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  async function del() {
    setLoading(true)
    try {
      await api.del(`raw-materials/${material.id}`)
      toast({ title: "Material deleted" })
      qc.invalidateQueries({ queryKey: ["raw-materials"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Cannot delete", description: e.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }
  return (
    <ConfirmDialog
      open onOpenChange={onClose}
      title={`Delete ${material.name}?`}
      destructive confirmLabel="Delete" loading={loading}
      description={`Current stock of ${fmtNum(material.quantity)} ${RAW_MATERIAL_UNIT_LABELS[material.unit] ?? material.unit} will be removed from tracking.`}
      onConfirm={del}
    />
  )
}
