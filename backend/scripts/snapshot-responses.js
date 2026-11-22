#!/usr/bin/env node
/**
 * Capture API responses to disk so an optimisation can be proved
 * output-identical. Run before a change, run after, then diff.
 *
 *   node scripts/snapshot-responses.js /tmp/before
 *   node scripts/snapshot-responses.js /tmp/after
 *   diff -r /tmp/before /tmp/after
 *
 * Volatile fields (generatedAt, timings) are stripped so repeat runs are stable.
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
process.env.MONGODB_URI =
  process.env.BENCH_MONGODB_URI || "mongodb://127.0.0.1:27017/khan-audit";
process.env.JWT_SECRET = process.env.JWT_SECRET || "bench-secret";
process.env.NODE_ENV = "development";

if (/mongodb\+srv:/.test(process.env.MONGODB_URI)) {
  console.error("Refusing to snapshot against a remote cluster.");
  process.exit(1);
}

const mongoose = require(path.join(ROOT, "node_modules/mongoose"));
const jwt = require(path.join(ROOT, "node_modules/jsonwebtoken"));
const app = require(path.join(ROOT, "src/app"));
const { connectDB } = require(path.join(ROOT, "src/config/db"));

const ENDPOINTS = [
  "/api/finance/overview",
  "/api/finance/overview?dateFrom=2026-01-01&dateTo=2026-12-31",
  "/api/finance/production-margin?dateFrom=2026-11-01&dateTo=2026-11-30",
  "/api/finance/production-margin?dateFrom=2026-01-01&dateTo=2026-12-31",
  "/api/finance/production-margin?dateFrom=2026-06-15&dateTo=2026-09-20",
  "/api/finance/party-sales-margin?dateFrom=2026-11-01&dateTo=2026-11-30",
  "/api/finance/party-sales-margin?dateFrom=2026-01-01&dateTo=2026-12-31",
  "/api/finance/monthly?months=12",
  "/api/finance/year-progress?year=2026",
  "/api/finance/charges-calculator",
  "/api/finance/product-profit",
  "/api/finance/manufacturing",
  "/api/finance/expense-breakdown",
  "/api/finance/customer-revenue",
  "/api/finance/supplier-expenses",
  "/api/finance/casting-rates",
  "/api/inventory/overview",
  "/api/inventory/alerts",
  "/api/inventory/stock",
  "/api/inventory/finished",
  "/api/inventory/reports?asOf=2026-11-30&dateFrom=2026-11-01&dateTo=2026-11-30",
  "/api/inventory/reports?asOf=2026-06-30",
  "/api/production/reports?dateFrom=2026-01-01&dateTo=2026-12-31",
  "/api/builty/reports?dateFrom=2026-01-01&dateTo=2026-12-31",
  "/api/reports/statements/customers-overview",
  "/api/reports/receivables",
  "/api/reports/payables",
  "/api/reports/position",
  "/api/reports/yearly?year=2026",
  "/api/reports/received",
  "/api/reports/paid",
  "/api/reports/monthly-receivables?year=2026",
  "/api/claims",
  "/api/dashboard",
];

const VOLATILE = new Set(["generatedAt", "costUpdatedAt", "updatedAt", "createdAt", "at"]);

/**
 * Canonicalise a response for comparison: strip volatile fields, sort object
 * keys, and sort arrays by their serialised form.
 *
 * Array order is deliberately normalised. Several endpoints build rows from a
 * Mongo `$group`, whose output order is unspecified, and the services then sort
 * only by name — so rows that tie on name already swap places between two runs
 * of the SAME code. Order therefore is not part of the contract, and comparing
 * it would produce false alarms rather than catching real regressions.
 */
function stripVolatile(value) {
  if (Array.isArray(value)) {
    const mapped = value.map(stripVolatile);
    return mapped
      .map((v) => [JSON.stringify(v), v])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map((pair) => pair[1]);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (VOLATILE.has(key)) continue;
      out[key] = stripVolatile(value[key]);
    }
    return out;
  }
  return value;
}

(async () => {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error("usage: node scripts/snapshot-responses.js <outDir>");
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  await connectDB();
  const user = await mongoose.connection.db.collection("users").findOne({});
  const token = jwt.sign({ sub: String(user._id), role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
  const headers = { Authorization: `Bearer ${token}` };

  const port = Number(process.env.SNAP_PORT || 5098);
  const server = app.listen(port);
  await new Promise((r) => server.once("listening", r));

  let ok = 0;
  for (const endpoint of ENDPOINTS) {
    const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, { headers });
    const text = await res.text();
    let body;
    try {
      body = stripVolatile(JSON.parse(text));
    } catch {
      body = text;
    }
    const name = endpoint.replace(/^\/api\//, "").replace(/[/?=&]/g, "_") + ".json";
    fs.writeFileSync(
      path.join(outDir, name),
      JSON.stringify({ status: res.status, body }, null, 2)
    );
    if (res.status === 200) ok += 1;
    else console.log(`  ${res.status}  ${endpoint}`);
  }
  console.log(`snapshot: ${ok}/${ENDPOINTS.length} returned 200 → ${outDir}`);

  server.close();
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error("snapshot failed:", e);
  process.exit(1);
});
