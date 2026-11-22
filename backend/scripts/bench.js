#!/usr/bin/env node
/**
 * Repeatable endpoint benchmark.
 *
 * Measures wall time, Mongo round trips (via the mongoose debug hook) and
 * response size for a list of endpoints, against a THROWAWAY local database.
 *
 * Never point this at production.
 *
 *   node scripts/bench.js                       # default endpoint set
 *   node scripts/bench.js --json out.json       # machine-readable output
 *   node scripts/bench.js "/api/builty" …       # explicit endpoints
 */
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
process.env.MONGODB_URI =
  process.env.BENCH_MONGODB_URI || "mongodb://127.0.0.1:27017/khan-audit";
process.env.JWT_SECRET = process.env.JWT_SECRET || "bench-secret";
process.env.NODE_ENV = "development";

if (/mongodb\+srv:/.test(process.env.MONGODB_URI)) {
  console.error("Refusing to benchmark against a remote cluster.");
  process.exit(1);
}

const mongoose = require(path.join(ROOT, "node_modules/mongoose"));
const jwt = require(path.join(ROOT, "node_modules/jsonwebtoken"));
const app = require(path.join(ROOT, "src/app"));
const { connectDB } = require(path.join(ROOT, "src/config/db"));

const PORT = Number(process.env.BENCH_PORT || 5099);
const RUNS = Number(process.env.BENCH_RUNS || 3);

const DEFAULT_ENDPOINTS = [
  "/api/finance/production-margin?dateFrom=2026-11-01&dateTo=2026-11-30",
  "/api/finance/party-sales-margin?dateFrom=2026-11-01&dateTo=2026-11-30",
  "/api/inventory/reports?asOf=2026-11-30&dateFrom=2026-11-01&dateTo=2026-11-30",
  "/api/finance/production-margin?dateFrom=2026-01-01&dateTo=2026-12-31",
  "/api/finance/party-sales-margin?dateFrom=2026-01-01&dateTo=2026-12-31",
  "/api/dashboard",
  "/api/finance/monthly?months=12",
  "/api/finance/overview",
  "/api/finance/charges-calculator",
  "/api/inventory/overview",
  "/api/inventory/alerts",
  "/api/inventory/finished",
  "/api/inventory/movements",
  "/api/production",
  "/api/builty",
  "/api/claims",
  "/api/reports/receivables",
  "/api/reports/payables",
  "/api/reports/position",
];

let ops = 0;
const byOp = new Map();
mongoose.set("debug", (coll, method) => {
  ops += 1;
  const key = `${coll}.${method}`;
  byOp.set(key, (byOp.get(key) || 0) + 1);
});

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

(async () => {
  await connectDB();
  const user = await mongoose.connection.db.collection("users").findOne({});
  if (!user) throw new Error("No user in the benchmark database.");
  const token = jwt.sign({ sub: String(user._id), role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
  const headers = { Authorization: `Bearer ${token}` };

  const server = app.listen(PORT);
  await new Promise((resolve) => server.once("listening", resolve));

  const argv = process.argv.slice(2);
  const jsonFlag = argv.indexOf("--json");
  const endpoints = argv.filter(
    (a, i) => a.startsWith("/api/") && i !== jsonFlag + 1
  );
  const targets = endpoints.length ? endpoints : DEFAULT_ENDPOINTS;
  const results = [];

  console.log("  median    db      payload  status  endpoint");
  console.log("  ──────  ─────  ──────────  ──────  ────────");

  for (const endpoint of targets) {
    const url = `http://127.0.0.1:${PORT}${endpoint}`;
    await fetch(url, { headers }).then((r) => r.text()).catch(() => {});

    const times = [];
    let opCount = 0;
    let bytes = 0;
    let status = 0;
    let top = "";

    for (let i = 0; i < RUNS; i += 1) {
      ops = 0;
      byOp.clear();
      const started = Date.now();
      const res = await fetch(url, { headers });
      const body = await res.text();
      times.push(Date.now() - started);
      opCount = ops;
      bytes = body.length;
      status = res.status;
      top = [...byOp.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, v]) => `${k}×${v}`)
        .join("  ");
    }

    const ms = median(times);
    results.push({ endpoint, ms, ops: opCount, bytes, status, top });
    console.log(
      `${String(ms).padStart(6)}ms ${String(opCount).padStart(6)} ${String((bytes / 1024).toFixed(1)).padStart(9)}KB    ${status}   ${endpoint}`
    );
    if (top) console.log(`                                       ${top}`);
  }

  if (jsonFlag > -1) {
    const out = argv[jsonFlag + 1];
    require("fs").writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(`\nwrote ${out}`);
  }

  server.close();
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error("bench failed:", err);
  process.exit(1);
});
