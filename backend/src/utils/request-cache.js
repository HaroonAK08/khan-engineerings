/**
 * Request-scoped memoisation.
 *
 * Several report endpoints call the same derived read many times while building
 * one response — settings lookups, raw-stock aggregates, average purchase rates.
 * Those values cannot change during a single request, so computing them once and
 * reusing the result is behaviour-preserving.
 *
 * The store is only installed for safe (GET/HEAD) requests. Handlers that write
 * run with no store at all, so a write followed by a read inside the same
 * request always sees fresh data.
 *
 * Outside a request (scripts, tests, the desktop launcher) `memo` simply calls
 * through, so every caller works unchanged.
 */
const { AsyncLocalStorage } = require("node:async_hooks");

const storage = new AsyncLocalStorage();

/** Express middleware. Installs a per-request cache for read-only requests. */
function requestCache(req, _res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  return storage.run({ cache: new Map(), hits: 0, misses: 0 }, next);
}

/**
 * Run `fn` at most once per request for a given key.
 * The in-flight promise is cached, so concurrent callers share one round trip.
 */
function memo(key, fn) {
  const store = storage.getStore();
  if (!store) return fn();
  const existing = store.cache.get(key);
  if (existing !== undefined) {
    store.hits += 1;
    return existing;
  }
  store.misses += 1;
  const promise = Promise.resolve()
    .then(fn)
    .catch((err) => {
      // Never cache a rejection — a retry inside the same request should re-run.
      store.cache.delete(key);
      throw err;
    });
  store.cache.set(key, promise);
  return promise;
}

/** Drop a cached entry (used by the few read paths that also write). */
function invalidate(prefix) {
  const store = storage.getStore();
  if (!store) return;
  for (const key of store.cache.keys()) {
    if (key.startsWith(prefix)) store.cache.delete(key);
  }
}

/** Diagnostics for the benchmark script. */
function stats() {
  const store = storage.getStore();
  return store ? { hits: store.hits, misses: store.misses, size: store.cache.size } : null;
}

module.exports = { requestCache, memo, invalidate, stats, storage };
