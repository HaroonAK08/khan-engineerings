# 03 — API & Data-Fetching Performance

## Method

A throwaway copy of the 2026-11-22 export was restored into a local database `khan-audit` (production never touched). The real Express app was booted against it with a `mongoose.set("debug", …)` hook counting every driver operation, each endpoint warmed once, then measured.

**Read the "db ops" column, not the "time" column.** Local MongoDB RTT is ~0.1 ms; production is Atlas behind Vercel, where each round trip costs roughly 5–40 ms. A handler issuing 283 operations — many of them strictly sequential — is slow in production for reasons that do not show up locally.

```
   time   dbops   payload  status  endpoint
```

## Measured results

### The actual dashboard (what `/dashboard` loads)

`frontend/src/app/dashboard/page.tsx:508` fires three calls in parallel:

| Range | production-margin | party-sales-margin | inventory/reports | **total ops** |
|---|---:|---:|---:|---:|
| 1 month | 38 | 41 | 4 | **83** |
| 12 months | 283 | 323 | 4 | **610** |

```
   163ms     38     57.1KB   200   /api/finance/production-margin?dateFrom=2026-11-01&dateTo=2026-11-30
                              products.find×19  batchexpenses.aggregate×6  productionbatches.find×4
                              appsettings.findOne×3  purchases.aggregate×3
   168ms     41     35.7KB   200   /api/finance/party-sales-margin?dateFrom=2026-11-01&dateTo=2026-11-30
                              products.find×20  batchexpenses.aggregate×6  productionbatches.find×4
    83ms      4     47.9KB   200   /api/inventory/reports?asOf=2026-11-30&…

   815ms    283     84.4KB   200   /api/finance/production-margin?dateFrom=2026-01-01&dateTo=2026-12-31
                              products.find×89  batchexpenses.aggregate×54  purchases.aggregate×38
                              appsettings.findOne×36  productionbatches.find×30
   891ms    323     65.1KB   200   /api/finance/party-sales-margin?dateFrom=2026-01-01&dateTo=2026-12-31
                              products.find×101 batchexpenses.aggregate×54  purchases.aggregate×38
                              appsettings.findOne×36 builties.aggregate×36
```

**Extrapolation.** 610 round trips with ~12 months of sequential segments. Even assuming each month's ~50 ops run mostly in parallel, the 12 month-segments do not — they run in a `for … await` loop. At a conservative 15 ms Atlas RTT this is **several seconds**, and `connectDB` sets `socketTimeoutMS: 5000`.

### Other endpoints

```
   265ms    134      8.5KB   200   /api/dashboard                 ← DEAD CODE, never called
                              purchases.aggregate×21  financeentries.aggregate×17
                              builties.aggregate×16   products.find×11  ledgerentries.aggregate×9
    99ms    125      1.6KB   200   /api/finance/monthly?months=12
                              purchases.aggregate×24  financeentries.aggregate×24
                              customerpayments.aggregate×12  builties.aggregate×12
   188ms     44      5.9KB   200   /api/finance/charges-calculator
   110ms     13      0.7KB   200   /api/inventory/overview
                              purchases.aggregate×4  productionbatches.find×4  ← see DF-002
    98ms      6      0.1KB   200   /api/inventory/alerts
   129ms     37      1.7KB   200   /api/reports/position
    78ms      9    174.5KB   200   /api/reports/receivables
    53ms      8     27.7KB   200   /api/reports/yearly?year=2026
    18ms      3    152.3KB   200   /api/reports/received
    46ms      3    261.3KB   200   /api/builty                    ← 261 KB, unpaginated
   440ms      3   2456.3KB   200   /api/production                ← 2.4 MB, unpaginated
    74ms      2     37.0KB   200   /api/inventory/finished
```

---

## DF-001 (P1) — Multi-month finance reports run month segments sequentially

`finance.service.js:973`:

```js
const parts = [];
for (const seg of segments) {
  parts.push(await computeProductionMarginForPeriod({ ...query, dateFrom: …, dateTo: … }));
}
return mergeProductionMarginReports(parts, { from, to });
```

The per-month decomposition is *deliberate and correct* — it is what makes totals additive (see 02 §G). The problem is purely that the loop awaits. `computePartySalesMarginForPeriod` has the identical shape at line 2794.

Each segment is independent; `Promise.all` is a drop-in change. Expected effect: 12-month production-margin wall time drops to roughly one month's (~40 ops of latency instead of ~283 serialised), with **no change to output**.

> Note: this also multiplies Atlas connection pressure — `maxPoolSize` is 5, so 12 concurrent segments × ~40 ops will queue. Pool size should rise to ~15 alongside this change.

## DF-002 (P1) — `inventory/overview` computes the same thing three times

`inventory.service.getOverview()`:

```js
Promise.all([
  purchaseService.getStock(),   // → aggregateStockForMaterial ×2 → sumNetConsumedForMaterial ×2
  getFinishedStock(),           // → movement agg + avgSoldPrices (full Builty scan)
  getAlerts(),                  // → getFinishedStock() AGAIN + purchaseService.getStock() AGAIN
  StockMovement.countDocuments(),
])
```

`getAlerts()` internally re-runs both of its siblings. Measured: **`productionbatches.find ×4` and `purchases.aggregate ×4` for one overview call.**

`sumNetConsumedForMaterial()` is the expensive one — it loads **every non-cancelled batch** (1,447 docs) into Node and sums in JavaScript:

```js
// production.service.js:124
const batches = await ProductionBatch.find(match)
  .select("inputs inputScrapKg returnedScrapKg").lean();
let total = 0;
for (const b of batches) { … }
```

This should be a single `$unwind` + `$group` aggregation, and the results should be computed once per request and shared.

The dashboard (dead) calls `inventoryService.getOverview()` **and** `getAlerts()` in the same `Promise.all`, producing 6 full batch scans per load.

## DF-003 (P1) — No pagination anywhere

No list endpoint accepts `page`/`limit`; no frontend screen requests one. Grep for pagination state across 46 dashboard pages returns nothing.

| Endpoint | Payload | Rows |
|---|---:|---:|
| `GET /api/production` | **2.4 MB** | 1,447 batches, fully populated |
| `GET /api/builty` | 261 KB | 697 |
| `GET /api/reports/receivables` | 175 KB | all parties |
| `GET /api/reports/received` | 152 KB | all payments |
| `GET /api/inventory/finished` | 37 KB | all SKUs |

The 2.4 MB production list is transferred, parsed, and rendered as 1,447 DOM rows on every visit to Production History, over the Next.js proxy hop, on a factory-floor machine. The only limit in the codebase is a silent `.limit(500)` on stock movements (`inventory.service.js:721`) with no total count, so users do not know the list is truncated.

## DF-004 (P1) — Write-on-read

| Path | What it writes |
|---|---|
| `GET /api/builty/:id` | `syncCustomerBuiltyPaymentStatuses` — reallocates and saves every builty for that customer |
| `GET /api/claims` | `repairLegacyBuiltyBoundClaims` — recomputes and may save **all 697 builties** + their ledger entries, once per process / per serverless cold start |
| `GET /api/suppliers/:id/ledger` | `syncSupplierPurchaseBalances` — reallocates and saves every purchase for that supplier |

These are correctness-restoring routines wired into read paths. They should be explicit maintenance endpoints (the scripts already exist: `resync:payments`, `rebuild:stock`).

## DF-005 (P2) — N+1 product lookups

| Site | Pattern |
|---|---|
| `builty.service.normalizeItems` (line 62) | `await Product.findById(raw.product)` inside the item loop |
| `production.service.recordFurnace` (line 424) | same, per output line |
| `claim.service` (lines 306, 462, 565) | same, per claim item |
| `inventory.service.onBatchFinished` (line 258) | `await Product.findById(line.product)` per finished line |

A 10-line builty issues 10 sequential `findById` calls that one `find({_id:{$in:[…]}})` would cover. Measured aggregate effect: `products.find ×19–20` per month segment in the margin reports, ×89–101 over a year.

## DF-006 (P2) — Settings re-read on every sub-computation

`appsettings.findOne ×36` on a 12-month margin report — three reads per month segment (`getWasteSettings`, `getTaxSplit`, `getElectricitySplit`), each calling `getAppSettings()` fresh. There is exactly one settings document; it should be request-scoped or TTL-cached like `product-cost.js` already does for rates.

## DF-007 (P2) — Unbounded aggregates inside per-item loops

`inventory.service.avgSoldPrices()` aggregates **every builty line ever written** with no date bound, and is called by `getFinishedStock()`, which is itself called 2–3× per inventory request (DF-002).

`claim.service.avgMaterialRate()` and `expense.service.estimateMaterialCost()` each run an unbounded `Purchase.aggregate` **per material type per claim item**.

## DF-008 (P2) — The Next.js API proxy is duplicated and buffering

- `next.config.ts` declares `rewrites()` for `/api/:path*`, and `src/app/api/[...path]/route.ts` declares a full proxy for the same paths. Route handlers take precedence, so the rewrite never fires — dead configuration that will mislead the next maintainer.
- The active proxy does `init.body = await req.arrayBuffer()` on every non-GET, fully buffering uploads in Node memory before forwarding.
- It forwards only `content-type` and `set-cookie` downstream — `cache-control`, `etag` and `content-length` are dropped, so no HTTP caching is possible even where it would be safe.

## DF-009 (P2) — Index gaps

Present and appropriate: single-field indexes on the obvious foreign keys and date fields on every hot collection.

Missing or wrong:

| Collection | Issue |
|---|---|
| `builties` | No `{ customer: 1, builtyDate: 1 }` — the dominant query shape in `syncCustomerBuiltyPaymentStatuses` and every statement report |
| `builties` | No index on `items.product`, though `avgSoldPrices` and the production report match on it |
| `stockmovements` | No `{ itemType: 1, movementDate: 1 }` — required for every as-of balance query |
| `customerpayments` | Carries a stale `order_1` index for a field that no longer exists on the schema |
| `productionbatches` | No `{ status: 1, productionDate: 1 }` compound |
| `batchexpenses` | 9 indexes on 1,341 documents — over-indexed for the write volume |

At 6 MB of data none of these is currently causing a slow query; they are listed so they are fixed before volume makes them matter.

## DF-010 (P3) — Frontend fetch hygiene

- **No request cancellation anywhere.** Zero `AbortController` usages. The date-range filter debounces 200 ms (`dashboard/page.tsx:524`) but does not cancel, so rapid range changes can land out of order and an older response can overwrite a newer one.
- **No caching or deduplication** — see 05 (DF): React Query is installed and its provider is mounted, but no component uses it.
- Every screen refetches from scratch on navigation, including reference data (products, customers, workers, warehouses) that changes rarely.

---

## Per-screen summary

| Screen | Calls | DB ops (1 mo) | Payload | Main cost |
|---|---|---:|---:|---|
| `/dashboard` | 3 | 83 | 141 KB | sequential month segments, product N+1 |
| `/dashboard` (year) | 3 | **610** | 150 KB | DF-001 |
| Production History | 1 | 3 | **2.4 MB** | no pagination |
| Builty list | 1 | 3 | 261 KB | no pagination |
| Inventory overview | 1 | 13 | 0.7 KB | DF-002 triple computation |
| Claims list | 1 | varies | — | **DF-004 mass write on cold start** |
| Builty detail | 1 | varies | — | DF-004 write-on-read |
| Receivables | 1 | 9 | 175 KB | fine |
| Reports (received/paid/yearly) | 1 | 3–8 | 27–152 KB | fine |

## What is already good

- Almost every service already batches its independent queries with `Promise.all`.
- Aggregations are used for sums rather than JS loops in most of `finance` and `reports`.
- `.lean()` and `.select()` are applied on the heaviest reads.
- `product-cost.js` has a sensible 60 s TTL cache on rate tables.
- The `withNetLineTotal()` aggregation helper correctly distributes a builty-level discount across lines inside the pipeline instead of post-processing in Node.
