# KhanEngineerings

Internal factory/business management system.

## Stack

**Frontend** (`frontend/`): Next.js 15 (App Router, TypeScript, Turbopack), Tailwind CSS, shadcn/ui, React Query, Axios, React Hook Form, Zod, Zustand.

**Backend** (`backend/`): Node.js, Express, MongoDB Atlas + Mongoose, JWT + bcrypt auth, Multer (uploads).

**Deployment**: Vercel (frontend + backend), MongoDB Atlas (free tier).

## Structure

```
KhanEngineerings/
├── frontend/          Next.js admin panel
└── backend/
    └── src/
        ├── modules/    feature-first modules (auth, …)
        ├── config/     db connection
        ├── middleware/ auth guard, roles, error handler
        ├── scripts/    seed admin
        ├── app.js
        └── server.js
```

## Phase 1 — Foundation & Authentication

Working admin panel with login, dashboard shell, profile, settings, and roles.

## Phase 2 — Suppliers & Raw Material Management

Scrap (kg) tracking:

- Supplier CRUD + ledger (purchases, payments, adjustments)
- Purchase entry & history with search/filters
- Material stock (inbound total kg)
- Purchase reports with best average rate by supplier

Routes: `/dashboard/suppliers`, `/dashboard/inventory`, `/dashboard/inventory/reports`

## Phase 3 — Production & Manufacturing

Melting / casting tracking:

- Product catalog
- Production batches (input scrap, loss, returned scrap, good/rejected units)
- Scrap stock reduced by net consumption
- Production reports (material used, waste, yield)

Routes: `/dashboard/production`, `/dashboard/production/products`, `/dashboard/production/reports`

## Phase 4 — Manufacturing Workflow & Expenses

Cost tracking across stages:

- Stages: Melting → Casting → Drilling → Shaping → Painting → Finishing
- Categories: Electricity, Fuel, Labor, Paint, Packaging, Maintenance, Other
- Batch expense log + cost calculator (operating + material estimate, cost/unit)
- Cost reports: by stage, category, monthly trend, costliest batches

Routes: `/dashboard/production/[id]` (expenses), `/dashboard/production/costs`

## Phase 5 — Inventory Management

Live stock:

- Raw scrap + finished goods by warehouse
- Automatic stock movements from purchases & production
- Low stock alerts (product thresholds)
- Categories, sizes, warehouses
- Inventory reports (on hand, produced this period)

Routes: `/dashboard/inventory` (+ purchases, finished, movements, alerts, settings, reports)

## Phase 6 — Customers, Orders & Payments

Sales & receivables:

- Customer management + ledger
- Sales orders / invoices with line items
- Partial payments & remaining balance
- Dispatch records (deduct finished stock)
- Outstanding / top-customer reports

Routes: `/dashboard/customers`, `/dashboard/orders`, `/dashboard/orders/reports`

## Phase 7 — Finance & Profit Analysis

Business financial insights:

- Income / expense tracking (manual entries + operational data)
- Cash flow vs profit & loss
- Monthly reports (12-month series)
- Customer revenue & supplier expenses
- Product profitability & manufacturing cost analysis
- Expense hotspots

Routes: `/dashboard/reports` (+ monthly, profit, expenses, entries)

## Phase 8 — Dashboard & Business Intelligence

One-screen factory overview:

- KPI cards (today/month sales, profit, cash, stock, production, expenses, pending orders)
- Sales, expense, and production charts (6 months)
- Outstanding payments & low stock alerts
- Top customers / suppliers, production summary
- Recent activity feed & quick actions

Route: `/dashboard`

## Phase 9 — Reports, Export & Search

Complete reporting system:

- Advanced search across customers, suppliers, orders, purchases, batches, products
- Date filters on every operational report
- Excel (`.xlsx`) and PDF export for sales, purchases, production, expenses, inventory, finance
- Customer & supplier statements with opening/closing balance + export
- Unified Reports hub

Routes: `/dashboard/reports` (+ sales, purchases, production, costs, inventory, statements, finance)

## Manufacturing ERP — Phases A–G

Spec: `docs/MANUFACTURING_ERP_TECH_SPEC.md`.

- **A** Domain foundation (scrap/daig, products, stock types) ✓
- **B–C** Production batch + furnace WIP workflow ✓
- **D** Reusable inventory ✓
- **E** Claims & returns ✓
- **F** Sales polish (city, bilty, salesman) ✓
- **G** Quick entry dashboard ✓

**Not included:** Employees, Departments, Attendance.

### Local development

Uses a **local MongoDB** (`mongodb://127.0.0.1:27017/khan-engineerings`) by default so testing never touches Atlas production data. Production URI lives in `backend/.env.production` (gitignored) and on Vercel.

Ensure `mongod` is running locally (`systemctl start mongod` or your OS equivalent).

### Backend

```bash
cd backend
cp .env.example .env   # local URI is already set
npm install
npm run seed           # creates admin@khanengineerings.com / admin123 on local DB
npm run migrate:mfg    # one-time Phase A data migration (after deploy/pull)
npm run dev            # http://localhost:5000 → local MongoDB

# Optional: hit Atlas from your machine (careful — live data)
# npm run dev:prod-db
# npm run seed:prod-db
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev            # http://localhost:3000
```

Sign in at `/` with the seeded admin credentials, then use `/dashboard`.

## Auth API

| Method | Path | Access |
|--------|------|--------|
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Public |
| GET | `/api/auth/me` | Authenticated |
| PATCH | `/api/auth/profile` | Authenticated |
| POST | `/api/auth/change-password` | Authenticated |
| POST | `/api/auth/register` | Admin only (future user management) |

## Planned modules

Auth → Dashboard → Employee Management → Departments → Inventory → Production → Orders → Suppliers → Customers → Attendance → Reports → Settings
