"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Shield } from "lucide-react";
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
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";
import {
  getVaultYearSummary,
  isVaultUnlocked,
  type VaultYearSummary,
} from "@/lib/vault-api";

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
  const [assets, setAssets] = useState<VaultYearSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getYearProgress({ year: Number(year) }));
      if (isVaultUnlocked()) {
        try {
          setAssets(await getVaultYearSummary(Number(year)));
        } catch {
          setAssets(null);
        }
      } else {
        setAssets(null);
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
  const assetsByMonth = useMemo(() => {
    const map = new Map<string, { personal: number; company: number; all: number }>();
    for (const m of assets?.months || []) {
      map.set(m.label, {
        personal: m.personal,
        company: m.company,
        all: m.all,
      });
    }
    return map;
  }, [assets]);

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

      {loading || !report || !totals ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {[
              {
                label: t("yearProgress.sales"),
                value: formatMoney(totals.sales),
                hint: t("yearProgress.builtiesCount", { count: totals.builtyCount }),
              },
              {
                label: t("yearProgress.production"),
                value: String(totals.productionPieces),
                hint: `${formatKg(totals.productionKg)} · ${t("yearProgress.batchesCount", {
                  count: totals.productionBatches,
                })}`,
              },
              {
                label: t("yearProgress.purchases"),
                value: formatMoney(totals.purchaseSpend),
                hint: `${formatKg(totals.purchaseKg)} · ${t("yearProgress.purchasesCount", {
                  count: totals.purchaseCount,
                })}`,
              },
              {
                label: t("yearProgress.expenses"),
                value: formatMoney(totals.expenses),
              },
              {
                label: t("yearProgress.netProfit"),
                value: formatMoney(totals.netProfit),
              },
            ].map((s) => (
              <Card key={s.label} className="py-0">
                <CardContent className="p-4">
                  <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                    {s.label}
                  </p>
                  <p className="font-data mt-1 text-xl">{s.value}</p>
                  {s.hint ? (
                    <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          {assets ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                {
                  label: t("yearProgress.assetsPersonal"),
                  value: formatMoney(assets.yearEnd.personal),
                },
                {
                  label: t("yearProgress.assetsCompany"),
                  value: formatMoney(assets.yearEnd.company),
                },
                {
                  label: t("yearProgress.assetsAll"),
                  value: formatMoney(assets.yearEnd.all),
                },
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
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Shield className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t("yearProgress.assetsLockedTitle")}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("yearProgress.assetsLockedHint")}
                    </p>
                  </div>
                </div>
                <Link
                  href="/dashboard/finance/vault"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-3.5 text-base hover:bg-muted"
                >
                  {t("yearProgress.openVault")}
                </Link>
              </CardContent>
            </Card>
          )}

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
                      <span className="ml-1 text-muted-foreground">
                        ({m.builtyCount})
                      </span>
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
                  {assetsByMonth.get(m.label) ? (
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span>{t("yearProgress.assets")}</span>
                      <span className="font-data">
                        {formatMoney(assetsByMonth.get(m.label)!.all)}
                      </span>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
