/**
 * Shared cache for reference data (products, parties, suppliers, workers…).
 *
 * These lists are small, change rarely, and were being refetched by almost
 * every screen plus the voice resolver and the cheque banner — measured at
 * `/api/customers?active=true` ×7 and `/api/products?active=true` ×5 on a
 * single page load, 244 duplicate requests across 15 routes.
 *
 * This lives in the API layer rather than in React Query because the biggest
 * offenders are NOT React components: `lib/voice/resolve.ts` and
 * `lib/voice/voice-model.ts` are plain modules and cannot use hooks. Caching
 * here fixes every caller at once; React Query then sits on top for
 * component-level caching and invalidation.
 *
 * Two mechanisms, both important:
 *   - in-flight sharing: concurrent callers await ONE request
 *   - TTL: a later caller within the window reuses the resolved value
 *
 * Writes must call `invalidateReference()`; every mutation in the API layer
 * already does (see the `listProducts` / `createProduct` pairs).
 */

type Entry = { at: number; value: Promise<unknown> };

const cache = new Map<string, Entry>();

/**
 * When each prefix was last invalidated.
 *
 * Needed to close a race: a read that started BEFORE a write commits would
 * otherwise resolve with pre-write data and be cached for the full TTL. A load
 * whose prefix was invalidated while it was in flight is therefore returned to
 * its caller but not stored.
 */
const invalidatedAt = new Map<string, number>();

function invalidatedSince(key: string, startedAt: number) {
  for (const [prefix, at] of invalidatedAt) {
    if (key.startsWith(prefix) && at >= startedAt) return true;
  }
  return false;
}

/** Reference data is stable enough that a minute is safe and still feels live. */
export const REFERENCE_TTL_MS = 60_000;

function isFresh(entry: Entry, ttl: number) {
  return Date.now() - entry.at < ttl;
}

/**
 * Run `loader` at most once per `ttl` for a given key, sharing the in-flight
 * promise with any concurrent caller.
 *
 * A rejection is never cached, so a failed load can be retried immediately.
 */
export function cachedGet<T>(
  key: string,
  loader: () => Promise<T>,
  ttl = REFERENCE_TTL_MS
): Promise<T> {
  const existing = cache.get(key);
  if (existing && isFresh(existing, ttl)) {
    return existing.value as Promise<T>;
  }

  const startedAt = Date.now();
  const value = loader().catch((err) => {
    cache.delete(key);
    throw err;
  });

  value
    .then(() => {
      // Drop the entry if a write invalidated this prefix mid-flight, so the
      // caller still gets its result but nobody else reuses stale data.
      if (invalidatedSince(key, startedAt)) cache.delete(key);
    })
    .catch(() => {});

  cache.set(key, { at: startedAt, value });
  return value;
}

/**
 * Drop cached entries. Call after any write that could change a reference list.
 * With no argument it clears everything (used on logout).
 */
export function invalidateReference(prefix?: string) {
  const now = Date.now();
  if (!prefix) {
    cache.clear();
    invalidatedAt.clear();
    invalidatedAt.set("", now);
    return;
  }
  invalidatedAt.set(prefix, now);
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Stable cache key from a params object — key order must not matter. */
export function referenceKey(scope: string, params?: Record<string, unknown>) {
  if (!params) return scope;
  const parts = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .map((k) => `${k}=${String(params[k])}`);
  return parts.length ? `${scope}?${parts.join("&")}` : scope;
}

/** Test/diagnostic helper. */
export function referenceCacheSize() {
  return cache.size;
}
