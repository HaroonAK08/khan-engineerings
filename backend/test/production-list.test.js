/**
 * Regression tests for the production list pagination added in
 * docs/audit/11-performance-implementation.md.
 *
 * Needs a local MongoDB with a copy of the data. Skipped when unavailable so
 * `npm test` stays green on a machine without one.
 *
 *   BENCH_MONGODB_URI=mongodb://127.0.0.1:27017/khan-audit npm test
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const URI = process.env.BENCH_MONGODB_URI || "mongodb://127.0.0.1:27017/khan-audit";
if (/mongodb\+srv:/.test(URI)) {
  throw new Error("Refusing to run tests against a remote cluster.");
}
process.env.MONGODB_URI = URI;

let available = false;
let productionService;
let ProductionBatch;

test.before(async () => {
  try {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 1500 });
    productionService = require("../src/modules/production/production.service");
    ProductionBatch = require("../src/modules/production/production.model");
    available = (await ProductionBatch.estimatedDocumentCount()) > 0;
  } catch {
    available = false;
  }
});

test.after(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});

/**
 * Availability is checked inside each test: a `{ skip }` option is evaluated
 * when the test is REGISTERED, which happens before the before-hook connects.
 */
function requireDb(t) {
  if (!available) {
    t.skip("no local database with production data");
    return false;
  }
  return true;
}

test("defaults to a bounded page and reports the true total", async (t) => {
  if (!requireDb(t)) return;
  const { batches, page } = await productionService.list({});
  assert.ok(batches.length <= 50, "default page size is 50");
  assert.equal(page.page, 1);
  assert.equal(page.returned, batches.length);
  assert.ok(page.total >= batches.length);
  assert.equal(page.total, await ProductionBatch.countDocuments({}));
});

test("page size is capped", async (t) => {
  if (!requireDb(t)) return;
  const { batches } = await productionService.list({ limit: 10000 });
  assert.ok(batches.length <= 200, "page size must be capped at 200");
});

test("paging covers every row exactly once", async (t) => {
  if (!requireDb(t)) return;
  const { page: meta } = await productionService.list({ limit: 1 });
  const total = meta.total;
  const pageSize = 100;
  const seen = new Set();
  for (let p = 1; p <= Math.ceil(total / pageSize); p += 1) {
    const { batches } = await productionService.list({ limit: pageSize, page: p });
    for (const b of batches) seen.add(String(b._id));
  }
  assert.equal(seen.size, total, "no gaps and no duplicates across pages");
});

test("all=true returns the unpaginated set", async (t) => {
  if (!requireDb(t)) return;
  const { batches, page } = await productionService.list({ all: "true" });
  assert.equal(batches.length, page.total);
  assert.equal(page.hasMore, false);
  assert.equal(page.all, true);
});

test("default ordering is unchanged (productionDate desc)", async (t) => {
  if (!requireDb(t)) return;
  const { batches } = await productionService.list({ limit: 25 });
  for (let i = 1; i < batches.length; i += 1) {
    const prev = new Date(batches[i - 1].productionDate).getTime();
    const curr = new Date(batches[i].productionDate).getTime();
    assert.ok(prev >= curr, "rows must stay newest-first by default");
  }
});

test("sortBy is restricted to an allowlist", async (t) => {
  if (!requireDb(t)) return;
  const asc = await productionService.list({ sortBy: "batchNo", sortDir: "asc", limit: 5 });
  const nos = asc.batches.map((b) => b.batchNo);
  assert.deepEqual(nos, [...nos].sort(), "batchNo asc must be sorted");

  // An unknown field must fall back to the default rather than reaching Mongo.
  const bogus = await productionService.list({ sortBy: "$where", limit: 5 });
  const def = await productionService.list({ limit: 5 });
  assert.deepEqual(
    bogus.batches.map((b) => String(b._id)),
    def.batches.map((b) => String(b._id)),
    "unknown sort field falls back to the default ordering"
  );
});

test("filters still apply, and the total reflects them", async (t) => {
  if (!requireDb(t)) return;
  const all = await productionService.list({ all: "true" });
  const hub = await productionService.list({ family: "hub", all: "true" });
  const expected = all.batches.filter((b) => b.family === "hub").length;
  assert.equal(hub.page.total, expected);
  assert.ok(hub.batches.every((b) => b.family === "hub"));
});

test("search input is escaped rather than interpolated", async (t) => {
  if (!requireDb(t)) return;
  // A regex metacharacter must be matched literally, not compiled.
  const res = await productionService.list({ q: "PB-2026(.*)+", limit: 5 });
  assert.equal(res.batches.length, 0, "literal match should find nothing");
});
