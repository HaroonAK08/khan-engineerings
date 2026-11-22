import { getAdapter, type AxiosInstance, type AxiosResponse } from "axios";
import type { QueryClient } from "@tanstack/react-query";
import { onDataChanged } from "@/lib/data-changed";
import { queryKeys } from "./keys";

// Only reviewed JSON reads. Keep downloads, search-as-you-type, auth, and
// reads with repair/resync side effects (claims list, builty detail, supplier
// ledger) on their original path.
const referencePaths = new Set([
  "/products", "/customers", "/party-groups", "/suppliers", "/workers",
  "/salesmen", "/inventory/categories", "/inventory/sizes",
  "/expenses/meta", "/production/meta",
]);
const readPaths = new Set([
  "/notes", "/suppliers/ledger/all", "/builty", "/builty/reports", "/builty/payments", "/purchases",
  "/purchases/reports", "/production", "/production/reports", "/production/cost-reports",
  "/inventory/stock", "/inventory/finished", "/inventory/overview", "/inventory/alerts",
  "/inventory/movements", "/inventory/reports", "/customers/instruments/due",
  "/expenses", "/workers/payments", "/salesmen/payments",
  "/assets/summary", "/assets/categories", "/assets/items",
  "/finance/overview", "/finance/monthly", "/finance/year-progress",
  "/finance/production-margin", "/finance/party-sales-margin", "/finance/charges-calculator",
  "/reports/receivables",
  "/reports/monthly-receivables", "/reports/received", "/reports/paid",
  "/reports/handout", "/reports/statements/customers-overview",
]);
const detailPath = /^\/(?:production\/[a-f0-9]{24}(?:\/(?:expenses|costs))?|production\/reports\/products\/[a-f0-9]{24}|(?:suppliers|customers|party-groups|salesmen|workers|claims)\/[a-f0-9]{24}|customers\/[a-f0-9]{24}\/(?:ledger|instruments|product-prices)|party-groups\/[a-f0-9]{24}\/ledgers|reports\/statements\/(?:customers|groups)\/[a-f0-9]{24})$/i;

export function readCachePolicy(path: string) {
  if (referencePaths.has(path)) return { staleTime: 30_000, gcTime: 120_000 };
  if (readPaths.has(path) || detailPath.test(path)) {
    return { staleTime: 15_000, gcTime: 60_000 };
  }
  return undefined;
}

/** Share the dashboard's QueryClient with existing imperative read loaders. */
export function installReadCache(api: AxiosInstance, client: QueryClient) {
  let generation = 0;
  const unsubscribe = onDataChanged(() => {
    // A read started before a write must not satisfy a read after that write.
    generation += 1;
  });
  const interceptor = api.interceptors.request.use((config) => {
    if (config.method !== "get" || config.baseURL !== "/api" || config.signal ||
        config.cancelToken || (config.responseType && config.responseType !== "json")) return config;
    const path = config.url?.split("?")[0];
    const policy = path && readCachePolicy(path);
    if (!policy) return config;

    const uri = api.getUri(config);
    // Keep arbitrary search strings out of the cache.
    if (new URLSearchParams(uri.split("?")[1]).has("q")) return config;
    const originalAdapter = config.adapter ?? api.defaults.adapter;
    const adapter = getAdapter(originalAdapter);
    const key = queryKeys.httpRead(generation, uri);
    config.adapter = async (request) => {
      // Keep Axios retries on the original transport, not a nested cache adapter.
      request.adapter = originalAdapter;
      const result = await client.fetchQuery({
        queryKey: key,
        ...policy,
        retry: false, // Axios owns retries.
        queryFn: async () => {
          const { data, headers, status, statusText } = await adapter(request);
          return { data, headers, status, statusText };
        },
      });
      return { ...result, config: request } as AxiosResponse;
    };
    return config;
  });
  return () => {
    unsubscribe();
    api.interceptors.request.eject(interceptor);
  };
}
