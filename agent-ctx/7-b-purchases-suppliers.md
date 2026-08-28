# Task 7-b — Purchases & Suppliers Modules

Agent: 7-b (frontend modules: purchases + suppliers)
Scope: replaced the two stub files with full production implementations. No other files touched.

## Files written
- `src/components/modules/purchases.module.tsx` — exports `PurchasesModule`
- `src/components/modules/suppliers.module.tsx` — exports `SuppliersModule`

## Purchases module — features
- Stat cards: Purchase Value (server `sum.total`, received purchases), Outstanding Payable (`sum.due`), Purchase Orders count, Open POs count.
- DataTable: PO #, supplier (name+company), order date, expected date, status badge (`PURCHASE_STATUS_LABELS/COLORS`), total/paid/due, payment status badge (`SALE_PAYMENT_STATUS_COLORS` + local PAID/PARTIAL/UNPAID labels). Client-side search (number/supplier), status filter SelectInput (server-side `status` param), supplier filter chip (from `moduleParams.supplierId`), header CSV export with pretty labels. Cancelled rows dimmed; due rows amber-tinted.
- Detail Sheet (sm:max-w-3xl): header (number, status badge, supplier link → suppliers module), stat row (total/paid/due/received), meta grid (ordered/expected/received/created by/notes), items table (product, variant, qty, received qty with pending highlight, unit cost + tax %, line total), totals breakdown (subtotal/discount/tax/total), payment history list (number · method label, date, txn/notes, amount, status badge).
- Status-aware actions: **Receive Goods** (ORDERED/PARTIAL_RECEIVED + `canDo("purchases","edit")`) — ConfirmDialog explaining pending units → stock + payable recorded + cost price updates → `POST purchases/:id/receive`; **Pay Supplier** (due>0, status≠ORDERED/CANCELLED + `canDo("purchases","pay")`) — dialog with amount prefilled to due, method CASH/UPI/CARD/BANK, date (today default), notes → `POST purchases/:id/pay`; **Cancel PO** (ORDERED, no payments) — destructive confirm → `POST purchases/:id/cancel`.
- New Purchase dialog (max-w-3xl): supplier EntityPicker (GET suppliers), expected date, notes, line-items builder with custom **VariantPicker** (debounced `GET products?q=`, grouped product → variant rows showing "Color / Size · SKU · ₹cost"), qty/unit-cost/tax% per line (cost + GST prefilled from variant/product), live line totals, totals footer (subtotal/tax/discount input/total), duplicate variant pick increments qty. **Pay now** switch (amount prefilled to total + method) applies to direct purchase. Dual submit: "Create PO" vs "Create & Receive" (`receiveNow`, `payNowAmount`, `payNowMethod`). On success invalidates purchases/suppliers/payments/inventory and opens the new purchase's detail sheet.
- moduleParams: `new` → open create dialog, `entityId` → open detail, `supplierId` → prefill supplier + filter list (supports "Pay Outstanding" / "New Purchase" navigation from suppliers module).

## Suppliers module — features (mirrors customers golden reference)
- Stat cards: Total Suppliers, With Outstanding, Outstanding Payable, GST Registered.
- DataTable: code, name+company avatar, phone, type badge (local SUPPLIER_TYPES map: FABRIC/FINISHED_GOODS/ACCESSORIES/PACKAGING/OTHER), GSTIN, outstanding (colored Money). Search (name/company/phone/gstin), type filter, header CSV export, outstanding rows amber-tinted.
- Create/edit dialog: name, company, phone, email, GSTIN, type, address, notes + opening balance (create only — posts `openingBalance`). Delete guarded via ConfirmDialog.
- Detail Sheet: header avatar (code · type · company), stats (Total Purchases / Total Paid / Outstanding / POs count + last order date), actions: **New Purchase** (→ purchases `{new:1, supplierId}`), **Pay Outstanding** (→ purchases `{supplierId}` filter, shown when outstanding>0), Edit. Contact card (phone/email/address/GSTIN/type/opening balance/notes).
- Tabs: **Ledger** (LedgerTable copied from customers pattern — date/description/debit/credit/balance with amber>0 / emerald≤0 colors), **Purchases** (click → purchases module entityId), **Payments** (number · method label, date · txn, −amount, status badge), **Products supplied** (click → products module entityId).
- moduleParams: `entityId` → open detail, `new` → open create.

## Verification
- `bunx tsc --noEmit` → ZERO errors in both files (remaining project errors are only in payments.module.tsx [another agent] + examples/ + skills/).
- `bunx eslint` on both files → clean.
- Live API shapes verified via curl against running dev server (login owner/owner123): `GET purchases` `{purchases,total,page,pageSize,sum:{total,due}}`; `GET purchases/:id` incl supplier+items(+variant)+payments; `GET suppliers` `{suppliers,total,...}`; `GET suppliers/:id` incl purchases(25)+payments(25)+ledger+products(50)+stats — all match the implementations.
- Note: lucide-react 0.525 has no `PackageDown` icon → used `PackagePlus`/`PackageCheck` instead.
- Note: dev server went down mid-session (managed externally, other agents active); browser click-through smoke test was started (login page rendered OK) but could not be completed. Static checks + API contract verification all pass.

## API notes / observations (no issues blocking)
- `GET purchases` `sum` only aggregates RECEIVED purchases (payables are recorded on receive) — stat card labeled accordingly. No date-range filter on purchases endpoint (stat is all-time, noted in sub-label).
- Supplier payments are only possible via `POST purchases/:id/pay` (requires received status) — supplier "Pay Outstanding" therefore navigates to the filtered purchases list, per spec.
- Supplier `type` is a free string; no SUPPLIER_TYPES map exists in constants.ts — local map added in suppliers.module.tsx (values match backend comment + demo data). If a shared map is added to constants.ts later, swap the local one.
