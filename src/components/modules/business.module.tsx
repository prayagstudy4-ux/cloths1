"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/client/api"
import { useApp } from "@/lib/client/store"
import { PageHeader, StatCard, SectionTitle, EmptyState } from "@/components/shared/basics"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Building2, Pencil, ShoppingCart, Zap, Users, Truck, IndianRupee, TrendingUp,
  Phone, Mail, Globe, MapPin, Landmark, Wallet, BadgeCheck, Package, Boxes, Receipt, IdCard, Factory,
} from "lucide-react"

const BUSINESS_TYPES: Record<string, string> = {
  RETAIL: "Retail",
  WHOLESALE: "Wholesale",
  MANUFACTURING: "Manufacturing",
  RETAIL_WHOLESALE: "Retail + Wholesale",
}

/** Stored logo URLs point at the file-service endpoint — normalise to the working route. */
function resolveFileUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url, "http://localhost")
    const p = u.searchParams.get("path")
    if (p) return `/api/files/file?path=${encodeURIComponent(p)}`
  } catch { /* keep original */ }
  return url
}

const COUNT_CARDS = [
  { key: "products", label: "Products", icon: Package, module: "products" },
  { key: "variants", label: "Variants", icon: Boxes, module: "products" },
  { key: "customers", label: "Customers", icon: Users, module: "customers" },
  { key: "suppliers", label: "Suppliers", icon: Truck, module: "suppliers" },
  { key: "sales", label: "Invoices", icon: ShoppingCart, module: "sales" },
  { key: "purchases", label: "Purchases", icon: Receipt, module: "purchases" },
  { key: "employees", label: "Employees", icon: IdCard, module: "staff" },
]

export function BusinessModule() {
  const { setActiveModule } = useApp()
  const { data, isLoading } = useQuery({
    queryKey: ["business"],
    queryFn: () => api.get("business"),
  })

  const b = data?.business
  const counts: Record<string, number> = data?.counts ?? {}

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Building2 className="h-5 w-5" />}
        title="Business"
        description="Profile, records and quick actions for your clothing business. Editing happens in Settings."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setActiveModule("settings", { tab: "business" })}>
              <Pencil className="mr-1.5 h-4 w-4" /> Edit Profile
            </Button>
            <Button size="sm" onClick={() => setActiveModule("sales", { tab: "pos" })}>
              <ShoppingCart className="mr-1.5 h-4 w-4" /> New Sale
            </Button>
          </>
        }
      />

      {/* ---------- PROFILE CARD ---------- */}
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : !b ? (
        <EmptyState
          title="No business profile"
          description="Complete the setup or fill in your business profile in Settings."
          icon={<Building2 className="h-6 w-6" />}
          action={<Button size="sm" onClick={() => setActiveModule("settings", { tab: "business" })}>Open Settings</Button>}
        />
      ) : (
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col gap-5 sm:flex-row">
              {/* Identity */}
              <div className="flex items-start gap-4 sm:w-72 sm:shrink-0">
                {b.logo ? (
                  <img
                    src={resolveFileUrl(b.logo)}
                    alt={`${b.name} logo`}
                    className="h-20 w-20 shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-3xl font-bold text-primary">
                    {(b.name ?? "?")[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold leading-tight">{b.name}</h2>
                  {b.brandName && <p className="text-sm font-medium text-primary">{b.brandName}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {b.businessType && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {BUSINESS_TYPES[b.businessType] ?? b.businessType}
                      </span>
                    )}
                    {b.gstin && (
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        GSTIN: {b.gstin}
                      </span>
                    )}
                    {b.pan && (
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        PAN: {b.pan}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact details */}
              <div className="grid flex-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Detail icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={b.phone} />
                <Detail icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={b.email} />
                <Detail icon={<Globe className="h-3.5 w-3.5" />} label="Website" value={b.website} />
                <Detail
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Address"
                  value={[b.address, b.city, b.state, b.pincode].filter(Boolean).join(", ") || undefined}
                  colSpan
                />
                <Detail icon={<Wallet className="h-3.5 w-3.5" />} label="UPI" value={[b.upiId, b.upiPayeeName].filter(Boolean).join(" · ")} />
                <Detail
                  icon={<Landmark className="h-3.5 w-3.5" />}
                  label="Bank"
                  value={[b.bankName, b.bankAccount, b.bankIfsc].filter(Boolean).join(" · ")}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- RECORDS ---------- */}
      <div>
        <SectionTitle>Business Records</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {COUNT_CARDS.map((c) => (
            <StatCard
              key={c.key}
              label={c.label}
              value={isLoading ? "…" : (counts[c.key] ?? 0)}
              icon={<c.icon className="h-4 w-4" />}
              onClick={() => setActiveModule(c.module)}
            />
          ))}
        </div>
      </div>

      {/* ---------- QUICK ACTIONS ---------- */}
      <div>
        <SectionTitle>Quick Actions</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <QuickAction icon={<Pencil className="h-5 w-5" />} label="Edit Profile" onClick={() => setActiveModule("settings", { tab: "business" })} />
          <QuickAction icon={<ShoppingCart className="h-5 w-5" />} label="New Sale" onClick={() => setActiveModule("sales", { tab: "pos" })} />
          <QuickAction icon={<Zap className="h-5 w-5" />} label="New Product" onClick={() => setActiveModule("products", { new: "1" })} />
          <QuickAction icon={<Users className="h-5 w-5" />} label="New Customer" onClick={() => setActiveModule("customers", { new: "1" })} />
          <QuickAction icon={<Truck className="h-5 w-5" />} label="New Purchase" onClick={() => setActiveModule("purchases", { new: "1" })} />
          <QuickAction icon={<IndianRupee className="h-5 w-5" />} label="Receive Payment" onClick={() => setActiveModule("payments", { tab: "receive" })} />
          <QuickAction icon={<Factory className="h-5 w-5" />} label="Production" onClick={() => setActiveModule("production")} />
          <QuickAction icon={<TrendingUp className="h-5 w-5" />} label="Reports" onClick={() => setActiveModule("reports")} />
          <QuickAction icon={<BadgeCheck className="h-5 w-5" />} label="Audit Log" onClick={() => setActiveModule("settings", { tab: "audit" })} />
        </div>
      </div>
    </div>
  )
}

function Detail({ icon, label, value, colSpan }: { icon: React.ReactNode; label: string; value?: string | null; colSpan?: boolean }) {
  return (
    <div className={colSpan ? "sm:col-span-2 lg:col-span-3" : ""}>
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-0.5 truncate font-medium" title={value ?? undefined}>{value || "—"}</p>
    </div>
  )
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-lg border bg-card p-3 text-center shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
    >
      <span className="text-primary">{icon}</span>
      <span className="text-xs font-medium leading-tight">{label}</span>
    </button>
  )
}
