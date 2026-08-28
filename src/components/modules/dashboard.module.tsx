"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/client/api"
import { useApp } from "@/lib/client/store"
import { PageHeader, StatCard, SectionTitle, EmptyState } from "@/components/shared/basics"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import {
  LayoutDashboard, IndianRupee, TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight,
  PackageX, AlertTriangle, ShoppingCart, Users, ClipboardList, Factory, CheckCircle2, Receipt,
  Truck, CalendarClock, ChevronRight, Zap,
} from "lucide-react"
import { fmtMoney, fmtDateIST } from "@/lib/format"
import { SALE_PAYMENT_STATUS_COLORS, ORDER_STATUS_COLORS, TASK_PRIORITY_COLORS, TASK_PRIORITY_LABELS } from "@/lib/constants"
import { StatusBadge, Money, DateCell } from "@/components/shared/fields"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/hooks/use-toast"

const QUICK_ACTIONS = [
  { label: "New Sale", icon: ShoppingCart, module: "sales", params: { tab: "pos" } },
  { label: "New Customer", icon: Users, module: "customers", params: { new: "1" } },
  { label: "New Product", icon: Zap, module: "products", params: { new: "1" } },
  { label: "New Purchase", icon: Truck, module: "purchases", params: { new: "1" } },
  { label: "Receive Payment", icon: IndianRupee, module: "payments", params: { tab: "receive" } },
  { label: "UPI / QR", icon: Wallet, module: "payments", params: { tab: "qr" } },
  { label: "Add Expense", icon: Receipt, module: "expenses", params: { new: "1" } },
  { label: "Reports", icon: TrendingUp, module: "reports" },
]

export function DashboardModule() {
  const { setActiveModule } = useApp()
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("dashboard"),
    refetchInterval: 60_000,
  })

  const k = data?.kpis
  const lists = data?.lists

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<LayoutDashboard className="h-5 w-5" />}
        title="Business Dashboard"
        description="Live overview of your clothing business — sales, collections, stock, dues and operations."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
              Refresh
            </Button>
            <Button size="sm" onClick={() => setActiveModule("sales", { tab: "pos" })}>
              <ShoppingCart className="mr-1.5 h-4 w-4" /> New Sale (F1)
            </Button>
          </>
        }
      />

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Today's Sales" value={fmtMoney(k?.todaySales ?? 0)} sub={`${k?.todayInvoices ?? 0} invoices`} icon={<ShoppingCart className="h-4 w-4" />} tone="primary" onClick={() => setActiveModule("sales")} />
        <StatCard label="Today's Collection" value={fmtMoney(k?.todayCollection ?? 0)} sub="All payment modes" icon={<IndianRupee className="h-4 w-4" />} tone="positive" onClick={() => setActiveModule("payments")} />
        <StatCard label="Today's Expenses" value={fmtMoney(k?.todayExpenses ?? 0)} icon={<Receipt className="h-4 w-4" />} onClick={() => setActiveModule("expenses")} />
        <StatCard label="Today's Profit (est.)" value={fmtMoney(k?.todayProfit ?? 0)} sub="Sales − COGS − expenses" icon={<TrendingUp className="h-4 w-4" />} tone={(k?.todayProfit ?? 0) >= 0 ? "positive" : "negative"} onClick={() => setActiveModule("accounts")} />
        <StatCard label="Total Receivable" value={fmtMoney(k?.receivable ?? 0)} sub="Customer udhaar" icon={<ArrowDownRight className="h-4 w-4" />} tone="warning" onClick={() => setActiveModule("customers")} />
        <StatCard label="Total Payable" value={fmtMoney(k?.payable ?? 0)} sub="Suppliers + contractors" icon={<ArrowUpRight className="h-4 w-4" />} tone="negative" onClick={() => setActiveModule("suppliers")} />
        <StatCard label="Stock Value" value={fmtMoney(k?.stockValue ?? 0, { compact: true })} sub="At cost price" icon={<PackageX className="h-4 w-4 rotate-45" />} onClick={() => setActiveModule("inventory")} />
        <StatCard label="Low / Out of Stock" value={`${k?.lowStockCount ?? 0} / ${k?.outOfStockCount ?? 0}`} sub="Variants needing attention" icon={<AlertTriangle className="h-4 w-4" />} tone={(k?.outOfStockCount ?? 0) > 0 ? "negative" : "warning"} onClick={() => setActiveModule("inventory", { tab: "low" })} />
      </div>

      {/* QUICK ACTIONS */}
      <div>
        <SectionTitle>Quick Actions</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => setActiveModule(a.module, a.params)}
              className="flex flex-col items-center gap-2 rounded-lg border bg-card p-3 text-center shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <a.icon className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TREND + MONTH SUMMARY */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <SectionTitle>Sales Trend — Last 14 Days</SectionTitle>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(data?.trend ?? []).map((t: any) => ({ ...t, label: fmtDateIST(t.date, "dd MMM") }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: any) => [fmtMoney(Number(v)), "Sales"]}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <SectionTitle>This Month</SectionTitle>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-muted-foreground">Revenue</span>
                <Money value={k?.monthRevenue ?? 0} className="text-lg font-bold" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-muted-foreground">Profit (est.)</span>
                <Money value={k?.monthProfit ?? 0} colored className="text-lg font-bold" />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-muted-foreground">Customers</span>
                <span className="text-lg font-bold tabular-nums">{k?.customerCount ?? 0}</span>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setActiveModule("reports")}>
                <TrendingUp className="mr-2 h-4 w-4" /> Full Reports
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* OPERATIONS GRID */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent invoices */}
        <Card>
          <CardContent className="p-4">
            <SectionTitle action={<Button variant="ghost" size="sm" onClick={() => setActiveModule("sales")}>View all <ChevronRight className="h-4 w-4" /></Button>}>
              Recent Invoices
            </SectionTitle>
            {isLoading ? <Skeleton className="h-40" /> : lists?.recentSales?.length ? (
              <div className="space-y-1">
                {lists.recentSales.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveModule("sales", { tab: "invoices", entityId: s.id })}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <ShoppingCart className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.invoiceNumber} · {s.customer}</p>
                      <p className="text-xs text-muted-foreground"><DateCell value={s.date} /></p>
                    </div>
                    <div className="text-right">
                      <Money value={s.total} className="text-sm font-semibold" />
                      <div className="mt-0.5"><StatusBadge label={s.paymentStatus} className={SALE_PAYMENT_STATUS_COLORS[s.paymentStatus]} /></div>
                    </div>
                  </button>
                ))}
              </div>
            ) : <EmptyState title="No sales yet" description="Create your first invoice from the POS screen." icon={<ShoppingCart className="h-6 w-6" />} />}
          </CardContent>
        </Card>

        {/* Recent payments */}
        <Card>
          <CardContent className="p-4">
            <SectionTitle action={<Button variant="ghost" size="sm" onClick={() => setActiveModule("payments")}>View all <ChevronRight className="h-4 w-4" /></Button>}>
              Recent Transactions
            </SectionTitle>
            {isLoading ? <Skeleton className="h-40" /> : lists?.recentPayments?.length ? (
              <div className="space-y-1">
                {lists.recentPayments.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveModule("payments", { entityId: p.id })}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-md ${p.direction === "IN" ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
                      {p.direction === "IN" ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.party}</p>
                      <p className="text-xs text-muted-foreground">{p.method} · {p.category === "SALE_RECEIPT" ? "Sale receipt" : p.category === "CUSTOMER_PAYMENT" ? "Payment received" : p.category === "REFUND" ? "Refund" : p.category === "SUPPLIER_PAYMENT" ? "Supplier payment" : p.category} · <DateCell value={p.date} /></p>
                    </div>
                    <Money value={p.amount} colored={p.direction === "IN"} className="text-sm font-semibold" />
                  </button>
                ))}
              </div>
            ) : <EmptyState title="No transactions yet" />}
          </CardContent>
        </Card>

        {/* Pending orders */}
        <Card>
          <CardContent className="p-4">
            <SectionTitle action={<Button variant="ghost" size="sm" onClick={() => setActiveModule("sales", { tab: "orders" })}>View all <ChevronRight className="h-4 w-4" /></Button>}>
              Pending Orders
            </SectionTitle>
            {lists?.pendingOrders?.length ? (
              <div className="space-y-1">
                {lists.pendingOrders.map((o: any) => (
                  <button
                    key={o.id}
                    onClick={() => setActiveModule("sales", { tab: "orders", entityId: o.id })}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
                  >
                    <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{o.number} · {o.customer?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground"><DateCell value={o.orderDate} /> · {o.items?.length ?? 0} items</p>
                    </div>
                    <Money value={o.total} className="text-sm font-medium" />
                    <StatusBadge label={o.status} className={ORDER_STATUS_COLORS[o.status]} />
                  </button>
                ))}
              </div>
            ) : <EmptyState title="No pending orders" description="Customer orders appear here with their status." icon={<ClipboardList className="h-6 w-6" />} />}
          </CardContent>
        </Card>

        {/* Production / job work */}
        <Card>
          <CardContent className="p-4">
            <SectionTitle action={<Button variant="ghost" size="sm" onClick={() => setActiveModule("production", { tab: "jobwork" })}>View all <ChevronRight className="h-4 w-4" /></Button>}>
              Production Status
            </SectionTitle>
            {lists?.jobWorks?.length ? (
              <div className="space-y-1">
                {lists.jobWorks.map((j: any) => {
                  const pct = j.quantity ? Math.round((j.completedQty / j.quantity) * 100) : 0
                  return (
                    <button
                      key={j.id}
                      onClick={() => setActiveModule("production", { tab: "jobwork", entityId: j.id })}
                      className="w-full rounded-md px-2 py-2 text-left hover:bg-accent"
                    >
                      <div className="flex items-center gap-2">
                        <Factory className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">{j.description}</p>
                        <span className="text-xs text-muted-foreground">{j.completedQty}/{j.quantity}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 pl-6">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground">{j.contractor?.name ?? ""}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : <EmptyState title="No active job work" description="Assign stitching/printing work to contractors in the Production module." icon={<Factory className="h-6 w-6" />} />}
          </CardContent>
        </Card>

        {/* Low stock */}
        <Card>
          <CardContent className="p-4">
            <SectionTitle action={<Button variant="ghost" size="sm" onClick={() => setActiveModule("inventory", { tab: "low" })}>View all <ChevronRight className="h-4 w-4" /></Button>}>
              Low Stock Alerts
            </SectionTitle>
            {lists?.lowStock?.length ? (
              <div className="space-y-1">
                {lists.lowStock.map((l: any) => (
                  <button
                    key={l.variantId}
                    onClick={() => setActiveModule("inventory", { entityId: l.variantId })}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
                  >
                    <PackageX className="h-4 w-4 shrink-0 rotate-45 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.product}</p>
                      <p className="text-xs text-muted-foreground">{l.variant} · {l.sku}</p>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${l.totalStock <= 0 ? "text-red-600" : "text-amber-600"}`}>
                      {l.totalStock}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> All products are sufficiently stocked
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks */}
        <Card>
          <CardContent className="p-4">
            <SectionTitle action={<Button variant="ghost" size="sm" onClick={() => setActiveModule("staff", { tab: "tasks" })}>View all <ChevronRight className="h-4 w-4" /></Button>}>
              Upcoming Tasks
            </SectionTitle>
            {lists?.tasks?.length ? (
              <div className="space-y-1">
                {lists.tasks.map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveModule("staff", { tab: "tasks", entityId: t.id })}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent"
                  >
                    <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      {t.dueDate && <p className="text-xs text-muted-foreground">Due <DateCell value={t.dueDate} /></p>}
                    </div>
                    <StatusBadge label={TASK_PRIORITY_LABELS[t.priority] ?? t.priority} className={TASK_PRIORITY_COLORS[t.priority]} />
                  </button>
                ))}
              </div>
            ) : <EmptyState title="No pending tasks" description="Business tasks assigned to staff appear here." icon={<CalendarClock className="h-6 w-6" />} />}
          </CardContent>
        </Card>
      </div>

      {/* Recent customers + purchases */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <SectionTitle action={<Button variant="ghost" size="sm" onClick={() => setActiveModule("customers")}>View all <ChevronRight className="h-4 w-4" /></Button>}>
              Recent Customers
            </SectionTitle>
            {lists?.recentCustomers?.length ? (
              <div className="space-y-1">
                {lists.recentCustomers.map((c: any) => (
                  <button key={c.id} onClick={() => setActiveModule("customers", { entityId: c.id })} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {c.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone ?? "No phone"} · {c.type.toLowerCase()}</p>
                    </div>
                    {c.outstanding > 0 && <span className="text-xs font-medium text-amber-600">₹{c.outstanding.toFixed(0)} due</span>}
                  </button>
                ))}
              </div>
            ) : <EmptyState title="No customers yet" icon={<Users className="h-6 w-6" />} />}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <SectionTitle action={<Button variant="ghost" size="sm" onClick={() => setActiveModule("purchases")}>View all <ChevronRight className="h-4 w-4" /></Button>}>
              Recent Purchases
            </SectionTitle>
            {lists?.recentPurchases?.length ? (
              <div className="space-y-1">
                {lists.recentPurchases.map((p: any) => (
                  <button key={p.id} onClick={() => setActiveModule("purchases", { entityId: p.id })} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent">
                    <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.number} · {p.supplier}</p>
                      <p className="text-xs text-muted-foreground"><DateCell value={p.date} /></p>
                    </div>
                    <Money value={p.total} className="text-sm font-medium" />
                    <StatusBadge label={p.status === "RECEIVED" ? "Received" : p.status === "ORDERED" ? "PO" : p.status} className={p.status === "RECEIVED" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"} />
                  </button>
                ))}
              </div>
            ) : <EmptyState title="No purchases yet" icon={<Truck className="h-6 w-6" />} />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
