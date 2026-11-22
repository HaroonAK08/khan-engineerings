"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { clearAuthToken } from "@/lib/auth-token";
import { LocaleBootstrap } from "@/components/layout/locale-bootstrap";
import { useAuthStore } from "@/stores/auth-store";
import { useTaxSplitStore } from "@/stores/tax-split-store";
import type { AuthUser } from "@/types/auth";

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

function TaxSplitBootstrap() {
  const status = useAuthStore((s) => s.status);
  const hydrate = useTaxSplitStore((s) => s.hydrate);

  useEffect(() => {
    if (status === "authenticated") void hydrate();
  }, [status, hydrate]);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  // The React Query provider lives in the dashboard layout, not here — see
  // providers/query-provider.tsx.
  return (
    <LocaleBootstrap>
      <AuthBootstrap>
        <TaxSplitBootstrap />
        {children}
      </AuthBootstrap>
    </LocaleBootstrap>
  );
}
