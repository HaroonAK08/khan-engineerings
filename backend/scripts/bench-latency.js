#!/usr/bin/env node
/**
 * Latency-bound benchmark.
 *
 * Local MongoDB answers in well under a millisecond, which hides the cost this
 * system actually pays in production: it runs on Vercel against Atlas, where
 * every round trip costs real network time. This injects a fixed delay into
 * each Mongo operation so the measurement reflects the deployed shape — where
 * the number of SEQUENTIAL round trips, not the scan size, is what hurts.
 *
 *   node scripts/bench-latency.js            # 10 ms per operation
 *   BENCH_LATENCY_MS=25 node scripts/bench-latency.js
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

const LATENCY_MS = Number(process.env.BENCH_LATENCY_MS || 10);

const mongoose = require(path.join(ROOT, "node_modules/mongoose"));
const jwt = require(path.join(ROOT, "node_modules/jsonwebtoken"));

// Delay every query and aggregation before it is sent, simulating network RTT.
const delay = () => new Promise((r) => setTimeout(r, LATENCY_MS));
mongoose.plugin((schema) => {
  schema.pre(
    [
      "find",
      "findOne",
      "findOneAndUpdate",
      "countDocuments",
      "estimatedDocumentCount",
      "distinct",
      "updateMany",
      "updateOne",
      "deleteMany",
    ],
    async function preDelay() {
      await delay();
    }
  );
  schema.pre("aggregate", async function preDelayAgg() {
    await delay();
  });
});

const app = require(path.join(ROOT, "src/app"));
const { connectDB } = require(path.join(ROOT, "src/config/db"));

const ENDPOINTS = process.argv.slice(2).filter((a) => a.startsWith("/api/"));
const DEFAULT = [
  "/api/finance/production-margin?dateFrom=2026-01-01&dateTo=2026-12-31",
  "/api/finance/party-sales-margin?dateFrom=2026-01-01&dateTo=2026-12-31",
  "/api/finance/production-margin?dateFrom=2026-11-01&dateTo=2026-11-30",
  "/api/finance/monthly?months=12",
  "/api/inventory/overview",
  "/api/production",
];

(async () => {
  await connectDB();
  const user = await mongoose.connection.db.collection("users").findOne({});
  const token = jwt.sign({ sub: String(user._id), role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
  const port = Number(process.env.BENCH_PORT || 5091);
  const server = app.listen(port);
  await new Promise((r) => server.once("listening", r));
  const headers = { Authorization: `Bearer ${token}` };

  console.log(`simulated per-operation latency: ${LATENCY_MS} ms\n`);
  for (const endpoint of ENDPOINTS.length ? ENDPOINTS : DEFAULT) {
    await fetch(`http://127.0.0.1:${port}${endpoint}`, { headers }).then((r) => r.text());
    const runs = [];
    for (let i = 0; i < 2; i += 1) {
      const t0 = Date.now();
      const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, { headers });
      await res.text();
      runs.push(Date.now() - t0);
    }
    console.log(`${String(Math.min(...runs)).padStart(7)} ms   ${endpoint}`);
  }

  server.close();
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error("bench-latency failed:", e.message);
  process.exit(1);
});
