"use client";

import { cn } from "@/lib/utils";
import type { ExpenseScope } from "@/lib/workers-api";

const SCOPES: ExpenseScope[] = ["hub", "drum", "common"];

export function scopeChipClass(scope: ExpenseScope | string | null | undefined, active = false) {
  const s = scope === "hub" || scope === "drum" ? scope : "common";
  if (s === "hub") {
    return active
      ? "border-sky-600 bg-sky-600 text-white"
      : "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
  if (s === "drum") {
    return active
      ? "border-yellow-500 bg-yellow-500 text-yellow-950"
      : "border-yellow-500/40 bg-yellow-400/15 text-yellow-800 dark:text-yellow-300";
  }
  return active
    ? "border-slate-700 bg-slate-800 text-white"
    : "border-border bg-muted/40 text-muted-foreground";
}

export function ExpenseScopeChips({
  value,
  onChange,
  labels,
  includeAll = false,
  allLabel = "All",
  className,
}: {
  value: ExpenseScope | "all";
  onChange: (next: ExpenseScope | "all") => void;
  labels: { hub: string; drum: string; common: string };
  includeAll?: boolean;
  allLabel?: string;
  className?: string;
}) {
  const options: Array<{ id: ExpenseScope | "all"; label: string }> = [
    ...(includeAll ? [{ id: "all" as const, label: allLabel }] : []),
    { id: "hub", label: labels.hub },
    { id: "drum", label: labels.drum },
    { id: "common", label: labels.common },
  ];

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={cn(
            "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            opt.id === "all"
              ? value === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground"
              : scopeChipClass(opt.id, value === opt.id)
          )}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export { SCOPES };
