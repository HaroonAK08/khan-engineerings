# 01 — Project Architecture

> Audit date: 2026-11-23 · Branch `main` @ `826a922`
> Evidence base: source inspection + a throwaway local restore of the 2026-11-22 cloud export into a scratch database `khan-audit`. **No production data was read, written, or modified.**

## 1. Stack (identified, not assumed)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 15.5.20 (App Router, Turbopack), React 19.1 | 74 routes, all `"use client"` |
| UI | Tailwind v4, shadcn-style primitives on `@base-ui/react`, lucide-react | 17 UI primitives in `components/ui` |
| FE state | Zustand (5 stores) + `useState`/`useEffect` | `@tanstack/react-query` installed + provider mounted but **never used** (see 05) |
| FE forms | react-hook-form + zod | Used on ~8 of 46 screens |
| Backend | Express 5.2, CommonJS, Node ≥ 22 | `backend/src/app.js` mounts 22 route modules |
| ORM | Mongoose 9.7 | 28 models |
| Database | MongoDB Atlas 8.0 (`khan-engineerings`) | 35 collections |
| Auth | JWT (HS256, 7-day) in httpOnly cookie **and** localStorage | PIN-based; see 07 |
| Exports | exceljs (XLSX), pdfkit (PDF), puppeteer-core + @sparticuz/chromium (HTML→PDF) | |
| Deploy | Vercel (frontend + serverless API via `backend/api/index.js`) | `maxDuration: 60`, `memory: 1024` |
| Desktop | Electron wrapper (`desktop/`) that boots local mongod + both apps | GitHub Actions release workflow |

### Request path

```
Browser
  → Next.js route handler  src/app/api/[...path]/route.ts    (full proxy, buffers body)
     ⚠ next.config.ts ALSO declares a rewrite for /api/:path* — route handlers win, so the
       rewrite is dead config. Every API call pays an extra Node hop.
  → Express app  backend/src/app.js
  → module routes → controller → service → Mongoose → Atlas
```

On Vercel the Express app is wrapped by `backend/api/index.js`, which re-implements CORS, re-parses the body (Vercel pre-parses it, and calling `express.json()` twice hangs), and short-circuits `/health` and `/db-check` before touching Mongo.

## 2. Module map

22 mounted route modules under `/api`:

`auth` · `suppliers` · `purchases` · `suppliers/:id/ledger` · `inventory` · `products` · `production` · `expenses` · `workers` · `settings` · `assets` · `personal-banks` · `notes` · `customers` · `party-groups` · `salesmen` · `builty` · `claims` · `finance` · `dashboard` · `reports`

Plus two service-only modules with no routes of their own: `domain` (constants) and `party-prices`.

### Size concentration

| File | Lines |
|---|---|
| `modules/reports/reports.service.js` | 4,911 |
| `modules/finance/finance.service.js` | 4,572 |
| `modules/production/production.service.js` | 1,329 |
| `modules/builty/builty.service.js` | 1,173 |
| `modules/inventory/inventory.service.js` | 1,093 |
| **Backend total** | **25,690** |
| `frontend/src/lib/i18n/messages.ts` | 5,011 |
| `frontend/src/lib/voice/parser.ts` | 1,780 |
| `frontend/src/app/dashboard/page.tsx` | 1,425 |
| **Frontend total** | **56,355** |

Two files hold 37 % of all backend logic. See 08.

## 3. Domain model

The business is a **foundry**: buy scrap/daig metal by the kg → cast and machine it into *hubs* and *drums* → sell by builty (delivery note / invoice) to parties.

### Core entities

```
Supplier ──< Purchase ──< LedgerEntry (purchase | payment | adjustment)
                │
                └─ raw material (kg, by materialType: scrap | daig)
                           │
                           ▼
                   ProductionBatch ── inputs[] (materialType, kg)
                     family: hub|drum|other   outputs[] (product, qty, weightKg)
                     stages[]                 outputProgress[]
                     furnaceWasteKg
                           │
                           ▼
                      Product (weightKg + weightHistory, standardCost, family)
                           │
                           ▼
Customer ──< Builty ──< items[] (product, qty, pricingMode, ratePerKg|unitPrice)
   │          │
   │          ├──< CustomerPayment ──< CustomerLedgerEntry (invoice|payment|adjustment)
   │          └──< Claim ──< items[] (disposition: returned|rework|…)
   │
   ├── PartyGroup (channel: power_engineering | ik_engineering)
   └──< CustomerInstrument (cheque | promise)

StockMovement — append-only ledger: itemType × direction × reason × qty
                (purchase, production_consume, production_output, sale,
                 claim_return, adjustment, transfer_in/out, …)

BatchExpense  — despite the name, 100 % of rows are factory overhead (batch: null).
                category ∈ {electricity, taxes, fixed_salary, paint, …}
                scope ∈ {hub, drum, common}  → drives per-kg overhead allocation
Worker        — salaries are BatchExpense rows with category "fixed_salary"
AppSetting    — single doc: payroll windows, waste %, tax split, electricity split
```

### Dependency direction

```
reports ──────────┐
finance ──────────┼──→ builty ──→ customers ──→ party-groups
dashboard ────────┤      │
                  │      └──→ inventory ──→ purchases ──→ ledger ──→ suppliers
claims ───────────┤      │         │
                  │      │         └──→ production ──→ products ──→ product-cost
expenses ─────────┘      └──→ party-prices                   │
workers ──→ expenses                                          └──→ finance ⟲ CYCLE
settings ──→ production ──→ inventory
```

**Circular dependency:** `products/product-cost.js` → `finance.service.getProductionMargin()` → reads expenses/production → and `production.service` calls back into `product-cost`. It is broken at runtime only by `require()` being placed inside function bodies (≈ 40 lazy requires across the backend). This is load-bearing: converting any of them to a top-level import will break module initialisation.

## 4. Data volumes (2026-11-22 snapshot)

| Collection | Docs | BSON |
|---|---:|---:|
| productionbatches | 1,447 | 1.85 MB |
| stockmovements | 4,814 | 1.49 MB |
| customerledgerentries | 1,181 | 247 KB |
| batchexpenses | 1,341 | 349 KB |
| partyproductprices | 840 | 139 KB |
| builties | 697 | 491 KB |
| customerpayments | 390 | 88 KB |
| ledgerentries | 242 | 53 KB |
| purchases | 149 | 44 KB |
| products | 146 | 54 KB |
| customers | 96 | 18 KB |
| workers | 39 | 10 KB |
| claims | 28 | 15 KB |
| suppliers | 7 | 1.3 KB |

Roughly **6 MB total**. This matters for how findings are prioritised: *nothing is slow because of data size*. Everything slow is slow because of **round-trip count** and **repeated recomputation** (see 03).

Five collections are empty leftovers: `salesorders`, `dispatches`, `vaultassets`, `vaultsnapshots`, `productcategories`, `productsizes`, `assetitems`.

## 5. Cross-cutting mechanisms

| Concern | Implementation | Assessment |
|---|---|---|
| Auth | `middleware/auth.js` — `requireAuth` on every router | Enforced server-side ✓ |
| Roles | `requireRole` used on exactly **one** route (`POST /auth/register`) | Effectively no RBAC |
| Errors | `middleware/errorHandler.js`, `err.statusCode` convention | Consistent ✓ |
| Validation | Hand-rolled `assertX` helpers per service | Consistent style, no shared schema |
| Duplicate guards | `utils/sameDay.js` — 409 `SAME_DAY_DUPLICATE`, user confirms | Good pattern, applied to 8 entry points ✓ |
| Payment allocation | `utils/allocate-payments.js` — this-month-first, then older, then adjustments | Single shared implementation for both AR and AP ✓ |
| Historical weights | `utils/product-weight.js` `resolveWeightKg(product, asOf)` | Correct as-of resolution ✓ |
| Transactions | **None** | See 04 / 07 |
| Caching | One 60 s in-process cache in `product-cost.js` | See 03 |
| Background jobs | None | |
| Audit log | None | |
| Rate limiting | None | |
| Structured logging / APM | None (21 `console.error`) | |

## 6. Deployment & environment

- `backend/.env` points at **production Atlas** even for local `npm run dev`. There is no separate dev database. `npm run dev:prod-db` exists as well, which suggests the distinction was intended but never landed.
- Secrets are correctly gitignored; no credentials are committed. The one exception is `APP_PIN=3811` in `backend/.env.example`, which is also the hardcoded fallback in two source files (see 07).
- `connectDB` caches the connection on `global.__mongoose` with `maxPoolSize: 5`, `bufferCommands: false`, 5 s socket timeout — appropriate for serverless, except that a 5 s `socketTimeoutMS` will abort the slow endpoints documented in 03.
- Backups: three ad-hoc `mongodump` directories, newest `2026-10-29`. No schedule, no retention policy, no tested restore.

## 7. Verified limitations of this audit

- Production Atlas was never queried. All measurements are against a local restore; absolute latencies are therefore **lower bounds** — Atlas adds network RTT per round trip, which is exactly the dimension where this system is weakest.
- Vercel runtime behaviour (cold starts, Chromium availability, font availability) was reasoned about from configuration, not observed. Items that depend on it are marked *potential* in 09.
- The voice-entry module (`lib/voice/`, ~4,600 lines) was surveyed structurally but not functionally tested; it needs browser speech APIs.
- No load testing was performed.
