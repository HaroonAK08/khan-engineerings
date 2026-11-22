# 08 — Testing & Code Quality

---

# Part A — Testing

## Current state

```
$ cd backend && npm test
# tests 11
# pass 11
# fail 0
# duration_ms 1079
```

**One test file**, `backend/test/report-handouts.test.js`, 11 cases, all passing. It verifies that the party / supplier / group / builty handouts render **identical rows and layout across preview, PDF and Excel**. That is a genuinely valuable property and the tests are well-targeted.

**Frontend: no test runner, no test files, no testing dependency.**

## Coverage against the high-risk workflows

| Workflow | Tested |
|---|---|
| Create / edit a purchase | ❌ |
| Receive raw material (stock movement on purchase) | ❌ |
| Consume raw material in production | ❌ |
| Record finished goods | ❌ |
| Edit or reverse a production batch | ❌ |
| Record a payment | ❌ |
| Partial payment allocation | ❌ |
| Salary calculation | ❌ |
| Expense recording | ❌ |
| Profit / loss calculation | ❌ |
| Concurrent stock updates | ❌ |
| Duplicate form submission | ❌ |
| Report handout rendering | ✅ 11 cases |

**0 % coverage of the money and stock logic.** Every finding in document 02 lives in untested code.

## TEST-001 (P1) — The highest-value missing tests

These are pure functions with no database dependency. They can be tested today with `node --test` and no new tooling:

| Module | What to assert |
|---|---|
| `utils/allocate-payments.js` | this-month-first ordering · never settles a charge dated after the payment · partial payments split correctly across invoices · adjustments settle last · rounding stays at 2dp across a long chain |
| `utils/builty-discount.js` | `withNetLineTotal` distributes a builty-level discount proportionally · discount is clamped to subtotal · zero-subtotal case |
| `utils/product-weight.js` | `resolveWeightKg` returns the catalog weight with no history · the pre-first-change weight for an earlier date · the correct step for a date between two changes |
| `settings.resolveWastePercent` | same three cases for waste % |
| `modules/finance/casting-khrad.js`, `labour-groups.js` | classification rules |

`allocate-payments.js` alone underpins every receivable and payable figure in the system. It is 96 lines, pure, and completely untested.

## TEST-002 (P1) — Integration tests the audit's findings demand

Run against an ephemeral `mongodb-memory-server` (or the same throwaway-restore approach this audit used):

1. **Raw stock agreement** — assert `purchaseService.getStock()` equals `getRawStockAsOf(today)`. *This test fails today* (02 BL-001: daig off by 508.5 kg) and is the regression guard for the fix.
2. **Purchase → ledger → movement** — one purchase produces exactly one `LedgerEntry(purchase)`, the right `StockMovement`, and correct supplier balance.
3. **Production round trip** — produce → consume movement + output movement; `updateProduce` leaves exactly one of each; `remove` leaves none.
4. **Builty lifecycle** — create → sale movements + invoice ledger row; pay partially → status `partial`, balance correct; delete → movements and ledger rows gone.
5. **Payment allocation across months** — build a 3-month invoice/payment fixture and assert the resulting per-invoice `amountPaid`.
6. **Claim return** — a `returned` disposition credits finished goods and a scrap-loss credits raw material, and both show up in *both* stock views.
7. **Duplicate guard** — a same-shape same-day entry returns 409 `SAME_DAY_DUPLICATE`; retrying with `confirmDuplicate: true` succeeds.
8. **Ledger reconciliation invariants** — the five checks this audit ran (02 §D) as standing assertions.

## TEST-003 (P2) — No frontend tests

No Jest/Vitest, no React Testing Library, no Playwright. The 1,000+ line page components have no safety net. Minimum viable: Playwright smoke tests for the five daily flows (login → builty → payment → production → purchase).

## TEST-004 (P2) — No seed/fixture tooling

`src/scripts/seedAdmin.js` creates one user. There is no fixture set for a realistic factory, so any test author must build one first — which is why there are none.

---

# Part B — Code Quality

## What is genuinely good

- **Consistent module shape.** Every one of the 22 modules follows `model / service / controller / routes` with the same conventions. A new developer can navigate any module after reading one.
- **Centralised domain constants.** `modules/domain/mfg.constants.js` is the single source for materials, families, stages, expense taxonomy, stock types and reasons — with deliberate retention of legacy ids so historical documents stay valid, and explicit `LEGACY_STAGE_MAP` / `LEGACY_CATEGORY_MAP` migration tables.
- **Shared utilities instead of copy-paste** where it counts: `allocate-payments` serves both AR and AP; `product-weight` serves builty, production and claims; `builty-discount` serves every revenue aggregation.
- **Honest comments.** The code explains *why* in the places that need it:
  - `product-cost.js:9` — why `otherCost` cannot come from batch-linked expenses
  - `app.js:47` — why calling `express.json()` on Vercel hangs
  - `middleware.ts` — why server-side auth is not enforced there
  - `builty.service.js:118` — that stock may go negative, deliberately
  - `finance.service.js:971` — why multi-month ranges are segmented per calendar month

  This is unusually good practice and made the audit far easier.
- **TypeScript `strict: true`** on the frontend, 0 type errors.
- **Clean lint:** 6 warnings, 0 errors.
- **Consistent error convention** (`err.statusCode`) and a single error handler.

## QUAL-001 (P2) — Two files hold 37 % of the backend

| File | Lines | Functions |
|---|---:|---:|
| `modules/reports/reports.service.js` | 4,911 | 60+ |
| `modules/finance/finance.service.js` | 4,572 | 50+ |

`finance.service.js` mixes P&L, production margin, party margin, charges calculation, electricity accrual and casting rates. `computeProductionMarginForPeriod` is ~1,100 lines; `computePartySalesMarginForPeriod` is ~550.

`reports.service.js` mixes data assembly, 20 export handlers, PDF/Excel row formatting, localisation and handout composition.

Natural split points already exist along function boundaries — e.g. `finance/{overview,production-margin,party-margin,charges,electricity}.js` and `reports/{data,exports,handouts,localize}.js`. No logic change required; this is pure file surgery.

## QUAL-002 (P2) — ~40 lazy `require()` calls work around a circular dependency

```js
const inventoryService = require("../inventory/inventory.service");   // inside a function body
const financeService  = require("../finance/finance.service");        // inside a function body
```

The cycle is real: `products/product-cost` → `finance.service` → production/expense data → `production.service` → `products/product-cost`. Moving any of these to a top-level import will break module initialisation, and nothing in the code says so. At minimum this needs a comment at each site; properly, the shared rate computation should be extracted into a leaf module that both sides import.

## QUAL-003 (P2) — Dead code

| Item | Size | Evidence |
|---|---|---|
| `modules/dashboard/*` (service + controller + routes) | ~350 lines, 134 DB ops | No frontend importer (02 BL-020) |
| `frontend/src/lib/dashboard-api.ts` | 100 lines | Imported by nothing |
| `next.config.ts` `rewrites()` for `/api` | — | Route handler takes precedence (05 FE-006) |
| `src/middleware.ts` matcher | 39 kB bundle | Returns `next()` unconditionally |
| Email/password login | ~20 lines | Commented out behind `USE_PIN_LOGIN = true` |
| Staged production API (`recordFurnace`/`recordTurning`/`advanceStage`) | ~200 lines | `produce()` bypasses it; 0 batches in staged state |
| `modules/expenses/expense.constants.js` | 17 lines | Self-documented `@deprecated` re-export shim |
| `onTurningBreakage()` | — | Empty function body |
| 7 empty collections + their CRUD routes | — | `productcategories`/`productsizes` still `$lookup`-joined on a hot query |

## QUAL-004 (P2) — Duplicated logic

- `roundMoney` / `roundKg` / `parseDate` / `httpError` are redefined in **12+ service files**. They should be one `utils/num.js` + `utils/http.js`.
- `builty/new/page.tsx` (1,143) and `builty/[id]/edit/page.tsx` (1,278) are forks of the same form.
- Average-material-rate computation appears three times with two different formulas: `product-cost.js:33` (correct, `Σspend/Σkg`), `claim.service.js:189` (correct), `purchase.service.js:299` + `finance.service.js:288` (incorrect, unweighted `$avg`).
- The three-way legacy/current branch in production reads (`outputProgress → outputs → legacy`) is written out longhand in six places instead of behind one `normalizeBatch()` helper.

## QUAL-005 (P2) — No input-validation layer

Every service hand-rolls `assertPositiveNumber`, `assertNonNeg`, `parseDate`, `httpError`. It is consistent and readable, but it means validation lives inside business logic, cannot be reused by the frontend, and produces no machine-readable error shape. `zod` is already a frontend dependency; sharing schemas would remove ~300 lines of assertion code and make the contract explicit.

## QUAL-006 (P3) — No API documentation

~120 endpoints, no OpenAPI spec, no route-level JSDoc, no README section. The only way to learn the contract is to read the controllers.

## QUAL-007 (P3) — Migration scripts are unversioned

Nine one-off scripts in `src/scripts/` (`migrate-to-mfg-erp`, `rebuild-finished-stock`, `resync-party-payments`, `recalc-product-costs`, …) with no record of which have run against production, no idempotency markers, and no ordering. Some are destructive (`rebuild-finished-stock` deletes movements before rebuilding).

## QUAL-008 (P3) — Minor

- `inventory.service.js:104-108` — `data.movementDate || data.movementDate` and `data.refType || data.refType` (no-op self-fallbacks, likely a leftover rename).
- `inventory.service.js:127` — `deleteMovementsByRef` builds `$or` with two identical clauses.
- `production.service.js:510` — an empty `if` block with only a comment.
- `assets/asset.model.js:48` — a one-off `dropIndex` repair that runs on every boot and fails silently.
- `expenses/expense.constants.js` — a deprecated shim still imported by `finance.service.js`.

---

## Quality scorecard

| Dimension | Rating | Note |
|---|---|---|
| Module structure | **Good** | Consistent, predictable, navigable |
| Naming | **Good** | Domain language used throughout (builty, kharad, daig, hub, drum) |
| Comments | **Very good** | Explains *why*, including inconvenient truths |
| Domain modelling | **Good** | Constants centralised; legacy handled deliberately |
| Type safety (FE) | **Good** | `strict: true`, 0 errors |
| Type safety (BE) | **Weak** | Plain CommonJS JS, no JSDoc types, no runtime schema |
| File size | **Poor** | Two 4,500+ line services |
| Duplication | **Fair** | Helpers duplicated 12×; one forked 1,200-line form |
| Dead code | **Fair** | ~700 lines plus a whole unused module |
| Test coverage | **Poor** | 11 tests, 0 % on money and stock |
| Documentation | **Poor** | No API docs |
| Observability | **Poor** | `console.error` only |

**Overall: a competently built, internally consistent codebase written by someone who understood the domain, carrying the usual debt of fast iteration — oversized service files, an untested core, and no observability. The structure is sound enough that the fixes in document 09 are mostly additive rather than architectural.**
