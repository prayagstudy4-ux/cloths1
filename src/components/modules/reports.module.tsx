"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { useApp } from "@/lib/client/store"
import { PageHeader, StatCard, SectionTitle, EmptyState } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import { StatusBadge, Money, DateCell } from "@/components/shared/fields"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import {
  TrendingUp, ShoppingCart, Boxes, IndianRupee, Users, Truck, Factory, Landmark,
  Receipt, PackageX, Download, ArrowDownRight, ArrowUpRight, CalendarRange,
} from "lucide-react"
import { fmtMoney, fmtDateIST } from "@/lib/format"
import {
  DATE_PRESETS, DATE_PRESET_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
  PAYMENT_CATEGORY_LABELS, PAYMENT_STATUS_COLORS, CUSTOMER_TYPE_LABELS,
  CONTRACTOR_TYPE_LABELS, EXPENSE_CATEGORY_LABELS, JOBWORK_STATUS_LABELS,
} from "@/lib/constants"
import { cn } from "@/lib/utils"

const REPORT_TYPES = [
  { id: "sales", label: "Sales", icon: ShoppingCart, desc: "Revenue, profit & trends" },
  { id: "inventory", label: "Inventory", icon: Boxes, desc: "Stock value & movement" },
  { id: "payments", label: "Payments", icon: IndianRupee, desc: "Cash in / out by mode" },
  { id: "customers", label: "Customers", icon: Users, desc: "Top buyers & dues" },
  { id: "suppliers", label: "Suppliers", icon: Truck, desc: "Purchases & payables" },
  { id: "production", label: "Production", icon: Factory, desc: "Job work & contractors" },
  { id: "finance", label: "Finance / P&L", icon: Landmark, desc: "Profit & loss statement" },
]

const STOCK_STATUS_COLORS: Record<string, string> = {
  OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  LOW: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  OUT: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}

const ACTION_COLORS: Record<string, string> = {
  IN: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  OUT: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}

export function ReportsModule() {
  const { moduleParams } = useApp()
  const [type, setType] = useState<string>(() => {
    const t = (moduleParams?.type ?? moduleParams?.tab) as string | undefined
    return REPORT_TYPES.some((r) => r.id === t) ? (t as string) : "sales"
  })
  const [preset, setPreset] = useState<string>("this_month")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [invTab, setInvTab] = useState<string>("current")

  const sub = type === "inventory" ? (invTab === "low" ? "low" : invTab === "out" ? "out" : "") : ""
  const customReady = preset !== "custom" || (!!customFrom && !!customTo)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["reports", type, preset, customFrom, customTo, sub],
    queryFn: () =>
      api.get(
        `reports/${type}${qs({
          preset,
          from: preset === "custom" ? customFrom : "",
          to: preset === "custom" ? customTo : "",
          sub,
        })}`,
      ),
    enabled: customReady,
    placeholderData: (prev: any) => prev,
  })

  const period = data?.period
  const activeType = REPORT_TYPES.find((r) => r.id === type)

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<TrendingUp className="h-5 w-5" />}
        title="Reports & Analytics"
        description="Sales performance, stock valuation, payment flows, party ledgers and profit & loss — filterable by date range."
        actions={
          period && (
            <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5" />
              {fmtDateIST(period.from)} — {fmtDateIST(period.to)}
              {isFetching && <span className="text-primary">· refreshing…</span>}
            </div>
          )
        }
      />

      {/* ---------- REPORT TYPE SELECTOR ---------- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {REPORT_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg border bg-card p-3 text-center shadow-sm transition-all hover:border-primary/40 hover:shadow",
              type === t.id && "border-primary bg-primary/5 shadow",
            )}
          >
            <t.icon className={cn("h-5 w-5", type === t.id ? "text-primary" : "text-muted-foreground")} />
            <span className={cn("text-xs font-medium leading-tight", type === t.id ? "text-primary" : "")}>{t.label}</span>
            <span className="hidden text-[10px] leading-tight text-muted-foreground lg:block">{t.desc}</span>
          </button>
        ))}
      </div>

      {/* ---------- DATE RANGE BAR ---------- */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          {DATE_PRESETS.filter((p) => p !== "custom").map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                preset === p
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {DATE_PRESET_LABELS[p]}
            </button>
          ))}
          <button
            onClick={() => setPreset("custom")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              preset === "custom"
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            Custom…
          </button>

          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 w-[150px]"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 w-[150px]"
                aria-label="To date"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- REPORT BODY ---------- */}
      {isLoading && !data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : !customReady ? (
        <EmptyState
          icon={<CalendarRange className="h-6 w-6" />}
          title="Pick a date range"
          description="Choose both a start and end date for the custom range, or select a preset above."
        />
      ) : !data ? (
        <EmptyState title={`No data for ${activeType?.label ?? "this report"}`} description="Try a different date range." />
      ) : (
        <div className="space-y-4">
          {type === "sales" && <SalesReport data={data} />}
          {type === "inventory" && <InventoryReport data={data} invTab={invTab} setInvTab={setInvTab} />}
          {type === "payments" && <PaymentsReport data={data} />}
          {type === "customers" && <CustomersReport data={data} />}
          {type === "suppliers" && <SuppliersReport data={data} />}
          {type === "production" && <ProductionReport data={data} />}
          {type === "finance" && <FinanceReport data={data} />}
        </div>
      )}
    </div>
  )
}

// ==================== SALES REPORT ====================
function SalesReport({ data }: { data: any }) {
  const s = data.summary ?? {}
  const methodTotals: Record<string, number> = data.methodTotals ?? {}
  const byDay: { date: string; total: number; count: number }[] = data.byDay ?? []
  const topProducts: any[] = data.topProducts ?? []
  const byCategory: any[] = data.byCategory ?? []
  const topCustomers: any[] = data.topCustomers ?? []
  const bySalesperson: any[] = data.bySalesperson ?? []
  const catTotal = byCategory.reduce((sm, c) => sm + c.total, 0)

  const prodCols: Column<any>[] = [
    { key: "name", header: "Product", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "sku", header: "SKU", render: (r) => <span className="text-xs text-muted-foreground">{r.sku}</span> },
    { key: "units", header: "Units", align: "right", sortValue: (r) => r.units },
    { key: "revenue", header: "Revenue", align: "right", sortValue: (r) => r.revenue, render: (r) => <Money value={r.revenue} /> },
    { key: "cogs", header: "COGS", align: "right", sortValue: (r) => r.cogs, render: (r) => <Money value={r.cogs} /> },
    {
      key: "profit", header: "Profit", align: "right", sortValue: (r) => r.revenue - r.cogs,
      render: (r) => <Money value={r.revenue - r.cogs} colored className="font-medium" />,
    },
  ]

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Sales" value={fmtMoney(s.totalSales)} icon={<ShoppingCart className="h-4 w-4" />} tone="primary" />
        <StatCard label="Invoices" value={s.invoiceCount ?? 0} icon={<Receipt className="h-4 w-4" />} />
        <StatCard label="Avg Sale" value={fmtMoney(s.avgSale)} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Gross Profit" value={fmtMoney(s.grossProfit)} tone={s.grossProfit >= 0 ? "positive" : "negative"} sub="Sales − COGS" icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="COGS" value={fmtMoney(s.cogs)} sub="At cost price" icon={<PackageX className="h-4 w-4 rotate-45" />} />
        <StatCard label="Amount Due" value={fmtMoney(s.due)} tone={s.due > 0 ? "warning" : "default"} icon={<IndianRupee className="h-4 w-4" />} />
      </div>

      {/* Payment methods */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PAYMENT_METHODS.map((m) => (
          <div key={m} className="rounded-lg border bg-card p-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{PAYMENT_METHOD_LABELS[m]}</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{fmtMoney(methodTotals[m] ?? 0)}</p>
          </div>
        ))}
      </div>

      {/* Daily chart */}
      <Card>
        <CardContent className="p-4">
          <SectionTitle>Sales by Day</SectionTitle>
          {byDay.length === 0 ? (
            <EmptyState title="No sales in this period" icon={<ShoppingCart className="h-6 w-6" />} />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDay.map((d) => ({ ...d, label: fmtDateIST(d.date, "dd MMM") }))}>
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

      {/* Top products */}
      <Card>
        <CardContent className="p-4">
          <SectionTitle>Top Products</SectionTitle>
          <DataTable
            columns={prodCols}
            rows={topProducts}
            exportName="sales-top-products"
            pageSize={10}
            dense
            emptyTitle="No products sold in this period"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Category-wise */}
        <Card>
          <CardContent className="p-4">
            <SectionTitle
              action={
                <Button
                  variant="outline" size="sm"
                  onClick={() => exportCSV("sales-by-category", ["Category", "Sales"], byCategory.map((c) => [c.category, c.total]))}
                >
                  <Download className="mr-1.5 h-4 w-4" /> CSV
                </Button>
              }
            >
              Category-wise Sales
            </SectionTitle>
            {byCategory.length === 0 ? (
              <EmptyState title="No category data" />
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 text-right font-semibold">Sales</th>
                      <th className="w-32 px-3 py-2 text-right font-semibold">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCategory.map((c: any, i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{c.category}</td>
                        <td className="px-3 py-2 text-right tabular-nums"><Money value={c.total} /></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${catTotal ? (c.total / catTotal) * 100 : 0}%` }} />
                            </div>
                            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                              {catTotal ? ((c.total / catTotal) * 100).toFixed(0) : 0}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top customers */}
        <Card>
          <CardContent className="p-4">
            <SectionTitle
              action={
                <Button
                  variant="outline" size="sm"
                  onClick={() => exportCSV("sales-top-customers", ["Customer", "Invoices", "Total"], topCustomers.map((c) => [c.name, c.count, c.total]))}
                >
                  <Download className="mr-1.5 h-4 w-4" /> CSV
                </Button>
              }
            >
              Top Customers
            </SectionTitle>
            <DataTable
              columns={[
                { key: "name", header: "Customer", render: (r: any) => <span className="font-medium">{r.name}</span> },
                { key: "count", header: "Invoices", align: "right", sortValue: (r: any) => r.count },
                { key: "total", header: "Total", align: "right", sortValue: (r: any) => r.total, render: (r: any) => <Money value={r.total} /> },
              ]}
              rows={topCustomers}
              pageSize={10}
              dense
              emptyTitle="No customer sales in this period"
            />
          </CardContent>
        </Card>
      </div>

      {/* Salesperson-wise */}
      <Card>
        <CardContent className="p-4">
          <SectionTitle
            action={
              <Button
                variant="outline" size="sm"
                onClick={() => exportCSV("sales-by-salesperson", ["Salesperson", "Sales"], bySalesperson.map((r) => [r.name, r.total]))}
              >
                <Download className="mr-1.5 h-4 w-4" /> CSV
              </Button>
            }
          >
            Salesperson Performance
          </SectionTitle>
          <DataTable
            columns={[
              { key: "name", header: "Salesperson", render: (r: any) => <span className="font-medium">{r.name}</span> },
              { key: "total", header: "Sales", align: "right", sortValue: (r: any) => r.total, render: (r: any) => <Money value={r.total} /> },
              {
                key: "share", header: "Share of Sales", align: "right",
                render: (r: any) => {
                  const tot = bySalesperson.reduce((s: number, x: any) => s + x.total, 0)
                  return <span className="text-xs tabular-nums text-muted-foreground">{tot ? ((r.total / tot) * 100).toFixed(1) : 0}%</span>
                },
              },
            ]}
            rows={bySalesperson}
            pageSize={10}
            dense
            emptyTitle="No salesperson data in this period"
            emptyDescription="Record salesperson names on invoices to see their performance here."
          />
        </CardContent>
      </Card>
    </>
  )
}

// ==================== INVENTORY REPORT ====================
function InventoryReport({ data, invTab, setInvTab }: { data: any; invTab: string; setInvTab: (t: string) => void }) {
  const s = data.summary ?? {}
  const rows: any[] = data.rows ?? []
  const fastSelling: any[] = data.fastSelling ?? []
  const slowSelling: any[] = data.slowSelling ?? []

  const stockCols: Column<any>[] = [
    { key: "sku", header: "SKU", render: (r) => <span className="text-xs text-muted-foreground">{r.sku}</span> },
    { key: "product", header: "Product", render: (r) => <span className="font-medium">{r.product}</span> },
    { key: "category", header: "Category" },
    { key: "variant", header: "Variant" },
    {
      key: "stock", header: "Stock", align: "right", sortValue: (r) => r.stock,
      render: (r) => (
        <span className={cn("font-semibold tabular-nums", r.stock <= 0 ? "text-red-600 dark:text-red-400" : r.status === "LOW" ? "text-amber-600 dark:text-amber-400" : "")}>
          {r.stock}
        </span>
      ),
    },
    { key: "minStock", header: "Min", align: "right", render: (r) => <span className="text-muted-foreground">{r.minStock}</span> },
    { key: "costPrice", header: "Cost", align: "right", sortValue: (r) => r.costPrice, render: (r) => <Money value={r.costPrice} /> },
    { key: "sellingPrice", header: "MRP", align: "right", sortValue: (r) => r.sellingPrice, render: (r) => <Money value={r.sellingPrice} /> },
    { key: "stockValue", header: "Stock Value", align: "right", sortValue: (r) => r.stockValue, render: (r) => <Money value={r.stockValue} /> },
    {
      key: "status", header: "Status", align: "center", sortValue: (r) => r.status,
      render: (r) => <StatusBadge label={r.status === "OK" ? "In Stock" : r.status === "LOW" ? "Low" : "Out"} className={STOCK_STATUS_COLORS[r.status]} />,
    },
  ]

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Stock Value (Cost)" value={fmtMoney(s.totalValue, { compact: true })} icon={<Boxes className="h-4 w-4" />} tone="primary" />
        <StatCard label="Retail Value" value={fmtMoney(s.retailValue, { compact: true })} sub="At selling price" icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Total Units" value={s.totalUnits ?? 0} icon={<PackageX className="h-4 w-4 rotate-45" />} />
        <StatCard label="Variants" value={s.totalVariants ?? 0} icon={<Boxes className="h-4 w-4" />} />
        <StatCard label="Low Stock" value={s.lowCount ?? 0} tone={s.lowCount > 0 ? "warning" : "default"} icon={<PackageX className="h-4 w-4" />} />
        <StatCard label="Out of Stock" value={s.outCount ?? 0} tone={s.outCount > 0 ? "negative" : "default"} icon={<PackageX className="h-4 w-4" />} />
      </div>

      <Tabs value={invTab} onValueChange={setInvTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="current" className="flex-none px-3">Current Stock</TabsTrigger>
          <TabsTrigger value="low" className="flex-none px-3">Low Stock</TabsTrigger>
          <TabsTrigger value="out" className="flex-none px-3">Out of Stock</TabsTrigger>
          <TabsTrigger value="fast" className="flex-none px-3">Fast-selling</TabsTrigger>
          <TabsTrigger value="slow" className="flex-none px-3">Slow-selling</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-3">
          <DataTable
            columns={stockCols}
            rows={rows}
            exportName="inventory-stock"
            pageSize={15}
            dense
            searchKeys={["sku", "product", "category", "variant"]}
            searchPlaceholder="Search SKU, product, category…"
            emptyTitle="No stock records"
            rowClassName={(r) => (r.stock <= 0 ? "bg-red-500/5" : r.status === "LOW" ? "bg-amber-500/5" : "")}
          />
        </TabsContent>

        <TabsContent value="low" className="mt-3">
          <DataTable
            columns={stockCols}
            rows={rows}
            exportName="inventory-low-stock"
            pageSize={15}
            dense
            searchKeys={["sku", "product", "category", "variant"]}
            searchPlaceholder="Search SKU, product…"
            emptyTitle="Nothing low on stock"
            emptyDescription="All variants are above their minimum stock level."
          />
        </TabsContent>

        <TabsContent value="out" className="mt-3">
          <DataTable
            columns={stockCols}
            rows={rows}
            exportName="inventory-out-of-stock"
            pageSize={15}
            dense
            searchKeys={["sku", "product", "category", "variant"]}
            searchPlaceholder="Search SKU, product…"
            emptyTitle="Nothing out of stock"
            emptyDescription="Every variant has at least one unit in stock."
          />
        </TabsContent>

        <TabsContent value="fast" className="mt-3">
          <p className="mb-3 text-xs text-muted-foreground">Units sold in the selected period, ranked highest first.</p>
          <DataTable
            columns={[
              { key: "sku", header: "SKU", render: (r: any) => <span className="text-xs text-muted-foreground">{r.sku}</span> },
              { key: "product", header: "Product", render: (r: any) => <span className="font-medium">{r.product}</span> },
              { key: "units", header: "Units Sold", align: "right", sortValue: (r: any) => r.units, render: (r: any) => <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{r.units}</span> },
            ]}
            rows={fastSelling}
            exportName="inventory-fast-selling"
            pageSize={10}
            dense
            emptyTitle="No sales in this period"
          />
        </TabsContent>

        <TabsContent value="slow" className="mt-3">
          <p className="mb-3 text-xs text-muted-foreground">In-stock variants with zero sales in the selected period.</p>
          <DataTable
            columns={[
              { key: "sku", header: "SKU", render: (r: any) => <span className="text-xs text-muted-foreground">{r.sku}</span> },
              { key: "product", header: "Product", render: (r: any) => <span className="font-medium">{r.product}</span> },
              { key: "stock", header: "Stock on Hand", align: "right", sortValue: (r: any) => r.stock, render: (r: any) => <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">{r.stock}</span> },
            ]}
            rows={slowSelling}
            exportName="inventory-slow-selling"
            pageSize={10}
            dense
            emptyTitle="No slow-moving stock"
            emptyDescription="Every in-stock variant sold at least once in this period."
          />
        </TabsContent>
      </Tabs>
    </>
  )
}

// ==================== PAYMENTS REPORT ====================
function PaymentsReport({ data }: { data: any }) {
  const s = data.summary ?? {}
  const byMethod: Record<string, number> = data.byMethod ?? {}
  const byCategory: Record<string, number> = data.byCategory ?? {}
  const payments: any[] = data.payments ?? []

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Money In" value={fmtMoney(s.totalIn)} tone="positive" icon={<ArrowDownRight className="h-4 w-4" />} />
        <StatCard label="Money Out" value={fmtMoney(s.totalOut)} tone="negative" icon={<ArrowUpRight className="h-4 w-4" />} />
        <StatCard label="Net Flow" value={fmtMoney(s.net)} tone={s.net >= 0 ? "positive" : "negative"} icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard label="Unmatched" value={fmtMoney(s.unmatched)} tone={s.unmatched > 0 ? "warning" : "default"} sub="Needs matching" icon={<PackageX className="h-4 w-4" />} />
        <StatCard label="Refunds Paid" value={fmtMoney(s.refunds)} tone="negative" icon={<ArrowUpRight className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <SectionTitle>By Payment Method</SectionTitle>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Method</th>
                    <th className="px-3 py-2 text-right font-semibold">Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byMethod).map(([m, v]) => (
                    <tr key={m} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{PAYMENT_METHOD_LABELS[m] ?? m}</td>
                      <td className="px-3 py-2 text-right"><Money value={v} colored className="font-medium" /></td>
                    </tr>
                  ))}
                  {Object.keys(byMethod).length === 0 && (
                    <tr><td className="px-3 py-4 text-center text-muted-foreground" colSpan={2}>No payments in this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <SectionTitle>By Category</SectionTitle>
            <div className="max-h-72 overflow-y-auto thin-scrollbar rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Category</th>
                    <th className="px-3 py-2 text-right font-semibold">Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byCategory).map(([c, v]) => (
                    <tr key={c} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{PAYMENT_CATEGORY_LABELS[c] ?? c}</td>
                      <td className="px-3 py-2 text-right"><Money value={v} colored className="font-medium" /></td>
                    </tr>
                  ))}
                  {Object.keys(byCategory).length === 0 && (
                    <tr><td className="px-3 py-4 text-center text-muted-foreground" colSpan={2}>No payments in this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <SectionTitle>Payment Transactions ({payments.length})</SectionTitle>
          <DataTable
            columns={[
              { key: "date", header: "Date", render: (p: any) => <DateCell value={p.date} />, sortValue: (p: any) => p.date },
              {
                key: "party", header: "Party", render: (p: any) => (
                  <span className="font-medium">{p.customer?.name ?? p.supplier?.name ?? "—"}</span>
                ),
              },
              { key: "category", header: "Category", render: (p: any) => <StatusBadge label={PAYMENT_CATEGORY_LABELS[p.category] ?? p.category} className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" /> },
              { key: "method", header: "Method", render: (p: any) => PAYMENT_METHOD_LABELS[p.method] ?? p.method },
              {
                key: "direction", header: "Flow", align: "center", sortValue: (p: any) => p.direction,
                render: (p: any) => <StatusBadge label={p.direction === "IN" ? "In" : "Out"} className={ACTION_COLORS[p.direction]} />,
              },
              {
                key: "amount", header: "Amount", align: "right", sortValue: (p: any) => p.amount,
                render: (p: any) => <Money value={p.direction === "IN" ? p.amount : -p.amount} colored className="font-semibold" />,
              },
              {
                key: "status", header: "Status", align: "center",
                render: (p: any) => <StatusBadge label={p.status} className={PAYMENT_STATUS_COLORS[p.status] ?? ""} />,
              },
            ]}
            rows={payments}
            exportName="payments-report"
            pageSize={15}
            dense
            searchKeys={["customer.name", "supplier.name", "method", "category", "transactionId"]}
            searchPlaceholder="Search party, method, txn id…"
            emptyTitle="No payments in this period"
          />
        </CardContent>
      </Card>
    </>
  )
}

// ==================== CUSTOMERS REPORT ====================
function CustomersReport({ data }: { data: any }) {
  const s = data.summary ?? {}
  const top: any[] = data.top ?? []
  const outstanding: any[] = data.outstanding ?? []

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Customers" value={s.totalCustomers ?? 0} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Active in Period" value={s.activeCustomers ?? 0} sub="Made a purchase" icon={<ShoppingCart className="h-4 w-4" />} tone="primary" />
        <StatCard label="Revenue (Period)" value={fmtMoney(s.totalRevenue)} icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard label="Total Outstanding" value={fmtMoney(s.totalOutstanding)} tone="warning" sub="Across all customers" icon={<PackageX className="h-4 w-4" />} />
      </div>

      <Card>
        <CardContent className="p-4">
          <SectionTitle>Top Customers (by purchases in period)</SectionTitle>
          <DataTable
            columns={[
              {
                key: "name", header: "Customer", render: (r: any) => (
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {r.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.code}{r.phone ? ` · ${r.phone}` : ""}</p>
                    </div>
                  </div>
                ),
              },
              { key: "type", header: "Type", render: (r: any) => <StatusBadge label={CUSTOMER_TYPE_LABELS[r.type] ?? r.type} className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" /> },
              { key: "invoiceCount", header: "Invoices", align: "right", sortValue: (r: any) => r.invoiceCount },
              { key: "purchases", header: "Purchases", align: "right", sortValue: (r: any) => r.purchases, render: (r: any) => <Money value={r.purchases} /> },
              { key: "outstanding", header: "Outstanding", align: "right", sortValue: (r: any) => r.outstanding, render: (r: any) => <Money value={r.outstanding} colored className="font-medium" /> },
            ]}
            rows={top}
            exportName="customers-report-top"
            pageSize={10}
            dense
            searchKeys={["name", "code", "phone"]}
            searchPlaceholder="Search customers…"
            emptyTitle="No customers yet"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <SectionTitle>Outstanding Dues (udhaar)</SectionTitle>
          <DataTable
            columns={[
              { key: "name", header: "Customer", render: (r: any) => <span className="font-medium">{r.name}</span> },
              { key: "phone", header: "Phone", render: (r: any) => <span className="tabular-nums">{r.phone ?? "—"}</span> },
              { key: "type", header: "Type", render: (r: any) => <StatusBadge label={CUSTOMER_TYPE_LABELS[r.type] ?? r.type} className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" /> },
              { key: "purchases", header: "Purchases (Period)", align: "right", sortValue: (r: any) => r.purchases, render: (r: any) => <Money value={r.purchases} /> },
              { key: "outstanding", header: "Outstanding", align: "right", sortValue: (r: any) => r.outstanding, render: (r: any) => <Money value={r.outstanding} colored className="font-semibold text-amber-600 dark:text-amber-400" /> },
            ]}
            rows={outstanding}
            exportName="customers-outstanding"
            pageSize={10}
            dense
            searchKeys={["name", "phone"]}
            searchPlaceholder="Search customers…"
            emptyTitle="No outstanding dues"
            emptyDescription="Every customer has settled their account."
            rowClassName={() => "bg-amber-500/5"}
          />
        </CardContent>
      </Card>
    </>
  )
}

// ==================== SUPPLIERS REPORT ====================
function SuppliersReport({ data }: { data: any }) {
  const s = data.summary ?? {}
  const rows: any[] = data.rows ?? []

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Total Suppliers" value={s.totalSuppliers ?? 0} icon={<Truck className="h-4 w-4" />} />
        <StatCard label="Purchases (Period)" value={fmtMoney(s.totalPurchases)} icon={<ShoppingCart className="h-4 w-4" />} tone="primary" />
        <StatCard label="Total Payable" value={fmtMoney(s.totalOutstanding)} tone="negative" sub="Across all suppliers" icon={<IndianRupee className="h-4 w-4" />} />
      </div>

      <Card>
        <CardContent className="p-4">
          <SectionTitle>Supplier Purchases & Payables</SectionTitle>
          <DataTable
            columns={[
              {
                key: "name", header: "Supplier", render: (r: any) => (
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.code}</p>
                  </div>
                ),
              },
              { key: "purchaseCount", header: "Purchases", align: "right", sortValue: (r: any) => r.purchaseCount },
              { key: "purchases", header: "Purchase Value (Period)", align: "right", sortValue: (r: any) => r.purchases, render: (r: any) => <Money value={r.purchases} /> },
              { key: "outstanding", header: "Outstanding", align: "right", sortValue: (r: any) => r.outstanding, render: (r: any) => <Money value={r.outstanding} colored className="font-medium" /> },
            ]}
            rows={rows}
            exportName="suppliers-report"
            pageSize={12}
            dense
            searchKeys={["name", "code"]}
            searchPlaceholder="Search suppliers…"
            emptyTitle="No suppliers yet"
            rowClassName={(r) => (r.outstanding > 0 ? "bg-amber-500/5" : "")}
          />
        </CardContent>
      </Card>
    </>
  )
}

// ==================== PRODUCTION REPORT ====================
function ProductionReport({ data }: { data: any }) {
  const s = data.summary ?? {}
  const contractors: any[] = data.contractorPerformance ?? []
  const jobWorks: any[] = data.jobWorks ?? []

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Job Works" value={s.jobWorks ?? 0} sub="Assigned in period" icon={<Factory className="h-4 w-4" />} />
        <StatCard label="Pieces Assigned" value={s.piecesAssigned ?? 0} icon={<Boxes className="h-4 w-4" />} />
        <StatCard label="Pieces Completed" value={s.piecesCompleted ?? 0} tone="positive" icon={<PackageX className="h-4 w-4 rotate-45" />} />
        <StatCard label="Labor Cost" value={fmtMoney(s.laborCost)} icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard label="Payable to Contractors" value={fmtMoney(s.outstandingPayable)} tone={s.outstandingPayable > 0 ? "warning" : "default"} icon={<Truck className="h-4 w-4" />} />
        <StatCard label="Production Orders" value={`${s.completedOrders ?? 0}/${s.productionOrders ?? 0}`} sub="Completed / started" icon={<Factory className="h-4 w-4" />} />
      </div>

      <Card>
        <CardContent className="p-4">
          <SectionTitle>Contractor Performance</SectionTitle>
          <DataTable
            columns={[
              {
                key: "name", header: "Contractor", render: (r: any) => (
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{CONTRACTOR_TYPE_LABELS[r.type] ?? r.type}</p>
                  </div>
                ),
              },
              { key: "works", header: "Job Works", align: "right", sortValue: (r: any) => r.works },
              { key: "assigned", header: "Assigned", align: "right", sortValue: (r: any) => r.assigned },
              {
                key: "completed", header: "Completed", align: "right", sortValue: (r: any) => r.completed,
                render: (r: any) => (
                  <span className={cn("tabular-nums", r.completed >= r.assigned ? "text-emerald-600 dark:text-emerald-400" : "")}>
                    {r.completed} {r.assigned > 0 && <span className="text-xs text-muted-foreground">({Math.round((r.completed / r.assigned) * 100)}%)</span>}
                  </span>
                ),
              },
              { key: "earned", header: "Earned", align: "right", sortValue: (r: any) => r.earned, render: (r: any) => <Money value={r.earned} /> },
              { key: "outstanding", header: "Outstanding", align: "right", sortValue: (r: any) => r.outstanding, render: (r: any) => <Money value={r.outstanding} colored className="font-medium" /> },
            ]}
            rows={contractors}
            exportName="contractor-performance"
            pageSize={10}
            dense
            searchKeys={["name", "type"]}
            searchPlaceholder="Search contractors…"
            emptyTitle="No contractors yet"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <SectionTitle>Job Works in Period</SectionTitle>
          <DataTable
            columns={[
              { key: "description", header: "Description", render: (r: any) => <span className="font-medium">{r.description}</span> },
              { key: "contractor", header: "Contractor", render: (r: any) => r.contractor?.name ?? "—" },
              { key: "quantity", header: "Qty", align: "right", sortValue: (r: any) => r.quantity },
              { key: "completedQty", header: "Completed", align: "right", sortValue: (r: any) => r.completedQty },
              { key: "totalAmount", header: "Amount", align: "right", sortValue: (r: any) => r.totalAmount, render: (r: any) => <Money value={r.totalAmount} /> },
              {
                key: "status", header: "Status", align: "center",
                render: (r: any) => <StatusBadge label={JOBWORK_STATUS_LABELS[r.status] ?? r.status} className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" />,
              },
              { key: "assignedAt", header: "Assigned", render: (r: any) => <DateCell value={r.assignedAt} />, sortValue: (r: any) => r.assignedAt },
            ]}
            rows={jobWorks}
            exportName="jobworks-report"
            pageSize={10}
            dense
            searchKeys={["description", "contractor.name"]}
            searchPlaceholder="Search job works…"
            emptyTitle="No job works in this period"
          />
        </CardContent>
      </Card>
    </>
  )
}

// ==================== FINANCE / P&L REPORT ====================
function FinanceReport({ data }: { data: any }) {
  const revenue = data.revenue ?? {}
  const cogs: number = data.cogs ?? 0
  const grossProfit: number = data.grossProfit ?? 0
  const opex = data.opex ?? { total: 0, byCategory: {} }
  const productionCost: number = data.productionCost ?? 0
  const netProfit: number = data.netProfit ?? 0
  const byCategory: Record<string, number> = opex.byCategory ?? {}

  function exportPnL() {
    const rows: (string | number)[][] = [
      ["Gross Revenue", revenue.gross ?? 0],
      ["Less: Returns", -(revenue.returns ?? 0)],
      ["Net Revenue", revenue.net ?? 0],
      ["Cost of Goods Sold", -cogs],
      ["Gross Profit", grossProfit],
      ...Object.entries(byCategory).map(([c, v]) => [`Opex: ${EXPENSE_CATEGORY_LABELS[c] ?? c}`, -v]),
      ["Total Operating Expenses", -(opex.total ?? 0)],
      ["Production Cost (job work)", -productionCost],
      ["Net Profit", netProfit],
    ]
    exportCSV("profit-and-loss", ["Line Item", "Amount (₹)"], rows)
  }

  const profitTone = netProfit >= 0 ? "positive" : "negative"

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Net Revenue" value={fmtMoney(revenue.net)} sub={`Gross ${fmtMoney(revenue.gross, { compact: true })} − returns`} icon={<ShoppingCart className="h-4 w-4" />} />
        <StatCard label="Gross Profit" value={fmtMoney(grossProfit)} tone={grossProfit >= 0 ? "positive" : "negative"} sub="Net revenue − COGS" icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Operating Expenses" value={fmtMoney(opex.total)} tone="negative" icon={<Receipt className="h-4 w-4" />} />
        <StatCard label="Production Cost" value={fmtMoney(productionCost)} sub="Job work completed" icon={<Factory className="h-4 w-4" />} />
        <StatCard label="Net Profit" value={fmtMoney(netProfit)} tone={profitTone} icon={<Landmark className="h-4 w-4" />} />
      </div>

      <Card>
        <CardContent className="p-4">
          <SectionTitle
            action={
              <Button variant="outline" size="sm" onClick={exportPnL}>
                <Download className="mr-1.5 h-4 w-4" /> Export CSV
              </Button>
            }
          >
            Profit & Loss Statement
          </SectionTitle>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {/* Revenue */}
                <tr className="bg-muted/50">
                  <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" colSpan={2}>Revenue</td>
                </tr>
                <PnLRow label="Gross Sales" value={revenue.gross ?? 0} />
                <PnLRow label="Less: Returns & Exchanges" value={-(revenue.returns ?? 0)} />
                <PnLRow label="Net Revenue" value={revenue.net ?? 0} subtotal />

                {/* COGS */}
                <tr className="bg-muted/50">
                  <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" colSpan={2}>Cost of Goods Sold</td>
                </tr>
                <PnLRow label="COGS (at cost price)" value={-cogs} />
                <PnLRow label="Gross Profit" value={grossProfit} subtotal />

                {/* Opex */}
                <tr className="bg-muted/50">
                  <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" colSpan={2}>Operating Expenses</td>
                </tr>
                {Object.entries(byCategory).length === 0 && (
                  <PnLRow label="No expenses recorded" value={0} muted />
                )}
                {Object.entries(byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([c, v]) => (
                    <PnLRow key={c} label={EXPENSE_CATEGORY_LABELS[c] ?? c} value={-v} indent />
                  ))}
                <PnLRow label="Total Operating Expenses" value={-(opex.total ?? 0)} subtotal />

                {/* Production */}
                <tr className="bg-muted/50">
                  <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" colSpan={2}>Production</td>
                </tr>
                <PnLRow label="Job Work / Labor Cost" value={-productionCost} />

                {/* Net */}
                <tr className={cn("font-bold", netProfit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10")}>
                  <td className="px-4 py-3 text-base">Net Profit / (Loss)</td>
                  <td className={cn("px-4 py-3 text-right text-base tabular-nums", netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    {fmtMoney(netProfit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Net Profit = Net Revenue − COGS − Operating Expenses − Production Cost. All figures are cash-basis for the selected period.
          </p>
        </CardContent>
      </Card>
    </>
  )
}

function PnLRow({ label, value, subtotal, indent, muted }: { label: string; value: number; subtotal?: boolean; indent?: boolean; muted?: boolean }) {
  return (
    <tr className={cn("border-b last:border-0", subtotal && "border-t-2 font-semibold")}>
      <td className={cn("px-4 py-2", indent && "pl-8 text-muted-foreground", muted && "text-muted-foreground")}>
        {label}
      </td>
      <td className={cn("px-4 py-2 text-right tabular-nums", indent && "text-muted-foreground")}>
        <span className={cn(value < 0 && "text-red-600 dark:text-red-400", value > 0 && subtotal && "text-emerald-600 dark:text-emerald-400")}>
          {fmtMoney(value)}
        </span>
      </td>
    </tr>
  )
}
