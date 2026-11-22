#!/usr/bin/env node
/**
 * Browser-level route benchmark.
 *
 * Drives a real Chrome against a LOCAL test stack and records, per route:
 *   - API requests issued (and how many are exact duplicates)
 *   - total API payload transferred
 *   - time until useful content is on screen
 *   - console errors / React warnings
 *
 * It also walks the routes a second time to measure NAVIGATION cost with a
 * warm cache, which is what an employee actually experiences all day.
 *
 *   node scripts/route-bench.cjs            # default route set
 *   BENCH_URL=http://127.0.0.1:3077 node scripts/route-bench.cjs --json out.json
 *
 * Never point this at production: it logs in with a locally minted token.
 */
const fs = require("fs");
const path = require("path");

const BACKEND = path.resolve(__dirname, "../../backend");
const puppeteer = require(path.join(BACKEND, "node_modules/puppeteer-core"));
const jwt = require(path.join(BACKEND, "node_modules/jsonwebtoken"));
const { MongoClient } = require(path.join(BACKEND, "node_modules/mongodb"));

const BASE = process.env.BENCH_URL || "http://127.0.0.1:3077";
const DB = process.env.BENCH_DB || "mongodb://127.0.0.1:27017/khan-audit";
const SECRET = process.env.BENCH_JWT || "shot-secret";
const CHROME = process.env.CHROME_PATH || "/opt/google/chrome/chrome";

if (/mongodb\+srv:/.test(DB) || !/127\.0\.0\.1|localhost/.test(BASE)) {
  console.error("Refusing to benchmark a non-local target.");
  process.exit(1);
}

const ROUTES = [
  "/dashboard",
  "/dashboard/overview",
  "/dashboard/inventory",
  "/dashboard/inventory/finished",
  "/dashboard/inventory/movements",
  "/dashboard/production",
  "/dashboard/production/history",
  "/dashboard/products",
  "/dashboard/builty",
  "/dashboard/party",
  "/dashboard/suppliers",
  "/dashboard/claims",
  "/dashboard/expenses/salaries",
  "/dashboard/reports/receivables",
  "/dashboard/reports/sales",
];

/** Wait until the page has rendered real content, not just a spinner. */
async function waitForContent(page, timeout = 45000) {
  const started = Date.now();
  await page
    .waitForFunction(
      () => {
        const main = document.querySelector("main");
        if (!main) return false;
        const spinning = main.querySelector(".animate-spin, .animate-pulse");
        const hasRows = main.querySelectorAll('[data-slot="table-row"]').length > 0;
        const hasCards = main.querySelectorAll('[data-slot="card"]').length > 0;
        const text = (main.innerText || "").trim();
        return !spinning && (hasRows || hasCards || text.length > 400);
      },
      { timeout, polling: 100 }
    )
    .catch(() => {});
  return Date.now() - started;
}

(async () => {
  const mc = await MongoClient.connect(DB);
  const user = await mc.db().collection("users").findOne({});
  await mc.close();
  if (!user) throw new Error("benchmark database has no user");
  const token = jwt.sign({ sub: String(user._id), role: "admin" }, SECRET, { expiresIn: "2h" });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  const consoleIssues = [];
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      const text = msg.text();
      if (/Download the React DevTools|Fast Refresh|\[HMR\]/.test(text)) return;
      consoleIssues.push(`${type}: ${text.slice(0, 160)}`);
    }
  });
  page.on("pageerror", (e) => consoleIssues.push(`pageerror: ${String(e.message).slice(0, 160)}`));

  let reqs = [];
  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    let size = 0;
    try {
      size = Number(res.headers()["content-length"] || 0) || (await res.buffer()).length;
    } catch {}
    reqs.push({ url: url.replace(BASE, ""), status: res.status(), size });
  });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("ke_auth_token", t), token);

  async function walk(label) {
    const rows = [];
    for (const route of ROUTES) {
      reqs = [];
      const t0 = Date.now();
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await waitForContent(page);
      const ms = Date.now() - t0;
      await new Promise((r) => setTimeout(r, 400)); // let late requests land

      const seen = new Map();
      for (const r of reqs) seen.set(r.url, (seen.get(r.url) || 0) + 1);
      const dupes = [...seen.values()].reduce((s, n) => s + (n > 1 ? n - 1 : 0), 0);
      const bytes = reqs.reduce((s, r) => s + r.size, 0);
      const failed = reqs.filter((r) => r.status >= 400).length;

      rows.push({ route, ms, requests: reqs.length, duplicates: dupes, kb: +(bytes / 1024).toFixed(1), failed });
    }
    return { label, rows };
  }

  // Pass 1: each route reached cold (full reload) — worst case
  const cold = await walk("cold");

  // Pass 2: client-side navigation with a warm cache — the daily experience
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2", timeout: 60000 });
  await waitForContent(page);
  const warmRows = [];
  for (const route of ROUTES) {
    reqs = [];
    const t0 = Date.now();
    const ok = await page.evaluate((r) => {
      const link = [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === r);
      if (link) { link.click(); return true; }
      return false;
    }, route);
    if (!ok) { await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" }); }
    await waitForContent(page, 30000);
    const ms = Date.now() - t0;
    await new Promise((r) => setTimeout(r, 300));
    const seen = new Map();
    for (const r of reqs) seen.set(r.url, (seen.get(r.url) || 0) + 1);
    warmRows.push({
      route, ms, requests: reqs.length,
      duplicates: [...seen.values()].reduce((s, n) => s + (n > 1 ? n - 1 : 0), 0),
      kb: +(reqs.reduce((s, r) => s + r.size, 0) / 1024).toFixed(1),
      failed: reqs.filter((r) => r.status >= 400).length,
    });
  }

  const memory = await page.evaluate(() =>
    performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
  );

  function table(label, rows) {
    console.log(`\n── ${label} ──`);
    console.log(`${"route".padEnd(38)}${"ms".padStart(7)}${"reqs".padStart(7)}${"dupes".padStart(7)}${"KB".padStart(9)}${"fail".padStart(6)}`);
    for (const r of rows) {
      console.log(`${r.route.padEnd(38)}${String(r.ms).padStart(7)}${String(r.requests).padStart(7)}${String(r.duplicates).padStart(7)}${String(r.kb).padStart(9)}${String(r.failed).padStart(6)}`);
    }
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    console.log(`${"TOTAL".padEnd(38)}${String(sum("ms")).padStart(7)}${String(sum("requests")).padStart(7)}${String(sum("duplicates")).padStart(7)}${String(sum("kb").toFixed(0)).padStart(9)}${String(sum("failed")).padStart(6)}`);
  }

  table("COLD (full page load per route)", cold.rows);
  table("WARM (client-side navigation)", warmRows);
  console.log(`\nJS heap after walking ${ROUTES.length * 2} routes: ${memory ?? "n/a"} MB`);
  console.log(`console errors / warnings: ${consoleIssues.length}`);
  for (const issue of [...new Set(consoleIssues)].slice(0, 12)) console.log(`  ${issue}`);

  const jsonFlag = process.argv.indexOf("--json");
  if (jsonFlag > -1) {
    fs.writeFileSync(process.argv[jsonFlag + 1], JSON.stringify({ cold: cold.rows, warm: warmRows, memory, consoleIssues }, null, 2));
    console.log(`\nwrote ${process.argv[jsonFlag + 1]}`);
  }
  await browser.close();
})().catch((e) => { console.error("route-bench failed:", e.message); process.exit(1); });
