"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export type SortState<K extends string = string> = { key: K; dir: SortDir } | null;

/**
 * Column sorting.
 *
 * No screen in the app had sortable columns (docs/audit/06, UX-007). This adds
 * it in one place so every table behaves the same, and so sorting composes with
 * the existing filters rather than replacing them.
 *
 * `useClientSort` sorts rows already in memory. For a server-paginated table,
 * pass the state to the API instead — sorting only the current page would be
 * wrong, since the rows outside it also compete for the top.
 */
export function useSortState<K extends string>(initial: SortState<K> = null) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const toggle = useCallback((key: K) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: "asc" };
      if (current.dir === "asc") return { key, dir: "desc" };
      return null; // third click clears, restoring the server's default order
    });
  }, []);

  return { sort, setSort, toggle };
}

/** Clickable header cell with an explicit, accessible sort indicator. */
export function SortableHead<K extends string>({
  columnKey,
  sort,
  onToggle,
  children,
  className,
  align = "left",
  labels,
}: {
  columnKey: K;
  sort: SortState<K>;
  onToggle: (key: K) => void;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  labels?: { asc: string; desc: string };
}) {
  const active = sort?.key === columnKey;
  const dir = active ? sort.dir : null;
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;

  return (
    <TableHead
      className={cn(align === "right" && "text-right", align === "center" && "text-center", className)}
      aria-sort={!active ? "none" : dir === "asc" ? "ascending" : "descending"}
    >
      <button
        type="button"
        onClick={() => onToggle(columnKey)}
        title={
          labels
            ? dir === "asc"
              ? labels.desc
              : labels.asc
            : undefined
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-0.5 py-0.5 transition-colors",
          "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <span>{children}</span>
        <Icon className={cn("size-3 shrink-0", active ? "opacity-100" : "opacity-40")} />
      </button>
    </TableHead>
  );
}

/**
 * Sort rows already loaded in memory.
 *
 * Comparison is type-aware: numbers numerically, dates chronologically, and
 * strings with localeCompare so Urdu names order sensibly. Null and undefined
 * always sort last regardless of direction, so empty cells do not float to the
 * top of a descending sort.
 */
export function useClientSort<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  accessors: Record<K, (row: T) => string | number | Date | null | undefined>
) {
  return useMemo(() => {
    if (!sort) return rows;
    const get = accessors[sort.key];
    if (!get) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;

    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      if (av instanceof Date || bv instanceof Date) {
        return (new Date(av as Date).getTime() - new Date(bv as Date).getTime()) * factor;
      }
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * factor;
      }
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor;
    });
  }, [rows, sort, accessors]);
}
