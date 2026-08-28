"use client"

import { lazy, Suspense, useEffect, useState } from "react"
import { api } from "@/lib/client/api"
import { useApp } from "@/lib/client/store"
import { TitleBar } from "@/components/app/TitleBar"
import { Sidebar } from "@/components/app/Sidebar"
import { StatusBar } from "@/components/app/StatusBar"
import { CommandPalette } from "@/components/app/CommandPalette"
import { NotificationsPanel } from "@/components/app/NotificationsPanel"
import { ModuleLoading } from "@/components/app/ModuleLoading"
import { NAV_GROUPS } from "@/lib/constants"
import * as Icons from "lucide-react"
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Module registry — lazy loaded
const DashboardModule = lazy(() => import("@/components/modules/dashboard.module").then((m) => ({ default: m.DashboardModule })))
const BusinessModule = lazy(() => import("@/components/modules/business.module").then((m) => ({ default: m.BusinessModule })))
const CustomersModule = lazy(() => import("@/components/modules/customers.module").then((m) => ({ default: m.CustomersModule })))
const SuppliersModule = lazy(() => import("@/components/modules/suppliers.module").then((m) => ({ default: m.SuppliersModule })))
const ProductsModule = lazy(() => import("@/components/modules/products.module").then((m) => ({ default: m.ProductsModule })))
const InventoryModule = lazy(() => import("@/components/modules/inventory.module").then((m) => ({ default: m.InventoryModule })))
const SalesModule = lazy(() => import("@/components/modules/sales.module").then((m) => ({ default: m.SalesModule })))
const PurchasesModule = lazy(() => import("@/components/modules/purchases.module").then((m) => ({ default: m.PurchasesModule })))
const ProductionModule = lazy(() => import("@/components/modules/production.module").then((m) => ({ default: m.ProductionModule })))
const StaffModule = lazy(() => import("@/components/modules/staff.module").then((m) => ({ default: m.StaffModule })))
const ExpensesModule = lazy(() => import("@/components/modules/expenses.module").then((m) => ({ default: m.ExpensesModule })))
const PaymentsModule = lazy(() => import("@/components/modules/payments.module").then((m) => ({ default: m.PaymentsModule })))
const AccountsModule = lazy(() => import("@/components/modules/accounts.module").then((m) => ({ default: m.AccountsModule })))
const ReportsModule = lazy(() => import("@/components/modules/reports.module").then((m) => ({ default: m.ReportsModule })))
const DocumentsModule = lazy(() => import("@/components/modules/documents.module").then((m) => ({ default: m.DocumentsModule })))
const NotificationsModule = lazy(() => import("@/components/modules/notifications.module").then((m) => ({ default: m.NotificationsModule })))
const SettingsModule = lazy(() => import("@/components/modules/settings.module").then((m) => ({ default: m.SettingsModule })))

const MODULES: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: DashboardModule,
  business: BusinessModule,
  customers: CustomersModule,
  suppliers: SuppliersModule,
  products: ProductsModule,
  inventory: InventoryModule,
  sales: SalesModule,
  purchases: PurchasesModule,
  production: ProductionModule,
  staff: StaffModule,
  expenses: ExpensesModule,
  payments: PaymentsModule,
  accounts: AccountsModule,
  reports: ReportsModule,
  documents: DocumentsModule,
  notifications: NotificationsModule,
  settings: SettingsModule,
}

export function AppShell() {
    const { activeModule, setActiveModule, sidebarCollapsed, toggleSidebar, notificationsOpen, setNotificationsOpen } = useApp()
  const ActiveModule = MODULES[activeModule] ?? DashboardModule

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        useApp.getState().setCommandOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault()
        toggleSidebar()
      }
      if (e.key === "Escape" && notificationsOpen) setNotificationsOpen(false)
      if (!typing && e.key === "F1") {
        e.preventDefault()
        useApp.getState().setActiveModule("sales", { tab: "pos" })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setCommandOpen, toggleSidebar, notificationsOpen, setNotificationsOpen])

  // Auto-backup check on boot
  useEffect(() => {
    api.post("backup/auto-check").catch(() => null)
  }, [])

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TitleBar onExit={() => { }} />
      <div className="flex min-h-0 flex-1">
        <div className="hidden md:flex">
          <Sidebar />
        </div>
        <main className="min-w-0 flex-1 overflow-y-auto thin-scrollbar">
          {/* extra bottom padding on mobile clears the floating nav button */}
          <div className="mx-auto max-w-[1500px] p-4 pb-16 md:p-6 md:pb-6">
            <Suspense fallback={<ModuleLoading />}>
              <ActiveModule />
            </Suspense>
          </div>
        </main>
      </div>
      <StatusBar />
      <CommandPalette />
      <NotificationsPanel />
      {/* Mobile nav */}
      <MobileNav />
    </div>
  )
}

function MobileNav() {
  const { activeModule, setActiveModule } = useApp()
  const [open, setOpen] = useState(false)
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="secondary" size="icon" className="fixed bottom-3 left-3 z-40 h-11 w-11 rounded-full shadow-lg md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[75vh]">
        <div className="overflow-y-auto p-3 pb-6 thin-scrollbar">
          {NAV_GROUPS.map((group) => (
            <div key={group.group} className="mb-2">
              <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{group.group}</p>
              <div className="grid grid-cols-2 gap-1">
                {group.items.map((item) => {
                  const Icon = (Icons as any)[item.icon] ?? Icons.Circle
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveModule(item.id); setOpen(false) }}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-3 text-sm font-medium",
                        activeModule === item.id ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                      )}
                    >
                      <Icon className="h-4 w-4" /> {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
