/**
 * Cache policy.
 *
 * Freshness is chosen per data class, not globally. The rule of thumb used
 * here: the longer a value can be wrong without someone making a bad decision,
 * the longer it may be cached.
 *
 * Financial and stock figures are deliberately kept short — they drive money
 * decisions and are invalidated explicitly after every write (see
 * invalidationGroups). Closed historical periods are the only thing cached for
 * minutes, because a finished month cannot change unless someone edits it, and
 * such an edit invalidates these keys anyway.
 */
export const cachePolicy = {
  /** Reference data: products, categories, warehouses, workers, party groups. */
  reference: {
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  },

  /** Live operational figures: stock on hand, alerts, dashboard KPIs. */
  live: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  },

  /** Money: balances, receivables, payables, margins for an open period. */
  financial: {
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  },

  /** Lists that a user pages and filters through. */
  list: {
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  },

  /** Reports over a period that has already closed. */
  historical: {
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  },

  /** Settings — small, rarely changed, invalidated on write. */
  settings: {
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  },
} as const;

/**
 * Pick a policy for a date range: a window that ended before today cannot
 * change on its own, so it is cached for longer than an open one.
 */
export function policyForRange(dateTo?: string | null) {
  if (!dateTo) return cachePolicy.financial;
  const end = new Date(dateTo);
  if (Number.isNaN(end.getTime())) return cachePolicy.financial;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return end < todayStart ? cachePolicy.historical : cachePolicy.financial;
}
