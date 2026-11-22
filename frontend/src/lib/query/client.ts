import { QueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
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
        retry(failureCount, error) {
          if (isAxiosError(error)) {
            const status = error.response?.status;
            if (status && status >= 400 && status < 500) return false;
          }
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      },
      mutations: {
        retry: false,
      },
    },
  });
}
