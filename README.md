# KhanEngineerings

Internal factory/business management system.

## Stack

**Frontend** (`frontend/`): Next.js 15 (App Router, TypeScript, Turbopack), Tailwind CSS, shadcn/ui, React Query, Axios, React Hook Form, Zod, Zustand.

**Backend** (`backend/`): Node.js, Express, MongoDB Atlas + Mongoose, JWT + bcrypt auth, Multer (uploads).

**Deployment**: Vercel (frontend + backend), MongoDB Atlas (free tier).

## Structure

```
KhanEngineerings/
├── frontend/          Next.js app
└── backend/
    └── src/
        ├── modules/    feature-first modules (auth, employees, inventory, ...)
        ├── config/     db connection, env-derived config
        ├── middleware/ auth guard, error handler
        ├── app.js
        └── server.js
```

## Local development

**Backend**

```bash
cd backend
cp .env.example .env   # fill in MONGODB_URI and JWT_SECRET
npm run dev             # http://localhost:5000
```

**Frontend**

```bash
cd frontend
cp .env.example .env.local
npm run dev              # http://localhost:3000
```

## Planned modules

Auth → Dashboard → Employee Management → Departments → Inventory → Production → Orders → Suppliers → Customers → Attendance → Reports → Settings
