# 18 — Performance & Stability Implementation

Findings are in `17-comprehensive-performance-audit.md`; measurements in `19-performance-verification.md`.

**UI design was not touched.** No colour, font, spacing, layout, component appearance or page design was changed. The only visual addition is a pagination bar on the Builty list, matching the one already shipped on Production and Stock Movements. **No business rule was changed** — 34/34 API responses remain byte-identical to pristine HEAD.

---

## 1. Shared reference-data cache — the main fix

**New:** `frontend/src/lib/reference-cache.ts`

The audit measured `/api/customers?active=true` requested **7×** and `/api/products?active=true` **5×** on a single page load. The duplicates came from three consumers that each loaded the full catalogue independently, plus 13 screens calling `listProducts` directly.

Two of those three consumers — `lib/voice/voice-model.ts` and `lib/voice/resolve.ts` — are **plain modules, not React components**. They cannot use hooks, so React Query could never have fixed them. The cache therefore lives in the API layer, where it fixes every caller at once.

```ts
export function cachedGet<T>(key: string, loader: () => Promise<T>, ttl = 60_000): Promise<T>
```

Two mechanisms, both necessary:

- **in-flight sharing** — three components mounting together await one request
- **TTL** — a later caller within 60 s reuses the resolved value

Wired into: `listProducts`, `listCustomers`, `listPartyGroups`, `listSalesmen`, `listSuppliers`, `listWorkers`, `listDueCustomerInstruments`.

### Correctness is the hard part, not the caching

**Every write invalidates.** 17 mutation functions now call `invalidateReference(scope)` — create/update/delete for products, customers, party groups, salesmen, suppliers, workers, and all four instrument mutations. Inserted by matching the function's closing parenthesis so a multi-line signature could not be corrupted (a naive brace-count attempt did exactly that and was reverted before it shipped).

**The write race is closed.** A read that *started* before a write commits would otherwise resolve with pre-write data and be cached for the full TTL — so a newly created product could stay invisible for a minute. The cache records when each prefix was last invalidated and refuses to store a load whose prefix was invalidated mid-flight. The caller still gets its result; nobody else reuses it.

**Rejections are never cached**, so a failed load retries immediately.

**Cleared on logout** (`stores/auth-store.ts`), so one session's data cannot leak into the next.

### Verified

Seven behaviours asserted against the compiled module (`node /tmp/refcache.test.mjs` pattern, reproducible):

```
✅ TTL reuse · in-flight sharing · invalidation forces reload
✅ prefix scoping · mid-flight write invalidates · rejections not cached
✅ key order does not matter
```

---

## 2. Retry with backoff — covering the screens React Query does not

**File:** `frontend/src/lib/api.ts`

Most screens still fetch with plain axios, so a single dropped packet left them empty until a full app reload.

The policy is deliberately narrow, because the dangerous mistake here is retrying a write:

| Rule | Reason |
|---|---|
| **GET/HEAD only** | A POST that timed out may already have been applied. Repeating it could double-post a payment or a production run. |
| **Network errors, timeouts and 5xx only** | A 4xx means the request was wrong. A **409 is the same-day duplicate question** and must reach the user, not be silently retried. |
| **Never retry a cancelled request** | Cancellation is intentional. |
| **2 retries, exponential backoff + jitter** | Jitter prevents every open screen retrying in lockstep after a brief outage. |

### Verified

```
✅ transient 5xx on GET recovers after 2 retries
✅ persistent 5xx gives up (1 original + 2 retries, then stop)
✅ a POST is NEVER retried — 1 request only
✅ a 409 passes straight through to the user
✅ a cancelled request is not retried
```

---

## 3. Builty list pagination

The last major unpaginated list — 261 KB, 697 rows on every visit.

**Backend** (`builty.service.js`, `builty.controller.js`): default 50, capped 200, `page`/`limit`/`sortBy`/`sortDir`, plus `all=true` for screens that need whole date ranges. Response is additive:

```jsonc
{ "builties": [...],        // unchanged — existing readers still work
  "page": { "page": 1, "pageSize": 50, "total": 697, "totalPages": 14,
            "hasMore": true, "returned": 50, "all": false } }
```

Sorting is allowlisted; an unknown field falls back to the default and never reaches Mongo. Every sort carries `createdAt` and `_id` as tiebreakers, which is what makes paging lossless.

**The regression risk, handled deliberately.** Changing the default would silently truncate three existing consumers. Each was traced and given `all: true`:

- `app/dashboard/history/page.tsx` — day-grouped timeline
- `app/dashboard/reports/page.tsx` — builty picker for a party
- `lib/voice/resolve.ts` — party builty lookup

**Frontend:** `listBuiltiesPage()` added alongside `listBuilties()`; the Builty screen now pages, with the same `TablePagination` component already used elsewhere, showing **"Showing 1–50 of 697 records"**.

### Verified

```
paging walk: seen=697  unique=697  duplicates=0   ✅ every row exactly once
```

Plus 7 new tests in `backend/test/builty-list.test.js`.

---

## 4. Request cancellation and race prevention

**File:** `app/dashboard/builty/page.tsx` (pattern; the previously-migrated screens already had it)

```ts
const controller = new AbortController();
const timer = setTimeout(() => void load(controller.signal), 200);
return () => { clearTimeout(timer); controller.abort(); };
```

Debounce alone was never enough: it prevents a request per keystroke but does not stop an earlier slow request from landing **after** a newer fast one and overwriting correct data. A cancelled request is now recognised (`ERR_CANCELED`) and does not raise an error toast.

Filter changes also reset to page 1, so a narrower result set cannot strand the user on a page that no longer exists.

---

## 5. Input safety

`builty.service.listBuilties` interpolated the raw search term into `new RegExp(term, "i")`. A metacharacter changed the query's meaning and a crafted term could pin the CPU. Now escaped, matching the fix already applied to `production.service`.

---

## 6. Files changed

### Frontend

| File | Change |
|---|---|
| `lib/reference-cache.ts` | **new** — TTL + in-flight sharing + write-race handling |
| `lib/api.ts` | retry with backoff for idempotent requests only |
| `lib/production-api.ts` | `listProducts` cached; 3 mutations invalidate |
| `lib/sales-api.ts` | customers / party-groups / salesmen / due-instruments cached; 12 mutations invalidate; `listBuiltiesPage` added |
| `lib/materials-api.ts` | `listSuppliers` cached; 3 mutations invalidate |
| `lib/workers-api.ts` | `listWorkers` cached; 2 mutations invalidate |
| `stores/auth-store.ts` | clears the cache on logout |
| `app/dashboard/builty/page.tsx` | pagination, cancellation, filter-resets-page |
| `app/dashboard/history/page.tsx`, `app/dashboard/reports/page.tsx`, `lib/voice/resolve.ts` | `all: true` where the full set is required |
| `scripts/route-bench.cjs` | **new** — browser-level route benchmark |
| `app/globals.css` | sticky-column backing inherits the row colour (see §7) |
| `components/layout/nav-items.ts` | Business Overview moved after Assets (requested) |

### Backend

| File | Change |
|---|---|
| `src/modules/builty/builty.service.js` | paginated, sortable, regex-escaped list |
| `src/modules/builty/builty.controller.js` | returns page metadata |
| `test/builty-list.test.js` | **new** — 7 regression tests |

---

## 7. Two defects fixed from your report

**Product names were invisible** in the colour-coded per-product tables. `globals.css` painted a `::before` backing behind every sticky first column, hard-coded to `var(--card)`. Because the cell carries a `z-index` it forms a stacking context, and inside one a negative-z-index pseudo-element paints **on top of** the element's own background — so the white backing covered the green row and the white product name sat on white. The backing now `inherit`s: `var(--card)` on a normal row, the row's own colour on a tinted one.

Verified in a real browser: `beforeBg` changed from white to `lab(55.05 -49.92 15.93)`, and the names render.

**Business Overview** moved to after Assets in the Dashboard group, as requested.

---

## 8. Not changed — and why

| Item | Reason |
|---|---|
| Migrating all ~40 screens to React Query | The measured problem was duplicate requests, and §1 fixes that for every screen *and* for the non-React voice modules that hooks could never reach. A 40-screen rewrite is higher risk for less measured benefit. The infrastructure from the previous round is in place for incremental migration. |
| Table virtualisation | Pagination bounds every large list; a single page is not long enough for virtualisation to pay. |
| `reports/position` (37 round trips) | Lives inside `allocateThisMonthFirst`, the receivables/payables engine, which has no tests yet. |
| `maxPoolSize` 5 → 15 | Changes serverless connection behaviour. Your decision. |
| `next start` is broken (`routesManifest.dataRoutes is not iterable`) | **Pre-existing** — `build: next build --turbopack` + `start: next start` are both unmodified at HEAD. Vercel does not use `next start`, and the desktop app uses `NEXT_OUTPUT=standalone`, so neither deployment path is affected. Worth fixing separately. |
| Raw-stock divergence, claims cold-start rewrite, transactions, unweighted `$avg` | Touch money, stock or history — out of scope. Open; see document 11 §9. |
