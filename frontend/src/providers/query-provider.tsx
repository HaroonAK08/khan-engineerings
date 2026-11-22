"use client";

import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/lib/query";
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

  // Any successful write anywhere in the app invalidates every cached query, so
  // a screen can never show figures that predate a change the user just made.
  useEffect(
    () =>
      onDataChanged(() => {
        void queryClient.invalidateQueries();
      }),
    [queryClient]
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
