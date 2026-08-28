"use client"

import { create } from "zustand"

export interface SessionUser {
  id: string
  username: string
  fullName: string
  role: string
}

export interface ModuleParams {
  entityId?: string
  tab?: string
  [key: string]: unknown
}

interface AppState {
  user: SessionUser | null
  modules: string[] // ["*"] for owner
  business: { id: string; name: string; brandName: string | null; logo: string | null; currency: string } | null
  activeModule: string
  moduleParams: ModuleParams | null
  sidebarCollapsed: boolean
  commandOpen: boolean
  notificationsOpen: boolean
  setUser: (u: SessionUser | null, modules?: string[]) => void
  setBusiness: (b: AppState["business"]) => void
  setActiveModule: (module: string, params?: ModuleParams) => void
  toggleSidebar: () => void
  setCommandOpen: (open: boolean) => void
  setNotificationsOpen: (open: boolean) => void
  logout: () => void
}

export const useApp = create<AppState>((set) => ({
  user: null,
  modules: [],
  business: null,
  activeModule: "dashboard",
  moduleParams: null,
  sidebarCollapsed: false,
  commandOpen: false,
  notificationsOpen: false,
  setUser: (user, modules = []) => set({ user, modules }),
  setBusiness: (business) => set({ business }),
  setActiveModule: (activeModule, moduleParams: ModuleParams | null = null) => set({ activeModule, moduleParams, commandOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
  logout: () => set({ user: null, modules: [], activeModule: "dashboard", moduleParams: null }),
}))

export function can(module: string, action: string = "view"): boolean {
  const { user, modules } = useApp.getState()
  if (!user) return false
  if (user.role === "OWNER") return true
  return modules.includes(module)
}

// Permission matrix mirrored client-side for UI affordances (server still enforces)
const ACTIONS: Record<string, Record<string, string[]>> = {
  OWNER: { "*": ["*"] },
  MANAGER: {
    dashboard: ["view"], business: ["*"], customers: ["*"], suppliers: ["*"], products: ["*"], inventory: ["*"],
    sales: ["*"], orders: ["*"], purchases: ["*"], payments: ["*"], production: ["*"], staff: ["*"],
    expenses: ["*"], accounts: ["*"], reports: ["view", "export"], documents: ["*"], notifications: ["*"],
    settings: ["view"], users: ["view"], audit: ["view"], backup: ["view", "export"], search: ["view"], tasks: ["*"],
  },
  SALES: {
    dashboard: ["view"], customers: ["*"], products: ["view"], inventory: ["view"],
    sales: ["view", "create", "edit", "export", "void"], orders: ["*"], payments: ["view", "create"],
    reports: ["view"], documents: ["view"], notifications: ["view"], search: ["view"], tasks: ["view"],
  },
  INVENTORY: {
    dashboard: ["view"], products: ["*"], inventory: ["*"], purchases: ["view", "create", "edit", "export"],
    suppliers: ["view"], production: ["view", "create", "edit"], rawMaterials: ["*"],
    reports: ["view", "export"], documents: ["*"], notifications: ["view"], search: ["view"], tasks: ["*"],
  },
  ACCOUNTANT: {
    dashboard: ["view"], payments: ["*"], accounts: ["*"], expenses: ["*"], sales: ["view", "export"],
    purchases: ["view", "pay"], customers: ["view"], suppliers: ["view"], staff: ["view", "pay"],
    reports: ["view", "export"], documents: ["*"], notifications: ["view"], search: ["view"], tasks: ["view"], audit: ["view"],
  },
  PRODUCTION: {
    dashboard: ["view"], production: ["*"], rawMaterials: ["*"], products: ["view"], inventory: ["view"],
    staff: ["view"], tasks: ["*"], reports: ["view"], documents: ["view"], notifications: ["view"], search: ["view"],
  },
  WORKER: {
    dashboard: ["view"], production: ["view"], tasks: ["view"], notifications: ["view"], search: ["view"],
  },
}

export function canDo(module: string, action: string = "view"): boolean {
  const { user } = useApp.getState()
  if (!user) return false
  const rolePerms = (ACTIONS as any)[user.role]
  if (!rolePerms) return false
  if (rolePerms["*"]?.includes("*")) return true
  const perms = rolePerms[module] ?? rolePerms[module === "raw-materials" ? "rawMaterials" : module]
  if (perms?.includes("*")) return true
  return !!perms?.includes(action)
}
