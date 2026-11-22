# 07 — Security, Reliability & Error Handling

---

# Part A — Security

## SEC-001 (P0) — A single shared 4-digit PIN grants full admin access

`backend/src/modules/auth/auth.service.js:58`:

```js
async function login(body) {
  const USE_PIN_LOGIN = true;
  const APP_PIN = process.env.APP_PIN || "3811";

  if (USE_PIN_LOGIN) {
    const pin = String(body.pin ?? body.password ?? "").trim();
    if (!/^\d{4}$/.test(pin) || pin !== APP_PIN) {
      const err = new Error("Wrong code"); err.statusCode = 401; throw err;
    }
    let user = await User.findOne({ role: "admin" });   // ← always the admin
    if (!user) user = await User.findOne();
    return { user, token: signToken(user) };
  }
  /* --- Email/password login (restore later: set USE_PIN_LOGIN = false) --- */
}
```

Five distinct problems in one function:

1. **10,000-combination keyspace.** A four-digit PIN is exhaustible in seconds.
2. **No rate limiting, no lockout, no delay.** There is no `express-rate-limit`, no `helmet`, nothing. `POST /api/auth/login` can be hammered without limit. (By contrast, the *Personal Banks* module implements a proper bcrypt hash + 15-minute lockout — the main application login is weaker than a sub-feature of it.)
3. **The default is published.** `"3811"` is the hardcoded fallback in source, and `backend/.env.example:20` ships `APP_PIN=3811` in the repository. If `APP_PIN` is ever unset on the host, the application silently accepts the committed value.
4. **Every session is admin.** The PIN resolves to `User.findOne({ role: "admin" })` regardless of who typed it. The `manager` and `staff` roles in the schema are unreachable.
5. **No identity, therefore no attribution.** Every action in the system is performed by "the admin user". There is no way to know who created, edited, or deleted a financial record.

The working email/password implementation is intact, commented out directly below.

**Reachability:** the API is deployed on Vercel at a public URL with `requireAuth` on every route except `/auth/login` and `/auth/logout` — so the PIN is the only thing between the public internet and the entire financial database.

**Fix (ordered, each independently useful):**
1. Rotate `APP_PIN` on the host today and remove the value from `.env.example`.
2. Remove the `|| "3811"` fallback — fail loudly if `APP_PIN` is unset.
3. Add rate limiting to `/api/auth/login` (5 attempts / 15 min / IP, plus a global counter).
4. Restore per-user email+password login; keep the PIN as a *secondary* fast-unlock for an already-identified device if the floor workflow needs it.
5. Put the real user id in the JWT so actions can be attributed.

## SEC-002 (P0) — The factory PIN bypasses the Personal Banks PIN

`modules/personal-banks/personal-banks.service.js:109`:

```js
async function resetPin({ factoryPin, newPin }) {
  const APP_PIN = process.env.APP_PIN || "3811";
  if (String(factoryPin || "") !== APP_PIN) throw httpError("Factory unlock code is wrong", 401);
  doc.pinHash = await bcrypt.hash(assertPin(newPin), 10);
  doc.failedAttempts = 0; doc.lockUntil = null;
  await doc.save();
}
```

`POST /api/personal-banks/auth/reset-pin` is mounted **before** `router.use(requirePersonalBanks)`, so it is unauthenticated. The Personal Banks module protects private bank-account balances behind its own bcrypt-hashed PIN with a proper lockout — and this route discards all of it in exchange for the same 4-digit `3811`. It also resets `failedAttempts` and `lockUntil`, so it defeats the lockout as well.

The same `|| "3811"` fallback applies.

## SEC-003 (P1) — No RBAC in practice

`requireRole` exists and works. It is used on exactly one route:

```js
router.post("/register", requireAuth, requireRole("admin"), controller.register);
```

Every other route — delete a builty, delete a production day, change the waste %, reset party balances, export the full financial report — requires only `requireAuth`. And because of SEC-001 every authenticated session is admin anyway, so even correct role checks would pass.

There is no separation between an operator who should enter builties and an owner who should change the waste percentage that rewrites history.

## SEC-004 (P1) — No audit log

Nothing records who changed what, when, or what the previous value was. This matters most for the operations identified in 04 DB-014, which rewrite historical records in bulk:

- changing a product weight re-prices past invoices
- changing the waste % rewrites past production batches and stock movements
- changing a worker's scope reclassifies all their past salaries
- `GET /api/claims` can mass-rewrite builty totals on a cold start

If a figure changes, there is no way to find out why.

## SEC-005 (P2) — JWT stored in `localStorage` as well as an httpOnly cookie

`lib/auth-token.ts` writes the token to `localStorage`; `lib/api.ts` attaches it as a bearer header; the backend also sets an httpOnly cookie and `requireAuth` accepts either. The cookie alone would be sufficient and is XSS-safe. The `localStorage` copy is readable by any injected script.

Cookie flags are otherwise handled thoughtfully (`sameSite: "none"` + `secure` for cross-origin Vercel hosts, `COOKIE_DOMAIN` support, an explicit `COOKIE_INSECURE` escape hatch).

## SEC-006 (P2) — No security middleware at all

| Protection | State |
|---|---|
| `helmet` (CSP, HSTS, X-Frame-Options, nosniff) | ❌ absent |
| Rate limiting | ❌ absent |
| Body size limit | ❌ absent (`express.json()` default 100 kb applies locally; Vercel pre-parses) |
| CSRF | ⚠️ mitigated by bearer-token usage, but the cookie is also accepted — a cross-site POST would carry it |
| CORS | ✅ allowlist from `CORS_ORIGIN`, rejects unknown origins |

### Injection — assessed clean

- **NoSQL injection:** low risk. Every query builds a literal filter object; IDs go through `mongoose.isValidObjectId` on the aggregate paths; no `$where`, no `eval`, no raw `JSON.parse` into a query.
- **ReDoS:** moderate and real. `new RegExp(userInput, "i")` is used for search in ~12 services without escaping. A crafted `q` (e.g. nested quantifiers) can pin the CPU. `claim.service.js` has an `escapeRegex` helper — it should be applied everywhere a user string becomes a regex.
- **XSS:** low. React escapes by default; no `dangerouslySetInnerHTML` anywhere in the frontend.
- **SQL injection:** N/A.

## SEC-007 (P2) — Error responses leak internals

`middleware/errorHandler.js` returns `err.message` verbatim for any status, including unhandled 500s — which will include Mongo error text, and `config/db.js` deliberately appends connection hints:

```js
"MongoDB connect timed out after 8000ms | Check MONGODB_URI on Vercel and Atlas Network Access (0.0.0.0/0)."
```

Useful in development; it should not reach a public client.

## SEC-008 (P3) — `/api/health` discloses configuration

Unauthenticated, returns `hasMongoUri`, `corsOrigin`, and whether the host is Vercel.

## SEC-009 (P3) — `middleware.ts` protects nothing

Matches `/dashboard/:path*` and returns `NextResponse.next()`. The comment explains the reasoning (the cookie lives on the API host; the session is verified client-side by `AuthGuard`). That reasoning is sound for *this* deployment, but it means an unauthenticated user can load every dashboard route's shell and JS — they simply get no data. Worth either implementing or removing the matcher (it ships 39 kB and runs on every navigation).

### Verified clean

- **No secrets in git.** `git ls-files` finds only `.env.example`; a scan for Atlas URIs, AWS keys and OpenAI keys across tracked content returns only the placeholder line in `.env.example`.
- `.gitignore` correctly covers `.env`, `.env.production`, all mongo dumps and local data directories.
- Passwords are bcrypt-hashed at cost 10 (the email login path and the Personal Banks PIN).
- No file-upload endpoint is exposed, despite `multer` being a dependency — so no upload attack surface.
- CORS is a strict allowlist.

---

# Part B — Reliability & Error Handling

## REL-001 (P0) — No transactions; partial writes are possible and silent

Covered in detail in 04 DB-008. Summary: zero `startSession` / `withTransaction` in the codebase, while every financial and inventory operation writes 3–10 documents in sequence. The worst case is `production.updateProduce`, which deletes a batch's stock movements before rewriting them.

## REL-002 (P0) — Failed side effects are swallowed and reported as success

Six sites follow this shape:

```js
try {
  await inventoryService.onPurchaseCreated(populated);
} catch (e) {
  console.error("Inventory movement (purchase) failed:", e.message);
}
return populated;          // ← 200 OK
```

(`purchase.service.js:163, 265, 287` · `production.service.js:310, 456` · and the batch-delete cleanup.)

The purchase is persisted, the stock movement is not, the user is told it worked, and `console.error` goes to a Vercel log nobody reads. This is precisely the mechanism by which inventory drifts from reality without anyone noticing.

Either the side effect is essential — in which case it belongs in the same transaction and its failure must fail the request — or it is optional, in which case the response should say so.

## REL-003 (P1) — `socketTimeoutMS: 5000` is shorter than the slow endpoints

`config/db.js` sets `serverSelectionTimeoutMS: 5000`, `connectTimeoutMS: 5000`, `socketTimeoutMS: 5000`, `maxPoolSize: 5`.

Meanwhile `/api/finance/production-margin` over a year issues 283 round trips in sequence (03 DF-001). The *socket* timeout applies per operation, so it will usually be survived — but with `maxPoolSize: 5` and 283 queued operations, queue waits are real, and `vercel.json` allows `maxDuration: 60`. The configuration is tuned for a fast endpoint the system does not have.

## REL-004 (P1) — Mass-write operations have no safety rails

| Operation | Scope | Transaction | Preview | Undo | Log |
|---|---|---|---|---|---|
| `GET /api/claims` → `restoreBuiltyTotalsFromItems` | all 697 builties | ❌ | ❌ | ❌ | ❌ |
| `setWastePercent` → `applyFamilyWasteFromDate` | every batch since date | ❌ | ❌ | ❌ | ❌ |
| product weight change → `applyProductWeightFromDate` | builties + claims + batches since date | ❌ | ❌ | ❌ | ❌ |
| `POST /api/inventory/sync` → `rebuildFinishedGoodsLedger` | **deletes and rebuilds** all finished-goods movements | ❌ | ❌ | ❌ | ❌ |

`rebuildFinishedGoodsLedger` is a legitimate and useful recovery tool, but it is exposed as an ordinary authenticated `POST` with no confirmation step, and it begins with `StockMovement.deleteMany(...)`.

## REL-005 (P1) — PDF export will fail on any host without a Debian font package

`modules/reports/export.util.js:7`:

```js
const URDU_FONT = "/usr/share/fonts/truetype/freefont/FreeSerif.ttf";
…
doc.registerFont("Urdu", URDU_FONT);   // line 374, no try/catch, no existence check
```

**Verified behaviour** — `registerFont` is lazy, but the first `doc.font("Urdu")` throws:

```
$ node -e 'const d=new (require("pdfkit"))(); d.registerFont("Urdu","…/NOPE.ttf"); d.font("Urdu")'
THROWS on font(): ENOENT - no such file or directory, open '…/NOPE.ttf'
```

The font exists on the Ubuntu dev machine. Vercel's Amazon Linux runtime ships no fonts by default, so **any PDF export containing Urdu text — any party name, supplier name or label in Urdu — will 500 in production**. The `@fontsource/noto-naskh-arabic` dependency is referenced only for the Puppeteer/HTML path (line 205), not for pdfkit.

*Limitation: I could not observe the Vercel filesystem. What is verified is that the code path throws when the file is absent, and that the path is distribution-specific.*

**Fix:** bundle a TTF in `backend/src/assets/`, resolve it with `path.join(__dirname, …)`, and wrap registration in a try/catch that degrades to Helvetica rather than failing the export.

## REL-006 (P2) — Chromium on serverless is unverified

`puppeteer-core` + `@sparticuz/chromium` are used for HTML→PDF. The Vercel function is configured at 1024 MB / 60 s. Chromium is large and memory-hungry; this combination commonly exceeds serverless bundle and memory limits. Needs a production smoke test of `/api/reports/export/handout?format=pdf`.

## REL-007 (P2) — No structured logging, no monitoring

21 `console.error` calls. No `pino`/`winston`, no Sentry, no APM, no request ids, no metrics. When something fails in production, the only trace is an unstructured line in Vercel's log stream with no correlation to a user or a request.

## REL-008 (P2) — Backups are manual and stale

Three ad-hoc `mongodump` directories; the newest is dated **2026-10-29** (≈ 3.5 weeks before this audit). No schedule, no retention, no tested restore, no documented procedure.

Given REL-001 (no transactions) and REL-004 (unguarded mass rewrites), the backup is the only real safety net — and it is three weeks stale.

**Confirm the Atlas cluster tier.** Free and shared tiers (M0/M2/M5) have **no** continuous backup. If this is a shared-tier cluster, an accidental `applyFamilyWasteFromDate` or a bad `rebuildFinishedGoodsLedger` is unrecoverable.

## REL-009 (P3) — No retry or idempotency on the client

`lib/api.ts` sets a 30 s axios timeout and does not retry. Non-GET requests carry no idempotency key, so a user who double-submits during a slow request can create two records — partially mitigated by the same-day duplicate guard, which is a good backstop but is scoped to "same day, same shape" rather than true idempotency.

### What is already good

- `middleware/errorHandler.js` is a single consistent handler; services signal status via `err.statusCode`; the frontend surfaces every failure through `toast.error(apiError(…))`. Error *handling* is consistent — the gap is error *observability*.
- `config/db.js` caches the connection on `global.__mongoose`, disables `bufferCommands`, and wraps connection in an 8 s hard timeout with an actionable message. Correct serverless shape.
- `api/index.js` short-circuits `/health` and `/db-check` before touching Mongo, and documents the Vercel double-body-parse hazard inline.
- `createBatchWithBatchNo` is a correct retry-on-duplicate-key loop — the one genuinely concurrency-safe write in the codebase.
- The Next.js proxy returns a clear 502 with a fix instruction when the backend is unreachable.

---

## Priority

| | Finding | Why first |
|---|---|---|
| 1 | **REL-008** — verify/enable Atlas backup | Makes every other finding recoverable. Do this before touching code. |
| 2 | **SEC-001** — rotate `APP_PIN`, remove the hardcoded fallback, rate-limit login | Minutes of work; currently the only barrier to the whole database |
| 3 | **SEC-002** — require authentication on `reset-pin` | One line |
| 4 | **REL-002** — stop swallowing inventory-write failures | Directly causes silent data drift |
| 5 | **REL-005** — bundle the PDF font | Likely breaking Urdu exports in production right now |
| 6 | **REL-001** — transactions on the 5 multi-document write paths | Larger change; needs testing |
