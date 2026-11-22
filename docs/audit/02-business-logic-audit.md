# 02 — Business Logic & Workflow Audit

Findings are split into **Verified** (reproduced against the data snapshot or by reading an unambiguous code path), **Potential** (code smell or risk that needs a production observation or owner confirmation), and **Gap** (functionality the brief asks about that does not exist).

---

## A. Raw Material Management

### ✅ What works

- Purchases validate quantity, enforce whole kilograms, compute `payable = totalAmount + freightAmount`, and reject `amountPaid > payable`.
- Every purchase writes a matching `LedgerEntry(type: "purchase")` and, if paid at entry, a second `LedgerEntry(type: "payment")`.
- Same-day duplicate guard on supplier + materialType + quantity (`purchase.service.js:107`).
- Auto invoice numbering `PUR-YYYYMMDD-NNN` when the supplier gives no bill number.
- **Purchase payable arithmetic is clean in production data: 0 of 149 purchases have `amountPaid + balance ≠ total + freight`.**

### 🔴 BL-001 (P0) — Raw stock has two sources of truth that disagree

Two independent code paths compute raw material on hand:

| Path | Formula | Used by |
|---|---|---|
| `purchaseService.getStock()` (`purchase.service.js:281`) | `Σ Purchase.quantityKg − Σ ProductionBatch.inputs[].quantityKg` | `/api/inventory/overview`, `/api/inventory/stock`, `/api/inventory/alerts` |
| `inventoryService.getRawStockAsOf()` (`inventory.service.js:612`) | net of `StockMovement` where `itemType ∈ {raw_scrap, raw_daig}` | `/api/inventory/reports` (the as-of report) |

The first path **never reads `StockMovement`**, so every movement that is not a purchase or a batch input is invisible to it.

**Measured on the 2026-11-22 snapshot:**

```
scrap   purchased=102061    consumed=96379.985   derived=5681.015   ledger=5707.015   DIFF= -26.0 kg
daig    purchased=193901    consumed=186899.73   derived=7001.27    ledger=7509.77    DIFF=-508.5 kg
```

Root cause located exactly — `claim_return` movements:

```
raw_daig   claim_return   in   qty=508.5   n=12
raw_scrap  claim_return   in   qty=26      n=1
```

When a customer claim returns scrapped goods to the melt, the system posts raw material back into the `StockMovement` ledger, but the inventory overview's formula cannot see it.

**Impact:** the Inventory overview understates daig on hand by **508.5 kg** against the as-of report. The two numbers are visible on adjacent screens. At typical daig rates this is a six-figure PKR difference in reported inventory value, and it also feeds the low-stock alert logic.

### 🔴 BL-002 (P1) — No negative-stock protection, and stock is already negative

`builty.service.js:118`:

```js
/** Stock may go negative when shipping — no hard block. */
async function assertStockAvailable() {
  return;
}
```

The function is called at two sites and is an empty stub. `production.service.produce()` computes `const available = await getAvailableMaterialKg(materialType)` (line 247) and then uses it **only** to report `availableAfter` — it never compares it to what the batch consumes.

**Measured:** 27 finished products hold a negative balance, **−101 units** in total:

```
Nissan A              -20 (hub)      cpb/12              -6 (drum)
Nissan TK20 regular    -9 (drum)     ISUZU-MT (R)        -5 (drum)
Tatra Goal             -7 (hub)      Tatra A             -5 (drum)
Sg o/p                 -6 (hub)      nissan Fr           -5 (hub)
…21 more
```

Whether a warning is wanted is a business decision (back-dated entry legitimately drives stock negative mid-sequence). What is not defensible is that there is **no signal at all** — no warning, no flag, no report. `getFinishedStock` filters out only exact zeros (`{ $match: { quantity: { $ne: 0 } } }`), so negatives are silently mixed into totals and into `mfgValue`/`saleValue`.

### 🟡 BL-003 (P2) — Unweighted average purchase rate

`purchase.service.js:299` and `finance.service.js:288` both use:

```js
avgRate: { $avg: "$ratePerKg" }
```

This averages *rates*, not *cost per kg*. A 50 kg buy at Rs 400 and a 5,000 kg buy at Rs 200 report Rs 300/kg; the true blended cost is Rs 202/kg. `product-cost.js:33` gets this right (`Σspend / Σkg`) — the two disagree.

`avgRate` is surfaced in the purchases report, the per-supplier breakdown, and `finance.estimateMaterialCost`.

### 🟡 BL-004 (P2) — Purchase edits silently reprice history

`purchase.service.update()` recomputes amounts, saves, and then calls `syncPurchasePaid` → `syncSupplierPurchaseBalances`, which **re-runs allocation across every purchase and payment for that supplier** and rewrites `amountPaid`/`balance` on all of them. Editing one old purchase's rate can therefore change the paid/unpaid status of unrelated invoices. There is no audit trail of what changed.

### Gap — not implemented

Material categories/units beyond the two hardcoded types (`scrap`, `daig`); minimum stock levels for raw material (`lowStockThreshold` exists on `Product` only — the raw alert fires only at `≤ 0`); stock valuation for raw material (no rolling/FIFO/weighted cost layer); material returns to supplier.

---

## B. Production Management

### ✅ What works

- `produce()` is a clean, well-shaped happy path: resolve as-of piece weight → `metalKg = qty × weightKg` → `wasteKg = metalKg × waste%` → `chargedKg = metalKg + wasteKg` → write batch → consume inputs → post finished goods.
- Waste % resolves **as of the production date** through `settings.resolveWastePercent` with a full `wasteHistory`, so back-dated entries use the rate that was in force then. Same for piece weight via `resolveWeightKg`. This is genuinely well done.
- `createBatchWithBatchNo` retries on duplicate-key up to 25 times, then falls back to a timestamp suffix — robust against concurrent batch creation.
- Same-day duplicate guard per product.
- **Measured: 0 non-cancelled batches lack a matching `StockMovement`; 0 cancelled batches retain movements. Batch inputs reconcile exactly to consume movements (daig 186,899.73 kg on both sides).** The production↔inventory link is sound.

### 🔴 BL-005 (P1) — Edit/reverse is delete-then-rewrite, with no transaction

`production.service.updateProduce()` (line 789):

```js
await inventoryService.onBatchDeleted(batch._id);   // deletes ALL movements for this batch
batch.inputs = [...]; batch.outputs = [...];
await batch.save();
await inventoryService.onBatchInputsConsumed(batch); // re-posts consume
await inventoryService.onBatchFinished(batch);       // re-posts output
```

Between the first line and the last, the batch's stock impact does not exist. Any failure in that window — timeout, cold-start eviction, validation error on save — leaves raw material permanently over-credited and finished goods under-credited, with no record that it happened. Mongo supports multi-document transactions on Atlas replica sets; none are used anywhere in the codebase.

### 🔴 BL-006 (P1) — Changing the waste % rewrites historical batches

`settings.service.setWastePercent()` → `production.service.applyFamilyWasteFromDate()` → loops every non-cancelled batch from the effective date and calls `updateProduce()` on each. Each call deletes and re-posts that batch's stock movements (BL-005) and recomputes consumption.

So one settings change silently mutates an unbounded number of historical production records and their inventory ledger entries, serially, outside a transaction, with no preview of what will change and no undo.

### 🟡 BL-007 (P2) — Two parallel production models coexist

The code supports both a legacy single-product batch (`batch.product`, `goodUnits`, `inputScrapKg`, `returnedScrapKg`) and the current multi-output staged model (`outputs[]`, `outputProgress[]`, `inputs[]`). Nearly every read path carries a three-way fallback:

```js
// production.service.js:216-232 (finishedLinesFromBatch, getReport, getProductReport …)
outputProgress → outputs → legacy batch.product/goodUnits
```

`getReport()` alone is ~200 lines of this branching. It works, but it is the single biggest source of correctness risk in the module and makes every change expensive.

### 🟡 BL-008 (P2) — The staged workflow is effectively dead

`recordFurnace` / `recordTurning` / `advanceStage` / `cancelBatch` implement a six-stage flow (furnace → turning → drilling → painting → polishing → finished). `produce()` bypasses it entirely, writing all stages as `completed` at once. **Measured: 0 cancelled batches exist; all batches in the snapshot are `completed`.** `recordFurnace` also hardcodes `wastePercent = 6` instead of reading settings (line 452), so if it were used it would ignore the configured rate.

### 🟡 BL-009 (P2) — Turning breakage is recorded but goes nowhere

`recordTurning` collects `brokenKg`, then calls:

```js
async function onTurningBreakage() {
  // Breakage no longer returns to a reusable pool.
}
```

Broken metal is captured on the stage record and then dropped — it is neither returned to raw stock nor booked as a loss.

### Gap — not implemented

Production planning / scheduling; bill of materials (consumption is derived purely from `qty × weightKg × (1 + waste%)`, there is no recipe); per-batch costing (see BL-014).

---

## C. Inventory & Stock

### ✅ What works

- `StockMovement` is a proper append-only ledger: always-positive quantity, explicit `in`/`out`, a typed `reason`, and `refType`/`refId` back-links. This is the right shape.
- `rebuildFinishedGoodsLedger()` can reconstruct finished-goods movements from production + builties + claims — a real recovery tool.
- Manual adjustments carry a same-day duplicate guard.

### 🔴 See BL-001 — the overview and the as-of report disagree on raw stock.

### 🟡 BL-010 (P2) — Finished-goods sale valuation can be circular

`getFinishedStock()` values stock at `saleValue = qty × salePrice`, where `salePrice` is:

1. that product's historical average realised price, else
2. its family's average realised price, else
3. catalog price (`sellingPrice`, or `weightKg × pricePerKg`).

**Measured: all 146 products have `pricePerKg = 0` and `sellingPrice = 0`.** So tier 3 is always zero, and any never-sold product is valued at its family average — which may be a very different product. Meanwhile `mfgValue` uses `standardCost`, and **all 146 products have `costUpdatedAt = null`**, meaning `applyProductCost()` has never persisted a recomputation; 18 products have `standardCost = 0`.

Net effect: the inventory *value* figures on the dashboard and inventory report are built on stale or absent cost and price data. The *quantities* are fine.

### 🟡 BL-011 (P2) — Movement history is hard-capped at 500 rows

`inventory.service.js:721`: `.limit(500)` with no pagination and no total count. Against 4,814 movements, the history screen silently shows a truncated view with no indication that it is truncated.

### Gap

Stock transfers between warehouses exist as movement *reasons* (`transfer_in`/`transfer_out`) but there is no transfer workflow — the only way to create one is a manual adjustment. Stock reconciliation / physical count has no UI.

---

## D. Suppliers & Customers (Parties)

### ✅ What works — and this is the strongest part of the system

`utils/allocate-payments.js` implements one allocation rule used by both AR and AP:

> each payment first settles the current calendar month's invoices dated on or before the payment, then older invoices oldest-first, then previous-pending adjustments; it never settles a charge dated after the payment.

That last clause is the important one — it prevents a 17 Sep payment from being shown as settling a 29 Sep invoice.

**Reconciliation against the snapshot is exact:**

```
customer ledger invoices : 697 rows, 74,436,627   │  builties : 697 rows, 74,436,627   DIFF 0
customer ledger payments : 390 rows, 67,027,592   │  payments : 390 rows, 67,027,592   DIFF 0
builty totalAmount vs items−discount    : 0 mismatches / 697
builty amountPaid + balance = total     : 0 mismatches / 697
purchase amountPaid + balance = payable : 0 mismatches / 149
orphan references (product/customer/supplier) : 0
```

The money ledgers are internally consistent. That is a meaningful result and the owner can rely on party balances.

### 🔴 BL-012 (P1) — Reading a builty writes to the database

`builty.service.getBuilty(id)` (line 283) calls `syncCustomerBuiltyPaymentStatuses()` on every single `GET`. That function loads **all** builties, payments and ledger adjustments for the customer, re-runs the allocation, and `save()`s every builty whose status changed.

`createBuilty`, `updateBuilty`, `recordBuiltyPayment`, `removeBuiltyPayment` and `setBuiltyAmountPaid` all return `getBuilty()`, so each also syncs twice.

Consequences: a read-only page view mutates data; two users opening the same party concurrently race on the same documents; and the write amplification is invisible in any log.

### 🔴 BL-013 (P1) — Listing claims rewrites every builty in the database

`claim.service.list()` (line 136) begins:

```js
await repairLegacyBuiltyBoundClaims();
```

which calls `restoreBuiltyTotalsFromItems()` — a loop over **all 697 builties** that recomputes each total and, on mismatch, saves the builty *and* `updateMany`s its invoice ledger entry — followed by `ensureClaimPartyCredits()`, which can create ledger adjustments and re-sync every touched customer.

It is guarded by a module-level `let repairedLegacyCuts = false`. On a long-lived server that means once per process. **On Vercel serverless it means once per cold start, indefinitely** — a GET request triggering an unbounded, untransacted, unlogged mass write.

This is a one-off migration that was left wired into a read path.

### 🟡 BL-014 (P2) — Party balance is computed by loading the whole ledger

`customer.service.getBalance()` does `CustomerLedgerEntry.find({customer})` — full hydrated Mongoose documents, no `.lean()`, no projection — then sums in JavaScript. It should be a single `$group`. Called on every ledger view, every payment, every adjustment.

### ✅ Instruments (cheques / promises)

Cheque and promise tracking is well modelled: `pending` → `received` transitions create a real `CustomerPayment`, deleting the payment reverts the instrument to `pending` (`customer.service.js:removeLedgerEntry`), and `listDueInstruments` drives a dashboard banner. Good.

---

## E. Employees & Salary

### Gap — most of what the brief asks about does not exist

Salaries are not a module. A salary payment is a `BatchExpense` row with `category: "fixed_salary"` and a `worker` reference. **Measured: 1,153 of 1,341 expense rows are `fixed_salary`.**

| Asked about | Status |
|---|---|
| Employee registration | ✅ `Worker` model — name, nameUr, job, scope, payDays |
| Salary structures | ❌ `rate` and `payType` are documented in the schema as *"suggestion only — not locked"* |
| Monthly salaries | ⚠️ Only via payroll *windows* (`AppSetting.payrollPeriods`), which remap which payment dates count toward which accounting month |
| Salary payments | ✅ `worker.service.pay()`, with a same-day duplicate guard |
| Advances | ❌ |
| Deductions | ❌ |
| Bonuses | ❌ |
| Outstanding salary balance | ❌ Nothing is ever *owed* — only paid amounts are recorded. There is no accrual, so "unpaid salary" cannot be computed |
| Salary reports | ✅ `/dashboard/reports/salaries`, calendar view, per-worker view |

This is a legitimate design for a cash-paid factory floor, and it should be described as such rather than as a defect — but the owner should know that the system cannot answer *"how much do I owe my workers right now?"*

### ✅ The payroll-window mechanism is correct

`settings.expenseMatchWithSalaryWindow()` builds a `$or` that matches non-salary expenses on the calendar range and salary expenses on the configured payment window. It is applied consistently in `finance.getOverview` and `worker.listPayments`.

### 🟡 BL-015 (P2) — Changing a worker's scope retroactively reclassifies all their past salaries

`worker.service.update()`:

```js
await BatchExpense.updateMany(
  { worker: worker._id, category: "fixed_salary" },
  { $set: { scope: nextScope } }
);
```

Moving a worker from `common` to `hub` rewrites every historical salary row, which changes the hub/drum overhead split and therefore every past month's per-kg cost and product margin. No audit record, no date boundary.

---

## F. Expenses & Financial Management

### ✅ What works

- A clear hierarchical taxonomy (`EXPENSE_CATEGORY_GROUPS`) with legacy ids preserved so old documents stay schema-valid — a good migration discipline.
- `scope` (hub / drum / common) is the mechanism for per-family overhead allocation, and certain categories are force-set to `common` (electricity, taxes, paint, LPG, petrol, tools, machine, repairs) so a user cannot mis-scope them.
- Same-day duplicate guard on category + amount.
- Electricity and tax splitting are configurable (`intensity` vs `percent`, `half` / `per_kg` / `percent`) with a dedicated accrual resolver.

### 🔴 BL-016 (P1) — Per-batch costing is structurally impossible

`BatchExpense.batch` is nullable by design, and **measured: 0 of 1,341 expense rows are linked to a batch.** The developer documented this honestly in `products/product-cost.js:9`:

> *"`otherCost` cannot be read from batch-linked expenses: in practice every expense is entered as factory overhead with `batch: null`, so that sum is always zero and standardCost collapses to metal only."*

The workaround is to derive a per-kg overhead rate from a **rolling 12-month** `getProductionMargin()` call and multiply by piece weight. That is defensible as an average, but it means:

- `standardCost` on a product reflects the *last 12 months of the whole factory*, not what that product actually cost.
- Any per-batch cost report will show zero.
- The rate changes retroactively for all products whenever the window rolls.

### 🟡 BL-017 (P2) — Expense entry does not enforce `stage` consistency

`validateExpenseBody(data, { requireStage: false })` for overhead, `true` for batch expenses — but `update()` derives `requireStage` from `Boolean(expense.batch)`, so an overhead row that once had a stage keeps it with no validation path to clear it.

---

## G. Profit & Loss — the most important section

### 🔴 BL-018 (P0) — COGS is purchase-based, not consumption-based

`finance.service.getOverview()` (line 239):

```js
const cogs = roundMoney(purchasesAccrual.total + manufacturingOps.total);
//                      ↑ Σ Purchase.totalAmount in the period
const profit = roundMoney(income.revenue - totalExpense);
```

Revenue is accrual (invoiced sales, net of claim credits) — correct. But cost of goods sold is **what was bought in the period**, not what was consumed. There is no opening/closing inventory adjustment.

The correct form is:

```
COGS = opening inventory + purchases − closing inventory
```

Every input needed for that already exists: `getRawStockAsOf()` gives raw kg at any date, `getFinishedStock({asOf})` gives finished units at any date.

**Why this matters to the owner:** buy a truckload of scrap on the 30th and that month shows a loss; sell from that scrap next month and next month shows an inflated profit. Monthly net profit tracks **purchasing rhythm**, not business performance. For a foundry that buys metal in large irregular lots, this can invert the sign of a month's result.

The code comment at line 237 shows the author was aware of the tension (*"Avoid double-counting material: use purchases for accrual COGS primary"*) but resolved it by picking one side rather than adding the inventory bridge.

### 🔴 BL-019 (P1) — `estimateMaterialCost` reads fields that are null on all modern batches

```js
// finance.service.js:287
const consumed = await ProductionBatch.aggregate([
  { $match: dateMatch("productionDate", from, to) },
  { $group: { _id: null, net: { $sum: { $subtract: ["$inputScrapKg", "$returnedScrapKg"] } } } },
]);
```

`inputScrapKg` and `returnedScrapKg` are the **legacy** fields; the current model stores consumption in `inputs[]`. On modern batches both are `null`, `$subtract` yields `null`, and `$sum` ignores it — so `netKg ≈ 0` and `materialEstimate ≈ 0`.

It is also multiplied by the unweighted `$avg: "$ratePerKg"` (BL-003), with no date bound at all — the rate from 2024 is averaged with today's.

The value is excluded from `pnlExpenseTotal` but **is** included in `expenses.totalAccrual`, which is returned to the client. The same broken `$subtract` appears in `dashboard.service.productionSeries()` (line 70) and `inventory.service.getInventoryReport()` (line 1003).

### ✅ What the P&L does get right

- Revenue is net of claim refunds (`salesNet = salesGross − claimsPeriod.totalRefund`).
- Cash flow and accrual profit are reported as **separate** blocks (`cashFlow` vs `profitAndLoss`) — the brief asks whether the system distinguishes them, and it does.
- `getProductionMargin` computes a genuine per-family manufacturing margin with material cost, allocated overhead, cost/kg and sell value. This is the number the dashboard actually shows, and it is consumption-based — so the *production margin* view is sounder than the *finance overview* view.
- Multi-month ranges are computed per calendar month and merged so totals stay additive (Sep + Oct = Sep–Oct) — a subtle correctness property that was deliberately engineered.

### ⚠️ Needs owner confirmation (do not change without a decision)

| Question | Current behaviour |
|---|---|
| Should freight be part of material cost? | Included in `payable` and in `product-cost` rates, **excluded** from `estimateMaterialCost` |
| Should claim `mfgLossAmount` (Rs 15,814 open) hit P&L? | Tracked on claims, not deducted anywhere in the P&L |
| Should the salesman add-on be a cost or a price component? | Currently folded into the per-kg charge in `getProductionMargin` |
| What is "previous pending"? | A positive `adjustment` ledger row; it increases the balance but is not revenue |
| Is the 12-month rolling overhead window right? | Hardcoded `ROLLING_MONTHS = 12` in `product-cost.js:18` |

---

## H. Reports & Dashboard

### 🔴 BL-020 (P2, high surprise value) — The `/api/dashboard` endpoint is dead code

`modules/dashboard/` (controller + service + routes, ~350 lines) builds a full KPI dashboard: sales today, cash balance, outstanding, low stock, 6-month charts, recent activity, top customers/suppliers. It costs **134 database round trips** per call.

**Nothing calls it.** `frontend/src/lib/dashboard-api.ts` exports `getDashboard()`; grep across the entire frontend finds no importer. The page at `/dashboard` instead calls `production-margin` + `party-sales-margin` + `inventory/reports`.

So the dashboard module is maintained, mounted, and reachable, but unused — and the KPIs it computes (cash balance, outstanding, low-stock count, pending orders) are **not shown anywhere in the product**.

### ✅ Report coverage is genuinely broad

22 report screens plus 20 export endpoints (XLSX + PDF each), including per-party statements, group statements, a yearly calendar, position, receivables/payables, received/paid, and a combined "full report" composer. The handout generator has **11 passing tests** verifying that preview, PDF and Excel render identical rows — the only well-tested area of the codebase.

### 🟡 BL-021 (P2) — Dashboard figures cannot be cross-checked

Because the P&L overview (BL-018) and the production margin use different cost bases, the "profit" a user sees depends on which screen they are on. There is no reconciliation view that ties revenue → COGS → gross → net across both.

---

## Verified-clean summary

For balance, these were specifically checked and found **correct**:

- Builty totals ↔ line items ↔ discount: 0 mismatches / 697
- Builty `amountPaid + balance = totalAmount`: 0 mismatches
- Purchase `amountPaid + balance = payable`: 0 mismatches / 149
- Customer ledger invoice rows ↔ builty totals: exact (Rs 74,436,627 both sides)
- Customer ledger payment rows ↔ payment documents: exact (Rs 67,027,592 both sides)
- Orphaned foreign keys: 0 across builty items, builty customers, ledger customers, purchase suppliers
- Batch inputs ↔ production-consume movements: exact (186,899.73 kg daig)
- Batches missing stock movements: 0 · cancelled batches with stray movements: 0
- Builties dated in the future: 0
- As-of weight and as-of waste-% resolution: correct by inspection, with full history

The payment-allocation engine and the ledger layer are the strongest parts of this system.
