"use client";

import { useLayoutEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/lib/query/client";
import { api } from "@/lib/api";
import { installReadCache } from "@/lib/query/read-cache";
import { onDataChanged } from "@/lib/data-changed";

/**
 * React Query provider, mounted by the dashboard layout rather than the root.
 *
 * Only dashboard screens use query hooks, and putting the provider in the root
 * layout pulled the whole observer runtime into the shared chunk that the login
 * page also loads. Scoping it here keeps the login route light while every
 * dashboard route still shares one client — and therefore one cache.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  // In state so the client survives re-renders and is never shared across
  // users during SSR.
  const [queryClient] = useState(createQueryClient);

  useLayoutEffect(() => {
    const uninstall = installReadCache(api, queryClient);
    const unsubscribe = onDataChanged(() => {
      // Cancel observed reads before revalidating, including initial requests.
      void queryClient.cancelQueries({ type: "active" });
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "http-read" });
    });
    return () => {
      unsubscribe();
      uninstall();
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
