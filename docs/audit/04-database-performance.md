# 04 — Database Audit

MongoDB 8.0 on Atlas · 28 Mongoose models · 35 collections · ~6 MB total.

**No production schema or data was modified.** All checks ran against a local restore (`khan-audit`).

---

## 1. Schema quality

### What is right

- Consistent `{ timestamps: true }` on every model.
- Enums used for every state field (`direction`, `reason`, `paymentStatus`, `disposition`, `status`, `scope`, `payType`) and centralised in `modules/domain/mfg.constants.js`.
- `min: 0` on money and quantity fields.
- **Legacy enum values are retained deliberately** so historical documents stay schema-valid: `STOCK_ITEM_TYPE_IDS` includes a retired `"reusable"`, `CATEGORY_IDS` includes eight `LEGACY_EXPENSE_CATEGORY_IDS`. This is good migration discipline and should be preserved.
- `StockMovement` is a correctly designed append-only ledger: positive quantity + explicit direction + typed reason + `refType`/`refId` back-link.
- `Product.weightHistory[]` and `AppSetting.wasteHistory[]` store `previousValue` + `effectiveFrom`, enabling true as-of resolution.

### DB-001 (P2) — Two schema generations live in one collection

`ProductionBatch` carries both models at once:

```js
// current
inputs: [{ materialType, quantityKg }]
outputs: [{ product, quantity, family, weightKg }]
outputProgress: [{ product, furnaceQty, goodAfterTurning, brokenAfterTurning, finishedQty }]

// "Legacy (Phase 1–9) — optional for old records"
product, inputScrapKg, materialLossKg, returnedScrapKg, goodUnits, rejectedUnits
```

Every consumer must branch three ways. Worse, **live code still reads the legacy fields as if they were current** — `finance.estimateMaterialCost`, `dashboard.productionSeries` and `inventory.getInventoryReport` all compute `$subtract: ["$inputScrapKg", "$returnedScrapKg"]`, which is `null` on every modern batch (see 02 BL-019).

A migration that backfills the legacy fields from `inputs[]`/`outputProgress[]` — or, better, rewrites those three aggregations to read the current fields — would remove the whole class of bug.

### DB-002 (P2) — Denormalised balances with no constraint

`Builty.amountPaid` / `balance` / `paymentStatus` and `Purchase.amountPaid` / `balance` are derived values stored on the document. They are kept in sync by `syncCustomerBuiltyPaymentStatuses` and `syncSupplierPurchaseBalances`, which re-derive from the ledger.

**Measured: 0 drift across all 697 builties and 149 purchases.** The sync routines work. But nothing *enforces* the invariant — the only protection is that every mutation path remembers to call the sync, and those calls are scattered across 12 call sites in 4 modules. One missed call silently corrupts a balance.

### DB-003 (P3) — `BatchExpense` is misnamed and overloaded

One collection stores: factory overhead, worker salaries (`category: "fixed_salary"`, 1,153 of 1,341 rows), salesman commission, electricity, and taxes. Nine indexes have accreted on it. The name says "batch expense" but **0 rows have a batch**.

### DB-004 (P3) — Empty / abandoned collections

`salesorders`, `dispatches`, `vaultassets`, `vaultsnapshots`, `vaultconfigs`, `productcategories`, `productsizes`, `assetitems` — all 0 documents. `ProductCategory` and `ProductSize` still have full CRUD routes and are `$lookup`-joined on every `getFinishedStock()` call, adding two no-op pipeline stages to a hot query.

---

## 2. Indexes

### Current state

```
stockmovements        _id, itemType, reason, product, warehouse, movementDate,
                      itemType+product+warehouse
productionbatches     _id, family, status, currentStage, batchNo(unique),
                      product, productionDate
builties              _id, builtyNo(unique), customer, builtyDate, paymentStatus
customerledgerentries _id, customer, entryDate
customerpayments      _id, customer, order, paymentDate, builty
batchexpenses         _id, batch, stage, worker, scope, category, expenseDate,
                      batch+stage+category, salesman
purchases             _id, purchaseDate, invoiceNo, materialType, supplier
ledgerentries         _id, supplier, entryDate
```

### DB-005 (P2) — Recommended changes

| Action | Index | Why |
|---|---|---|
| **Add** | `builties { customer: 1, builtyDate: 1 }` | The dominant query shape — `syncCustomerBuiltyPaymentStatuses` sorts every customer's builties by date; every statement report does the same |
| **Add** | `stockmovements { itemType: 1, movementDate: 1 }` | Every as-of balance query matches on both; currently only one can be used |
| **Add** | `builties { "items.product": 1 }` | `avgSoldPrices`, production report sales join, party-margin all match on it |
| **Add** | `productionbatches { status: 1, productionDate: 1 }` | Every report filters `status ≠ cancelled` within a date range |
| **Drop** | `customerpayments.order_1` | Stale — the `order` field no longer exists on the schema |
| **Review** | `batchexpenses` 9 indexes / 1,341 docs | Each write updates 9 B-trees; `stage` and `batch` are near-useless (`batch` is null on 100 % of rows) |

None of these is currently causing a slow query at 6 MB. They are listed so the fix lands before volume makes it urgent.

### DB-006 (P3) — `autoIndex` is on in production

Mongoose builds indexes on first model use. This showed up in request traces as `batchexpenses.createIndex` *inside a request*. On a long-lived server this is a one-off; on Vercel it is a per-cold-start cost and a per-cold-start write to the catalogue. Set `autoIndex: false` in `connectDB` and manage indexes with a migration script.

### DB-007 (P3) — Index side effects at module load

`modules/assets/asset.model.js:48` fires `AssetCategory.collection.dropIndex("name_1").catch(() => {})` on connection. A one-off repair living permanently in a model file; it runs (and fails silently) on every boot.

---

## 3. Transactions, atomicity, concurrency

### DB-008 (P0) — No transactions exist anywhere

```
$ grep -rn "startSession\|withTransaction\|session:" backend/src --include=*.js
(no matches)
```

Atlas runs a replica set, so multi-document transactions are available. None are used. Every multi-document financial and inventory write is a sequence of independent operations that can partially fail.

**Non-atomic sequences that matter:**

| Operation | Documents written in sequence |
|---|---|
| `purchase.create` | `Purchase` → `LedgerEntry(purchase)` → `LedgerEntry(payment)` → `syncSupplierPurchaseBalances` (saves N purchases) → `StockMovement` |
| `builty.create` | `Builty` → N × `StockMovement` → `CustomerLedgerEntry` → `CustomerPayment` → `CustomerLedgerEntry` → sync (saves N builties) |
| `production.updateProduce` | **delete all movements** → save batch → re-post consume → re-post finished |
| `claim.create` | `Claim` → `CustomerLedgerEntry` → `StockMovement` → builty `claimedQuantity` updates → customer re-sync |
| `settings.setWastePercent` | 1 settings save → `updateProduce()` on **every** batch since the effective date |

The production edit is the most dangerous: there is a window in which the batch's entire stock impact has been deleted and not yet rewritten.

### DB-009 (P1) — Failures are caught and discarded

The pattern appears at six sites:

```js
// purchase.service.js:163, 265  ·  production.service.js:310, 456  ·  …
try {
  await inventoryService.onPurchaseCreated(populated);
} catch (e) {
  console.error("Inventory movement (purchase) failed:", e.message);
}
```

The purchase is saved and returned `200 OK`. The stock movement is missing. The user sees success. Nothing surfaces it, and there is no reconciliation job that would notice.

This is also how the raw-stock divergence in 02 BL-001 could grow unnoticed.

### DB-010 (P1) — Read-modify-write races

No optimistic locking (`__v` is not checked), no `findOneAndUpdate` with conditions on the hot paths. Concurrent-safe patterns are used in exactly one place — `createBatchWithBatchNo` retries on duplicate key, which is correct.

Everything else is vulnerable:

- Two users paying the same builty: both read `balance`, both pass the `amount > balance` check, both write. Over-payment.
- Two users editing the same party: both run `syncCustomerBuiltyPaymentStatuses`, interleaved saves, last writer wins.
- `GET /api/builty/:id` from two tabs triggers two concurrent full re-allocations of the same customer's builties.

At 1–3 concurrent factory-floor users this is low-probability but non-zero, and the damage is silent.

### DB-011 (P2) — Sequence generation by counting

```js
// purchase.service.js:46
const count = await Purchase.countDocuments({ invoiceNo: new RegExp(`^PUR-${prefix}`) });
return `PUR-${prefix}-${String(count + 1).padStart(3, "0")}`;
```

Identical pattern in `claim.service.nextClaimNo`. Count-then-insert is racy, and neither `Purchase.invoiceNo` nor `Claim.claimNo`… — actually `claimNo` *is* `unique: true`, so a collision throws a 500 rather than corrupting. `invoiceNo` is **not** unique, so duplicate invoice numbers can be created silently. `ProductionBatch` gets this right with retry-on-duplicate.

---

## 4. Referential integrity

Mongo has no foreign keys; the application compensates with delete guards:

| Guard | Location | Verdict |
|---|---|---|
| Can't delete a product used in batches | `product.service.remove` | ✅ (but only checks legacy `batch.product`, not `outputs.product`) |
| Can't delete a customer with builties | `customer.service.remove` | ✅ |
| Can't delete a category/size/warehouse in use | `inventory.service` | ✅ |
| Can't delete the default warehouse | `inventory.service.removeWarehouse` | ✅ |
| Can't delete a paid builty | `builty.service.removeBuilty` | ✅ |

**Measured: 0 orphaned references** across builty items → products, builties → customers, ledger entries → customers, purchases → suppliers.

### DB-012 (P2) — One real gap

`product.service.remove()` checks `ProductionBatch.countDocuments({ product: id })` — the **legacy** field only. A product that appears solely in `outputs[].product` (i.e. every product created under the current model) passes the guard and can be deleted while still referenced by batches and builty lines.

### DB-013 (P2) — Cascading deletes are partial

`customer.service.remove()` deletes `CustomerLedgerEntry` and `CustomerInstrument` but leaves `CustomerPayment` and `PartyProductPrice` rows orphaned. (It is gated on having no builties, so the blast radius is small.)

---

## 5. Historical data preservation

### DB-014 (P1) — History is mutable by design

Three settings changes rewrite the past:

| Trigger | Rewrites |
|---|---|
| `product.weightKg` change | `applyProductWeightFromDate` — **re-prices builty lines and totals** from the effective date, re-saves claims, re-runs `updateProduce()` on batches |
| `AppSetting` waste % change | `applyFamilyWasteFromDate` — `updateProduce()` on every batch since the date, deleting and re-posting stock movements |
| `Worker.scope` change | `BatchExpense.updateMany` — reclassifies **all** of that worker's historical salary rows |

The weight case is the most serious: a past invoice's `lineTotal` and `totalAmount` are recomputed, the customer ledger invoice row is updated to match, and payment statuses are re-derived. An invoice the customer has already received, and possibly already paid, changes value.

The mechanism exists for a real reason — the shop measures a product and discovers its true weight — and the `effectiveFrom` boundary is honoured. But invoices that have been issued should be immutable; a correction belongs as a credit/debit note, not as an in-place rewrite. **This needs an owner decision before any change** (see 09 for the proposed route).

None of these operations is logged, previewed, or reversible.

---

## 6. Data quality observations

```
products: 146
  weightKg missing or 0 :   0   ✅
  pricePerKg = 0        : 146   ⚠  → sellingPrice = weightKg × 0 = 0 for every product
  sellingPrice = 0      : 146   ⚠
  standardCost = 0      :  18
  costUpdatedAt = null  : 146   ⚠  → applyProductCost() has never persisted a recomputation

batchexpenses: 1341
  linked to a batch     :   0   ⚠  → per-batch costing is structurally dead
  factory overhead      : 1341
  fixed_salary          : 1153

finished goods with negative balance : 27 products, −101 units
raw stock divergence                 : scrap −26 kg, daig −508.5 kg (claim returns)
```

The `pricePerKg = 0` finding deserves a direct check with the owner: either the field was never adopted (prices are entered per-builty instead, which the data supports — `pricingMode: "rate_kg"` with a per-line `ratePerKg`), in which case the product-level price fields and the `sellingPrice` column should be removed from the UI rather than shown as zero; or it is a data-entry gap.

---

## 7. Backup & recovery

| Item | State |
|---|---|
| Scheduled backups | ❌ None in the repo, no cron, no GitHub Action |
| Manual dumps | 3 ad-hoc `mongodump` directories; newest `2026-10-29` (≈ 3.5 weeks old) |
| Atlas backup | Not verifiable from here — **depends on cluster tier; M0/M2/M5 have no continuous backup** |
| Restore test | No evidence of one |
| Point-in-time recovery | Not available without a backup-enabled tier |
| Migration scripts | 9 one-off scripts in `src/scripts/`, no version tracking, no idempotency markers |

Given that this is a single-database production system with no transactions and several mass-rewrite operations (DB-014), the absence of a verified backup is the highest-leverage reliability gap in the whole audit.

**Confirm the Atlas cluster tier and whether continuous backup is enabled. If it is not, that is the single most urgent item in this report** — ahead of every code finding, because it is what makes every other finding recoverable.
