# 13 — Before / After Benchmarks

**Measured 2026-11-23.** Baseline is a pristine `git archive` of HEAD (`826a922`) run side by side with the optimised tree against the same throwaway database (`khan-audit`, a local restore of the 2026-11-22 export). **Production was never touched.**

Reproduce with:

```bash
cd backend
npm run bench                      # round trips, payload, local wall time
node scripts/bench-latency.js      # latency-bound wall time (the deployed shape)
node scripts/snapshot-responses.js /tmp/after   # output equivalence
```

---

## 1. The measurement that matters: latency-bound

Local MongoDB answers in well under a millisecond, which **hides the cost this system actually pays**. It runs on Vercel against Atlas, where every round trip costs real network time, and its slowest endpoints were slow because of *sequential* round trips rather than scan size.

`scripts/bench-latency.js` injects a fixed delay into every Mongo operation so the measurement reflects the deployed shape.

### At 10 ms per operation

| Endpoint | Before | After | Change |
|---|---:|---:|---:|
| `finance/production-margin` (12 months) | 3,295 ms | **705 ms** | **−79 %** |
| `finance/party-sales-margin` (12 months) | 3,794 ms | **793 ms** | **−79 %** |
| `finance/monthly?months=12` | 321 ms | **90 ms** | **−72 %** |
| `production` (list) | 416 ms | **52 ms** | **−87 %** |
| `inventory/overview` | 140 ms | **96 ms** | −31 % |
| `finance/production-margin` (1 month) | 422 ms | 393 ms | −7 % |

### At 25 ms per operation

| Endpoint | Before | After | Change |
|---|---:|---:|---:|
| `finance/production-margin` (12 months) | 6,829 ms | **1,174 ms** | **−83 %** |
| `finance/party-sales-margin` (12 months) | 7,942 ms | **1,361 ms** | **−83 %** |
| `finance/monthly?months=12` | 685 ms | **145 ms** | −79 % |
| `production` (list) | 452 ms | **81 ms** | −82 % |
| `inventory/overview` | 196 ms | **126 ms** | −36 % |

**The `/dashboard` page issues the two margin calls in parallel, so its server time is the slower of the two: ~7.9 s → ~1.4 s at 25 ms RTT.**

> ⚠️ **The old code was likely timing out in production.** `config/db.js` sets `socketTimeoutMS: 5000`. At 25 ms RTT the year-range margin endpoints took 6.8 s and 7.9 s — above that ceiling. Anyone opening the dashboard on a 12-month range was plausibly hitting a timeout or a Vercel function limit. That is now ~1.2–1.4 s.

---

## 2. Database round trips and payload (local, 3 runs, median)

| Endpoint | ops before | ops after | payload before | payload after |
|---|---:|---:|---:|---:|
| `finance/production-margin` (year) | 283 | **229** | 84 KB | 84 KB |
| `finance/party-sales-margin` (year) | 323 | **269** | 65 KB | 65 KB |
| `dashboard` | 134 | **122** | 8 KB | 8 KB |
| `finance/charges-calculator` | 44 | **39** | 6 KB | 6 KB |
| `finance/production-margin` (month) | 38 | **35** | 57 KB | 57 KB |
| `finance/party-sales-margin` (month) | 41 | **38** | 36 KB | 36 KB |
| **`inventory/overview`** | 13 | **7** | 0.7 KB | 0.7 KB |
| **`production` (list)** | 3 | 4 | **2,456 KB** | **85 KB** |
| **`inventory/movements`** | 3 | 4 | **239 KB** | **48 KB** |
| `inventory/alerts` | 6 | 6 | 0.1 KB | 0.1 KB |
| `builty` | 3 | 3 | 261 KB | 261 KB |
| `reports/receivables` | 8 | 8 | 175 KB | 175 KB |
| **Total across 19 endpoints** | **1,100** | **965** (−12 %) | | |

Two things to read carefully here:

- **Round-trip count fell only 12 %, but latency-bound wall time fell 79–83 %.** Most of the remaining 965 operations are genuinely distinct work (54 expense aggregations across 12 month segments, etc.). The win came from stopping them being *sequential*, not from deleting them. Round-trip count is the wrong headline; the latency-bound table above is the right one.
- `production` and `movements` gained one operation each — the `countDocuments` that pagination needs to report a true total. That is a deliberate trade: one cheap counting query in exchange for a 96 % smaller payload and an honest record count.

### Payload reductions

| Endpoint | Before | After | Change |
|---|---:|---:|---:|
| `GET /api/production` (unbounded) | 2,456 KB · 1,447 rows | **85 KB · 50 rows** | **−96.5 %** |
| `GET /api/production` (one month, `all=true`) | 2,456 KB | **358 KB · 211 rows** | −85 % |
| `GET /api/inventory/movements` | 239 KB · 500 rows (silently clipped) | **48 KB · 100 rows + true total** | −80 % |

---

## 3. Frontend bundles

Production build, `next build --turbopack`, both runs clean (75/75 pages, 0 type errors).

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Shared first-load JS | 253 kB | **245 kB** | −8 kB |
| Dashboard routes, mean first load | 379.4 kB | **361.0 kB** | **−18.4 kB** |
| Dashboard routes, worst case | 457 kB | **439 kB** | −18 kB |
| `/dashboard` | 375 kB | **357 kB** | −18 kB |
| `/dashboard/suppliers` | 444 kB | **426 kB** | −18 kB |
| `/download`, `/_not-found` | 232 / 229 kB | **223 / 220 kB** | −9 kB |
| `/dashboard/overview` (new) | — | 343 kB | new route |

Every route got smaller **while adding** React Query's observer runtime, the new overview page, and four new shared components. Three changes paid for it:

1. The voice stack (~4,600 lines) and the calculator were imported by the topbar, which is in the dashboard layout — so they shipped with **every** dashboard route. Now `next/dynamic`.
2. The React Query provider moved from the root layout to the dashboard layout, keeping the observer runtime out of the login page's chunk.
3. The new confirmation dialog uses `useI18n`, which pulls the 5,011-line message catalogue. Mounting it in the dashboard layout rather than the root layout kept that out of the root chunk too.

### Request behaviour

| | Before | After |
|---|---|---|
| Client cache | none | React Query, per-data-class policy |
| Duplicate requests | one per component mount | deduplicated by query key |
| Request cancellation | **none in the codebase** | `AbortSignal` on every migrated query |
| Revisiting a screen | full refetch | served from cache, revalidated in background |
| Background refresh | full-page spinner | previous data stays, subtle "Updating…" strip |

---

## 4. Correctness verification

This is the part that matters more than any timing number.

### Output equivalence — 34 endpoints, byte-identical

`scripts/snapshot-responses.js` captures each response, strips volatile fields, canonicalises key and array order, and writes it to disk. Pristine HEAD and the optimised tree were snapshotted and diffed.

```
control (HEAD vs HEAD, same code):         clean  ✅
HEAD vs optimised:  34/34 identical        ✅
```

The control run is load-bearing: it proves the comparison can actually detect a difference and is not trivially passing.

> **Why array order is normalised.** Four endpoints returned rows in a different order on two runs of *the same unmodified code*. They build rows from a Mongo `$group`, whose output order is unspecified, then sort only by name — so rows tying on name swap places between runs. Order was already not part of the contract; comparing it would have produced false alarms rather than catching real regressions. Values, counts and totals are compared exactly.

Covered: finance overview / production-margin (3 ranges) / party-margin (2 ranges) / monthly / year-progress / charges-calculator / product-profit / manufacturing / expense-breakdown / customer-revenue / supplier-expenses / casting-rates, inventory overview / alerts / stock / finished / reports (2 as-of dates), production reports, builty reports, receivables / payables / position / yearly / received / paid / monthly-receivables, claims, dashboard, customers-overview statement.

### Aggregation rewrite proved equivalent

`sumNetConsumedForMaterial` was rewritten from "load all 1,447 batches into Node and loop" to a single aggregation. The old implementation was kept verbatim in a test harness and compared:

```
PASS  scrap  legacy=96379.985  new=96379.985
PASS  daig   legacy=186899.73  new=186899.73
ALL PASS (incl. 5 exclude-batch cases)
```

The `excludeBatchId` path matters because it is what a production edit uses.

### Pagination proved lossless

```
paging walk: seen=1447  unique=1447  duplicates=0  expected=1447
✅ pagination covers every row exactly once
```

Walking every page at size 50 returns each of the 1,447 batches exactly once — no gaps, no repeats. The sort always carries `createdAt` and `_id` as tiebreakers, which is what makes that true.

### Test suite

| | Before | After |
|---|---:|---:|
| Tests | 11 | **31** |
| Passing | 11 | **31** |
| Files | 1 | 4 |

New: `concurrency.test.js` (5), `request-cache.test.js` (7), `production-list.test.js` (8, DB-backed).

DB-backed tests skip cleanly when no local database is present, so `npm test` stays green on a fresh checkout:

```
with DB:     31 tests, 31 pass,  0 skipped
without DB:  31 tests, 23 pass,  8 skipped
```

### Build and lint

| | Before | After |
|---|---|---|
| `next build` | ✅ 74/74 pages | ✅ **75/75** pages |
| TypeScript errors | 0 | **0** |
| ESLint | 0 errors, 8 warnings | 0 errors, **3 warnings** |
| `npm test` (backend) | 11/11 | **31/31** |

---

## 5. What did *not* improve, and why

| Endpoint | ops | Why it was left alone |
|---|---:|---|
| `reports/position` | 37 → 37 | `purchases.find ×8` + `ledgerentries.find ×7` are per-supplier payment allocations. Batching them means restructuring `allocateThisMonthFirst`, which is the core receivables/payables engine — out of scope for a performance pass, and it has no tests yet. |
| `reports/payables` | 17 → 17 | Same shape, same reason. |
| `finance/monthly` | 125 → 125 | Ops unchanged by design: the same 125 queries now run concurrently. Wall time fell 72–79 % (see §1). |
| `builty` list | 261 KB | Not yet paginated — the list screen has no paging UI, and adding server paging without it would silently truncate. Queued as follow-up work. |
| `reports/receivables` | 175 KB | Report screens expect the whole set for client-side grouping and export. |

---

## 6. Honest limitations

- **All figures are from a local restore, not production.** Absolute numbers will differ. The latency-bound table is a *simulation* of Atlas round-trip cost, not a measurement of Atlas itself; it models per-operation delay uniformly, where real networks are variable. The relative improvement is the reliable part.
- **Indexes were applied to the scratch database only.** Production still needs `npm run indexes:apply`. Their effect at 6 MB of data is not measurable; they were chosen on query shape, not on an observed slow query.
- **No concurrent-load testing.** Everything was measured single-request. Raising segment concurrency to 6 interacts with `maxPoolSize: 5` — see the note in document 11.
- **Frontend timings were not measured in a browser.** Bundle sizes are from the build; no Lighthouse or field data was collected.
- **The `/api/claims` cold-start cost is not in these numbers.** Its mass-write repair is guarded by a module-level flag, so it ran before the first measured request. It remains a real production cost on every serverless cold start and is unaddressed (out of scope — it touches ledger data).
