"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import { listFactoryExpenses } from "@/lib/expenses-api";
import {
  getProductionMargin,
  type ProductionMarginReport,
} from "@/lib/finance-api";
import { formatDate, formatKg, formatMoney } from "@/lib/materials-api";
import { calendarDay } from "@/lib/date-range";
import type { BatchExpense } from "@/types/production";
import { cn } from "@/lib/utils";

type Accrual = NonNullable<
  ProductionMarginReport["summary"]["electricityAccrual"]
>;

function inRange(iso: string | Date | undefined, from: string, to: string) {
  if (!iso) return false;
  const d = calendarDay(iso);
  return d >= from && d <= to;
}

type Props = {
  /** Bump after saving a bill so status refreshes. */
  refreshKey?: number;
  className?: string;
};

export function ElectricityAccrualStatus({ refreshKey = 0, className }: Props) {
  const { t } = useI18n();
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();
  const [loading, setLoading] = useState(true);
  const [accrual, setAccrual] = useState<Accrual | null>(null);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [bills, setBills] = useState<BatchExpense[]>([]);

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const [margin, expenses] = await Promise.all([
        getProductionMargin({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
        listFactoryExpenses(),
      ]);
      setAccrual(margin.summary?.electricityAccrual ?? null);
      setPeriod(margin.period ?? null);
      setBills(expenses.filter((e) => e.category === "electricity"));
    } catch {
      setAccrual(null);
      setPeriod(null);
      setBills([]);
    } finally {
      setLoading(false);
    }
  }, [hydrated, dateFrom, dateTo]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [load, refreshKey]);

  const periodFrom = period?.from ? calendarDay(period.from) : "";
  const periodTo = period?.to ? calendarDay(period.to) : "";
  const estimate = accrual?.estimate;
  const priorFrom = estimate?.priorFrom ? calendarDay(estimate.priorFrom) : "";
  const priorTo = estimate?.priorTo ? calendarDay(estimate.priorTo) : "";

  const relatedBills = useMemo(() => {
    if (!accrual) return [];
    if (accrual.source === "actual" && periodFrom && periodTo) {
      return bills
        .filter((e) => inRange(e.expenseDate, periodFrom, periodTo))
        .sort(
          (a, b) =>
            new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime()
        );
    }
    if (accrual.source === "estimated" && priorFrom && priorTo) {
      return bills
        .filter((e) => inRange(e.expenseDate, priorFrom, priorTo))
        .sort(
          (a, b) =>
            new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime()
        );
    }
    return [];
  }, [accrual, bills, periodFrom, periodTo, priorFrom, priorTo]);

  const sourceTone =
    accrual?.source === "actual"
      ? "border-chart-3/40 bg-chart-3/10"
      : accrual?.source === "estimated"
        ? "border-amber-500/40 bg-amber-500/10"
        : "border-border bg-muted/40";

  const sourceLabel =
    accrual?.source === "actual"
      ? t("elec.accrual.actual")
      : accrual?.source === "estimated"
        ? t("elec.accrual.estimated")
        : t("elec.accrual.none");

  return (
    <Card className={cn("py-0", className)}>
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {t("elec.accrual.title")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("elec.accrual.desc")}
            </p>
          </div>
          <DateRangeFilter />
        </div>

        {loading || !accrual ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3",
                sourceTone
              )}
            >
              <div>
                <p className="text-xs font-medium tracking-wide uppercase">
                  {sourceLabel}
                </p>
                {periodFrom && periodTo ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("elec.accrual.forPeriod", {
                      from: formatDate(periodFrom),
                      to: formatDate(periodTo),
                    })}
                  </p>
                ) : null}
              </div>
              <p className="font-data text-xl">
                {formatMoney(accrual.amount || 0)}
              </p>
            </div>

            {accrual.source === "estimated" && estimate ? (
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">
                    {t("elec.accrual.priorBill")}:{" "}
                  </span>
                  <span className="font-data">{formatMoney(estimate.priorBill)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    ({formatDate(priorFrom)} – {formatDate(priorTo)})
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">
                    {t("elec.accrual.rate")}:{" "}
                  </span>
                  <span className="font-data">
                    {formatMoney(estimate.ratePerWeightedKg)} / {t("elec.accrual.weightedKg")}
                  </span>
                </p>
                {estimate.unitPrice != null ? (
                  <p>
                    <span className="text-muted-foreground">
                      {t("elec.unitRate")}:{" "}
                    </span>
                    <span className="font-data">
                      {formatMoney(estimate.unitPrice)} / {t("elec.unit")}
                    </span>
                    {estimate.priorUnits > 0 ? (
                      <span className="text-muted-foreground">
                        {" "}
                        ({formatKg(estimate.priorUnits)} {t("elec.unit")})
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <p>
                  <span className="text-muted-foreground">
                    {t("elec.accrual.priorKg")}:{" "}
                  </span>
                  <span className="font-data">
                    {formatKg(estimate.priorHubKg)} {t("prod.hub")} ·{" "}
                    {formatKg(estimate.priorDrumKg)} {t("prod.drum")}
                  </span>
                </p>
              </div>
            ) : null}

            {accrual.source === "actual" ? (
              <p className="text-sm text-muted-foreground">
                {t("elec.accrual.actualHint")}
              </p>
            ) : null}

            {accrual.source === "none" ? (
              <p className="text-sm text-muted-foreground">
                {t("elec.accrual.noneHint")}
              </p>
            ) : null}

            {relatedBills.length > 0 ? (
              <div className="overflow-hidden rounded-lg border">
                <p className="border-b bg-muted/40 px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {accrual.source === "estimated"
                    ? t("elec.accrual.priorBillsList")
                    : t("elec.accrual.periodBillsList")}
                </p>
                <ul className="divide-y">
                  {relatedBills.map((e) => (
                    <li
                      key={e._id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="font-data text-xs text-muted-foreground">
                        {formatDate(e.expenseDate)}
                        {e.quantity != null && e.quantity > 0
                          ? ` · ${formatKg(e.quantity)} ${t("elec.unit")}`
                          : ""}
                        {e.notes?.trim() ? ` · ${e.notes.trim()}` : ""}
                      </span>
                      <span className="font-data">{formatMoney(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
