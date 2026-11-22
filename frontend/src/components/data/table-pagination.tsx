"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

export type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  returned: number;
};

/**
 * Pagination bar with an explicit record count.
 *
 * The count is the important part: the stock-movement screen used to return a
 * silent 500-row cap with no total, so a partial ledger looked complete
 * (docs/audit/06, UX-008).
 */
export function TablePagination({
  page,
  onPageChange,
  onPageSizeChange,
  className,
  label,
}: {
  page: PageInfo | undefined;
  onPageChange: (next: number) => void;
  onPageSizeChange?: (size: number) => void;
  className?: string;
  label?: string;
}) {
  const { t } = useI18n();
  if (!page) return null;

  const first = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.page * page.pageSize, page.total);
  const unit = label ?? t("common.records");

  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="font-data text-[11px] tracking-[0.1em] text-muted-foreground">
        {page.total === 0
          ? `0 ${unit}`
          : `${t("common.showing")} ${first.toLocaleString()}–${last.toLocaleString()} ${t("common.ofTotal")} ${page.total.toLocaleString()} ${unit}`}
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-data tracking-[0.1em]">{t("common.rowsPerPage")}</span>
            <select
              value={page.pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded-md border bg-background px-1.5 text-xs"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={page.page <= 1}
            onClick={() => onPageChange(page.page - 1)}
            aria-label={t("common.prev")}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="font-data min-w-[5.5rem] text-center text-[11px] tracking-[0.1em] text-muted-foreground">
            {t("common.page")} {page.page} / {Math.max(1, page.totalPages)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={!page.hasMore}
            onClick={() => onPageChange(page.page + 1)}
            aria-label={t("common.next")}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
