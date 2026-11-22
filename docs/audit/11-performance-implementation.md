# 11 — Performance Implementation

What was changed, why, and how each change was proved safe. Benchmark numbers live in `13-before-after-benchmarks.md`.

**Nothing in this document changes a business rule.** Every financial, stock, production and salary calculation produces the same output as before — verified endpoint by endpoint (see §7).

---

## 1. Approach

Three rules governed the work:

1. **Measure first, then change.** A baseline was captured from a pristine `git archive` of HEAD before a line was edited.
2. **Prove equivalence, not plausibility.** Every optimisation was followed by a diff of 34 endpoint responses against pristine HEAD. A control run (HEAD vs HEAD) proves the comparison can detect a difference.
3. **Optimise the deployed shape.** The system runs on Vercel against Atlas. Local MongoDB hides its actual bottleneck — sequential round trips — so a latency-injecting benchmark was built to measure the case that matters.

### New tooling (kept in the repo)

| File | Purpose |
|---|---|
| `backend/scripts/bench.js` | Round trips, payload size, wall time per endpoint. `npm run bench` |
| `backend/scripts/bench-latency.js` | Same, with simulated per-operation network latency |
| `backend/scripts/snapshot-responses.js` | Captures responses for before/after diffing. `npm run snapshot` |
| `backend/src/scripts/ensure-indexes.js` | Idempotent, documented index management. `npm run indexes:check` / `indexes:apply` |

All three refuse to run against a `mongodb+srv://` URI, so they cannot be pointed at production by accident.

---

## 2. Request-scoped memoisation

**New file:** `backend/src/utils/request-cache.js` · mounted in `app.js`

A twelve-month report re-read the single settings document 36 times, re-ran the same all-time purchase-rate aggregate 38 times, and recomputed the same month's finished-kg figure from several call sites. None of those can change during one request.

`AsyncLocalStorage` gives each request a `Map`; `memo(key, loader)` runs a loader at most once per request and shares the in-flight promise between concurrent callers.

**The safety property that makes this acceptable:**

```js
function requestCache(req, _res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  return storage.run({ cache: new Map(), ... }, next);
}
```

**The cache is never installed for a write.** A `POST` that saves and then re-reads always sees fresh data, because there is no store to read from. Outside a request (scripts, tests, the desktop launcher) `memo` simply calls through.

A rejection is never cached, so a transient failure can be retried within the same request.

### Memoised reads

| Site | Was |
|---|---|
| `settings.getWasteSettings / getTaxSplit / getElectricitySplit / getPayrollPeriod` | `appsettings.findOne ×36` per year report |
| `purchases.aggregateStockForMaterial` | re-run by overview, alerts and several finance paths |
| `production.sumNetConsumedForMaterial` | full batch scan, 4–6× per inventory request |
| `inventory.avgSoldPrices` | unbounded Builty aggregate, 2–3× per request |
| `inventory.getFinishedStock` | keyed on its filter arguments |
| `finance.getAvgMaterialRates` + its all-time fallback | same fallback recomputed per month segment |
| `finance.getFamilyFinishedKg / sumElectricityInRange / getSalesmanSoldKg` | same window requested from several call sites |

Only **derived, read-only projections** are cached — never a mongoose document. `settings.getAppSettings()` (which writers use and then `.save()`) is untouched; read paths call a new `readAppSettings()`. `setWastePercent` calls `invalidate("settings:")` after saving as belt-and-braces.

**Tests:** `backend/test/request-cache.test.js` — 7 cases covering GET memoisation, per-request isolation, no-cache-on-write for all four write verbs, pass-through outside a request, rejections not cached, concurrent callers sharing one load, and prefix invalidation.

---

## 3. Parallel month segments — the single biggest win

**File:** `backend/src/modules/finance/finance.service.js` · **New:** `backend/src/utils/concurrency.js`

Multi-month reports are deliberately computed per calendar month and merged, which is what keeps totals additive (Sep + Oct = Sep–Oct). That design is correct and was preserved. The problem was purely that the loop awaited:

```js
// before
const parts = [];
for (const seg of segments) {
  parts.push(await computeProductionMarginForPeriod({ ... }));   // 12× serial
}
```

```js
// after — concurrent, bounded, order-preserving
const parts = await mapWithConcurrency(segments, SEGMENT_CONCURRENCY, (seg) =>
  computeProductionMarginForPeriod({ ... })
);
```

`mapWithConcurrency` returns results **in input order**, which matters because the merge folds them in sequence and floating-point accumulation order must not change.

Applied to three loops:

| Function | Note |
|---|---|
| `getProductionMargin` | straight fan-out |
| `getPartySalesMargin` | straight fan-out |
| `resolveElectricityAccrualForRange` | resolves segments concurrently, then **folds in the original order** so the running rounded total and `lastEstimate` are bit-identical |
| `getMonthly` | 12 sequential `getOverview` calls → concurrent, mapped back in order |

**Result at 25 ms RTT: 6,829 ms → 1,174 ms (−83 %).**

**Tests:** `backend/test/concurrency.test.js` — 5 cases including an explicit assertion that the parallel result equals a serial loop's result over the same inputs, and that the concurrency bound is respected.

> **Operational note:** concurrency is 6 (`REPORT_SEGMENT_CONCURRENCY`) while `maxPoolSize` is 5. Six concurrent segments will queue slightly on the pool. Raising the pool to ~15 would help further but changes connection behaviour on a serverless platform, so it is **flagged for your decision** rather than changed here.

---

## 4. Eliminating duplicated work

### `inventory/overview` computed the same figures three times

`getAlerts()` internally re-called both of its siblings:

```js
// before: productionbatches.find ×4, purchases.aggregate ×4 for one request
Promise.all([ purchaseService.getStock(), getFinishedStock(), getAlerts(), count ])
```

```js
// after: load once, hand the results down
const [raw, finished, movementCount] = await Promise.all([...]);
const alerts = await getAlerts({ finished, raw });
```

`getAlerts()` still works with no arguments. **13 → 7 round trips.**

### Full-collection scan → aggregation

`sumNetConsumedForMaterial` loaded every non-cancelled batch into Node and summed in JavaScript. It is now one aggregation that mirrors the original branching exactly: batches with a non-empty `inputs[]` contribute matching positive quantities; batches without fall back to the legacy scrap fields, and only for scrap.

Proved equivalent by keeping the original implementation verbatim in a harness:

```
PASS  scrap  legacy=96379.985  new=96379.985
PASS  daig   legacy=186899.73  new=186899.73
ALL PASS (incl. 5 exclude-batch cases)
```

### N+1 product lookups

`builty.normalizeItems` issued one `Product.findById` per line. Now one `find({_id: {$in: […]}})`.

Validation order was preserved deliberately: the "Product is required on each line" check still runs per line, in order, **before** any "Product not found" — so a malformed request produces exactly the same error as before.

---

## 5. Pagination

### Production list — 2,456 KB → 85 KB

**Files:** `production.service.js`, `production.controller.js`, `frontend/src/lib/production-api.ts`

`GET /api/production` returned all 1,447 batches, fully populated, on every call.

Now: default page size 50, capped at 200, with `page`, `limit`, `sortBy`, `sortDir` and an `all=true` escape hatch.

**Contract evolution was additive and the frontend was updated in the same change:**

```jsonc
{ "batches": [ ... ],                      // unchanged — existing readers still work
  "page": { "page": 1, "pageSize": 50, "total": 1447,
            "totalPages": 29, "hasMore": true, "returned": 50, "all": false } }
```

Two screens — Production History and the unified History timeline — group batches by day and run day-level bulk actions, so a page would break them. Both now pass `all: true` explicitly, and both are already bounded by the date-range filter (one month = 358 KB, not 2,456 KB). **This was the regression risk in the whole pagination change and it was handled deliberately rather than discovered later.**

Sorting is allowlisted (`productionDate`, `batchNo`, `status`, `family`, `createdAt`); an unknown field falls back to the default ordering and never reaches Mongo. Every sort carries `createdAt` and `_id` as tiebreakers, which is what makes paging lossless.

The `batchNo` search also gained `escapeRegex` — user input was previously interpolated straight into a `RegExp`.

**Proof:**
```
paging walk: seen=1447  unique=1447  duplicates=0  expected=1447
✅ pagination covers every row exactly once
```

**Tests:** `backend/test/production-list.test.js` — 8 cases covering default page size, the cap, lossless paging, `all=true`, unchanged default ordering, the sort allowlist (including a `$where` injection attempt), filters reflected in `total`, and regex escaping.

### Stock movements — the silent truncation

`listMovements` ended in a bare `.limit(500)` with no total, so a user reconciling stock saw a clipped ledger with no indication (4,814 movements exist). It is now properly paginated and **returns a true `total`**, which the UI displays as "Showing 1–100 of 4,814".

---

## 6. Indexes

**New:** `backend/src/scripts/ensure-indexes.js` — dry-run by default, `--apply` to create, every index carrying a written justification.

```bash
npm run indexes:check    # report what is missing
npm run indexes:apply    # create them (idempotent, background build)
```

| Collection | Index | Why |
|---|---|---|
| `builties` | `{customer, builtyDate}` | payment sync and every statement load one party in date order |
| `builties` | `{items.product}` | `avgSoldPrices`, production sales join, party margin |
| `stockmovements` | `{itemType, movementDate}` | every as-of balance filters on both |
| `stockmovements` | `{refType, refId}` | `deleteMovementsByRef` on every edit and delete |
| `productionbatches` | `{status, productionDate}` | every report filters status within a window |
| `customerledgerentries` | `{customer, entryDate}` | ledger and balance reads |
| `ledgerentries` | `{supplier, entryDate}` | supplier ledger and balance sync |
| `customerpayments` | `{customer, paymentDate}` | payment allocation |

Also detected (not dropped without `--drop-stale`): `customerpayments.order_1`, an index on a field no longer on the schema.

> ⚠️ **Applied to the scratch database only.** Production needs `npm run indexes:apply` during a quiet period. At 6 MB their effect is not measurable today — they were chosen on query shape to pre-empt growth.

---

## 7. How correctness was proved

| Check | Result |
|---|---|
| 34 endpoint responses vs pristine HEAD | **identical** |
| Control run (HEAD vs HEAD) | clean — the comparison can detect a difference |
| `sumNetConsumedForMaterial` vs original JS | identical, incl. 5 exclude-batch cases |
| Pagination walk over 1,447 rows | 0 gaps, 0 duplicates |
| Backend tests | 11 → **31**, all passing |
| `next build` | ✅ 75/75 pages, 0 type errors |
| ESLint | 0 errors, warnings 8 → **3** |

Snapshot comparison normalises array order, because four endpoints already returned rows in a different order on two runs of unmodified code (`$group` output order is unspecified and the services sort only by name). Values, counts and totals are compared exactly. This is explained in full in `13-before-after-benchmarks.md` §4.

---

## 8. Files changed (backend)

| File | Change |
|---|---|
| `src/utils/request-cache.js` | **new** — GET-only request-scoped memoisation |
| `src/utils/concurrency.js` | **new** — bounded, order-preserving concurrent map |
| `src/scripts/ensure-indexes.js` | **new** — documented, idempotent index management |
| `scripts/bench.js`, `scripts/bench-latency.js`, `scripts/snapshot-responses.js` | **new** — measurement and equivalence tooling |
| `test/concurrency.test.js`, `test/request-cache.test.js`, `test/production-list.test.js` | **new** — 20 tests |
| `src/app.js` | mount the request cache |
| `src/modules/finance/finance.service.js` | 4 loops parallelised; 5 read helpers memoised |
| `src/modules/inventory/inventory.service.js` | overview dedup; `getAlerts` accepts preloaded data; movements paginated; 2 reads memoised |
| `src/modules/inventory/inventory.controller.js` | return page metadata |
| `src/modules/production/production.service.js` | scan → aggregation; list paginated/sorted; regex escaping |
| `src/modules/production/production.controller.js` | return page metadata |
| `src/modules/purchases/purchase.service.js` | stock aggregate memoised |
| `src/modules/settings/settings.service.js` | read-only accessor + memoised projections |
| `src/modules/builty/builty.service.js` | N+1 → `$in` |
| `src/modules/claims/claim.service.js` | material rate memoised |
| `package.json` | `bench`, `snapshot`, `indexes:check`, `indexes:apply` |

---

## 9. Deliberately NOT done — needs your approval

Each of these is a real improvement that falls outside the agreed scope because it touches money, stock or history.

| Item | Why it was skipped |
|---|---|
| **Raw-stock single source of truth** (audit INV-001) | `purchaseService.getStock()` ignores `StockMovement`, so claim returns are invisible to it — a verified **508.5 kg daig** divergence from the as-of report. Fixing it changes a reported inventory figure. The audit explicitly asked that this phase not touch it. |
| **`GET /api/claims` mass rewrite** (audit DATA-002) | Listing claims rewrites all 697 builties and their ledger rows, once per serverless cold start. Removing it is correct but touches ledger data. |
| **Transactions on multi-document writes** (audit DATA-001) | No `startSession` anywhere. In scope for reliability, not for a performance pass, and it needs its own test suite first. |
| **`reports/position` / `payables` (37 and 17 round trips)** | The per-supplier `find` loops live inside `allocateThisMonthFirst`, the core receivables/payables engine. It has **no tests**. Writing those tests is the prerequisite — they are the highest-value missing tests in the whole system (audit TEST-001). |
| **Builty list pagination (261 KB)** | Needs paging UI on that screen first; adding server paging alone would silently truncate. |
| **Raising `maxPoolSize` 5 → 15** | Changes connection behaviour on serverless. One-line change, your call. |
| **Removing the no-op `middleware.ts`** | 39 kB running on every dashboard navigation for zero effect — but it sits next to the auth story, which is out of scope. |
| **Unweighted `$avg: "$ratePerKg"`** (audit PERF-004) | Mathematically wrong (averages rates, not cost per kg) and disagrees with `product-cost.js` — but correcting it **changes a reported rate**, so it is a business-figure change. |
