"use client";

import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared data-state primitives.
 *
 * Screens previously each rolled their own spinner block, and a background
 * refresh blanked the whole page. These keep the three states consistent and
 * make "refreshing" visually distinct from "loading for the first time".
 */

/** Grey block used to compose skeletons. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-muted/70", className)}
    />
  );
}

/** Skeleton shaped like a row of KPI cards. */
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-32" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton shaped like a data table, so layout does not jump on load. */
export function TableSkeleton({
  rows = 8,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex gap-4 border-b bg-muted/40 p-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b p-3 last:border-0">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Subtle "updating" strip for a background refresh. Deliberately not a
 * full-page spinner: the figures already on screen stay readable.
 */
export function RefreshingBar({
  active,
  label = "Updating…",
}: {
  active: boolean;
  label?: string;
}) {
  if (!active) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-xs text-muted-foreground"
    >
      <Loader2 className="size-3 animate-spin" />
      <span className="font-data tracking-[0.12em] uppercase">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <Icon className="size-7 text-muted-foreground/60" />
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Try again",
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center"
    >
      <AlertTriangle className="size-7 text-destructive/70" />
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-md text-xs text-muted-foreground">{description}</p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** "Showing 50 of 1,447" — so a capped list never looks like the whole set. */
export function RecordCount({
  shown,
  total,
  label = "records",
  className,
}: {
  shown: number;
  total?: number;
  label?: string;
  className?: string;
}) {
  const hasTotal = typeof total === "number" && total >= 0;
  return (
    <p
      className={cn(
        "font-data text-[11px] tracking-[0.1em] text-muted-foreground",
        className
      )}
    >
      {hasTotal && total !== shown
        ? `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} ${label}`
        : `${shown.toLocaleString()} ${label}`}
    </p>
  );
}
