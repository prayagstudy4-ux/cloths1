# Task 7-a — Products & Inventory Modules

Agent: 7-a (frontend modules: products + inventory)
Scope: replaced the two stub files with full production implementations. No other files touched.

## Files written
- `src/components/modules/products.module.tsx` — exports `ProductsModule`
- `src/components/modules/inventory.module.tsx` — exports `InventoryModule`

## Products module — features
- **Tab "Products"**: PageHeader (Export CSV + New Product gated `canDo("products","create")`), 5 stat cards (Total Products from server total, Variants / Stock Units / Stock Value / Low-Out computed from page), server-side filter bar (debounced q search + category / collection / status SelectInputs), DataTable (code, name+brand, category, collection, gender·type, cost/MRP/selling right-aligned Money, total variant stock colored red=0 / amber≤min with variant count, min-stock col, status badge) with red/amber row tinting for out/low products.
- **Product detail Sheet** (sm:max-w-3xl): header w/ status badge, 4 stat cards (Variants, Total Stock, Stock Value @cost, Retail Value), actions (Edit / Add Variant / Delete w/ auto-archive handling). Inner tabs:
  - *Overview*: 14-field info grid (category, collection, brand, type, gender, material, pattern, supplier, tax, min stock, price trio, wholesale, created, status) + description block.
  - *Variants*: dense table (SKU mono, barcode, size, color w/ hex swatch, total stock colored + per-warehouse mini badges `WH·qty` w/ tooltips, cost/MRP/selling, inline **edit price dialog** (barcode+3 prices → PUT), delete variant button disabled when stock ≠ 0 (server also blocks sales-history variants)).
  - *Sales & Movements*: per-variant movement stats via `useQueries` (`inventory/movements?variantId=` ×200 each) → Units Sold / Returned / Net / Est. Revenue cards + merged movement table (date, type badge colored by direction, variant, signed qty, note, user).
- **Create/Edit product dialog** (max-w-2xl, scrollable): full field set (name, code w/ auto-P000X hint, brand, category, collection, product type, gender, material, pattern, tax %, cost/MRP/selling/wholesale, min stock, supplier via EntityPicker from suppliers API, status, description). Create-only **variant matrix generator**: size toggle-chips × color chips (hex dots) → live preview rows (size, color, SKU preview mirroring server `CODE-COL-SIZE` logic, prefilled prices from product form, opening qty) + global "Opening stock (per variant)" qty + warehouse select (default warehouse preselected) → posts `variants[]` with `openingStock: [{warehouseId, quantity}]`. Create button shows variant count; on success invalidates products/inventory and opens the new product's detail sheet.
- **Add Variant dialog**: size/color pickers from attributes, live SKU preview (+ auto-uniquify hint), barcode, prices prefilled from product, per-warehouse opening stock inputs → POST `products/:id/variants`.
- **Tab "Categories & Attributes"**: 6 compact cards (Categories w/ parent select + sortOrder, Collections w/ season select + date range + active toggle, ordered Sizes w/ position numbers, Colors w/ hex color-picker + swatch preview, Materials, Patterns shared component). Inline add rows (Enter submits) + inline edit rows + delete ConfirmDialogs, all permission-gated (products create/edit/delete), all via `attributes/<table>` CRUD; invalidates attributes + products.
- moduleParams: `new` → create dialog, `entityId` → detail sheet, `tab:"attributes"` → attributes tab.

## Inventory module — features
- **Tab "Current Stock"**: 5 stat cards (Total Variants, Total Units, Stock Value @cost, Low Stock + Out of Stock — both clickable → apply filter). Filter bar: All/Low/Out segmented chips with live counts, warehouse select (filters rows with qty>0 there), CSV export. Single `inventory/stock?pageSize=300` query supplies rows + global summary. DataTable (product+code·variant label, SKU mono, barcode, category, per-warehouse stock badges (emerald>0 / muted=0, abbrev + tooltip), total stock red if 0 / amber if ≤min with "min X" subtext, cost, stock value) with red/amber row tinting; client search via DataTable searchKeys.
- **Variant detail Sheet**: stats (Total Stock colored, Stock Value, Selling Price, Min Stock), Adjust/Transfer quick actions, warehouse breakdown table (name, type label, qty), recent movements table (`inventory/movements?variantId=` ×50: date+time, type badge, signed colored qty, note, user).
- **Adjust Stock dialog** (module header + variant detail, gated `canDo("inventory","edit")`): variant EntityPicker (label `Product · Color/Size (SKU)`), warehouse select (default preselected), type select OPENING(+)/DAMAGE(−)/LOSS(−)/ADJUSTMENT(exact count) — input switches between delta qty and new absolute quantity, live "Current: X → New: Y" context from stock rows, note → POST `inventory/adjust` (signs delta correctly for DAMAGE/LOSS). Invalidates inventory/warehouses/products/dashboard.
- **Transfer Stock dialog**: variant picker, from/to warehouse (to excludes from, default preselected on from), qty with available-at-source hint, note → POST `inventory/transfer`.
- **Tab "Movements"**: server-filtered history (type select from MOVEMENT_TYPES, from/to date inputs, server pagination 50/page with prev/next), DataTable w/ client search (date+time, type badge colored by direction map, product+variant·SKU, signed colored qty, reference, note, user), CSV export with labels. 
- **Tab "Warehouses"**: cards per warehouse (name, default star, type badge w/ local color map, address, items-in-stock + total-units stat tiles, Edit/Delete guarded — default warehouse delete hidden), add/edit dialog (name, type, address, isDefault switch → un-defaults others server-side), delete ConfirmDialog (server blocks stock-holding warehouses).
- moduleParams: `tab` stock|movements|warehouses|low (→ stock + low filter)|adjust (→ stock + adjust dialog)|transfer (→ stock + transfer dialog), `entityId` → variant detail sheet (row resolved from full stock snapshot).

## Verification
- `bunx tsc --noEmit` → ZERO errors in both files (only remaining project errors: production.module.tsx [another agent] + examples/ + skills/).
- `bunx eslint` on both files → clean.
- API shapes verified by reading server modules directly (products.ts, inventory.ts, attributes.ts, warehouses.ts) — all match implementations (e.g. adjust `delta` signed / `newQuantity` for ADJUSTMENT; movements carry signed quantity; attributes PUT for collections ignores dates so edit form only exposes name/season/active).

## ⚠️ CRITICAL shared-file blocker found (NOT fixed — outside my scope)
`src/app/globals.css` line 148 contains invalid CSS: `.print-a4 @page { size: A4; margin: 8mm; }` ("Invalid dangling combinator in selector"). This kills the ENTIRE app — every route (including `/api/*`) returns 500 while this rule is present (verified: dev instance on port 3100 returns 500 with this exact compile error; root page included). Introduced by whoever added the invoice print CSS (not me — I only wrote my 2 module files).
**Suggested fix (for orchestrator):** delete line 148 (an unconditional `@page { margin: 8mm }` already exists inside `@media print` at line 141); if A4 sizing is needed, use `@page { size: A4; margin: 8mm; }` at top level (class-scoped @page is not possible in CSS). After fixing, restart/recompile the dev server.

## API notes (minor, no blockers)
- `inventory/stock` has no `variantId` filter param → variant detail resolves its row from the full snapshot query (pageSize capped at 300 server-side; fine for current scale).
- `products/:id` has no sales summary include → product sales summary is derived from per-variant movement history (useQueries, 200 movements/variant) — accurate for units; revenue is an estimate (net units × selling price).
- `attributes` PUT for collections ignores startDate/endDate (settable only at create) — UI reflects this.
- Movements list is paginated 50/page server-side; CSV export covers the currently filtered pages.
