import { NextRequest } from "next/server"
import { handleApi, registerDomain } from "@/lib/server/router"

// Register all domain handlers
import * as auth from "@/lib/server/modules/auth"
import * as publicMod from "@/lib/server/modules/public"
import * as setup from "@/lib/server/modules/setup"
import * as business from "@/lib/server/modules/business"
import * as users from "@/lib/server/modules/users"
import * as auditlogs from "@/lib/server/modules/auditlogs"
import * as attributes from "@/lib/server/modules/attributes"
import * as products from "@/lib/server/modules/products"
import * as warehouses from "@/lib/server/modules/warehouses"
import * as inventory from "@/lib/server/modules/inventory"
import * as customers from "@/lib/server/modules/customers"
import * as suppliers from "@/lib/server/modules/suppliers"
import * as sales from "@/lib/server/modules/sales"
import * as orders from "@/lib/server/modules/orders"
import * as quotations from "@/lib/server/modules/quotations"
import * as returns from "@/lib/server/modules/returns"
import * as payments from "@/lib/server/modules/payments"
import * as purchases from "@/lib/server/modules/purchases"
import * as production from "@/lib/server/modules/production"
import * as staff from "@/lib/server/modules/staff"
import * as expenses from "@/lib/server/modules/expenses"
import * as tasks from "@/lib/server/modules/tasks"
import * as cashregister from "@/lib/server/modules/cashregister"
import * as accounts from "@/lib/server/modules/accounts"
import * as reports from "@/lib/server/modules/reports"
import * as documents from "@/lib/server/modules/documents"
import * as notifications from "@/lib/server/modules/notifications"
import * as search from "@/lib/server/modules/search"
import * as settings from "@/lib/server/modules/settings"
import * as backup from "@/lib/server/modules/backup"
import * as dashboard from "@/lib/server/modules/dashboard"
import * as demodata from "@/lib/server/modules/demodata"
import * as files from "@/lib/server/modules/files"

registerDomain("auth", auth.handle)
registerDomain("public", publicMod.handle)
registerDomain("setup", setup.handle)
registerDomain("business", business.handle)
registerDomain("users", users.handle)
registerDomain("audit-logs", auditlogs.handle)
registerDomain("attributes", attributes.handle)
registerDomain("products", products.handle)
registerDomain("warehouses", warehouses.handle)
registerDomain("inventory", inventory.handle)
registerDomain("customers", customers.handle)
registerDomain("suppliers", suppliers.handle)
registerDomain("sales", sales.handle)
registerDomain("orders", orders.handle)
registerDomain("quotations", quotations.handle)
registerDomain("returns", returns.handle)
registerDomain("payments", payments.handle)
registerDomain("purchases", purchases.handle)
registerDomain("contractors", production.handle)
registerDomain("jobworks", production.handle)
registerDomain("production", production.handle)
registerDomain("raw-materials", production.handle)
registerDomain("staff", staff.handle)
registerDomain("expenses", expenses.handle)
registerDomain("tasks", tasks.handle)
registerDomain("cash-register", cashregister.handle)
registerDomain("accounts", accounts.handle)
registerDomain("reports", reports.handle)
registerDomain("documents", documents.handle)
registerDomain("notifications", notifications.handle)
registerDomain("search", search.handle)
registerDomain("settings", settings.handle)
registerDomain("backup", backup.handle)
registerDomain("dashboard", dashboard.handle)
registerDomain("demo-data", demodata.handle)
registerDomain("files", files.handle)

export async function GET(req: NextRequest) { return handleApi(req, "GET") }
export async function POST(req: NextRequest) { return handleApi(req, "POST") }
export async function PUT(req: NextRequest) { return handleApi(req, "PUT") }
export async function PATCH(req: NextRequest) { return handleApi(req, "PATCH") }
export async function DELETE(req: NextRequest) { return handleApi(req, "DELETE") }
