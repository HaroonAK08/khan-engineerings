/**
 * Global "something was written" signal.
 *
 * Every cache in this app must be able to tell when the server state it mirrors
 * has changed. Most write screens still post with plain axios rather than a
 * React Query mutation, so a per-screen invalidation map cannot see them — a
 * sale recorded on the Builty screen would leave the dashboard's cached margin
 * figures untouched.
 *
 * Instead, the axios layer emits here after ANY successful write, and every
 * cache subscribes. The invalidation is deliberately broad: for financial and
 * stock data, re-fetching slightly more than necessary is the right trade
 * against ever showing a figure that predates a write.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe. Returns an unsubscribe function. */
export function onDataChanged(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by the axios interceptor after a successful write. */
export function emitDataChanged() {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A failing subscriber must never break the request that triggered it.
    }
  }
}
