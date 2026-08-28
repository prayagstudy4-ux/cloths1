// Central role-based permission matrix.
// Authorization is enforced SERVER-SIDE in the API router (business logic, not just hidden UI).
import type { SessionUser } from "@/lib/server/auth"

export type Action = "view" | "create" | "edit" | "delete" | "export" | "void" | "pay" | "approve"

const ALL: Action[] = ["view", "create", "edit", "delete", "export", "void", "pay", "approve"]
const VIEW: Action[] = ["view"]
const VIEW_EXPORT: Action[] = ["view", "export"]

/** role → module → actions */
export const PERMISSIONS: Record<string, Record<string, Action[]>> = {
  OWNER: { "*": ALL },
  MANAGER: {
    dashboard: VIEW, business: ALL, customers: ALL, suppliers: ALL, products: ALL, inventory: ALL,
    sales: ALL, orders: ALL, purchases: ALL, payments: ALL, production: ALL, staff: ALL,
    expenses: ALL, accounts: ALL, reports: VIEW_EXPORT, documents: ALL, notifications: ALL,
    settings: VIEW, users: VIEW, audit: VIEW, backup: VIEW_EXPORT, search: VIEW, tasks: ALL,
  },
  SALES: {
    dashboard: VIEW, customers: ALL, products: VIEW, inventory: VIEW,
    sales: ["view", "create", "edit", "export", "void"], orders: ALL, payments: ["view", "create"],
    reports: VIEW, documents: VIEW, notifications: VIEW, search: VIEW, tasks: VIEW,
  },
  INVENTORY: {
    dashboard: VIEW, products: ALL, inventory: ALL, purchases: ["view", "create", "edit", "export"],
    suppliers: VIEW, production: ["view", "create", "edit"], rawMaterials: ALL,
    reports: VIEW_EXPORT, documents: ALL, notifications: VIEW, search: VIEW, tasks: ALL,
  },
  ACCOUNTANT: {
    dashboard: VIEW, payments: ALL, accounts: ALL, expenses: ALL, sales: ["view", "export"],
    purchases: ["view", "pay"], customers: VIEW, suppliers: VIEW, staff: ["view", "pay"],
    reports: VIEW_EXPORT, documents: ALL, notifications: VIEW, search: VIEW, tasks: VIEW, audit: VIEW,
  },
  PRODUCTION: {
    dashboard: VIEW, production: ALL, rawMaterials: ALL, products: VIEW, inventory: VIEW,
    staff: VIEW, tasks: ALL, reports: VIEW, documents: VIEW, notifications: VIEW, search: VIEW,
  },
  WORKER: {
    dashboard: VIEW, production: VIEW, tasks: VIEW, notifications: VIEW, search: VIEW,
  },
}

export function can(user: SessionUser | null, module: string, action: Action = "view"): boolean {
  if (!user) return false
  const rolePerms = PERMISSIONS[user.role]
  if (!rolePerms) return false
  // wildcard module (owner)
  if (rolePerms["*"]?.includes(action)) return true
  const perms = rolePerms[module]
  if (perms?.includes(action)) return true
  return false
}

export function allowedModules(user: SessionUser | null): string[] {
  if (!user) return []
  const rolePerms = PERMISSIONS[user.role] ?? {}
  if (rolePerms["*"]) return ["*"]
  return Object.keys(rolePerms).filter((m) => rolePerms[m].includes("view"))
}
