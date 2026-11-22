import { QueryClient } from "@tanstack/react-query";
import { cachePolicy } from "./cache-policy";

/**
 * Shared QueryClient.
 *
 * Defaults are conservative — individual hooks opt into longer caching through
 * `cachePolicy`. Retrying a 4xx is pointless (the request was wrong, not
 * unlucky) and actively harmful on a 409 duplicate-confirmation, which is a
 * question for the user rather than an error.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: cachePolicy.live.staleTime,
        gcTime: cachePolicy.live.gcTime,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        // Axios already retries transient GET failures. Do not multiply retries.
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
