# Khan Engineerings — Manufacturing ERP Tech Spec

**Status:** Phases A–G implemented (Employees/Attendance excluded)  
**Date:** 2026-07-18  
**Stack (unchanged):** Next.js 15 + Express 5 + MongoDB/Mongoose + JWT auth  
**Approach:** Evolve the existing Phase 1–9 system — do not rewrite from scratch.

---

## 1. Goal

Turn the current scrap-foundry ops app into a **batch-centric Manufacturing ERP** for the family factory (hubs & drums).

**Core principle:** Every kilogram of raw material, every manufacturing step, every expense, and every sale should link back to a **production batch** (or explicitly be factory-overhead when it cannot), so true cost and profitability are calculable.

---

## 2. Factory workflow (system of record)

```
Suppliers
   → Raw Material Purchase (Scrap / Daig)
   → Raw Material Inventory
   → Electric Furnace
        Scrap → Hub outputs
        Daig  → Drum outputs
   → Production Batch (WIP)
        → Finished units (by product)
        → Hand (reusable kg)
        → Furnace waste (kg)
        → Production costs
   → Turning (Kharaad)
        → Good units
        → Broken units → Reusable inventory
        → Labour cost
   → Drilling (Hub / Drum)
   → Painting (Hub / Drum)
   → Polishing (Hub only — drums skip)
   → Finished Goods Inventory
   → Dispatch / Bilty → Customer
   → Payments (AR)
   → Claims / Returns → Reusable or Rework batch
```

---

## 3. What stays vs what changes

| Area | Keep | Change |
|------|------|--------|
| Auth, roles, seed | Yes | — |
| Supplier CRUD + A/P ledger | Yes | Purchase fields (material type, paid/balance, freight) |
| Customer CRUD + AR ledger | Yes | Optional: city, salesman |
| Sales orders, payments, dispatch | Yes | Bilty fields; claims module |
| Stock movement ledger | Yes | New item types + reasons |
| Products, warehouses, categories, sizes | Yes | Product `family` Hub/Drum; weight; default selling price |
| Production batches | Replace shape | Multi-output, WIP stages, reusable/waste |
| Batch expenses | Yes | New stage + category taxonomy |
| Finance / dashboard / reports | Yes | New KPIs; Quick Entry hub |
| Employees / attendance | Still out of scope | Leave nav stubs |

---

## 4. Domain constants

### 4.1 Material types (raw)

| ID | Label | Typical output |
|----|-------|----------------|
| `scrap` | Scrap | Hubs |
| `daig` | Daig | Drums |

### 4.2 Product family

| ID | Label | Workflow |
|----|-------|----------|
| `hub` | Hub | Furnace → Turning → Drilling → Painting → Polishing → Finished |
| `drum` | Drum | Furnace → Turning → Drilling → Painting → Finished (skip polishing) |

### 4.3 Production stages (WIP)

Replace current stages (`melting`, `casting`, `drilling`, `shaping`, `painting`, `finishing`).

| Order | ID | Label | Notes |
|------:|----|-------|-------|
| 1 | `furnace` | Furnace | Batch created here; inputs + outputs recorded |
| 2 | `turning` | Turning (Kharaad) | Good vs broken; broken → reusable |
| 3 | `drilling` | Drilling | Hub / Drum |
| 4 | `painting` | Painting | Hub / Drum |
| 5 | `polishing` | Polishing | Hub only |
| 6 | `finished` | Finished | Terminal; FG stock posted |

Batch `currentStage` advances in order. **A batch is hub-only or drum-only** (never mixed in one furnace run). Drum batches skip `polishing` automatically.

### 4.4 Expense taxonomy

Hierarchical categories for reporting; leaf IDs stored on expenses.

```
raw_material
  scrap | daig
utilities
  electricity | lpg_gas
labour
  fixed_salary | furnace | turning | drilling | painting | polishing | packing
consumables
  paint | silica_sand | sheera | tools
maintenance
  machine
government
  taxes | fees
misc
  transport | repairs | other
```

**Linkage rule:** Prefer `batch` + `stage` when known. Overhead (e.g. fixed salary, taxes) may omit batch (`batch: null`) and appear in factory P&L only.

### 4.5 Stock item types

Extend `StockMovement.itemType`:

| ID | Unit | Meaning |
|----|------|---------|
| `raw_scrap` | kg | Fresh scrap purchases / consumption *(keep id for backward compat)* |
| `raw_daig` | kg | Fresh daig |
| `reusable` | kg | Hand, broken turning, claim returns, other recoverable iron |
| `finished_good` | pcs | Finished hubs/drums |

---

## 5. Data model

### 5.1 Schema changes (existing collections)

#### `Purchase`

```js
{
  supplier: ObjectId,           // required
  materialType: "scrap" | "daig",  // replace immutable material:"scrap"
  quantityKg: Number,
  ratePerKg: Number,
  totalAmount: Number,          // qty * rate (material only)
  freightAmount: Number,        // optional, default 0; included in payable + material cost
  amountPaid: Number,           // default 0
  balance: Number,              // (totalAmount + freightAmount) - amountPaid
  vehicleNo: String,            // optional
  purchaseDate: Date,
  invoiceNo: String,
  notes: String,
}
```

**Ledger behavior:** On create, post A/P for `totalAmount`. If `amountPaid > 0`, also post payment. Later supplier payments reduce balance as today.

#### `Product`

```js
{
  name, sku, description, unitLabel, // existing
  family: "hub" | "drum",            // NEW required for manufacturing products
  weightKg: Number,                  // optional standard weight
  standardCost: Number,              // calculated / last known; not user-primary
  sellingPrice: Number,              // default unit price for dispatch
  category, size, defaultWarehouse, lowStockThreshold, isActive, // existing
}
```

#### `ProductionBatch` (breaking reshape)

```js
{
  batchNo: String,                 // unique, e.g. "128"
  family: "hub" | "drum",          // locked; never mixed
  isRework: Boolean,               // default false; true when from claim rework
  productionDate: Date,
  status: "in_progress" | "completed" | "cancelled",
  currentStage: StageId,           // furnace…finished

  // Furnace inputs (one or both)
  inputs: [{
    materialType: "scrap" | "daig" | "reusable",
    quantityKg: Number,
  }],

  // Furnace outputs — multiple products
  outputs: [{
    product: ObjectId,             // Product
    quantity: Number,              // pieces after furnace / casting
    family: "hub" | "drum",        // denormalized from product
  }],

  furnaceWasteKg: Number,          // slag / burn-off
  handKg: Number,                  // reusable recovered at furnace

  // Per-stage process results (filled as batch advances)
  stages: [{
    stage: StageId,
    status: "pending" | "completed" | "skipped",
    completedAt: Date | null,
    // Turning-specific (null on other stages)
    goodUnits: Number | null,      // sum or per-output mirror
    brokenUnits: Number | null,
    brokenKg: Number | null,       // to reusable
    notes: String,
  }],

  // Optional per-output WIP counters after turning
  outputProgress: [{
    product: ObjectId,
    furnaceQty: Number,
    goodAfterTurning: Number,
    brokenAfterTurning: Number,
    finishedQty: Number,           // posted to FG when stage=finished
  }],

  notes: String,
}
```

**Accounting identity (furnace):**

```
sum(inputs.quantityKg) ≈ sum(outputs.weight) + handKg + furnaceWasteKg
```

Soft warning if imbalance > configurable threshold (e.g. 2%); do not hard-block (factory measurements vary).

**Deprecate fields:** `product`, `inputScrapKg`, `materialLossKg`, `returnedScrapKg`, `goodUnits`, `rejectedUnits` (migrate → new shape).

#### `BatchExpense`

```js
{
  batch: ObjectId | null,          // null = overhead
  stage: StageId | null,
  category: ExpenseCategoryId,     // leaf from §4.4
  amount: Number,
  expenseDate: Date,
  notes: String,
}
```

#### `StockMovement`

```js
itemType: "raw_scrap" | "raw_daig" | "reusable" | "finished_good"
reason: [
  // existing
  "purchase", "production_consume", "production_return",
  "production_output", "adjustment", "sale",
  "transfer_in", "transfer_out",
  // new
  "hand_recovery",           // furnace hand → reusable in
  "turning_breakage",        // broken → reusable in
  "claim_return",            // claim → reusable or raw
  "rework_consume",          // reusable out into rework/furnace
]
```

#### `SalesOrder` / `Dispatch` (additive)

```js
// SalesOrder
salesman: String | null,           // or ObjectId later when Employees exist
city: String,                      // snapshot; also store on Customer

// Dispatch
biltyNo: String,
transporter: String,
vehicleNo: String,
freightAmount: Number,
```

#### `Customer` (additive)

```js
city: String,
```

### 5.2 New collections

#### `Claim` (returns / warranty)

```js
{
  claimNo: String,                 // unique
  order: ObjectId,                 // SalesOrder
  customer: ObjectId,
  claimDate: Date,
  items: [{
    product: ObjectId,
    quantity: Number,
    reason: String,
    disposition: "reusable" | "rework" | "scrap_loss" | "replacement",
  }],
  replacementOrder: ObjectId | null,
  reworkBatch: ObjectId | null,
  notes: String,
  status: "open" | "resolved" | "cancelled",
}
```

**Side effects by disposition:**

| Disposition | Stock | Notes |
|-------------|-------|-------|
| `reusable` | `reusable` IN | kg estimated from product.weightKg × qty (or manual kg) |
| `rework` | hold / link rework batch | Creates or links ProductionBatch marked rework |
| `scrap_loss` | no recoverable stock | Quality loss only |
| `replacement` | FG OUT when replacement dispatched | Via linked order/dispatch |

#### `FactoryExpense` (optional alias)

Prefer extending `BatchExpense` with `batch: null` rather than a second expense collection. Keep `FinanceEntry` for non-ops cash book entries as today.

### 5.3 Derived stock (no balance documents)

Continue computing on-hand from `StockMovement` aggregates:

| Stock pool | Filter |
|------------|--------|
| Scrap kg | `itemType=raw_scrap` |
| Daig kg | `itemType=raw_daig` |
| Reusable kg | `itemType=reusable` |
| FG by product/warehouse | `itemType=finished_good` + product |

---

## 6. Business rules

### 6.1 Purchase

1. `materialAmount = quantityKg * ratePerKg`. Store `freightAmount` separately.
2. **Freight is part of material cost:** `payable = materialAmount + freightAmount`. Effective rate for costing = `payable / quantityKg`.
3. `balance = payable - amountPaid`.
4. Stock IN: `raw_scrap` or `raw_daig` by `materialType`.
5. Supplier ledger: purchase debit + optional payment credit.

### 6.2 Start production batch

1. Generate / accept `batchNo`.
2. Require ≥1 input line with available stock.
3. Declare batch `family`: `hub` or `drum` (locked for the batch).
4. Consume inputs (`production_consume`) from scrap/daig/reusable.
5. Create stage list; mark `furnace` pending → user records furnace output next.
6. Status = `in_progress`, `currentStage = furnace`.

**Family rule:** Hub and drum **cannot** share one furnace batch. Enforce on create and on furnace output (all products must match batch.family). Typical inputs: Scrap → Hub batch; Daig → Drum batch (reusable may feed either).

### 6.3 Record furnace output

1. Enter output lines (products + pieces), `handKg`, `furnaceWasteKg`. All products must be same `family` as the batch.
2. Post `hand_recovery` → **reusable** IN for `handKg` (Hand is always reusable iron).
3. Waste is not stock (loss only).
4. Do **not** post finished goods yet.
5. Complete furnace stage; advance to `turning`.

### 6.4 Turning

1. For each output line: `goodUnits`, `brokenUnits`, and **`brokenKg` (required when brokenUnits > 0)**.
2. That `brokenKg` is added to **reusable** (`turning_breakage`). Broken pieces that will be melted again later are consumed from reusable when a rework / new furnace batch starts.
3. `goodAfterTurning` becomes quantity that continues WIP.
4. Advance to `drilling`.

### 6.5 Drilling / Painting / Polishing

1. Stage completion is a checkpoint (labour/expenses can attach anytime).
2. Polishing: auto-`skipped` for **drum** batches; required for **hub** batches.
3. Advance until `finished`.

### 6.6 Finish batch

1. Post `production_output` FG IN for each product’s `finishedQty` (default = good after turning unless adjusted).
2. Status = `completed`, `currentStage = finished`.
3. Compute / refresh product `standardCost` as **weighted moving average** by finished pieces (§13 #5). Can refine later.

### 6.7 Cancel batch

Only if no FG posted (or reverse FG movements). Re-credit unused inputs per policy (v1: admin-only cancel before finished).

### 6.8 Cost & profitability

**Batch manufacturing cost:**

```
materialCost = Σ (inputKg × weightedAvgRate for that material pool)
operatingCost = Σ BatchExpense where batch = this
totalBatchCost = materialCost + operatingCost
```

**Allocate to products** (v1 simple rule):

```
weight_i = product.weightKg * finishedQty_i
share_i = weight_i / Σ weight_i   (fallback: by piece count if weights missing)
cost_i = totalBatchCost * share_i
unitCost_i = cost_i / finishedQty_i
```

**Gross profit on invoice line (v1):**

```
revenue - (unitCost × qty)
```

Salesman commission / fee is **not a fixed formula** yet — it varies by deal. v1: optional free-text `salesman` on the order + optional manual `commissionAmount` (or expense entry) when known. Do not bake in a % of sale until the family defines a rule.

Document cost formulas in UI tooltips so the family trusts the number.

### 6.9 Claims

1. Must reference original invoice/order.
2. Qty cannot exceed originally dispatched (soft warn if over).
3. Disposition drives stock (§5.2).

---

## 7. API design

Base path unchanged (`/api/...`). Auth: existing JWT.

### 7.1 Meta

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/production/meta` | stages, families, material types, expense taxonomy |
| GET | `/api/inventory/meta` | item types, reasons |

### 7.2 Purchases (extend)

| Method | Path | Change |
|--------|------|--------|
| POST/PATCH | `/api/purchases` | `materialType`, `amountPaid`, `freightAmount`, `vehicleNo` |
| GET | `/api/purchases/reports` | by material type; avg rate; supplier outstanding |

### 7.3 Production (reshape)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/production` | list (filter status, stage, date) |
| POST | `/api/production` | start batch (inputs only) |
| GET | `/api/production/:id` | detail + stages + expenses + cost summary |
| POST | `/api/production/:id/furnace` | record outputs, hand, waste |
| POST | `/api/production/:id/turning` | good/broken |
| POST | `/api/production/:id/advance` | complete current stage (drilling/painting/polishing) |
| POST | `/api/production/:id/finish` | post FG + complete |
| POST | `/api/production/:id/cancel` | cancel rules |
| GET | `/api/production/reports` | waste, yield, reusable recovered, units/week |
| * | `/api/production/:id/expenses` | keep nested expenses |
| GET | `/api/production/:id/costs` | material + ops + unit costs |

### 7.4 Inventory (extend)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/inventory/overview` | scrap, daig, reusable, FG |
| GET | `/api/inventory/reusable` | reusable balance + movements |
| GET | `/api/inventory/stock` | include new item types |

### 7.5 Expenses (extend)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/production/expenses` or `/api/expenses` | allow `batch: null` overhead |
| GET | `/api/production/cost-reports` | by new categories/stages |

### 7.6 Orders / dispatch (extend)

| Method | Path | Change |
|--------|------|--------|
| POST | `/api/orders` | salesman, city snapshot |
| POST | `/api/orders/:id/dispatch` | biltyNo, transporter, vehicleNo, freight |

### 7.7 Claims (new module)

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/claims` | list / create |
| GET/PATCH | `/api/claims/:id` | detail / resolve |
| POST | `/api/claims/:id/replacement` | link/create replacement order |

Mount: `app.use("/api/claims", claimRoutes)`.

### 7.8 Dashboard / Quick Entry

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/dashboard` | extend KPIs: reusable, payables, receivables, WIP batches |
| GET | `/api/dashboard/quick-entry` | optional: counts/suggestions for cards |

---

## 8. Frontend IA & screens

### 8.1 Navigation (proposed)

| Label | Route | Notes |
|-------|-------|-------|
| Dashboard | `/dashboard` | KPIs + **Quick Entry** cards |
| Inventory | `/dashboard/inventory` | tabs: Scrap, Daig, Reusable, Finished, Movements |
| Production | `/dashboard/production` | WIP board + batch detail workflow |
| Orders | `/dashboard/orders` | invoices, dispatch, payments |
| Claims | `/dashboard/claims` | **new** |
| Suppliers | `/dashboard/suppliers` | unchanged + purchase form fields |
| Customers | `/dashboard/customers` | + city |
| Reports | `/dashboard/reports` | extended questions |
| Profile / Settings | existing | — |
| Employees / Attendance | **Out of scope** — removed from nav |

### 8.2 Quick Entry (Dashboard)

Cards → focused modal/drawer (not one giant form):

| Card | Opens |
|------|-------|
| Add Raw Material Purchase | Purchase form (material type, paid, freight) |
| Start Production Batch | Inputs + batch no/date |
| Record Production Output | Furnace outputs for selected WIP batch |
| Advance / Complete Stage | Turning or stage advance |
| Add Expense | Category + optional batch/stage |
| Create Dispatch | From open order |
| Record Payment | Customer payment |
| Record Claim/Return | Claim form |

### 8.3 Production UX

**List:** Kanban or table grouped by `currentStage` (Furnace → … → Finished).

**Batch detail:** Vertical stage timeline (checkbox style from the product vision). Each stage expands to its form. Cost panel sidebar: material, labour, consumables, unit cost.

### 8.4 Inventory UX

Four stock headlines + movements filter by `itemType`. Reusable page answers: “How much reusable iron do we have?” and “How much fresh scrap do we need?”

### 8.5 Claims UX

From order detail: “Record claim”. List with disposition badges. Link to rework batch when created.

---

## 9. Analytics (dashboard + reports)

Must answer:

**Purchasing**

- Best supplier price (avg rate by material)
- Scrap / Daig / Reusable on hand
- Supplier payables outstanding

**Production**

- Highest furnace wastage batches
- Reusable recovered (hand + turning + claims)
- Units produced this week (by product/family)

**Manufacturing**

- Losses by stage (turning breakage, waste kg)
- Cost by stage / category
- True unit cost hub vs drum

**Sales**

- Revenue by customer / city
- Overdue invoices

**Finance**

- Monthly revenue, expenses, gross/net profit, cash flow
- AR + AP outstanding

Reuse existing `/api/finance` and `/api/reports` exporters; extend query params for material type and stage.

---

## 10. Migration plan

### 10.1 Data migration script

`backend/src/scripts/migrate-to-mfg-erp.js`

1. Purchases: set `materialType: "scrap"`, `amountPaid: 0` or infer from ledger payments, `balance = totalAmount - paid`, `freightAmount: 0`.
2. Products: set `family` from category name heuristics or require admin mapping sheet; default `hub` if unknown + flag for review.
3. ProductionBatch: for each old batch, create:
   - `inputs: [{ materialType: "scrap", quantityKg: inputScrapKg }]`
   - `outputs: [{ product, quantity: goodUnits }]`
   - `furnaceWasteKg: materialLossKg`
   - `handKg: returnedScrapKg` *(semantic shift: old “returned scrap” → treat as reusable Hand; document)*
   - `status: "completed"`, `currentStage: "finished"`
   - stages all `completed` (polishing skipped if product family drum)
4. StockMovement: leave historical rows; new code paths write new reasons/types going forward. Optionally backfill `returnedScrapKg` movements as `reusable` if distinguishable.
5. BatchExpense: map old stages → new (`melting|casting` → `furnace`, `shaping` → `turning`, `finishing` → `polishing`). Map old categories → nearest new leaf (`fuel` → `lpg_gas`, `labor` → `furnace` or `other`).

### 10.2 Compatibility window

- Keep read adapters for old batch shape for one release **or** migrate all at once (preferred — fewer batches expected).
- Frontend ships only new forms after migration.

### 10.3 Rollback

Snapshot MongoDB before migration. Script is idempotent via `migratedAt` flag on documents.

---

## 11. Implementation phases

| Phase | Name | Deliverable | Depends on |
|------:|------|-------------|------------|
| A | Domain foundation | Constants, Product.family, Purchase material/payment fields, Stock item types, expense taxonomy, migration script | — |
| B | Production Batch v2 | Multi-input/output schema, furnace + finish stock effects, cost allocation | A |
| C | WIP workflow | Stage advance, turning breakage → reusable, drum skip polishing | B |
| D | Reusable inventory UI | Overview + movements + “need to buy” helper | C |
| E | Claims & returns | Claim module + dispositions | D |
| F | Sales/dispatch polish | City, salesman, bilty fields | A (parallel OK) |
| G | Quick Entry + analytics | Dashboard cards + report questions | B–F |

**Recommended start:** Phase A → B (everything hangs off the new batch).

---

## 12. Non-goals (v1)

- Full double-entry general ledger / GST returns
- Employee, department, attendance modules
- Barcode / shop-floor terminals
- Multi-factory / multi-company
- Automated weighing scale integration
- Mobile-native apps (responsive web is enough)

---

## 13. Decisions (all locked)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Freight / transport | Not a separate purchase field. Include truck cost inside **Total amount** if needed. Payable = that total. Pay later via supplier ledger. |
| 2 | Hand | Always goes to **reusable** inventory (kg). |
| 3 | Hub + Drum | **Never** in the same furnace batch. Separate batches only. |
| 4 | Broken at turning | Staff enter **weight (kg)** of broken iron → that kg is added to **reusable**. Piece count can still be recorded for quality stats. |
| 5 | Product “make cost” display | **Weighted moving average** of finished batches (by pieces). Convenience only; each batch keeps its own true cost. Can refine later. |
| 6 | Salesman | Optional name (text). Commission/fee is **variable / deal-by-deal** — optional manual amount when known; no fixed % in v1. |
| 7 | Rework / melt again | Broken or claim returns that must be melted again use the **same Production Batch** flow (`isRework: true`, linked to claim when from a return). Input comes from reusable (or as recorded). No separate rework module in v1. |

---

## 14. Success criteria

- [ ] One furnace run can output multiple products of the **same family** (hub **or** drum) + Hand + waste — never mixed families.
- [ ] Batch visibly moves Furnace → … → Finished; drums skip polishing.
- [ ] Scrap, Daig, and Reusable balances are separate and correct after purchase/production/claims.
- [ ] Unit cost for a finished hub/drum is explainable from batch material + expenses.
- [ ] Dispatch reduces FG; payment reduces AR; claim can feed reusable/rework.
- [ ] Dashboard Quick Entry covers the 7–8 daily tasks without deep navigation.
- [ ] Existing historical data migrates without losing purchase/ledger/order history.

---

## 15. File touch map (implementation guide)

**Backend (primary):**

- `modules/production/*` — model, service, routes (largest change)
- `modules/expenses/expense.constants.js` + model
- `modules/purchases/*`
- `modules/inventory/movement.model.js` + `inventory.service.js`
- `modules/products/*`
- `modules/orders/*` (dispatch bilty, customer city)
- **new** `modules/claims/*`
- `modules/dashboard/*`, `modules/finance/*`, `modules/reports/*`
- `scripts/migrate-to-mfg-erp.js`

**Frontend (primary):**

- `app/dashboard/page.tsx` — Quick Entry
- `app/dashboard/production/**` — WIP + stage forms
- `app/dashboard/inventory/**` — material tabs + reusable
- **new** `app/dashboard/claims/**`
- `lib/production-api.ts`, `inventory-api.ts`, new `claims-api.ts`
- `components/layout/nav-items.ts`
- types under `src/types/`

---

*All §13 decisions locked. Ready to implement Phase A.*
