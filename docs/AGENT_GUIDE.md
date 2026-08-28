# Agent Guide — Clothing Business Manager Frontend Modules

READ THIS FULLY BEFORE WRITING CODE. Also read `/home/z/my-project/worklog.md` for prior work.

## Mission context
Desktop-style ERP for a clothing business. Next.js 16 + React 19 + Tailwind 4 + shadcn/ui + TanStack Query 5 + Zustand. Single-page app (only route `/`). Modules render inside `src/components/app/AppShell.tsx` via lazy imports registered in `MODULES` map (already wired — stub files exist at `src/components/modules/<name>.module.tsx` which you will REPLACE with full implementations).

## GOLDEN REFERENCES (study these before coding)
- `src/components/modules/customers.module.tsx` — CRUD list + dialog form + detail Sheet + tabs + ledger. YOUR CODE MUST FOLLOW THIS STYLE.
- `src/components/modules/dashboard.module.tsx` — stat cards, lists, recharts usage.
- `src/components/shared/basics.tsx` — PageHeader, StatCard, SectionTitle, EmptyState
- `src/components/shared/DataTable.tsx` — DataTable (search/sort/pagination), exportCSV, Column type
- `src/components/shared/fields.tsx` — StatusBadge, Money, DateCell, ConfirmDialog, Field, TextInput, NumberInput, SelectInput, TextArea, SwitchInput, EntityPicker

## Hard rules
1. ONLY write your assigned module files. NEVER edit shared files (AppShell, store, api, shared/*, constants, any lib). If a shared change is needed, note it in worklog instead.
2. Every module file starts with `"use client"` and exports `export function <Name>Module()` (exact stub name — check the stub file for the export name).
3. Data fetching: `useQuery`/`useMutation` from `@tanstack/react-query` with `api` from `@/lib/client/api` (`api.get(path)`, `api.post(path, body)`, `api.put(path, body)`, `api.del(path)`). Invalidate with `qc.invalidateQueries({ queryKey: [...] })`.
4. Money via `fmtMoney()` / `<Money>` from `@/lib/format` / shared fields. Dates via `<DateCell>`, `fmtDateIST` (all data is IST).
5. Toasts: `import { toast } from "@/hooks/use-toast"` → `toast({ title, description?, variant?: "destructive" })`.
6. Permission gating: `import { canDo } from "@/lib/client/store"` → `canDo("sales", "create")` to hide/disable buttons (server enforces too).
7. Module params (deep-linking): `const { moduleParams, setActiveModule } = useApp()`. `moduleParams?.tab` = initial tab; `moduleParams?.entityId` = open detail for entity; truthy `moduleParams?.new` = open create dialog. Initialize `useState` from them ONCE (see customers.module pattern using `useState(() => {...})`).
8. Style: professional ERP. Use `PageHeader` at top with icon, stat card row, tabs via shadcn `Tabs`, tables via `DataTable`, forms via shadcn `Dialog`, details via `Sheet` (right side). NO blue/indigo colors (primary is teal/emerald, already themed). Responsive (grids collapse to 1-2 cols on mobile).
9. Labels from `@/lib/constants` (e.g. `PURCHASE_STATUS_LABELS`, `MOVEMENT_TYPE_LABELS`, `EXPENSE_CATEGORY_LABELS` — read that file for all available label maps + color maps like `ORDER_STATUS_COLORS`).
10. TypeScript strict: no `any` where avoidable (some `any` for API rows is fine — see reference).
11. DO NOT create test files. DO NOT run `bun run build`. You may run `bunx tsc --noEmit` to check types (expect pre-existing errors ONLY in examples/ and skills/ folders — ignore those; fix any errors in YOUR files).
12. After finishing: append your work record to `/home/z/my-project/worklog.md` (append mode — never overwrite).

## API contract (all under `/api/`)
All return JSON. Errors: `{error: string}` with 4xx/5xx status (thrown by api wrapper as ApiError with `.message`).
Query params via `qs({ page, pageSize, q, status, ... })` helper from `@/lib/client/api`.
List responses: `{ <plural>: [...], total, page, pageSize, ...extras }`.

### Common patterns
- `GET customers` → `{customers: []}`. Detail `GET customers/:id` → `{customer: {...includes}}`. Create `POST customers` body JSON. Update `PUT customers/:id`. Delete `DELETE customers/:id`.
- Date filters: `from` & `to` ISO strings.

### Endpoints by module
**attributes**: `GET attributes/all` → `{categories, collections, sizes, colors, materials, patterns}`. CRUD: `GET|POST attributes/<table>` and `PUT|DELETE attributes/<table>/:id` where `<table>` ∈ categories|collections|sizes|colors|materials|patterns. Body: `{name, ...}` (categories: parentId?, description?, sortOrder?; collections: season?, description?, active?; colors: hex?).
**products**: `GET products?q&categoryId&collectionId&status&page&pageSize` → `{products: [product incl category, collection, material, pattern, supplier, variants[incl size,color,stockLevels[incl warehouse]]]}`. `POST products` body `{name, code?, description?, categoryId?, collectionId?, brand?, productType?, gender?, materialId?, patternId?, taxRate?, costPrice?, mrp?, sellingPrice?, wholesalePrice?, discountPrice?, minStock?, supplierId?, status?, variants?: [{sizeId?, colorId?, sku?, barcode?, costPrice?, mrp?, sellingPrice?, openingStock?: [{warehouseId, quantity}]}]}`. `GET|PUT|DELETE products/:id`. `POST products/:id/variants` (same variant shape). `PUT|DELETE products/:id/variants/:variantId` (barcode/costPrice/mrp/sellingPrice).
**warehouses**: `GET|POST warehouses`, `PUT|DELETE warehouses/:id` (name, type, address, isDefault).
**inventory**: `GET inventory/stock?q&warehouseId&filter=low|out&page` → `{rows: [{variantId, sku, barcode, productName, productCode, category, collection, size, color, minStock, totalStock, costPrice, sellingPrice, stockValue, warehouseStock: [{warehouseId, warehouse, quantity}]}], summary: {totalVariants, totalUnits, totalValue, lowCount, outCount}}`. `GET inventory/movements?variantId&type&from&to&page` → `{movements: [{id,date,type,quantity,product,sku,variantLabel,referenceType,note,userName}]}`. `POST inventory/adjust` `{variantId, warehouseId, type: OPENING|DAMAGE|LOSS|ADJUSTMENT, delta? , newQuantity? (ADJUSTMENT), note?}`. `POST inventory/transfer` `{variantId, fromWarehouseId, toWarehouseId, quantity, note?}`.
**sales**: `GET sales?q&status&paymentStatus&type&customerId&from&to&page` → `{sales: [incl customer, items], sum: {total, due}}`. `POST sales` `{customerId?, type?, warehouseId?, items: [{variantId, quantity, unitPrice, discount?, taxRate?}], extraDiscount?, payments: [{method, amount, transactionId?}], notes?, date?, salespersonName?}` → `{sale: {...incl items, payments}}`. `GET sales/:id`. `POST sales/:id/void` `{reason}`.
**orders**: `GET orders?q&status&customerId&page`. `POST orders` `{customerId, items: [{variantId, quantity, unitPrice?, taxRate?}], discountAmount?, deliveryDate?, deliveryAddress?, courier?, trackingNumber?, notes?, status?}`. `GET orders/:id`. `PUT orders/:id` `{status?, deliveryStatus?, courier?, trackingNumber?, deliveryDate?, deliveryAddress?, notes?}`. `POST orders/:id/invoice` `{payments: [{method, amount}]}` → creates invoice. `POST orders/:id/cancel`.
**quotations**: `GET quotations?q&status&page`. `POST quotations` `{customerId, items, discountAmount?, validUntil?, notes?}`. `GET quotations/:id`. `PUT quotations/:id` `{status?}`. `POST quotations/:id/convert` → creates order.
**returns**: `GET returns?q&type&page`. `POST returns` `{type: CUSTOMER_RETURN|EXCHANGE, saleId?, customerId?, items: [{saleItemId, quantity} | {variantId, quantity, unitPrice?}], exchangeItems: [{variantId, quantity, unitPrice?}], refundMethod: CASH_REFUND|UPI_REFUND|STORE_CREDIT|ADJUSTMENT|NONE, exchangePaidAmount?, exchangePaidMethod?, notes?}` → `{return}`. `GET returns/:id`.
**payments**: `GET payments?q&method&status&direction&category&customerId&from&to&page` → `{payments: [incl customer, supplier, sale], sumVerified}`. `POST payments` `{customerId?, saleId?, amount, method: CASH|UPI|CARD|BANK, transactionId?, date?, notes?}` (record payment). `POST payments` with `{unmatched: true, amount, method, transactionId?}` → creates UNMATCHED. `POST payments/:id/assign` `{customerId?, saleId?}`. `POST payments/:id/void` `{reason}`.
**payments QR**: `POST payments/qr` `{amount, saleId?, customerId?, note?}` → `{qr: {id, code, amount, status, upiUrl, qrDataUrl (data:image/png), ...}}`. `GET payments/qr/:id` → `{qr: {status, payment?}}` (poll this). `POST payments/qr/:id/confirm` `{transactionId?}` → verifies (staff confirms money arrived). `POST payments/qr/:id/cancel`. `GET payments/shop-qr` → `{qrDataUrl, upiId, payee}`. `GET payments/qr?status=` → `{qrs}`.
**purchases**: `GET purchases?q&status&supplierId&page` → `{purchases: [incl supplier, items], sum}`. `POST purchases` `{supplierId, items: [{variantId, quantity, unitCost?, taxRate?}], discountAmount?, expectedDate?, notes?, receiveNow?: true, payNowAmount?, payNowMethod?}`. `GET purchases/:id` (incl items + payments). `POST purchases/:id/receive`. `POST purchases/:id/pay` `{amount, method, date?, notes?}`. `POST purchases/:id/cancel`.
**suppliers**: same shape as customers. `GET suppliers/:id` → detail incl purchases, payments, ledger, products, stats. `GET suppliers/:id/ledger`.
**contractors**: `GET contractors` → `{contractors: [incl stats]}`. `POST contractors` `{name, type, phone?, address?, rate?}`. `PUT|DELETE contractors/:id`. `GET contractors/:id` (incl jobWorks, payments). `POST contractors/:id/pay` `{amount, method, date?, notes?}`.
**jobworks**: `GET jobworks?status&contractorId` → `{jobWorks: [incl contractor], summary: {pending, completed, outstandingPayable}}`. `POST jobworks` `{contractorId, productId?, description, quantity, rate, dueDate?, notes?, variantId?}`. `POST jobworks/:id/progress` `{completedQty}`. `POST jobworks/:id/receive-goods` `{quantity}`. `POST jobworks/:id/cancel`. `GET jobworks/:id`.
**production**: `GET production?status` → `{orders: [incl contractor], summary: {active, completed}}`. `POST production` `{productId, designName?, quantity, contractorId?, planLines?: [{variantId, qty}], targetDate?, costEstimate?, notes?}`. `POST production/:id/stage` `{stage?}` (omit stage = advance next; "COMPLETED" adds finished stock). `POST production/:id/cancel`. Stages: DESIGN, RAW_MATERIAL, CUTTING, STITCHING, PRINTING, FINISHING, QC, PACKAGING, COMPLETED.
**raw-materials**: `GET raw-materials?type&q` → `{materials: [], summary: {totalValue, lowCount}}`. `POST raw-materials` `{name, type, unit, quantity?, minQuantity?, costPerUnit?, supplierId?}`. `PUT|DELETE raw-materials/:id`.
**staff**: `GET staff?q` → `{employees: [...incl todayAttendance], summary: {active, presentToday}}`. `POST staff` `{name, phone?, designation?, joiningDate?, salary?, address?, notes?}`. `GET staff/:id` (incl attendance 60, salaryPayments 50). `PUT|DELETE staff/:id`. `GET staff/attendance?date=YYYY-MM-DD|month=YYYY-MM` → `{records: [incl employee]}`. `POST staff/attendance` `{date?, entries: [{employeeId, status: PRESENT|ABSENT|HALF_DAY|LEAVE}]}`. `GET staff/payments?employeeId` → `{payments: [incl employee]}`. `POST staff/payments` `{employeeId, type: SALARY|ADVANCE|BONUS|DEDUCTION, amount, method, month?, date?, notes?}`.
**expenses**: `GET expenses?q&category&from&to&page` → `{expenses: [], sum, byCategory: [{category, _sum}]}`. `POST expenses` `{category, description, amount, date?, method: CASH|UPI|CARD|BANK, paidTo?, notes?}`. `PUT|DELETE expenses/:id`.
**tasks**: `GET tasks?status` → `{tasks: [], summary: {pending, inProgress, overdue}}`. `POST tasks` `{title, description?, assignedTo?, priority, dueDate?, status?}`. `PUT|DELETE tasks/:id`.
**cash-register**: `GET cash-register` → `{current, history: [], cashIn, cashOut, expected, breakdown: []}`. `POST cash-register/open` `{openingAmount}`. `POST cash-register/close` `{countedAmount, notes?}`.
**accounts**: `GET accounts/overview` → `{balances: {cash, upi, card, bank, total}, inflow, outflow, receivables: {total, count, top}, customerAdvances, payables: {suppliers, contractors}, stockValue}`. `GET accounts/pnl?preset=this_month&from&to` → `{revenue: {gross, returns, refundsPaid, net, orderCount}, cogs, grossProfit, operatingExpenses: {total, byCategory}, productionCost, netProfit}`. `GET accounts/cashflow?preset` → `{totalIn, totalOut, byDay: [{date, in, out}], recentIn, recentOut}`. Presets: today|yesterday|this_week|this_month|last_month|this_year|custom.
**reports**: `GET reports/<type>?preset&from&to&sub` where type ∈ sales|inventory|payments|customers|suppliers|production|finance. See src/lib/server/modules/reports.ts for exact response shapes. Response always includes `period: {from, to, preset}`.
**documents**: `GET documents?category&q` → `{documents: []}`. `POST documents` multipart FormData: files (multiple), category, entityType?, entityId?. `DELETE documents/:id`. File access: GET `/api/documents/file?path=documents/<file>` (also uploads/ prefix).
**notifications**: `GET notifications?unread=1` → `{notifications, unreadCount}`. `POST notifications/:id/read`. `POST notifications/read-all`. `DELETE notifications/:id`. `DELETE notifications/clear-read`.
**business**: `GET business` → `{business, counts}`. `PUT business` (many fields). `POST business/logo` multipart (file).
**users**: `GET users` → `{users}`. `POST users` `{username, password, fullName, role, phone?}`. `PUT users/:id` (password optional). `DELETE users/:id` (deactivates).
**settings**: `GET settings` → `{settings}`. `PUT settings` (partial). Keys: auto_backup, backup_retention_days, default_invoice_print, allow_negative_stock, notify_low_stock, notify_payment, notify_due, razorpay_enabled, razorpay_key_id, razorpay_key_secret.
**backup**: `GET backup` → `{backups: [{name, size, createdAt}], settings: {autoBackup, retentionDays}, dbPath}`. `POST backup` → creates backup now. `POST backup/restore` `{filename}`.
**audit-logs**: `GET audit-logs?page&module&q` → `{logs: [{userName, userRole, module, action, entityId, details, createdAt}]}`.
**search**: `GET search?q=` → `{groups: [{module, label, results: [{id, title, subtitle, module, entityId, tab?}]}]}`.
**demo-data**: `GET demo-data/status` → `{loaded}`. `POST demo-data/load`.

## Label/color maps in constants.ts
`CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS, ORDER_STATUSES, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, DELIVERY_STATUS_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_CATEGORIES, PAYMENT_CATEGORY_LABELS, SALE_PAYMENT_STATUS_COLORS, PURCHASE_STATUSES, PURCHASE_STATUS_LABELS, PURCHASE_STATUS_COLORS, QUOTATION_STATUSES, QUOTATION_STATUS_LABELS, QUOTATION_STATUS_COLORS, MOVEMENT_TYPES, MOVEMENT_TYPE_LABELS, WAREHOUSE_TYPES, WAREHOUSE_TYPE_LABELS, PRODUCTION_STAGES, PRODUCTION_STAGE_LABELS, CONTRACTOR_TYPES, CONTRACTOR_TYPE_LABELS, JOBWORK_STATUSES, JOBWORK_STATUS_LABELS, RAW_MATERIAL_TYPES, RAW_MATERIAL_TYPE_LABELS, RAW_MATERIAL_UNITS, RAW_MATERIAL_UNIT_LABELS, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS, TASK_STATUSES, TASK_STATUS_LABELS, ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS, SALARY_PAYMENT_TYPES, SALARY_PAYMENT_TYPE_LABELS, PRODUCT_STATUSES, PRODUCT_STATUS_LABELS, GENDERS, GENDER_LABELS, PRODUCT_TYPES, PRODUCT_TYPE_LABELS, COLLECTION_SEASONS, COLLECTION_SEASON_LABELS, RETURN_TYPES, RETURN_TYPE_LABELS, REFUND_METHODS, REFUND_METHOD_LABELS, DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, ROLES, ROLE_LABELS, DATE_PRESETS, DATE_PRESET_LABELS`

## UI design language (match references!)
- Module root: `<div className="space-y-4">` with PageHeader → stat cards grid → tabs or table.
- Color semantics: emerald=positive/paid, amber=warning/pending/due, red=negative/void, sky=info (ok to use sky sparingly), zinc=neutral. NEVER indigo/blue-500.
- Tab layout: `<Tabs defaultValue={...}>` with `<TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">`.
- Detail views: right Sheet (`w-full sm:max-w-2xl`) with header + stat row + action buttons + tabs of related data.
- Create/Edit: Dialog `max-w-lg` (forms grid `grid gap-3 sm:grid-cols-2`, Field wrapper).
- Numbers right-aligned `tabular-nums`. Money via `<Money>` component.
- Loading: skeleton rows via DataTable `loading` prop or `<Skeleton>`.
