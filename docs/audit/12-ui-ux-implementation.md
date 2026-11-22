# 12 — UI / UX Implementation

What changed on the frontend, and why. Bundle numbers are in `13-before-after-benchmarks.md`.

The audit found the existing design system coherent and domain-appropriate, so **it was kept**. Nothing was restyled for its own sake. The work was: make data fetching correct, make tables honest about what they are showing, make destructive actions explain themselves, and surface the parts of the product that existed but were unreachable.

---

## 1. React Query — from installed-but-unused to the data layer

The audit's sharpest frontend finding: `@tanstack/react-query` was in `package.json`, a `QueryClient` was configured with `staleTime: 30_000`, the provider was mounted — and **not one component used it**. All 46 screens fetched by hand with `useEffect` + `useState` (621 `useState`, 165 `useEffect`, 0 `useQuery`). The configured `staleTime` was dead code.

### New structure

```
src/lib/query/
  keys.ts            query key factory + invalidation map
  cache-policy.ts    freshness per data class
  client.ts          shared QueryClient
  hooks.ts           useAppQuery / useAppMutation / useInvalidate
  domains/
    finance.ts       useProductionMargin, usePartySalesMargin
    inventory.ts     useInventoryReport
    dashboard.ts     useDashboard
    production.ts    useProductionList
src/providers/query-provider.tsx
```

### Cache policy — chosen per data class, not globally

The rule applied: *the longer a value can be wrong without someone making a bad decision, the longer it may be cached.*

| Class | staleTime | gcTime | Used for |
|---|---:|---:|---|
| `reference` | 10 min | 30 min | products, categories, warehouses, workers |
| `live` | 30 s | 5 min | stock on hand, alerts, dashboard KPIs |
| `financial` | 60 s | 10 min | balances, receivables, margins for an **open** period |
| `list` | 60 s | 10 min | paged, filtered lists |
| `historical` | 10 min | 30 min | reports over a period that has **already closed** |
| `settings` | 5 min | 30 min | tax split, waste % |

`policyForRange(dateTo)` picks automatically: a window ending before today cannot change on its own, so it gets the longer policy. **Financial and stock figures are deliberately kept short** and are invalidated explicitly after every write.

### Invalidation is a map, not a guess

Writes in this system fan out further than they look — recording a builty moves finished stock, writes a ledger entry and changes margin. `invalidationGroups` encodes that once:

```ts
sale: [builty, inventory, finance, parties, reports, dashboard],
purchase: [purchases, suppliers, inventory, finance, reports, dashboard],
production: [production, inventory, finance, products, dashboard],
```

so a new screen cannot forget it.

**Caches are invalidated, never optimistically patched.** Stock and money figures here are derived server-side — payment allocation re-runs across a whole party, a sale touches several ledgers — so a client-side guess at the new value would frequently be wrong, and wrong in the one place it matters.

### Request cancellation — previously absent entirely

Zero `AbortController` existed in the codebase. React Query hands every query function an `AbortSignal`; `useAppQuery` passes it through to axios, and the API layer was extended to accept it.

This fixes a real, silent bug: switching from a 12-month range (seconds) to a 1-month range (fast) could let the slow response land **last** and overwrite the correct figures — no error, no spinner, just wrong numbers.

### Error handling

`useAppMutation` shows a toast on failure and invalidates on success — except on `409`, which is the same-day duplicate confirmation. That is a question for the user, not an error, and the existing `withSameDayConfirm` flow handles it. Retries skip 4xx entirely.

### Migrated so far

| Screen | State |
|---|---|
| `/dashboard` (production margin) | ✅ three queries, cancellation, skeletons, retry |
| `/dashboard/overview` (new) | ✅ |
| Stock movements | ✅ paginated |
| Production History, History timeline | contract updated (`all: true`), fetch still manual |

The remaining screens were deliberately left on `useEffect`. The brief asked not to replace all 621 `useState` indiscriminately, and form state, modal visibility and transient selections are correctly local. Migration order for the rest is in §7.

---

## 2. A real business overview — `/dashboard/overview`

The audit found that `GET /api/dashboard` had been built and maintained from the start — cash balance, today's sales, outstanding receivables, low stock, pending orders, recent activity, top parties — and **was never called by any screen**. Those KPIs were computed on every request and displayed nowhere.

The new page consumes that endpoint directly. **Every figure comes from the existing API; nothing is recalculated client-side**, so no new accounting logic was introduced.

- 8 KPI tiles, each linking to the screen that explains it
- Tone-coded only where it carries meaning (negative cash, outstanding balance, low stock)
- Top outstanding parties and low-stock items side by side
- Recent activity feed, each row linking to its record
- Skeletons on first load; a subtle "Updating…" strip on background refresh

The hub/drum manufacturing margin analysis **remains** at `/dashboard` and is the second item in the Finance subnav.

---

## 3. Navigation — eight orphaned pages surfaced

The audit found eight working pages reachable only by typing the URL, including the low-stock alerts screen and the only place to manage categories, sizes and warehouses.

| Added to | Entries |
|---|---|
| Finance subnav | **Business Overview** (new) |
| Inventory children | Stock Alerts, Stock Movements, Categories & Warehouses |
| Production (now expandable) | Production Runs, Production History, By Product, Production Costs, Production Reports |

All existing URLs and redirects are unchanged.

---

## 4. Tables — sorting, paging, honest counts

### Column sorting — previously absent on all 46 screens

**New:** `components/data/sortable-table.tsx`

- `useSortState` — three-state toggle: ascending → descending → **cleared**, restoring the server's default order
- `SortableHead` — clickable header with `aria-sort` and a visible direction indicator
- `useClientSort` — type-aware comparison: numbers numerically, dates chronologically, strings via `localeCompare` so **Urdu names order sensibly**. Null and empty values always sort last regardless of direction, so blank cells never float to the top of a descending sort.

Applied to Finished Stock (product, family, size, quantity) and composed with — not replacing — the existing family filter. The component is ready for the remaining tables.

For server-paginated tables the sort state goes to the API instead, because sorting only the current page would be wrong: rows outside it also compete for the top. The production endpoint accepts `sortBy`/`sortDir` for exactly this.

### Pagination and record counts

**New:** `components/data/table-pagination.tsx`

The count is the important part. Stock movements previously returned a silent 500-row cap with no total against 4,814 records — a partial ledger that looked complete. It now reads:

> **Showing 1–100 of 4,814 records**

Changing a filter resets to page 1, so a narrower result set never strands the user on a page that no longer exists.

---

## 5. Destructive actions — 20 native `confirm()` dialogs replaced

The app already had a well-designed styled dialog for the *less* dangerous same-day-duplicate case, while irreversible deletes used the raw OS `window.confirm()` with generic text.

**New:** `lib/confirm-action.ts` + `components/confirm-action-dialog.tsx`, mirroring the existing duplicate-confirm pattern so both behave identically.

The real gain over `window.confirm` is the payload — it can state consequences:

> **Delete this builty?**
> • Finished goods on this builty are returned to stock
> • The party ledger entry for this builty is removed
>
> *This cannot be undone.*

> **Delete all 7 production runs for this day?**
> • Removes 7 production batch(es) from history
> • Raw material consumed by these runs is credited back to stock
> • Finished pieces produced by these runs are removed from stock

Replaced across 17 files. **Deletion behaviour and authorisation are unchanged** — only the confirmation UI. All strings are bilingual.

---

## 6. Loading, error and empty states

**New:** `components/data/states.tsx` — `Skeleton`, `StatCardsSkeleton`, `TableSkeleton`, `RefreshingBar`, `EmptyState`, `ErrorState`, `RecordCount`.

The important distinction these encode: **"loading for the first time" is not the same as "refreshing"**. Previously any refetch blanked the whole page back to a spinner. Now:

- First load → skeletons shaped like the content, so layout does not jump
- Background refresh → previous figures stay readable, a small "Updating…" strip appears
- Error → a message with a **Try again** button, not a silent empty table
- Empty → an explicit empty state

`ErrorState` carries `role="alert"`, `RefreshingBar` carries `aria-live="polite"`, sortable headers carry `aria-sort`.

---

## 7. Frontend performance

### Code splitting

The topbar is in the dashboard layout, so everything it imported shipped with **every** dashboard route. Two heavy modules were moved to `next/dynamic` (`ssr: false`, both touch browser-only APIs):

- the voice stack — speech recognition, a ~1,800-line intent parser, entity resolver, on-device model
- the calculator popover

Plus the 550-line charges calculator, which sits below the fold on one screen.

### Provider scoping

Two modules were pulling heavy dependencies into the **root** chunk, which the login page also loads:

- `QueryClientProvider` → moved from the root layout to the dashboard layout. Nothing outside `/dashboard` uses query hooks, and all dashboard routes still share one client, so they still share one cache.
- `ConfirmActionDialog` → mounted in the dashboard layout. It uses `useI18n`, which pulls the 5,011-line message catalogue; every destructive action is under `/dashboard` anyway.

**Net: every route got smaller while adding React Query's runtime, a new page and four new shared components.** Dashboard routes −18.4 kB mean, login/download −9 kB.

### Lint fixes

- `reports/sales` — `report?.byProduct || []` produced a fresh array each render, defeating two `useMemo`s. Now memoised (audit FE-008).
- Removed a stale `eslint-disable` and two unused imports.

ESLint warnings: 8 → 3. The remaining three are pre-existing and cosmetic.

---

## 8. Bilingual support

Every new string was added to **both** locales: 60 keys covering the overview page, navigation entries, table controls, data states and confirmation consequences.

The typed message catalogue (`MessageKey = keyof typeof en`) caught every missing key at compile time — which is exactly what it is for.

---

## 9. Files changed (frontend)

| File | Change |
|---|---|
| `lib/query/**` (8 files) | **new** — keys, cache policy, client, hooks, domain hooks |
| `providers/query-provider.tsx` | **new** — dashboard-scoped provider |
| `components/data/states.tsx` | **new** — skeletons, refreshing, empty, error, record count |
| `components/data/sortable-table.tsx` | **new** — sort state, sortable header, type-aware client sort |
| `components/data/table-pagination.tsx` | **new** — pagination with record count |
| `components/confirm-action-dialog.tsx`, `lib/confirm-action.ts` | **new** — styled destructive confirmation |
| `app/dashboard/overview/page.tsx` | **new** — business overview |
| `app/dashboard/page.tsx` | migrated to React Query; skeletons, retry, lazy charges panel |
| `app/dashboard/layout.tsx` | mounts `QueryProvider` + `ConfirmActionDialog` |
| `app/layout.tsx` | confirm dialog moved out of the root chunk |
| `providers/app-providers.tsx` | query provider removed |
| `components/layout/nav-items.ts` | overview + 8 orphaned pages surfaced |
| `components/layout/topbar.tsx` | voice + calculator lazy-loaded |
| `app/dashboard/inventory/finished/page.tsx` | sortable columns |
| `app/dashboard/inventory/movements/page.tsx` | paginated with true total |
| `app/dashboard/production/history/page.tsx`, `app/dashboard/history/page.tsx` | `all: true` for day grouping |
| `lib/{production,inventory,finance,dashboard}-api.ts` | `AbortSignal` + page metadata |
| `lib/i18n/messages.ts` | 60 keys × 2 locales |
| 17 screens/components | `window.confirm` → styled dialog |

---

## 10. Not done — and why

| Item | Reason |
|---|---|
| Migrating the other ~40 screens to React Query | Deliberately incremental. Order: Builty list → Party detail → Receivables → Purchases → Expenses. The infrastructure is in place; each is now a small, independently testable change. |
| Virtualising large tables | Pagination removed the acute problem (2.4 MB → 85 KB). Virtualisation only pays once a single page is genuinely long. |
| Sorting on the remaining tables | The component is built and proven on one screen. Rolling it out is mechanical but touches many files; better as a separate reviewable change. |
| Builty list pagination | Needs paging UI on that screen first — server paging alone would silently truncate, which is the exact problem being fixed elsewhere. |
| Splitting the 1,000+ line page components | Maintainability, not performance. Out of scope here. |
| Removing the no-op `middleware.ts` (39 kB) | Adjacent to the auth story, which is out of scope. |
| Frontend tests | None existed and none were added; the brief scoped tests to regression coverage for changed backend behaviour. Playwright smoke tests for the five daily flows remain the top recommendation. |
