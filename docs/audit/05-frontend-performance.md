# 05 — Frontend Performance

Next.js 15.5.20 (App Router, Turbopack) · React 19.1 · 74 routes · 56,355 lines of TS/TSX.

Production build verified: **`BUILD_EXIT=0`**, 74/74 static pages generated, 0 type errors, 6 lint warnings.

---

## Measured bundle sizes

```
First Load JS shared by all                   253 kB
  ├ chunk fe119d85…                           59.2 kB
  ├ chunk 61b1ecc4…                           24.0 kB
  ├ chunk 86927910…                           19.1 kB
  ├ chunk 8082ab48…                           17.2 kB
  ├ globals.css                               25.0 kB
  └ 5 further chunks + shared                 ~108 kB

Middleware                                    39.1 kB
```

| Route | Page JS | First Load |
|---|---:|---:|
| `/dashboard/salesmen` | 2.83 kB | **444 kB** |
| `/dashboard/suppliers` | 3.28 kB | **444 kB** |
| `/dashboard/builty/[id]/edit` | 8.73 kB | 384 kB |
| `/dashboard/builty/new` | 8.27 kB | 384 kB |
| `/dashboard/reports/*` | 4–7 kB | 367–382 kB |
| `/dashboard` | 12.8 kB | 375 kB |
| `/` (login) | 12 kB | 301 kB |

253 kB shared baseline is on the heavy side for an app whose job is tables and forms, but it is not the bottleneck — the bottleneck is the 83–610 database round trips behind each screen (see 03). Fix those first.

---

## FE-001 (P1) — React Query is installed, mounted, and completely unused

`package.json` includes `@tanstack/react-query@5.101.2`. `providers/app-providers.tsx` creates a `QueryClient` with `staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: false` and wraps the tree in `QueryClientProvider`.

```
$ grep -rl "@tanstack/react-query" frontend/src --include=*.tsx --include=*.ts
frontend/src/providers/app-providers.tsx      ← the only file
$ grep -rc "useQuery\|useMutation" frontend/src/app
0
```

Every one of the 46 dashboard screens fetches with hand-rolled `useEffect` + `useState`. Counted across `app/`: **621 `useState`, 165 `useEffect`, 0 `useQuery`**.

Consequences:

- **No caching.** Navigating Dashboard → Reports → Dashboard refetches everything, including the 610-round-trip year view.
- **No deduplication.** Two components needing the product list issue two requests.
- **No request cancellation.** Zero `AbortController` in the codebase.
- **No background revalidation, no retry, no shared loading state.**
- The `staleTime` config is dead code.

This is the single highest-leverage frontend change available: the client library is already paid for in the bundle.

## FE-002 (P1) — Unpaginated, unvirtualised tables

No screen implements pagination, infinite scroll, or virtualisation. Combined with 03 DF-003:

| Screen | Rows rendered | Payload |
|---|---:|---:|
| Production History | 1,447 | 2.4 MB |
| Builty list | 697 | 261 KB |
| Received report | all payments | 152 KB |
| Receivables | all parties | 175 KB |

1,447 table rows is roughly 15–25k DOM nodes. On a mid-range factory-floor PC that is a visible multi-second paint, and any re-render (filter keystroke, sort, locale toggle) repeats it.

## FE-003 (P2) — Stale-response race on filtered screens

`app/dashboard/page.tsx:504`:

```js
const load = useCallback(async () => { … }, [dateFrom, dateTo, taxMode, hydrated, t]);
useEffect(() => { const timer = setTimeout(load, 200); return () => clearTimeout(timer); }, [load]);
```

The 200 ms debounce prevents a request per keystroke, but nothing cancels an in-flight request. Change the range from a 12-month span (several seconds) to a 1-month span (fast) and the slow response can land last and overwrite the correct data — with no error, no spinner, just wrong numbers on screen.

Every date-filtered screen shares this pattern.

## FE-004 (P2) — No code splitting of heavy, rarely-used modules

`next/dynamic` and `React.lazy` appear **zero** times. `Suspense` is used only for `useSearchParams` boundaries.

Candidates that are currently in the shared or page bundles for everyone:

| Module | Lines | Used by |
|---|---:|---|
| `lib/i18n/messages.ts` | 5,011 | every page (both locales always loaded) |
| `lib/voice/*` (parser, resolve, model, speech…) | ~4,600 | one page (`/dashboard/today`) + a header control |
| `components/voice/voice-confirm-dialog.tsx` | 989 | voice flow only |
| `components/layout/simple-calculator.tsx` | — | a topbar popover |
| `components/finance/charges-calculator.tsx` | 549 | one dashboard panel |

Splitting voice + calculator alone should remove a meaningful slice of the 253 kB baseline for the 95 % of sessions that never use them.

## FE-005 (P2) — Oversized page components

| File | Lines |
|---|---:|
| `app/dashboard/page.tsx` | 1,425 |
| `app/dashboard/expenses/salaries/page.tsx` | 1,281 |
| `app/dashboard/builty/[id]/edit/page.tsx` | 1,278 |
| `components/party/party-history-calendar.tsx` | 1,249 |
| `app/dashboard/claims/page.tsx` | 1,147 |
| `app/dashboard/builty/new/page.tsx` | 1,143 |
| `app/dashboard/finance/party-margin/page.tsx` | 1,042 |
| `app/dashboard/production/history/page.tsx` | 1,006 |

Each is a single `"use client"` component holding presentation, form state, derived calculations and fetch orchestration. Any state change re-renders the whole tree. `app/dashboard/page.tsx` has only 3 `useMemo` calls for a 1,425-line component that renders several tables.

`builty/new` (1,143) and `builty/[id]/edit` (1,278) are near-duplicates of each other — the same form, forked.

## FE-006 (P2) — Dead and conflicting configuration

- `next.config.ts` `rewrites()` for `/api/:path*` never fires (the route handler at `app/api/[...path]/route.ts` wins). Dead config.
- `src/middleware.ts` matches `/dashboard/:path*` and returns `NextResponse.next()` — it does nothing, by design, with a comment explaining why. It still ships **39.1 kB** of middleware bundle and runs on every dashboard navigation. Either remove the matcher or implement the auth check there.
- `lib/dashboard-api.ts` is imported by nothing (see 02 BL-020).

## FE-007 (P3) — Unoptimised images

```
public/logo.png      876 KB
public/icon-512.png  224 KB
```

`next/image` is not used for these. 876 KB for a logo served on the login page is the largest single asset in the app.

## FE-008 (P3) — Lint warnings

`npx eslint src` → 6 warnings, 0 errors:

- `app/dashboard/reports/sales/page.tsx:139` — `byProduct` logical expression changes `useMemo` deps on every render, defeating two memos (a real, if small, perf bug).
- `components/layout/simple-calculator.tsx:193` — `useEffect` missing `applyOp` / `backspace` deps (stale-closure risk in a keyboard handler).
- `app/dashboard/reports/page.tsx:826,859` — unused `columnIndex`.
- `app/dashboard/claims/page.tsx:596` — unused eslint-disable directive.

---

## What is already good

- **Build is clean.** TypeScript `strict: true`, 0 type errors, 0 lint errors.
- **Loading states are near-universal** — a `Loader2` spinner or skeleton appears on 46 of 46 data screens.
- **Error handling is consistent** — `toast.error(apiError(err, fallback))` via sonner, with a shared `apiError` helper.
- **Independent requests are parallelised** with `Promise.all` on every multi-fetch screen.
- **Debouncing** is applied to filter inputs.
- **The duplicate-entry UX is genuinely well built**: the backend returns `409 SAME_DAY_DUPLICATE`, `lib/duplicate-confirm.ts` + `duplicate-confirm-dialog.tsx` show a styled dialog naming the party/product/amount, and the retry carries `confirmDuplicate: true`. Applied consistently across 8 entry forms.
- **Urdu/English bilingual support** is thorough — `nameUr` on domain models, a phonetic Urdu input component, RTL handling, and a 5,011-line message catalogue.
- Redirect stubs (`/dashboard/customers` → `/dashboard/party`, etc.) keep old URLs working.

---

## Priority order for frontend work

1. **FE-001** — adopt React Query on the 5 heaviest screens. Highest ratio of benefit to risk; the library is already shipped.
2. **FE-002** — paginate Production History and Builty list (needs the backend change in 03 DF-003).
3. **FE-003** — add `AbortController` to every filtered fetch. Small, mechanical, removes a silent-wrong-data class.
4. **FE-004** — `next/dynamic` for voice and calculator.
5. **FE-006** — delete the dead rewrite, the no-op middleware matcher, and `dashboard-api.ts`.
6. **FE-005** — split the 1,000+ line pages, starting by extracting the shared builty form from `new` / `edit`.
