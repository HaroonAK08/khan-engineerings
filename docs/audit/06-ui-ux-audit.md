# 06 — UI / UX Audit

Reviewed from three seats: the **business owner** reading numbers, the **daily operator** entering work, and a **product designer** looking at coherence.

---

## 1. Navigation & information architecture

### What works

- A 13-item primary sidebar with expandable children for the four multi-page areas (Dashboard/Finance, Inventory, Expenses, Party) — flat enough to scan, deep enough to group.
- Sub-navigation bars repeat the children inside each area, so you can move sideways without returning to the sidebar.
- Legacy URLs redirect (`/dashboard/customers` → `/dashboard/party`, `/dashboard/salaries` → `/dashboard/expenses/salaries`, five more in `next.config.ts`).
- Mobile has a real drawer (`Sheet` behind a hamburger, `topbar.tsx:90`), and the sidebar is correctly `hidden md:flex`.

### UX-001 (P2) — Eight working pages are unreachable

These routes exist, build, and fetch data, but **nothing links to them** — not the sidebar, not a subnav, not any other page:

```
/dashboard/inventory/alerts        /dashboard/production/costs
/dashboard/inventory/settings      /dashboard/production/reports
/dashboard/inventory/products      /dashboard/production/products
/dashboard/inventory/purchases
```

`/dashboard/inventory/alerts` is the low-stock screen — the one an operator would most want. `/dashboard/inventory/settings` is where categories, sizes and warehouses are managed; with it unlinked, those entities can only be created by typing the URL.

Either surface them or delete them. Right now they are maintenance cost with zero user value.

### UX-002 (P2) — "Dashboard" is the production-margin report

`NAV_ITEMS[0]` is labelled `nav.dashboard` and points at `/dashboard`, whose first child is labelled `financeSubnav.productionMargin` and points at the **same URL**. The landing page is in fact a hub/drum manufacturing-margin analysis with a date-range filter.

There is no overview screen. The KPI set an owner would open the app for — cash balance, today's sales, outstanding receivables, low-stock count, pending orders — is computed by `/api/dashboard` and **displayed nowhere** (see 02 BL-020). That endpoint already exists and works; it just has no page.

### UX-003 (P3) — 13 reports in one flat list

`reports-subnav.tsx` lists received · paid · receivables · monthly-receivables · payables · position · sales · ranking · purchases · production · costs · inventory · statements · yearly, all at one level. "Received" vs "Receivables" vs "Monthly receivables", and "Paid" vs "Payables", are easy to confuse. Grouping into **Money In / Money Out / Operations / Statements** would cost nothing and remove the ambiguity.

---

## 2. Dashboard

Reviewing `/dashboard` as it actually is — the production-margin screen.

**Good:** hub and drum are shown as distinct colour-coded cards (sky / yellow) carrying pieces, finished kg, units sold, material cost, overhead, total cost, cost per kg, sell value, profit and margin %. For a foundry owner this is the right spine of numbers, and the per-family split matches how the business is actually run.

### UX-004 (P1) — Opening the app can take seconds with no progress signal

The default range loads three endpoints totalling 83 database round trips; a one-year range is 610 (see 03). The screen shows a single spinner for the whole page. There is no skeleton, no partial render, no indication that a wider range costs more.

### UX-005 (P2) — Numbers that cannot be cross-checked

The finance overview's profit (purchase-based COGS, 02 BL-018) and the dashboard's production margin (consumption-based) are built on different cost bases and will not agree. Nothing on screen says which is which, and there is no reconciliation view. An owner comparing the two will reasonably conclude one of them is broken.

### UX-006 (P3) — No trend, no comparison

Every figure is a point-in-time total for the selected range. There is no previous-period comparison, no sparkline, no month-over-month delta. `finance/monthly` and `finance/year-progress` exist as separate pages but are not surfaced on the landing screen.

---

## 3. Tables & data management

### UX-007 (P1) — No column sorting anywhere

Surveyed all 46 dashboard screens: **0 implement sortable columns.** Order is whatever the server returns (usually date descending).

An operator who wants "biggest outstanding party first" or "lowest-stock product first" cannot get it. On the receivables, payables, finished-stock and ranking screens this is the single most-missed interaction.

### UX-008 (P1) — No pagination, and one silent truncation

No screen paginates (see 03 DF-003, 05 FE-002). Production History renders 1,447 rows from a 2.4 MB response.

Worse, Inventory → Movements is capped server-side at 500 rows (`inventory.service.js:721`) with **no total count and no "showing 500 of 4,814" notice**. A user reconciling stock is looking at a truncated ledger and cannot tell.

### What works

| Feature | State |
|---|---|
| Loading states | ✅ spinner/skeleton on 46 of 46 data screens |
| Error states | ✅ consistent `toast.error(apiError(err, fallback))` |
| Empty states | ✅ on most list screens |
| Search / filter | ✅ on ~20 screens |
| Date-range filter | ✅ shared `DateRangeFilter` component, persisted in a Zustand store across navigation — genuinely good |
| Horizontal scroll | ✅ `Table` wraps in `overflow-x-auto` |
| Row actions | ✅ present |
| Bulk actions | ⚠️ only Production History (bulk delete, bulk date shift) |
| Export | ✅ XLSX + PDF on 20 report endpoints via a shared `ExportButtons` component |

The date-range persistence deserves particular credit: switching between reports keeps your range, which is exactly right for a reporting-heavy app.

---

## 4. Forms & data entry

### What works — and this is the best-designed part of the UI

- **Same-day duplicate prevention.** The backend returns `409 SAME_DAY_DUPLICATE` with a message naming the party, product and amount; `lib/duplicate-confirm.ts` surfaces a styled dialog; confirming retries with `confirmDuplicate: true`. Applied to purchases, builties, production, payments, expenses, salaries, finance entries and stock adjustments. For a factory floor where the same entry genuinely does repeat, this is the correct design — warn, don't block.
- **Urdu input.** A phonetic Urdu input component plus `nameUr` on suppliers, workers and products, with a locale toggle. Serious bilingual support, not an afterthought.
- **Voice entry** (`/dashboard/today`) — a 1,780-line intent parser for spoken data entry, with a confirmation dialog before anything is written. Ambitious and correctly gated behind confirmation.
- **Searchable selects** for products and workers rather than raw `<select>` lists.
- react-hook-form + zod on the complex forms.

### UX-009 (P2) — Destructive actions use the browser's `confirm()`

Twenty delete paths call native `window.confirm()`:

```
builty · builty history · claims · production history (single + whole day)
purchases (×2) · salary payments (×4) · salesman payments (×2)
expense entries (×2) · asset category · asset item · notes · worker removal
```

Two problems. First, it is visually inconsistent — the app already has a styled dialog for the *less* dangerous duplicate case, but uses a raw OS modal for irreversible deletes. Second, the messages are generic ("Delete this builty?") and do not state the consequence: deleting a builty returns goods to stock and removes ledger entries; deleting a whole production day removes N batches and their stock movements.

Dangerous deletions should name what will happen and how many records are affected.

### UX-010 (P2) — Two near-identical builty forms

`builty/new/page.tsx` (1,143 lines) and `builty/[id]/edit/page.tsx` (1,278 lines) are forks of the same form. They will drift; a validation rule fixed in one will be missed in the other.

### UX-011 (P3) — Price fields that are always empty

All 146 products have `pricePerKg = 0` and therefore `sellingPrice = 0` (see 04 §6). The Products screen shows these columns regardless. Pricing in practice happens per builty line (`pricingMode: "rate_kg"`, per-line `ratePerKg`), so these fields appear to be an abandoned concept being rendered as zeros.

---

## 5. Visual design

**Coherent.** A single design system is applied consistently: shadcn-style primitives on `@base-ui/react`, Tailwind v4 tokens, a `font-data` monospace treatment for numerics, a `font-nameplate` display face for headings, consistent `Card` / `Badge` / `Button` usage, and a light/dark toggle.

Distinctive touches that work: the hub = sky-blue / drum = yellow family colour-coding is carried through cards, badges and table rows; `channel-colors.ts` gives the two sales channels (Power Engineering / IK Engineering) their own consistent palette; `corner-frame.tsx` gives the shell an industrial look that suits the domain.

### UX-012 (P3) — Financial sign and status convention is not fully systematic

Money is formatted through a shared `formatMoney`, but positive/negative emphasis, "owes us" vs "we owe", and payment-status colouring are decided per screen rather than by a shared token set. A `<Money />` component carrying sign, colour and sign-convention would remove a class of misreading on balance-heavy screens.

### UX-013 (P3) — `logo.png` is 876 KB

Served unoptimised on the login page (see 05 FE-007).

---

## 6. User experience

### Operator view — clicks to complete the common tasks

| Task | Path | Verdict |
|---|---|---|
| Record a purchase | Suppliers → party → form | ✅ 2 clicks |
| Record production | Production → New | ✅ 2 clicks |
| Create a builty | Builty → New | ✅ 2 clicks |
| Record a party payment | Party → party → payment | ✅ 3 clicks |
| Pay a worker | Expenses → Salaries → worker | ✅ 3 clicks |
| Check low stock | **URL only** | ❌ UX-001 |
| Add a product category | **URL only** | ❌ UX-001 |

Daily entry is well laid out. It is the *monitoring* half that has holes.

### UX-014 (P2) — No keyboard shortcuts for a keyboard-heavy job

Data entry is numeric and repetitive. There is a calculator popover in the topbar (nice touch) but no global shortcuts — no "new builty", no "save and add another", no field-to-field flow optimisation. For an operator entering 20 builties a day this is the difference between a fast tool and a slow one.

### UX-015 (P3) — Contextual information is thin at the point of decision

When adding a line to a builty, the form does not show current stock for that product, the party's last price, or the party's outstanding balance — all of which the backend already knows (`partyproductprices` has 840 rows of remembered per-party prices; `getFinishedStock` has live quantities). Surfacing them inline would prevent errors rather than catch them afterwards.

### UX-016 (P3) — Mobile and tablet are functional, not optimised

The drawer works and tables scroll horizontally, but a 15-column receivables table on a tablet is a horizontal-scrolling exercise. No card-per-row fallback at narrow widths, no priority-column hiding.

---

## Summary

| Area | Verdict |
|---|---|
| Visual design system | **Strong** — coherent, domain-appropriate, consistent |
| Data entry & duplicate prevention | **Strong** — genuinely well thought through |
| Bilingual / Urdu support | **Strong** |
| Loading / error / empty states | **Good** — near-universal |
| Date-range filtering & persistence | **Good** |
| Navigation structure | **Adequate** — but 8 pages are orphaned |
| Dashboard as an overview | **Weak** — it is a margin report; the KPIs exist but are not displayed |
| Table interaction (sort, paginate) | **Weak** — absent everywhere |
| Destructive-action safety | **Weak** — native `confirm()`, consequences not stated |
| Keyboard efficiency | **Weak** — nothing beyond browser defaults |

The fastest wins, in order: link the 8 orphan pages into the nav; build an overview page on the `/api/dashboard` endpoint that already exists; add column sorting to the shared `Table`; replace `window.confirm` with the existing dialog component and state consequences; add a "showing N of M" notice wherever results are capped.
