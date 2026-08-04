"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";
import {
  getProductionMargin,
  type ProductionMarginFamily,
  type ProductionMarginReport,
} from "@/lib/finance-api";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";

function FamilyCard({
  title,
  data,
  labels,
}: {
  title: string;
  data: ProductionMarginFamily;
  labels: {
    pieces: string;
    material: string;
    overhead: string;
    sellValue: string;
    profit: string;
    margin: string;
  };
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-nameplate text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {labels.pieces}
          </p>
          <p className="font-data mt-1 text-lg">{data.pieces}</p>
        </div>
        <div>
          <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {labels.material}
          </p>
          <p className="font-data mt-1 text-lg">{formatMoney(data.materialCost)}</p>
        </div>
        <div>
          <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {labels.overhead}
          </p>
          <p className="font-data mt-1 text-lg">{formatMoney(data.overhead)}</p>
        </div>
        <div>
          <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {labels.sellValue}
          </p>
          <p className="font-data mt-1 text-lg">{formatMoney(data.sellValue)}</p>
        </div>
        <div>
          <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {labels.profit}
          </p>
          <p className="font-data mt-1 text-lg">{formatMoney(data.profit)}</p>
        </div>
        <div>
          <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {labels.margin}
          </p>
          <p className="font-data mt-1 text-lg">
            {data.marginPct != null ? `${data.marginPct}%` : "—"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProductionMarginPage() {
  const { t } = useI18n();
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();
  const [report, setReport] = useState<ProductionMarginReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const data = await getProductionMargin({ dateFrom, dateTo });
      setReport(data);
    } catch (err) {
      toast.error(apiError(err, t("prodMargin.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, hydrated, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  const summary = report?.summary;
  const isProfit = (summary?.profit ?? 0) >= 0;

  const familyLabels = {
    pieces: t("prodMargin.pieces"),
    material: t("prodMargin.materialCost"),
    overhead: t("prodMargin.overhead"),
    sellValue: t("prodMargin.sellValue"),
    profit: t("prodMargin.netProfit"),
    margin: t("prodMargin.margin"),
  };

  return (
    <div className="flex flex-col gap-6">
      <FinanceSubnav />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("common.financeEyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("prodMargin.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("prodMargin.subtitle")}</p>
        </div>
        <DateRangeFilter />
      </div>

      {loading || !report || !summary ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <Card className={isProfit ? "border-chart-3/40" : "border-destructive/40"}>
            <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                {isProfit ? (
                  <TrendingUp className="size-5 text-chart-3" />
                ) : (
                  <TrendingDown className="size-5 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {isProfit ? t("prodMargin.profitPeriod") : t("prodMargin.lossPeriod")}
                  </p>
                  <p className="font-data text-xs text-muted-foreground">
                    {t("prodMargin.catalogBasis")}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-data text-3xl">{formatMoney(summary.profit)}</p>
                <p className="font-data text-xs text-muted-foreground">
                  {t("prodMargin.margin")}{" "}
                  {summary.marginPct != null ? `${summary.marginPct}%` : "—"}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: t("prodMargin.pieces"),
                value: String(summary.pieces),
                hint: t("prodMargin.piecesHint"),
                accent: "bg-chart-1",
              },
              {
                label: t("prodMargin.scrapUsed"),
                value: formatKg(summary.scrapKg),
                hint: t("prodMargin.inclWaste"),
                accent: "bg-chart-4",
              },
              {
                label: t("prodMargin.daigUsed"),
                value: formatKg(summary.daigKg),
                hint: t("prodMargin.inclWaste"),
                accent: "bg-chart-2",
              },
              {
                label: t("prodMargin.materialCost"),
                value: formatMoney(summary.materialCost),
                hint: t("prodMargin.scrapPlusDaig"),
                accent: "bg-chart-5",
              },
              {
                label: t("prodMargin.mfgCost"),
                value: formatMoney(summary.totalCost),
                hint: t("prodMargin.materialPlusOverhead"),
                accent: "bg-chart-4",
              },
              {
                label: t("prodMargin.sellValue"),
                value: formatMoney(summary.sellValue),
                hint: t("prodMargin.catalogValue"),
                accent: "bg-chart-3",
              },
              {
                label: t("prodMargin.netProfit"),
                value: formatMoney(summary.profit),
                hint: t("prodMargin.sellMinusCost"),
                accent: isProfit ? "bg-chart-3" : "bg-destructive",
              },
              {
                label: t("prodMargin.margin"),
                value: summary.marginPct != null ? `${summary.marginPct}%` : "—",
                hint: t("prodMargin.marginHint"),
                accent: "bg-chart-1",
              },
            ].map((stat) => (
              <Card key={stat.label} className="relative overflow-hidden py-0">
                <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
                <CardContent className="p-5">
                  <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="font-data mt-2 text-2xl font-medium">{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <FamilyCard
              title={t("prodMargin.hubSummary")}
              data={report.byFamily.hub}
              labels={familyLabels}
            />
            <FamilyCard
              title={t("prodMargin.drumSummary")}
              data={report.byFamily.drum}
              labels={familyLabels}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">
                {t("prodMargin.expenseBreakdown")}
              </CardTitle>
              <CardDescription>{t("prodMargin.expenseBreakdownDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {report.expenseBreakdown.length === 0 ? (
                <p className="px-6 py-8 text-sm text-muted-foreground">
                  {t("prodMargin.noExpenses")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.category")}</TableHead>
                      <TableHead className="text-right">{t("common.amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.expenseBreakdown.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <span className="mr-2">{row.label}</span>
                          <Badge variant="secondary" className="font-data text-[9px]">
                            {row.kind === "material"
                              ? t("prodMargin.kindMaterial")
                              : t("prodMargin.kindOverhead")}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(row.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">
                {t("prodMargin.byProduct")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 overflow-x-auto">
              {report.products.length === 0 ? (
                <p className="px-6 py-8 text-sm text-muted-foreground">
                  {t("prodMargin.noProduction")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.product")}</TableHead>
                      <TableHead className="text-right">{t("prodMargin.pieces")}</TableHead>
                      <TableHead className="text-right">{t("prodMargin.materialKg")}</TableHead>
                      <TableHead className="text-right">{t("prodMargin.materialCost")}</TableHead>
                      <TableHead className="text-right">{t("prodMargin.overhead")}</TableHead>
                      <TableHead className="text-right">{t("prodMargin.totalCost")}</TableHead>
                      <TableHead className="text-right">{t("prodMargin.costPerPiece")}</TableHead>
                      <TableHead className="text-right">{t("prodMargin.sellPerPiece")}</TableHead>
                      <TableHead className="text-right">{t("prodMargin.sellValue")}</TableHead>
                      <TableHead className="text-right">{t("prodMargin.netProfit")}</TableHead>
                      <TableHead className="text-right">{t("prodMargin.margin")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.products.map((p) => {
                      const isDrum = p.family === "drum";
                      const materialKg = isDrum ? p.daigKg : p.scrapKg;
                      const materialKgLabel = isDrum
                        ? t("prodMargin.daigKg")
                        : t("prodMargin.scrapKg");
                      return (
                      <TableRow key={p.productId}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span>{p.name}</span>
                            <Badge variant="outline" className="w-fit font-data text-[9px]">
                              {isDrum ? t("prodMargin.drum") : t("prodMargin.hub")}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">{p.pieces}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{formatKg(materialKg)}</span>
                            <span className="text-[9px] text-muted-foreground">
                              {materialKgLabel}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(p.materialCost)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(p.overhead)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(p.totalCost)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(p.costPerPiece)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(p.sellPricePerPiece)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(p.sellValue)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(p.profit)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {p.marginPct != null ? `${p.marginPct}%` : "—"}
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
