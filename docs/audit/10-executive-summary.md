# 10 — Executive Summary

**Khan Engineerings Factory Management System · Audit of 2026-11-23 · branch `main` @ `826a922`**

Method: full source review of 82,000 lines across backend and frontend, plus instrumented measurement of 20 API endpoints and ten data-integrity checks run against a throwaway local restore of the 2026-11-22 export. **Production was never read from, written to, or modified.**

---

## 1. Overall project health

**Fundamentally sound, with a small number of sharp edges that matter.**

This is a real, working ERP built by someone who clearly understands foundry operations. The domain modelling is accurate (hub/drum families, scrap/daig materials, builty-based sales, per-kg pricing, kharad/casting splits). The code is consistently structured, consistently named, and — unusually — honestly commented: several of the most serious findings in this report were sign-posted in the source by the author.

The hard evidence supports that assessment. Ten integrity checks across the money layer came back **clean**:

```
customer ledger invoices ↔ builty totals    697 rows, Rs 74,436,627 both sides   DIFF 0
customer ledger payments ↔ payment docs     390 rows, Rs 67,027,592 both sides   DIFF 0
builty totalAmount ↔ line items − discount                   0 mismatches / 697
builty amountPaid + balance = totalAmount                    0 mismatches / 697
purchase amountPaid + balance = payable                      0 mismatches / 149
batch inputs ↔ production-consume movements   186,899.73 kg daig, exact match
orphaned foreign keys (4 relationships checked)                             0
batches missing stock movements · cancelled batches with stray movements  0 · 0
```

The payment-allocation engine — one shared implementation covering both receivables and payables, with a correctly-handled rule that a payment never settles a charge dated after it — is the strongest part of the system and can be relied on.

What holds it back is not the business logic. It is the operational layer around it: authentication, atomicity, observability, and backups.

| Dimension | Rating |
|---|---|
| Domain modelling | **Strong** |
| Ledger integrity (AR / AP) | **Strong** |
| Code consistency & comments | **Strong** |
| UI design system & data entry | **Strong** |
| Inventory correctness | **Weak** — two disagreeing sources of truth |
| P&L correctness | **Weak** — purchase-based COGS |
| Security | **Critical** |
| Atomicity & reliability | **Critical** |
| Performance | **Weak** — latent, not yet acute |
| Testing | **Poor** — 0 % on money and stock |
| Observability & backups | **Poor** |

---

## 2. Most critical issues

**① A single 4-digit PIN, published in the repository, grants full admin access.**
`auth.service.js:61` falls back to the literal `"3811"`, which is also committed in `.env.example`. There is no rate limiting, no lockout, and the PIN always resolves to the admin user — so every session is admin and no action can be attributed to a person. The API is publicly reachable. *(07 SEC-001)*

A second route, `POST /api/personal-banks/auth/reset-pin`, is unauthenticated and accepts the same PIN to overwrite the bcrypt-protected bank PIN and clear its lockout. *(07 SEC-002)*

**② Raw material stock is reported two different ways, and they disagree.**
Verified on the snapshot: the inventory overview says 7,001 kg of daig; the as-of inventory report says 7,510 kg. The 508.5 kg gap is customer claim returns — `purchaseService.getStock()` computes `purchases − consumption` and never reads the stock-movement ledger where those returns live. *(02 BL-001)*

**③ Nothing is transactional.**
`grep` for `startSession` across the backend returns nothing, while every financial operation writes 3–10 documents in sequence. The worst case is a production edit, which **deletes all of a batch's stock movements before rewriting them** — a window in which a failure leaves inventory permanently wrong. *(04 DB-008)*

**④ Monthly profit tracks purchasing, not performance.**
`cogs = purchases in the period + overhead`, with no opening/closing inventory adjustment. Buy a truckload of scrap on the 30th and the month shows a loss; sell from it next month and next month looks great. For a foundry buying metal in irregular lots this can invert a month's reported result. *(02 BL-018)*

**⑤ There is no verified backup.**
The newest dump is dated 2026-10-29. Combined with ③ and with four unguarded mass-rewrite operations, a single bad action is unrecoverable. Free and shared Atlas tiers have no continuous backup — **the cluster tier needs to be confirmed today.** *(04 §7)*

---

## 3. Biggest performance bottlenecks

Measured round trips per request (local restore; production adds Atlas network latency to each):

| Endpoint | DB round trips | Payload |
|---|---:|---:|
| `/dashboard` page, 12-month range | **610** | 150 KB |
| `/api/finance/party-sales-margin` (year) | 323 | 65 KB |
| `/api/finance/production-margin` (year) | 283 | 84 KB |
| `/api/dashboard` *(dead code)* | 134 | 8 KB |
| `/api/production` | 3 | **2.4 MB** |

The root causes are narrow and fixable:

- Multi-month reports loop months with `for … await` instead of `Promise.all` — 12× the latency for no reason. *(03 DF-001)*
- `inventory/overview` computes finished stock 2–3× per request because `getAlerts()` re-calls its own siblings. *(03 DF-002)*
- N+1 `Product.findById` loops produce 89–101 product lookups on a year report. *(03 DF-005)*
- No pagination anywhere: 1,447 production rows at 2.4 MB per visit. *(03 DF-003)*

**Nothing is slow because of data size** — the whole database is 6 MB. Everything slow is slow because of round-trip count, and most of it is one `Promise.all` away.

---

## 4. Biggest data-fetching problems

- **React Query is installed, its provider is mounted, and not one component uses it.** 621 `useState` and 165 `useEffect` do the work instead. No caching, no deduplication, no cancellation, no retry — and the configured `staleTime` is dead code. The library is already paid for in the bundle. *(05 FE-001)*
- **No `AbortController` anywhere.** Change a date range from a year to a month and the slow response can land last, silently overwriting correct data with stale numbers. *(05 FE-003)*
- **Reads that write.** `GET /api/builty/:id` re-saves every builty for that customer. `GET /api/claims` recomputes and may rewrite **all 697 builties** plus their ledger rows — once per process, which on serverless means **once per cold start, indefinitely**. *(03 DF-004)*

---

## 5. Most important business-logic risks

| Risk | Evidence |
|---|---|
| Raw stock disagrees between two screens | daig off by 508.5 kg, scrap by 26 kg — verified |
| COGS excludes the inventory bridge | `finance.service.js:237` |
| 27 products hold negative stock, −101 units, with no warning anywhere | `assertStockAvailable()` is an empty stub |
| Correcting a product's weight **re-prices already-issued invoices** and updates their ledger rows | `apply-product-weight.js` |
| Changing the waste % rewrites every historical batch and its stock movements | `applyFamilyWasteFromDate` |
| `estimateMaterialCost` reads legacy fields that are `null` on all modern batches, so it returns ≈ 0 | `finance.service.js:287` |
| Per-batch costing is structurally impossible — **0 of 1,341 expenses link to a batch** | documented in `product-cost.js:9` |
| All 146 products have `pricePerKg = 0` and `costUpdatedAt = null`; inventory *value* rests on this | snapshot check |
| Salary has no accrual — the system cannot answer "what do I owe my workers?" | no model for it |

---

## 6. Most important UI/UX problems

- **There is no overview screen.** "Dashboard" is a hub/drum margin report. The KPIs an owner opens the app for — cash balance, today's sales, outstanding receivables, low-stock count — are computed by `/api/dashboard` and **displayed nowhere**. *(06 UX-002)*
- **Eight working pages are unreachable** from the navigation, including the low-stock alerts screen and the only place to manage categories, sizes and warehouses. *(06 UX-001)*
- **No column sorting on any of 46 screens.** "Biggest outstanding party first" is not achievable. *(06 UX-007)*
- **No pagination, and one silent truncation** — stock movements are capped at 500 of 4,814 with no "showing N of M" notice, so a user reconciling stock is looking at a partial ledger without knowing it. *(06 UX-008)*
- **Twenty destructive actions use the browser's `window.confirm()`** with generic text, while the far less dangerous duplicate-entry case gets a well-designed styled dialog. *(06 UX-009)*

Against that: the design system is coherent and domain-appropriate, the Urdu/bilingual support is serious, loading and error states are near-universal, date ranges persist across navigation, and **the same-day duplicate-prevention flow is genuinely excellent** — it warns with full context rather than blocking, which is exactly right for a factory floor.

---

## 7. Security concerns

| | Finding |
|---|---|
| **P0** | Shared 4-digit PIN → admin; default `3811` hardcoded and committed; no rate limit, no lockout |
| **P0** | Unauthenticated `reset-pin` bypasses the Personal Banks bcrypt PIN and its lockout |
| **P1** | No RBAC in practice — `requireRole` guards exactly one route, and every session is admin anyway |
| **P1** | No audit log — history-rewriting operations leave no record of who or why |
| **P2** | JWT duplicated into `localStorage` beside the httpOnly cookie |
| **P2** | No `helmet`, no rate limiting, no body-size limit; unescaped `new RegExp(userInput)` in ~12 services (ReDoS) |
| **P2** | `errorHandler` returns raw `err.message` on 500s, including DB connection hints |

**Verified clean:** no secrets committed (`.gitignore` is correct; only `.env.example` is tracked); no NoSQL injection vectors; no XSS (`dangerouslySetInnerHTML` appears zero times); CORS is a strict allowlist; bcrypt at cost 10; no file-upload surface.

---

## 8. Quick wins — ~2–3 days, high value, low risk

| | Action | Effort | Effect |
|---|---|---|---|
| 1 | Verify/enable Atlas backup, perform one test restore | 1 h | Makes every other fix recoverable |
| 2 | Rotate `APP_PIN`; delete `3811` from source and `.env.example` | 30 min | Closes a published credential |
| 3 | Authenticate `reset-pin` | 10 min | Closes the bank-PIN bypass |
| 4 | `Promise.all` the finance month segments | 1 h | Year dashboard: 610 → ~50 serial round trips |
| 5 | Rate-limit `/api/auth/login` | 1 h | Makes the PIN non-brute-forceable |
| 6 | Compute inventory once, pass into `getAlerts()` | 2 h | Removes 2 full collection scans per request |
| 7 | Remove the claims-list mass rewrite | 2 h | Stops an unlogged bulk write per cold start |
| 8 | Bundle the PDF font, wrap in try/catch | 2 h | Likely fixes Urdu PDF exports in production |
| 9 | Delete the dead dashboard module, rewrite, middleware matcher | 2 h | −450 lines, −39 kB |
| 10 | Link the 8 orphan pages into the nav | 1 h | Makes the low-stock screen reachable |
| 11 | Add 4 indexes, drop 1 stale | 1 h | Pre-empts the next growth stage |
| 12 | Weighted average rate, `$in` batching, settings cache | 4 h | `products.find` 89 → ~3 per report |

Together these close both P0 security holes, the worst performance item, two silent-corruption paths, and the most-missed UI gap — without touching a single business rule.

---

## 9. Recommended improvements beyond the quick wins

**Correctness** — make `StockMovement` the single source of truth for raw material; add the opening/closing inventory bridge to COGS; warn on negative stock; fix the legacy-field material estimate; stop swallowing failed inventory writes.

**Reliability** — transactions on the five multi-document write paths; an audit log; structured logging and error tracking; scheduled, tested backups.

**Performance** — pagination on the five heaviest endpoints; adopt the React Query that is already installed; virtualise the 1,447-row tables.

**Experience** — build a real overview page on the `/api/dashboard` endpoint that already exists; sortable columns in the shared `Table`; styled destructive-action dialogs that state consequences.

**Maintainability** — split the two 4,500-line services; break the circular dependency behind ~40 lazy `require()` calls; unify the dual production schema; test the pure functions (`allocate-payments.js` is 96 lines, underpins every receivable and payable figure, and has no tests).

---

## 10. Roadmap

| Phase | Window | Content | Risk |
|---|---|---|---|
| **0 · Safety net** | Day 1 | Backup verified + test-restored · PIN rotated · `reset-pin` secured · tagged release | None |
| **1 · Quick wins** | Week 1 | Items 4–12 above — performance, dead code, indexes, nav | Low — no logic change |
| **2 · Correctness** | Weeks 2–4 | Single source of truth for stock · negative-stock warning · material-estimate fix · COGS inventory bridge | **Medium — needs owner sign-off** |
| **3 · Structural** | Weeks 5–8 | Transactions · audit log · test suite (written alongside, not after) · pagination | Medium |
| **4 · Experience** | Weeks 9–12 | React Query · overview page · sortable tables · safe deletes · virtualisation | Low |
| **5 · Maintainability** | Ongoing | Split the big services · break the dependency cycle · unify the production schema | Low |

### Eight decisions needed before Phase 2

Each one changes reported profit, so none should be guessed:

1. Inventory valuation basis for COGS — weighted average or FIFO?
2. Should correcting a product's weight change **already-issued** invoices, or generate a credit note?
3. Should claim manufacturing loss (Rs 15,814 open) be a P&L expense?
4. Is freight part of material cost? (Currently included in two places, excluded in a third.)
5. Is a 12-month rolling window right for product standard cost, or should it be 3 months?
6. Should product-level `pricePerKg` be used at all? It is 0 on all 146 products.
7. Should the system track salary **owed**, not just salary paid?
8. Should negative stock be blocked, warned, or silently allowed? (27 products are currently negative.)

---

## Answering the three questions the brief asks

**Can the business owner trust the figures?**
*Party balances, receivables and payables — yes.* They reconcile exactly, and the allocation logic is correct and shared. *Inventory and monthly profit — not yet.* Raw stock is reported two different ways with a verified 508.5 kg gap, inventory valuation rests on product cost fields that have never been recomputed, and COGS tracks purchasing rather than consumption.

**Can an operator work quickly?**
*For data entry, yes.* Two to three clicks to every daily task, a well-designed duplicate-prevention flow, searchable selects, genuine Urdu support. *For monitoring, no.* No overview screen, no column sorting, no pagination, and the low-stock page is unreachable from the menu.

**Is the system fast, secure, reliable and maintainable?**
*Fast enough today* at 6 MB of data, but structurally wasteful — 610 round trips for one dashboard view, with the main fix being a single `Promise.all`. *Not secure* — a published 4-digit PIN with no rate limiting is the only barrier to the entire financial database. *Not reliable* — no transactions, swallowed write failures, a three-week-old backup. *Reasonably maintainable* — consistent structure and honest comments, held back by two 4,500-line files and an untested core.

---

## Limitations of this audit

- **Production was never queried.** All measurements come from a local restore of the 2026-11-22 export into a scratch database. Absolute latencies are therefore *lower bounds* — Atlas adds network round-trip cost per operation, which is exactly where this system is weakest.
- **Vercel runtime behaviour was not observed.** Cold-start cost, Chromium availability, and font availability were reasoned about from configuration. Items depending on them are marked `POTENTIAL` in document 09.
- **The voice-entry module** (~4,600 lines) was surveyed structurally but not functionally tested; it requires browser speech APIs.
- **No load or concurrency testing** was performed. Race-condition findings are from code analysis, not reproduction.
- **No business rule was inferred.** Where the correct behaviour depends on how the owner runs the factory, the question is listed for decision rather than answered.

---

## Document index

| | |
|---|---|
| `01-project-architecture.md` | Stack, module map, dependency graph, data volumes |
| `02-business-logic-audit.md` | Workflow-by-workflow findings across all eight domains |
| `03-api-and-data-fetching.md` | Measured round trips and payloads per endpoint |
| `04-database-performance.md` | Schema, indexes, transactions, integrity, backups |
| `05-frontend-performance.md` | Bundles, rendering, caching, dead configuration |
| `06-ui-ux-audit.md` | Navigation, dashboard, tables, forms, visual design |
| `07-security-and-reliability.md` | Auth, authorisation, injection, error handling, recovery |
| `08-testing-and-quality.md` | Coverage gaps, recommended tests, code quality |
| `09-prioritized-improvement-roadmap.md` | Every finding with ID, evidence, impact, fix, complexity |
| `10-executive-summary.md` | This document |
