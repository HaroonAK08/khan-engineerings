"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/hooks/use-i18n";
import { getYearProgress, type YearProgressReport } from "@/lib/finance-api";
import { getAssetsSummary } from "@/lib/assets-api";
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";

function currentYear() {
  return new Date().getFullYear();
}

function yearOptions() {
  const y = currentYear();
  return Array.from({ length: 8 }, (_, i) => y - i);
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export default function YearProgressPage() {
  const { t } = useI18n();
  const [year, setYear] = useState(String(currentYear()));
  const [report, setReport] = useState<YearProgressReport | null>(null);
  const [assetsTotal, setAssetsTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getYearProgress({ year: Number(year) }));
      try {
        const summary = await getAssetsSummary();
        setAssetsTotal(summary.grandTotal);
      } catch {
        setAssetsTotal(null);
      }
    } catch (err) {
      toast.error(apiError(err, t("yearProgress.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [year, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const yearItems = useMemo(
    () => Object.fromEntries(yearOptions().map((y) => [String(y), String(y)])),
    []
  );

  const totals = report?.totals;

  return (
    <div className="flex flex-col gap-6">
      <FinanceSubnav />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("common.financeEyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("yearProgress.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("yearProgress.subtitle")}</p>
        </div>
        <div className="grid gap-1.5">
          <Label>{t("yearProgress.year")}</Label>
          <Select value={year} onValueChange={(v) => setYear(v || String(currentYear()))} items={yearItems}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions().map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading || !report ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: t("yearProgress.sales"), value: formatMoney(totals?.sales || 0) },
              { label: t("yearProgress.purchases"), value: formatMoney(totals?.purchaseSpend || 0) },
              { label: t("yearProgress.expenses"), value: formatMoney(totals?.expenses || 0) },
              { label: t("yearProgress.netProfit"), value: formatMoney(totals?.netProfit || 0) },
            ].map((s) => (
              <Card key={s.label} className="py-0">
                <CardContent className="p-4">
                  <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                    {s.label}
                  </p>
                  <p className="font-data mt-1 text-xl">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {assetsTotal != null ? (
            <Card>
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{t("yearProgress.assets")}</p>
                  <p className="font-data text-xl">{formatMoney(assetsTotal)}</p>
                </div>
                <Link
                  href="/dashboard/finance/assets"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-3.5 text-sm hover:bg-muted"
                >
                  {t("financeSubnav.assets")}
                </Link>
              </CardContent>
            </Card>
          ) : null}

          <div>
            <h2 className="text-nameplate text-sm">{t("yearProgress.monthsTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("yearProgress.monthsDesc")}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {report.months.map((m) => (
              <Card key={m.label}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-nameplate text-sm">
                        {MONTH_LABELS[m.month - 1]} {m.year}
                      </CardTitle>
                      <CardDescription className="font-data text-xs">{m.label}</CardDescription>
                    </div>
                    <Badge variant={m.isProfit ? "secondary" : "destructive"}>
                      {m.isProfit ? t("financeOverview.profitLabel") : t("financeMonthly.loss")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("yearProgress.sales")}</span>
                    <span className="font-data text-xs">
                      {formatMoney(m.sales)}
                      <span className="ml-1 text-muted-foreground">({m.builtyCount})</span>
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("yearProgress.production")}</span>
                    <span className="font-data text-right text-xs">
                      {m.productionPieces} pcs · {formatKg(m.productionKg)}
                      <span className="mt-0.5 block text-muted-foreground">
                        {t("yearProgress.batchesCount", { count: m.productionBatches })}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("yearProgress.purchases")}</span>
                    <span className="font-data text-right text-xs">
                      {formatMoney(m.purchaseSpend)}
                      <span className="mt-0.5 block text-muted-foreground">
                        {formatKg(m.purchaseKg)} · {m.purchaseCount}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("yearProgress.expenses")}</span>
                    <span className="font-data text-xs">{formatMoney(m.expenses)}</span>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-border/60 pt-2">
                    <span className="font-medium">{t("yearProgress.netProfit")}</span>
                    <span className="font-data text-sm font-medium">
                      {formatMoney(m.netProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>{t("yearProgress.cashNet")}</span>
                    <span className="font-data">{formatMoney(m.cashNet)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
