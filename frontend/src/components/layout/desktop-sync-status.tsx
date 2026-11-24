"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SyncStatus = {
  state: "failed" | "disabled" | "starting" | "offline" | "syncing" | "synced" | "up-to-date";
  lastSuccessAt?: string | null;
  pending?: boolean;
  error?: string | null;
};

type DesktopBridge = {
  isDesktop?: boolean;
  getSyncStatus?: () => Promise<SyncStatus>;
};

declare global {
  interface Window { khanDesktop?: DesktopBridge; }
}

export function DesktopSyncStatus() {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    if (!window.khanDesktop?.isDesktop || !window.khanDesktop.getSyncStatus) return;
    let cancelled = false;
    const read = async () => {
      try {
        const next = await window.khanDesktop?.getSyncStatus?.();
        if (!cancelled && next) setStatus(next);
      } catch { /* desktop bridge unavailable */ }
    };
    void read();
    const timer = window.setInterval(read, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  if (!status) return null;
  const syncing = status.state === "syncing";
  const online = status.state === "synced" || status.state === "up-to-date";
  const label = status.state === "disabled" ? "Local only" : status.state === "failed" ? "Backup needs attention" : syncing ? "Backing up…" : online ? "Cloud backed up" : "Offline · saved locally";
  const Icon = syncing ? Loader2 : online ? Cloud : CloudOff;
  return (
    <Badge
      variant="secondary"
      title={status.error || (status.lastSuccessAt ? `Last backup ${new Date(status.lastSuccessAt).toLocaleString()}` : label)}
      className={cn("hidden gap-1.5 border-0 bg-sidebar-accent font-data text-[10px] tracking-wide sm:inline-flex", syncing && "text-primary")}
    >
      <Icon className={cn("size-3", syncing && "animate-spin")} />
      {label}
    </Badge>
  );
}
