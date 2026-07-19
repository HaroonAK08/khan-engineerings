"use client";

import { useEffect } from "react";
import { useLocaleStore } from "@/stores/locale-store";

export function LocaleBootstrap({ children }: { children: React.ReactNode }) {
  const hydrate = useLocaleStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return <>{children}</>;
}
