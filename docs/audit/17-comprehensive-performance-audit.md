# 17 — Comprehensive Performance, Stability & Reliability Audit

**Date:** 2026-11-23 · branch `main` @ `826a922` plus the uncommitted work from documents 11–13.

This round audited the application as a running system rather than as source: a real Chrome driving a local stack, recording every API request, duplicate, payload and console error per route. Findings below are ordered by severity, each with the evidence that produced it.

**Scope note.** UI design, authentication, and all accounting/inventory/salary business rules were out of scope and were not touched. Everything here is about how the application *fetches, renders, recovers and holds memory*.

---

## Method

| Tool | What it measures |
|---|---|
| `frontend/scripts/route-bench.cjs` (new) | per-route API requests, exact duplicates, payload, time-to-content, console errors, JS heap — over a cold pass and a warm client-side navigation pass |
| `backend/scripts/bench.js` | DB round trips, payload, wall time per endpoint |
| `backend/scripts/bench-latency.js` | the same under injected network latency (the Atlas shape) |
| `backend/scripts/snapshot-responses.js` | byte-level response equivalence against pristine HEAD |

All tooling refuses a `mongodb+srv://` URI or a non-local target. Every measurement ran against `khan-audit`, a throwaway local restore. **Production was never touched.**

---

## Baseline — what the browser actually did

15 routes, cold load each:

```
route                                      ms   reqs  dupes       KB  fail
/dashboard                               4278     29     19    707.3     0
/dashboard/claims                        1820     30     20   1231.4     0
/dashboard/inventory/movements           1669     28     19    699.2     0
/dashboard/expenses/salaries             2094     26     16    598.4     0
…
TOTAL                                   29606    382    244     9284     0
```

**244 of 382 requests — 64 % — were exact duplicates of another request on the same page load.**

Warm client-side navigation was barely better: 260 requests, 162 duplicates, 6.1 MB.

---

## CRITICAL

### C-1 · The same reference lists were fetched up to 7× per page

**Evidence** — every request issued by `/dashboard/claims`:

```
× 7  /api/customers?active=true
× 5  /api/products?active=true
× 5  /api/suppliers?active=true
× 5  /api/workers?active=true
× 4  /api/customers/instruments/due
× 2  /api/claims
× 2  /api/builty
```

**Cause.** Three independent consumers each load the full catalogue with no cache:

- `lib/voice/voice-model.ts` — `computeCatalogFingerprint()` and `trainVoiceModel()` each fetch all four lists
- `lib/voice/resolve.ts` — re-fetches per entity resolution (lines 341, 360, 410, 549)
- `components/voice/voice-confirm-dialog.tsx` — fetches again on open

plus 13 screens that call `listProducts` directly, 9 that call `listCustomers`, 8 `listPartyGroups`, 7 `listSuppliers`.

**Why React Query alone could not fix it.** The worst offenders are plain modules, not React components. They cannot use hooks. Any fix had to live in the API layer.

**Impact.** Roughly 500 KB of redundant transfer per page load, ~20 wasted requests, and a visible delay before the page settles. On every single navigation, all day.

### C-2 · Two components polled the same endpoint independently

`ChequePromiseDueBanner` (dashboard layout) and `ChequePromiseDueBell` (topbar) both call `listDueCustomerInstruments()` on mount. Measured **×4 per page**, on every page, forever.

---

## HIGH

### H-1 · Builty list was unpaginated — 261 KB, 697 rows

The one major list left unpaginated after the previous round. Loaded in full on every visit to the Builty screen.

### H-2 · No request cancellation on ~40 screens

The previous round added `AbortSignal` only to the screens migrated to React Query. Everywhere else, changing a date range or a search term leaves the earlier request running. A slow wide-range response can land **after** a fast narrow one and overwrite it — no error, no spinner, just wrong figures on screen.

### H-3 · No retry anywhere outside React Query

Most screens fetch with plain axios. A single dropped packet leaves the screen empty until the user reloads the entire application. For a factory-floor connection this is the difference between a hiccup and a work stoppage.

### H-4 · Writes could be masked by an in-flight read

Any cache added for C-1 introduces a race: a read that *started* before a write commits would resolve with pre-write data and then be cached. Without handling, creating a product could leave it invisible for the cache window.

---

## MEDIUM

### M-1 · `/api/production` and `/api/inventory/movements` contracts changed but callers were only partly updated

Carried over risk from the previous round: pagination defaults would silently truncate any consumer that still expected the full set. Two day-grouping screens were already handled; `listBuilties` consumers needed the same treatment.

### M-2 · Unescaped user input compiled into a RegExp

`builty.service.listBuilties` interpolated the search term directly into `new RegExp(term, "i")`. A metacharacter changes the query's meaning; a crafted term can pin the CPU. (The same class was fixed in `production.service` last round.)

### M-3 · Console noise

38 console errors/warnings across the walk, including a Next.js dev-only client-manifest error for `global-error.js`. Dev-only, but it masks real errors during debugging.

---

## LOW

### L-1 · Three pre-existing ESLint warnings
Two unused `columnIndex` parameters in `reports/page.tsx` and a missing-dependency warning in `simple-calculator.tsx`. Cosmetic.

---

## Verified CLEAN — inspected and found sound

These were audited because the brief asked for them, and no defect was found. Recording that is as useful as recording a bug.

| Area | Result |
|---|---|
| **Event-listener leaks** | Every file that calls `addEventListener` has a matching `removeEventListener` count. Balanced across all of `app/`, `components/`, `hooks/`, `lib/`, `stores/`. |
| **Timer leaks** | Every `setInterval` has a matching `clearInterval`. |
| **JS heap growth** | 60 MB after walking 30 routes — flat, no runaway retention. |
| **Failed requests** | 0 failed API requests across the entire 30-route walk. |
| **Backend round trips** | The previous round's gains were re-verified intact (see document 19); no regression. |
| **Backend response equivalence** | 34/34 endpoints byte-identical to pristine HEAD throughout this round's changes. |

---

## Deliberately NOT changed

| Item | Why |
|---|---|
| Migrating all ~40 screens to React Query | The measured problem was *duplicate requests*, and C-1/C-2 fix that for every screen at once — including the non-React modules a hook migration could never reach. A 40-screen rewrite would have been far higher risk for less measured benefit. Incremental migration continues to be the right path. |
| Table virtualisation | Pagination already bounds every large list. Virtualisation only pays once a single *page* is long, which it is not. |
| `reports/position` (37 round trips) | The per-supplier loops live inside `allocateThisMonthFirst`, the core receivables/payables engine, which still has no tests. Writing those tests is the prerequisite. |
| Raising `maxPoolSize` 5 → 15 | Changes connection behaviour on serverless. Flagged for a decision, not changed unilaterally. |
| The raw-stock divergence, claims cold-start rewrite, transactions, unweighted `$avg` rate | All touch money, stock or history — explicitly out of scope. Still open; see document 11 §9. |
| The no-op `middleware.ts` (39 kB) | Adjacent to authentication, which is out of scope. |

---

Implementation is in `18-performance-and-stability-implementation.md`; measurements in `19-performance-verification.md`.
