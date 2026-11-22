/**
 * Run an async mapper over a list with a bounded number of in-flight tasks,
 * returning results in the SAME ORDER as the input.
 *
 * Used for independent per-month report segments. Order is preserved because
 * callers fold the results in sequence and floating-point accumulation order
 * must not change.
 *
 * The limit exists so a twelve-month report does not open more concurrent
 * operations than the Mongo connection pool can serve.
 */
async function mapWithConcurrency(items, limit, mapper) {
  const list = Array.from(items);
  if (list.length === 0) return [];
  const max = Math.max(1, Math.min(limit, list.length));
  const results = new Array(list.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= list.length) return;
      results[index] = await mapper(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: max }, worker));
  return results;
}

/** Concurrency used for per-calendar-month report segments. */
const SEGMENT_CONCURRENCY = Number(process.env.REPORT_SEGMENT_CONCURRENCY || 6);

module.exports = { mapWithConcurrency, SEGMENT_CONCURRENCY };
