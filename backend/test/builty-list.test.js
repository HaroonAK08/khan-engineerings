/**
 * Regression tests for builty list pagination.
 * Skips cleanly when no local database is available.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const URI = process.env.BENCH_MONGODB_URI || "mongodb://127.0.0.1:27017/khan-audit";
if (/mongodb\+srv:/.test(URI)) throw new Error("Refusing to run tests against a remote cluster.");
process.env.MONGODB_URI = URI;

let available = false;
let builtyService;
let Builty;

test.before(async () => {
  try {
    if (!mongoose.connection.readyState) {
      await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
    }
    builtyService = require("../src/modules/builty/builty.service");
    Builty = require("../src/modules/builty/builty.model");
    available = (await Builty.estimatedDocumentCount()) > 0;
  } catch {
    available = false;
  }
});

test.after(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});

function requireDb(t) {
  if (!available) {
    t.skip("no local database with builty data");
    return false;
  }
  return true;
}

test("defaults to a bounded page with a true total", async (t) => {
  if (!requireDb(t)) return;
  const { rows, page } = await builtyService.listBuilties({});
  assert.ok(rows.length <= 50);
  assert.equal(page.returned, rows.length);
  assert.equal(page.total, await Builty.countDocuments({}));
});

test("page size is capped at 200", async (t) => {
  if (!requireDb(t)) return;
  const { rows } = await builtyService.listBuilties({ limit: 5000 });
  assert.ok(rows.length <= 200);
});

test("paging covers every builty exactly once", async (t) => {
  if (!requireDb(t)) return;
  const { page: meta } = await builtyService.listBuilties({ limit: 1 });
  const seen = new Set();
  for (let p = 1; p <= Math.ceil(meta.total / 100); p += 1) {
    const { rows } = await builtyService.listBuilties({ limit: 100, page: p });
    for (const r of rows) seen.add(String(r._id));
  }
  assert.equal(seen.size, meta.total, "no gaps and no duplicates across pages");
});

test("all=true returns the full set", async (t) => {
  if (!requireDb(t)) return;
  const { rows, page } = await builtyService.listBuilties({ all: "true" });
  assert.equal(rows.length, page.total);
  assert.equal(page.hasMore, false);
});

test("default ordering stays newest-first", async (t) => {
  if (!requireDb(t)) return;
  const { rows } = await builtyService.listBuilties({ limit: 25 });
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(
      new Date(rows[i - 1].builtyDate).getTime() >= new Date(rows[i].builtyDate).getTime()
    );
  }
});

test("sortBy is allowlisted and search input is escaped", async (t) => {
  if (!requireDb(t)) return;
  const bogus = await builtyService.listBuilties({ sortBy: "$where", limit: 5 });
  const def = await builtyService.listBuilties({ limit: 5 });
  assert.deepEqual(
    bogus.rows.map((r) => String(r._id)),
    def.rows.map((r) => String(r._id)),
    "unknown sort field falls back to the default"
  );
  const escaped = await builtyService.listBuilties({ q: "B-(.*)+", limit: 5 });
  assert.equal(escaped.rows.length, 0, "regex metacharacters are matched literally");
});

test("filters are reflected in the total", async (t) => {
  if (!requireDb(t)) return;
  const unpaid = await builtyService.listBuilties({ paymentStatus: "unpaid", all: "true" });
  assert.equal(unpaid.page.total, await Builty.countDocuments({ paymentStatus: "unpaid" }));
  assert.ok(unpaid.rows.every((r) => r.paymentStatus === "unpaid"));
});
