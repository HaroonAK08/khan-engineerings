# 19 — Performance Verification

All measurements from a real Chrome driving a local stack against `khan-audit`, a throwaway restore of the 2026-11-22 export. **Production was never touched.** Before and after were measured under **identical conditions** (same dev server, same backend, same database, same 15 routes).

Reproduce:

```bash
cd frontend && node scripts/route-bench.cjs --json out.json
cd backend  && npm run bench
cd backend  && node scripts/bench-latency.js
cd backend  && node scripts/snapshot-responses.js /tmp/after
```

---

## 1. Headline — browser requests across 15 routes

### Cold (full page load per route)

| | Before | After | Change |
|---|---:|---:|---:|
| **API requests** | 382 | **142** | **−63 %** |
| **Duplicate requests** | 244 | **4** | **−98 %** |
| **Payload transferred** | 9,284 KB | **3,554 KB** | **−62 %** |
| Failed requests | 0 | 0 | — |

### Warm (client-side navigation)

| | Before | After | Change |
|---|---:|---:|---:|
| **API requests** | 260 | **99** | **−62 %** |
| **Duplicate requests** | 162 | **3** | **−98 %** |
| **Payload transferred** | 6,144 KB | **2,301 KB** | **−63 %** |

### Per route (cold)

```
route                              requests      duplicates       payload KB
/dashboard                         29 → 10          19 → 0          707 → 254
/dashboard/overview                24 → 9           15 → 0          462 → 122
/dashboard/inventory               25 → 10          15 → 0          502 → 162
/dashboard/inventory/finished      25 → 9           16 → 0          558 → 144
/dashboard/inventory/movements     28 → 11          19 → 2          699 → 210
/dashboard/production              26 → 10          16 → 0          566 → 151
/dashboard/production/history      25 → 9           16 → 0          887 → 472
/dashboard/products                24 → 9           15 → 0          568 → 228
/dashboard/builty                  23 → 8           15 → 0          496 → 156
/dashboard/party                   24 → 9           15 → 0          482 → 141
/dashboard/suppliers               23 → 8           15 → 0          455 → 115
/dashboard/claims                  30 → 12          20 → 2         1231 → 761
/dashboard/expenses/salaries       26 → 10          16 → 0          598 → 248
/dashboard/reports/receivables     25 → 9           16 → 0          516 → 175
/dashboard/reports/sales           25 → 9           16 → 0          555 → 214
```

---

## 2. Navigation speed

The headline number for daily use. An operator bouncing between screens:

| | Requests | Time |
|---|---:|---:|
| Revisiting a route, before | 23–30 per route | 700–1,000 ms |
| **Revisiting a route, after** | **0** | **4–6 ms** |

Measured directly:

```
/dashboard/builty    total=4ms  apiCalls=0
/dashboard/products  total=6ms  apiCalls=0
```

A screen revisited within the cache window now needs **no network at all**.

> **Honest caveat on wall-clock.** Dev-server timings for a *first* visit are dominated by on-demand route compilation and are not a meaningful before/after signal — in the warm pass they barely moved (8,738 ms → 8,749 ms total) even though requests fell 62 %. The reliable signals are request count, duplicate count, payload and memory, all measured exactly. The 4–6 ms figure above is a repeat navigation with the route already compiled, which is the realistic daily case.

---

## 3. Memory

| | Before | After |
|---|---:|---:|
| JS heap after walking 30 routes | 60 MB | **34 MB** (−43 %) |

No growth trend in either run. Separately verified by inspection:

- every `addEventListener` has a matching `removeEventListener` across `app/`, `components/`, `hooks/`, `lib/`, `stores/`
- every `setInterval` has a matching `clearInterval`

No leak was found, and none was invented.

---

## 4. Backend — previous gains intact, no regression

Re-run at 25 ms simulated per-operation latency (the Atlas shape):

| Endpoint | Original | Previous round | **This round** |
|---|---:|---:|---:|
| `production-margin` (12 months) | 6,829 ms | 1,174 ms | **1,168 ms** |
| `party-sales-margin` (12 months) | 7,942 ms | 1,361 ms | **1,362 ms** |
| `production` (list) | 452 ms | 81 ms | **79 ms** |
| `finance/monthly` | 685 ms | 145 ms | **146 ms** |
| `inventory/overview` | 196 ms | 126 ms | **125 ms** |

All within run-to-run noise. **No regression.**

### Builty list payload

| | Before | After |
|---|---:|---:|
| `GET /api/builty` | 261 KB · 697 rows | **~24 KB · 50 rows + true total** |

---

## 5. Correctness

This matters more than any timing number.

| Check | Result |
|---|---|
| **34 endpoint responses vs pristine HEAD** | **byte-identical** |
| Control run (HEAD vs HEAD) | clean — the comparison can detect a difference |
| Builty paging walk over 697 rows | 697 unique, 0 duplicates, 0 gaps |
| Production paging walk over 1,447 rows | 1,447 unique, 0 duplicates, 0 gaps |
| Reference cache (7 behaviours) | all pass, including the mid-flight write race |
| Retry policy (5 behaviours) | all pass, including "a POST is never retried" |
| Backend tests | 31 → **38**, all passing |
| Tests without a database | 38 total, 30 pass, 8 skip cleanly |
| `next build` | ✅ 75/75 pages, 0 type errors |
| ESLint | 0 errors, 3 warnings (all pre-existing) |
| Failed API requests across 30-route walk | **0** |

---

## 6. Tests executed

```
backend:  38 tests, 38 pass, 0 fail
  report-handouts      11   (pre-existing)
  concurrency           5
  request-cache         7
  production-list       8
  builty-list           7   (new this round)

standalone verifications:
  reference-cache       7 behaviours ✅
  retry policy          5 behaviours ✅

browser:
  30 route loads, 0 failed API requests, 0 unhandled page errors
```

---

## 7. Remaining issues

### Still open, measured

| Item | Current | Why not fixed |
|---|---|---|
| `/dashboard/claims` payload | 761 KB | The claims list populates full builty and product documents. Needs a projection; low urgency at 28 claims, will matter as it grows. |
| `/dashboard/production/history` payload | 472 KB | Day-grouped screen legitimately needs whole months (`all: true`). Bounded by the date filter. |
| `reports/position` | 37 round trips | Inside `allocateThisMonthFirst` — the receivables/payables engine, still untested. Those tests are the prerequisite and remain the highest-value missing tests in the system. |
| `next start` fails | `routesManifest.dataRoutes is not iterable` | **Pre-existing**, unmodified at HEAD. Vercel and the desktop standalone path don't use `next start`. |
| 3 ESLint warnings | cosmetic | Pre-existing. |

### Out of scope, still open

The business-correctness items from the original audit are untouched and still need decisions: the verified **508.5 kg** raw-stock divergence, the claims cold-start mass rewrite, absent database transactions, and the unweighted `$avg` purchase rate. See document 11 §9 and document 09.

---

## 8. Limitations

- **Local stack, not production.** Absolute numbers will differ; the relative improvements and the exact request/payload counts are the reliable part.
- **Backend latency figures are a simulation.** Per-operation delay is injected uniformly; real networks are variable.
- **Dev-server wall-clock is not a valid before/after signal** for first visits, as explained in §2. It is reported for transparency, not as evidence.
- **No multi-user concurrency testing.** Everything was measured single-session.
- **The reference cache has a 60 s TTL.** A change made by *another* user can be up to 60 s stale on this user's screen for reference lists (products, parties, suppliers, workers). This user's own writes are always immediate — every mutation invalidates. At 1–3 concurrent users this is a deliberate and safe trade; if the team grows, shorten the TTL or move these lists onto React Query with `refetchOnWindowFocus`.
