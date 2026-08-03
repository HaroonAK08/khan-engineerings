"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

type DateRangeFilterProps = {
  className?: string;
  showAll?: boolean;
  showToday?: boolean;
  inputClassName?: string;
};

export function DateRangeFilter({
  className,
  showAll = false,
  showToday = false,
  inputClassName,
}: DateRangeFilterProps) {
  const { t } = useI18n();
  const id = useId();
  const fromId = `${id}-from`;
  const toId = `${id}-to`;
  const {
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    setThisMonth,
    setToday,
    clearRange,
    isThisMonth,
    isToday,
    isAll,
  } = usePersistedDateRange();

  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      {showAll ? (
        <Button
          type="button"
          size="sm"
          variant={isAll ? "default" : "outline"}
          onClick={clearRange}
        >
          {t("common.all")}
        </Button>
      ) : null}
      {showToday ? (
        <Button
          type="button"
          size="sm"
          variant={isToday ? "default" : "outline"}
          onClick={setToday}
        >
          {t("common.today")}
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant={isThisMonth ? "default" : "outline"}
        onClick={setThisMonth}
      >
        {t("common.thisMonth")}
      </Button>
      <div className="grid gap-1.5">
        <Label htmlFor={fromId}>{t("common.from")}</Label>
        <Input
          id={fromId}
          type="date"
          className={cn("w-auto", inputClassName)}
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={toId}>{t("common.to")}</Label>
        <Input
          id={toId}
          type="date"
          className={cn("w-auto", inputClassName)}
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>
    </div>
  );
}
