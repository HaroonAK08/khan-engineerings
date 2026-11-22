/**
 * Query key factory.
 *
 * One place that owns every cache key, so invalidation after a mutation is a
 * lookup rather than a guess. Keys are hierarchical: invalidating
 * `queryKeys.inventory.all` drops every inventory query beneath it.
 */

type Params = Record<string, unknown> | undefined;

/** Stable key fragment — undefined/null/"" entries are dropped so that
 *  `{ a: 1 }` and `{ a: 1, b: undefined }` share one cache entry. */
function params(value: Params) {
  if (!value) return {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = value[key];
    if (v === undefined || v === null || v === "") continue;
    out[key] = v;
  }
  return out;
}

export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: () => ["auth", "me"] as const,
  },

  dashboard: {
    all: ["dashboard"] as const,
    overview: () => ["dashboard", "overview"] as const,
  },

  finance: {
    all: ["finance"] as const,
    productionMargin: (p?: Params) => ["finance", "production-margin", params(p)] as const,
    partySalesMargin: (p?: Params) => ["finance", "party-sales-margin", params(p)] as const,
    overview: (p?: Params) => ["finance", "overview", params(p)] as const,
    monthly: (p?: Params) => ["finance", "monthly", params(p)] as const,
    yearProgress: (p?: Params) => ["finance", "year-progress", params(p)] as const,
    chargesCalculator: (p?: Params) => ["finance", "charges-calculator", params(p)] as const,
    assets: () => ["finance", "assets"] as const,
  },

  inventory: {
    all: ["inventory"] as const,
    overview: () => ["inventory", "overview"] as const,
    alerts: () => ["inventory", "alerts"] as const,
    finished: (p?: Params) => ["inventory", "finished", params(p)] as const,
    report: (p?: Params) => ["inventory", "report", params(p)] as const,
    movements: (p?: Params) => ["inventory", "movements", params(p)] as const,
    stock: () => ["inventory", "stock"] as const,
  },

  production: {
    all: ["production"] as const,
    list: (p?: Params) => ["production", "list", params(p)] as const,
    detail: (id: string) => ["production", "detail", id] as const,
    report: (p?: Params) => ["production", "report", params(p)] as const,
    productReport: (id: string, p?: Params) =>
      ["production", "product-report", id, params(p)] as const,
  },

  products: {
    all: ["products"] as const,
    list: (p?: Params) => ["products", "list", params(p)] as const,
  },

  purchases: {
    all: ["purchases"] as const,
    list: (p?: Params) => ["purchases", "list", params(p)] as const,
    report: (p?: Params) => ["purchases", "report", params(p)] as const,
  },

  builty: {
    all: ["builty"] as const,
    list: (p?: Params) => ["builty", "list", params(p)] as const,
    detail: (id: string) => ["builty", "detail", id] as const,
    report: (p?: Params) => ["builty", "report", params(p)] as const,
  },

  parties: {
    all: ["parties"] as const,
    list: (p?: Params) => ["parties", "list", params(p)] as const,
    detail: (id: string) => ["parties", "detail", id] as const,
    ledger: (id: string) => ["parties", "ledger", id] as const,
    groups: () => ["parties", "groups"] as const,
    dueInstruments: () => ["parties", "due-instruments"] as const,
  },

  suppliers: {
    all: ["suppliers"] as const,
    list: (p?: Params) => ["suppliers", "list", params(p)] as const,
    detail: (id: string) => ["suppliers", "detail", id] as const,
    ledger: (id: string, p?: Params) => ["suppliers", "ledger", id, params(p)] as const,
  },

  expenses: {
    all: ["expenses"] as const,
    list: (p?: Params) => ["expenses", "list", params(p)] as const,
    meta: () => ["expenses", "meta"] as const,
    salaries: (p?: Params) => ["expenses", "salaries", params(p)] as const,
  },

  workers: {
    all: ["workers"] as const,
    list: (p?: Params) => ["workers", "list", params(p)] as const,
  },

  claims: {
    all: ["claims"] as const,
    list: (p?: Params) => ["claims", "list", params(p)] as const,
  },

  reports: {
    all: ["reports"] as const,
    receivables: (p?: Params) => ["reports", "receivables", params(p)] as const,
    payables: (p?: Params) => ["reports", "payables", params(p)] as const,
    position: (p?: Params) => ["reports", "position", params(p)] as const,
    yearly: (p?: Params) => ["reports", "yearly", params(p)] as const,
  },

  settings: {
    all: ["settings"] as const,
    taxSplit: () => ["settings", "tax-split"] as const,
    waste: () => ["settings", "waste"] as const,
  },
} as const;

/**
 * Domains to invalidate after a mutation.
 *
 * Writes in this system fan out further than they look — recording a builty
 * moves finished stock, writes a ledger entry and changes margin, so a sale
 * must drop inventory and finance too. Keeping that map here means a new screen
 * cannot forget it.
 */
export const invalidationGroups = {
  sale: [queryKeys.builty.all, queryKeys.inventory.all, queryKeys.finance.all,
         queryKeys.parties.all, queryKeys.reports.all, queryKeys.dashboard.all],
  payment: [queryKeys.parties.all, queryKeys.builty.all, queryKeys.finance.all,
            queryKeys.reports.all, queryKeys.dashboard.all],
  purchase: [queryKeys.purchases.all, queryKeys.suppliers.all, queryKeys.inventory.all,
             queryKeys.finance.all, queryKeys.reports.all, queryKeys.dashboard.all],
  production: [queryKeys.production.all, queryKeys.inventory.all, queryKeys.finance.all,
               queryKeys.products.all, queryKeys.dashboard.all],
  expense: [queryKeys.expenses.all, queryKeys.finance.all, queryKeys.reports.all,
            queryKeys.dashboard.all],
  claim: [queryKeys.claims.all, queryKeys.builty.all, queryKeys.inventory.all,
          queryKeys.parties.all, queryKeys.finance.all, queryKeys.dashboard.all],
  product: [queryKeys.products.all, queryKeys.inventory.all, queryKeys.production.all],
  settings: [queryKeys.settings.all, queryKeys.finance.all, queryKeys.production.all],
  party: [queryKeys.parties.all, queryKeys.builty.all, queryKeys.reports.all],
  supplier: [queryKeys.suppliers.all, queryKeys.purchases.all, queryKeys.reports.all],
} as const;

export type InvalidationGroup = keyof typeof invalidationGroups;
