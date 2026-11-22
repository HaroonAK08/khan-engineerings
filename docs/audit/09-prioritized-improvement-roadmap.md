# 09 — Prioritised Improvement Roadmap

**Status key:** `VERIFIED` = reproduced against data or an unambiguous code path · `POTENTIAL` = real risk, needs a production observation · `DECISION` = needs the business owner's answer before any code changes · `GAP` = functionality that does not exist.

**Complexity:** S ≤ ½ day · M 1–3 days · L 1–2 weeks · XL > 2 weeks.

---

## P0 — Critical

### OPS-000 · Verify Atlas backup is enabled and restorable · `VERIFIED` (absence) · S
**Module:** Infrastructure · **Ref:** 04 §7, 07 REL-008
**Description:** No scheduled backup exists in the repo. The only artefacts are three manual `mongodump` directories, newest `2026-10-29`.
**Evidence:** `ls .mongo-*` · no cron, no GitHub Action, no documented procedure.
**Business impact:** With no transactions (DATA-001) and four unguarded mass-rewrite paths (REL-004), a single bad operation is unrecoverable. Free/shared Atlas tiers (M0/M2/M5) have **no** continuous backup.
**Fix:** Confirm the cluster tier. If backup is unavailable, upgrade or add a nightly `mongodump` to object storage with 30-day retention. **Perform one test restore.**
**→ Do this before any other item in this document.**

### SEC-001 · Shared 4-digit PIN grants admin; default published · `VERIFIED` · S→M
**Module:** Auth · **File:** `backend/src/modules/auth/auth.service.js:58-78`; `backend/.env.example:20`; `personal-banks.service.js:110`
**Description:** Login accepts a single 4-digit PIN, resolves to `User.findOne({role:"admin"})`, has no rate limiting or lockout, and falls back to the hardcoded literal `"3811"` — which is also committed in `.env.example`.
**Evidence:** `git grep APP_PIN` → `.env.example:20: APP_PIN=3811`; `auth.service.js:61: process.env.APP_PIN || "3811"`. No `express-rate-limit`/`helmet` in `package.json`.
**Business impact:** 10,000-combination keyspace with unlimited attempts is the only barrier between the public internet and the full financial database. Every session is admin, so no action can be attributed to a person.
**Fix (S first, M after):** rotate `APP_PIN` on the host · delete the value from `.env.example` · remove the `|| "3811"` fallback and fail loudly · add `express-rate-limit` to `/api/auth/login` · then restore per-user email+password (the implementation is intact at `auth.service.js:83`) and put the real user id in the JWT.

### SEC-002 · Factory PIN resets the Personal Banks PIN, unauthenticated · `VERIFIED` · S
**Module:** Personal Banks · **File:** `personal-banks.routes.js:9`, `personal-banks.service.js:109`
**Description:** `POST /api/personal-banks/auth/reset-pin` is mounted before `requirePersonalBanks` and accepts the same `APP_PIN`, overwriting the bcrypt PIN and clearing `failedAttempts`/`lockUntil`.
**Business impact:** Defeats the one properly-protected module (bcrypt + 15-min lockout) in exchange for `3811`.
**Fix:** Move the route behind `requireAuth` + `requireRole("admin")`, or require the current PIN. One line.

### INV-001 · Raw stock has two disagreeing sources of truth · `VERIFIED` · M
**Module:** Inventory · **File:** `purchase.service.js:281` vs `inventory.service.js:612`
**Description:** `purchaseService.getStock()` computes `Σ purchases − Σ batch inputs` and never reads `StockMovement`, so claim returns and manual adjustments are invisible to it. `getRawStockAsOf()` reads the ledger.
**Evidence (2026-11-22 snapshot):**
```
scrap  derived=5681.015  ledger=5707.015  DIFF= -26.0 kg
daig   derived=7001.27   ledger=7509.77   DIFF=-508.5 kg
cause: raw_daig claim_return in 508.5 kg (12 rows); raw_scrap claim_return in 26 kg (1 row)
```
**Business impact:** Inventory overview understates daig by 508.5 kg against the as-of report — the two numbers appear on adjacent screens. Also feeds the low-stock alert.
**Fix:** Make `StockMovement` the single source of truth for raw material. Reimplement `purchaseService.getStock()` to call `inventoryService.getRawStockAsOf()`, keeping `purchasedKg` / `totalSpend` / `avgRate` from `Purchase` for the reporting fields. Add a reconciliation test (08 TEST-002 #1) that currently fails.

### DATA-001 · No database transactions anywhere · `VERIFIED` · L
**Module:** All write paths · **Evidence:** `grep -rn "startSession\|withTransaction\|session:" backend/src` → no matches
**Description:** Every financial and inventory operation writes 3–10 documents in sequence with no atomicity. Worst case: `production.updateProduce` (`production.service.js:789`) deletes all of a batch's stock movements before rewriting them.
**Business impact:** Any failure mid-sequence leaves the books or the stock permanently wrong, with no record that it happened.
**Fix:** Wrap the five highest-risk paths in `session.withTransaction`: `purchase.create/update/remove` · `builty.createBuilty/updateBuilty/removeBuilty` · `production.produce/updateProduce/remove` · `claim.create/remove` · `customer.recordPayment`. Atlas replica sets support this; the change is mechanical but needs testing against each path.

### FIN-001 · COGS is purchase-based, with no inventory bridge · `VERIFIED` + `DECISION` · M
**Module:** Finance · **File:** `finance.service.js:237`
**Description:** `cogs = Σ Purchase.totalAmount(period) + manufacturingOps`. Revenue is accrual; cost is purchasing. There is no `opening + purchases − closing` adjustment.
**Evidence:** `const cogs = roundMoney(purchasesAccrual.total + manufacturingOps.total);`
**Business impact:** Monthly net profit tracks **when metal was bought**, not business performance. A large end-of-month scrap purchase shows as a loss; selling from it next month shows inflated profit. For a foundry buying in irregular lots this can invert a month's reported result.
**Fix:** `COGS = openingInventoryValue + purchases − closingInventoryValue`. Both inputs already exist (`getRawStockAsOf(date)`, `getFinishedStock({asOf})`). **Requires owner sign-off on the valuation basis** (weighted average vs FIFO) before implementation.

---

## P1 — High

### DATA-002 · `GET /api/claims` mass-rewrites every builty on cold start · `VERIFIED` · S
**File:** `claim.service.js:136, 76-130`
`list()` calls `repairLegacyBuiltyBoundClaims()` → `restoreBuiltyTotalsFromItems()` (loops all 697 builties, saves on mismatch, updates ledger rows) + `ensureClaimPartyCredits()` (creates ledger adjustments, re-syncs customers). Guarded by a module-level boolean = once per process = **once per Vercel cold start, forever**.
**Fix:** Move to an explicit admin maintenance endpoint or a script. Remove from the read path. Half a day.

### DATA-003 · Settings changes retroactively rewrite history · `VERIFIED` + `DECISION` · M
**Files:** `products/apply-product-weight.js` · `production.service.applyFamilyWasteFromDate` · `worker.service.update:127`
Changing a product's weight **re-prices past builty lines and totals** and updates the matching customer ledger invoice rows. Changing the waste % re-runs `updateProduce()` on every batch since the date (deleting and re-posting stock movements). Changing a worker's scope reclassifies all their historical salaries, shifting every past month's hub/drum overhead split.
**Business impact:** An invoice the customer has already received — possibly already paid — can change value. No log, no preview, no undo.
**Fix:** **Owner decision required.** Recommended: keep forward-looking `effectiveFrom` behaviour but stop rewriting *issued* invoices; corrections become credit/debit notes. Minimum interim: a preview ("this will change 143 builties and 87 batches — continue?") and an audit record.

### INV-002 · No negative-stock guard; stock is already negative · `VERIFIED` · M
**File:** `builty.service.js:118` (`assertStockAvailable` is an empty stub) · `production.service.js:247` (`available` computed, never compared)
**Evidence:** 27 products hold negative finished balances, **−101 units** total (Nissan A −20, Nissan TK20 regular −9, Tatra Goal −7, …).
**Fix:** Keep allowing negatives (back-dated entry legitimately causes them) but **warn**: return a confirmable `409` using the existing `SAME_DAY_DUPLICATE` dialog pattern, and add a "negative stock" section to the inventory report. Also stop `getFinishedStock` from silently folding negatives into totals.

### PERF-001 · Multi-month finance reports run segments sequentially · `VERIFIED` · S
**File:** `finance.service.js:973` and `:2794` — `for (const seg of segments) { parts.push(await compute…) }`
**Evidence:** 12-month production-margin = **283 DB round trips**, party-margin = **323**; the `/dashboard` page issues both plus inventory = **610 per load**.
**Fix:** `Promise.all` over segments (they are independent; merge logic is unchanged) and raise `maxPoolSize` from 5 to ~15. Expected: year-range wall time drops to roughly a single month's. **Highest performance return per line changed in the whole audit.**

### PERF-002 · `inventory/overview` computes the same results 2–3× · `VERIFIED` · S
**File:** `inventory.service.js:getOverview` — `getAlerts()` internally re-calls `getFinishedStock()` and `purchaseService.getStock()`.
**Evidence:** one overview request = `productionbatches.find ×4`, `purchases.aggregate ×4`.
Compounded by `sumNetConsumedForMaterial` (`production.service.js:124`) loading all 1,447 batches into Node and summing in JS.
**Fix:** compute once and pass results into `getAlerts(finished, raw)`; convert the JS sum to a `$unwind`+`$group` aggregation.

### PERF-003 · No pagination on any list endpoint · `VERIFIED` · M
**Evidence:** `GET /api/production` = **2.4 MB / 1,447 rows**; `GET /api/builty` = 261 KB / 697 rows; receivables 175 KB; received 152 KB. Stock movements are silently capped at 500 of 4,814 with no total count.
**Fix:** add `page`/`limit` + `total` to the five heaviest list endpoints; paginate the matching screens; add a "showing N of M" notice wherever results are capped.

### REL-002 · Failed inventory writes are swallowed and reported as success · `VERIFIED` · S
**Files:** `purchase.service.js:163, 265, 287` · `production.service.js:310, 456`
```js
try { await inventoryService.onPurchaseCreated(populated); }
catch (e) { console.error("Inventory movement (purchase) failed:", e.message); }
return populated;   // 200 OK, stock movement missing
```
**Fix:** once DATA-001 lands these belong inside the transaction. Interim: surface the failure in the response and log it as an alertable error.

### REL-005 · PDF export fails on hosts without a Debian font · `VERIFIED` (code path) / `POTENTIAL` (Vercel) · S
**File:** `reports/export.util.js:7, 374` — `registerFont("Urdu", "/usr/share/fonts/truetype/freefont/FreeSerif.ttf")`, no try/catch.
**Evidence:** `doc.font("Urdu")` with a missing file throws `ENOENT` (verified locally). Vercel's Amazon Linux runtime ships no fonts.
**Impact:** any PDF export containing Urdu text — any Urdu party or supplier name — 500s in production.
**Fix:** bundle a TTF under `backend/src/assets/`, resolve with `path.join(__dirname, …)`, wrap in try/catch degrading to Helvetica.

### FE-001 · React Query installed, mounted, and entirely unused · `VERIFIED` · M
**Evidence:** only `providers/app-providers.tsx` imports it; `grep -c "useQuery\|useMutation" frontend/src/app` → **0**. 621 `useState` / 165 `useEffect` instead.
**Impact:** no caching, no deduplication, no cancellation, no retry. Every navigation refetches everything, including the 610-round-trip year view.
**Fix:** migrate the five heaviest screens first (dashboard, builty list, production history, receivables, party detail). The library is already in the bundle.

### FIN-002 · `estimateMaterialCost` reads fields that are null on modern batches · `VERIFIED` · S
**File:** `finance.service.js:287` — `$subtract: ["$inputScrapKg", "$returnedScrapKg"]` (legacy fields) × unweighted, date-unbounded `$avg: "$ratePerKg"`.
Same broken `$subtract` in `dashboard.service.js:70` and `inventory.service.js:1003`.
**Fix:** read `inputs[].quantityKg`; use `Σspend/Σkg` as `product-cost.js:33` already does; bound the rate window to the period.

### SEC-003 · No RBAC and no audit log · `VERIFIED` · M
`requireRole` is used on exactly one route. Nothing records who changed what. Combined with DATA-003 (history rewrites) there is no way to explain why a figure changed.
**Fix:** an `AuditLog` collection written on every create/update/delete of a financial or inventory document (actor, action, collection, docId, before, after, at). Depends on SEC-001 for a real actor id.

---

## P2 — Medium

| ID | Module | Issue | Status | Cx |
|---|---|---|---|---|
| **DEAD-001** | Dashboard | Entire `/api/dashboard` module (~350 lines, 134 DB ops) is never called; `lib/dashboard-api.ts` has no importer. Its KPIs (cash balance, outstanding, low stock, pending orders) are shown nowhere | `VERIFIED` | S |
| **DEAD-002** | Frontend | `next.config.ts` `/api` rewrite never fires (route handler wins); `middleware.ts` ships 39 kB and returns `next()` | `VERIFIED` | S |
| **DATA-004** | Products | All 146 products: `pricePerKg = 0`, `sellingPrice = 0`, `costUpdatedAt = null`; 18 have `standardCost = 0`. Inventory *value* figures rest on this | `VERIFIED` + `DECISION` | S |
| **DATA-005** | Expenses | 0 of 1,341 expenses link to a batch → per-batch costing is structurally dead; `standardCost` derives from a 12-month rolling factory average | `VERIFIED` + `DECISION` | M |
| **PERF-004** | Purchases | `avgRate: {$avg:"$ratePerKg"}` averages rates, not cost/kg — disagrees with `product-cost.js` | `VERIFIED` | S |
| **PERF-005** | Several | N+1 `Product.findById` in `builty.normalizeItems`, `production.recordFurnace`, `claim` (×3), `inventory.onBatchFinished` → `products.find ×89–101` per year report | `VERIFIED` | S |
| **PERF-006** | Settings | `appsettings.findOne ×36` on a year report — no request-scoped cache | `VERIFIED` | S |
| **PERF-007** | Inventory | `avgSoldPrices()` aggregates every builty line ever, with no date bound, 2–3× per request | `VERIFIED` | S |
| **DB-005** | Database | Missing `builties{customer,builtyDate}`, `stockmovements{itemType,movementDate}`, `builties{items.product}`, `productionbatches{status,productionDate}`; stale `customerpayments.order_1`; `batchexpenses` over-indexed (9 on 1,341 docs) | `VERIFIED` | S |
| **DB-012** | Products | `product.remove()` guards on legacy `batch.product` only — products referenced solely via `outputs[].product` can be deleted while in use | `VERIFIED` | S |
| **REL-003** | Config | `socketTimeoutMS: 5000` / `maxPoolSize: 5` are tuned for endpoints the system does not have | `VERIFIED` | S |
| **REL-006** | Reports | puppeteer + @sparticuz/chromium on a 1024 MB / 60 s Vercel function — unverified | `POTENTIAL` | S |
| **REL-007** | Ops | No structured logging, no APM, no request ids, no error tracking (21 `console.error`) | `VERIFIED` | M |
| **SEC-005** | Auth | JWT duplicated into `localStorage` alongside the httpOnly cookie | `VERIFIED` | S |
| **SEC-006** | API | No `helmet`, no rate limiting, no body-size limit; unescaped `new RegExp(userInput)` in ~12 services (ReDoS) | `VERIFIED` | S |
| **SEC-007** | API | `errorHandler` returns raw `err.message` on 500s, including DB connection hints | `VERIFIED` | S |
| **BL-012** | Builty | `GET /api/builty/:id` writes — `syncCustomerBuiltyPaymentStatuses` re-saves every builty for that customer on every read | `VERIFIED` | M |
| **BL-014** | Customers | `getBalance()` loads all ledger entries as hydrated docs and sums in JS | `VERIFIED` | S |
| **BL-007/8/9** | Production | Dual legacy/current schema branched 3 ways in 6 places; staged workflow dead (0 batches use it, hardcodes `wastePercent = 6`); `onTurningBreakage()` is empty — broken metal is dropped | `VERIFIED` | M |
| **BL-015** | Workers | Changing a worker's scope rewrites all their historical salary rows | `VERIFIED` | S |
| **UX-001** | Nav | 8 working pages unreachable — including the low-stock alerts screen and inventory settings | `VERIFIED` | S |
| **UX-002** | Nav | "Dashboard" is the production-margin report; no overview screen exists despite the endpoint existing | `VERIFIED` | M |
| **UX-007** | Tables | **0 of 46 screens have sortable columns** | `VERIFIED` | M |
| **UX-008** | Tables | No pagination; movements silently truncated at 500 of 4,814 with no notice | `VERIFIED` | M |
| **UX-009** | Forms | 20 destructive actions use native `window.confirm()` without stating consequences, while the *less* dangerous duplicate case gets a styled dialog | `VERIFIED` | S |
| **UX-010** | Builty | `new` (1,143 lines) and `edit` (1,278 lines) are forks of one form | `VERIFIED` | M |
| **FE-002/3/4** | Frontend | No virtualisation (1,447 rows); no `AbortController` anywhere (stale-response races); no `next/dynamic` (voice ~4,600 lines + calculator in every bundle) | `VERIFIED` | M |
| **QUAL-001** | Backend | `reports.service.js` 4,911 lines, `finance.service.js` 4,572 — 37 % of the backend in two files | `VERIFIED` | L |
| **QUAL-002** | Backend | ~40 lazy `require()` calls working around an undocumented circular dependency | `VERIFIED` | M |
| **QUAL-004** | Backend | `roundMoney`/`roundKg`/`parseDate`/`httpError` redefined in 12+ files; avg-rate computed 3× with 2 formulas | `VERIFIED` | S |
| **TEST-001/2** | Tests | 11 tests, all report formatting. 0 % coverage of money, stock, production, payroll | `VERIFIED` | L |

---

## P3 — Low

| ID | Issue | Cx |
|---|---|---|
| FE-007 | `public/logo.png` 876 KB, `icon-512.png` 224 KB, unoptimised, no `next/image` | S |
| FE-008 | 6 lint warnings — incl. `reports/sales:139` defeating two `useMemo`s, `simple-calculator:193` stale-closure risk | S |
| SEC-008 | `/api/health` discloses `hasMongoUri`, `corsOrigin`, platform — unauthenticated | S |
| SEC-009 | `middleware.ts` protects nothing but runs on every dashboard navigation | S |
| DB-003 | `BatchExpense` misnamed (0 % have a batch; 86 % are salaries) and overloaded | M |
| DB-004 | 7 empty collections; `productcategories`/`productsizes` still `$lookup`-joined on a hot query | S |
| DB-006/7 | `autoIndex` on in production; a one-off `dropIndex` repair runs on every boot | S |
| DB-011 | `invoiceNo` generated by count-then-insert and **not unique** — duplicates possible | S |
| QUAL-003 | ~700 lines of dead code (staged production API, commented-out email login, deprecated constants shim) | S |
| QUAL-006/7 | No API documentation; 9 unversioned migration scripts, some destructive | M |
| QUAL-008 | `data.movementDate \|\| data.movementDate`, duplicate `$or` clauses, empty `if` block | S |
| UX-003 | 13 reports in one flat list; "Received"/"Receivables"/"Monthly receivables" are easy to confuse | S |
| UX-012 | Financial sign/colour convention decided per screen; no shared `<Money />` | M |
| UX-014/15/16 | No keyboard shortcuts; no inline stock/price/balance context at entry; tablet tables scroll horizontally | M |
| GAP-001 | Salary: no accrual, advances, deductions, bonuses, or outstanding balance — the system cannot answer "what do I owe my workers?" | L |
| GAP-002 | No stock-transfer workflow (reasons exist, no UI); no physical-count reconciliation | M |
| GAP-003 | No raw-material minimum levels (alerts fire only at ≤ 0); no raw-material valuation layer | M |

---

## Quick wins — highest value per hour

| Order | Item | Effort | Effect |
|---|---|---|---|
| 1 | **OPS-000** verify/enable Atlas backup | 1 h | Makes everything else recoverable |
| 2 | **SEC-001a** rotate `APP_PIN`, strip the `3811` fallback + `.env.example` | 30 min | Closes the published-credential hole |
| 3 | **SEC-002** authenticate `reset-pin` | 10 min | Closes the bank-PIN bypass |
| 4 | **PERF-001** `Promise.all` the month segments | 1 h | Year-range dashboard from 610 → ~50 serial round trips |
| 5 | **SEC-001b** rate-limit `/api/auth/login` | 1 h | Makes the PIN non-brute-forceable |
| 6 | **PERF-002** compute inventory once, pass into `getAlerts` | 2 h | 13 → ~6 ops; removes 2 full batch scans |
| 7 | **DATA-002** remove the claims-list mass rewrite | 2 h | Stops an unlogged bulk write on every cold start |
| 8 | **REL-005** bundle the PDF font | 2 h | Likely fixes Urdu PDF exports in production |
| 9 | **DEAD-001/002** delete the unused dashboard module, rewrite, middleware matcher | 2 h | −450 lines, −39 kB |
| 10 | **UX-001** link the 8 orphan pages into the nav | 1 h | Makes the low-stock screen reachable |
| 11 | **DB-005** add 4 indexes, drop the stale one | 1 h | Pre-empts the next growth stage |
| 12 | **PERF-004/005/006** weighted avg rate, `$in` batching, settings cache | 4 h | `products.find` 89 → ~3 per report |

**Total ≈ 2–3 days for items 1–12**, covering both P0 security holes, the worst performance item, two silent-corruption paths, and the most-missed UI gap.

---

## Implementation sequence

### Phase 0 — Safety net (day 1, do before anything else)
OPS-000 backup verified and test-restored · SEC-001a/b · SEC-002 · a tagged release of the current state.

### Phase 1 — Quick wins (week 1) — *no business-logic change*
Items 4–12 above. Each is independently revertible. Measure `/api/finance/production-margin?year` round trips before and after.

### Phase 2 — Correctness, with sign-off (weeks 2–4)
Requires owner decisions first (see below):
- **INV-001** single source of truth for raw stock + the failing reconciliation test
- **INV-002** negative-stock warning
- **FIN-002** fix the legacy-field material estimate
- **REL-002** stop swallowing inventory failures
- **FIN-001** COGS inventory bridge — *only after the valuation-basis decision*

### Phase 3 — Structural (weeks 5–8)
DATA-001 transactions on the 5 write paths · SEC-003 audit log · TEST-001/002 pure-function + integration tests (write the tests *with* the transaction work, not after) · PERF-003 pagination.

### Phase 4 — Experience (weeks 9–12)
FE-001 React Query on the 5 heaviest screens · UX-002 real overview page on the existing endpoint · UX-007 sortable columns in the shared `Table` · UX-009 styled destructive-action dialogs · FE-002/4 virtualisation + code splitting.

### Phase 5 — Maintainability (ongoing)
QUAL-001 split the two 4,500-line services · QUAL-002 break the circular dependency · BL-007 unify the production schema · QUAL-003 remove dead code.

---

## Decisions needed from the business owner

Nothing in Phase 2 or later should be implemented until these are answered. Each changes reported profit.

1. **Inventory valuation basis for COGS** — weighted average or FIFO? (FIN-001)
2. **Should past invoices change when a product's weight is corrected?** Current behaviour rewrites them; the alternative is a credit/debit note. (DATA-003)
3. **Should claim `mfgLossAmount` (Rs 15,814 currently open) be a P&L expense?** It is tracked but deducted nowhere.
4. **Is freight part of material cost?** It is included in `payable` and in `product-cost` rates, excluded from `estimateMaterialCost`.
5. **Is the 12-month rolling overhead window correct** for product standard cost, or should it be the trailing 3 months? (`product-cost.js:18`)
6. **Should product-level `pricePerKg` be used at all?** It is 0 on all 146 products; pricing happens per builty line. Either populate it or remove the fields from the UI. (DATA-004)
7. **Should the system track salary owed, not just salary paid?** (GAP-001)
8. **Should negative stock be blocked, warned, or silently allowed?** Currently silent; 27 products are negative. (INV-002)
