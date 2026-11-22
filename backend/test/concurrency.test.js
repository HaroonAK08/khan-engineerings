const test = require("node:test");
const assert = require("node:assert/strict");
const { mapWithConcurrency } = require("../src/utils/concurrency");

test("mapWithConcurrency preserves input order", async () => {
  // Deliberately make later items finish first.
  const out = await mapWithConcurrency([5, 4, 3, 2, 1], 5, async (n) => {
    await new Promise((r) => setTimeout(r, n * 10));
    return n;
  });
  assert.deepEqual(out, [5, 4, 3, 2, 1]);
});

test("mapWithConcurrency never exceeds the limit", async () => {
  let inFlight = 0;
  let peak = 0;
  await mapWithConcurrency(Array.from({ length: 30 }, (_, i) => i), 4, async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight -= 1;
  });
  assert.ok(peak <= 4, `peak concurrency ${peak} exceeded limit 4`);
});

test("mapWithConcurrency handles empty and single-item inputs", async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
  assert.deepEqual(await mapWithConcurrency([7], 4, async (n) => n * 2), [14]);
});

test("mapWithConcurrency propagates the first rejection", async () => {
  await assert.rejects(
    mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    }),
    /boom/
  );
});

test("mapWithConcurrency produces the same result as a serial loop", async () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  const mapper = async (n) => {
    await new Promise((r) => setTimeout(r, (n % 5) * 2));
    return n * 3 + 1;
  };
  const serial = [];
  for (const item of items) serial.push(await mapper(item));
  const parallel = await mapWithConcurrency(items, 6, mapper);
  assert.deepEqual(parallel, serial);
});
