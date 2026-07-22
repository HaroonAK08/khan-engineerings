"use client";

import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { clearAuthToken } from "@/lib/auth-token";
import { LocaleBootstrap } from "@/components/layout/locale-bootstrap";
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
        if (cancelled) return;
        // Don't wipe a session established while this /me was still in flight
        if (useAuthStore.getState().status === "authenticated") return;
        setUser(null);
        // Clear a stale token/cookie only on auth rejection, not network/CORS failures
        if (err?.response?.status === 401) {
          clearAuthToken();
          api.post("/auth/logout").catch(() => {});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setUser, setStatus]);

  return <>{children}</>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleBootstrap>
        <AuthBootstrap>{children}</AuthBootstrap>
      </LocaleBootstrap>
    </QueryClientProvider>
  );
}
