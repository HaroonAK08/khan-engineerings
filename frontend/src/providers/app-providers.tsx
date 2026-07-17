"use client";

import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const setStatus = useAuthStore((s) => s.setStatus);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    api
      .get<{ user: AuthUser }>("/auth/me")
      .then((res) => {
        if (!cancelled) setUser(res.data.user);
      })
      .catch((err) => {
        // Leave loading immediately so GuestGuard can show the login form
        if (!cancelled) setUser(null);
        // Clear a stale cookie only on auth rejection, not on network/CORS failures
        if (err?.response?.status === 401) {
          api.post("/auth/logout").catch(() => {});
        }
      });

    return () => {
      cancelled = true;
    };
    // Intentionally omit `status` — including it re-ran this effect on
    // setStatus("loading") and cancelled the in-flight /me before setUser ran.
  }, [setUser, setStatus]);

  return <>{children}</>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap>{children}</AuthBootstrap>
    </QueryClientProvider>
  );
}
