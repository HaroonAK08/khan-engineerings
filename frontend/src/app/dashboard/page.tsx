"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";
import {
  getProductionMargin,
  type ProductionMarginFamily,
  type ProductionMarginProduct,
  type ProductionMarginReport,
} from "@/lib/finance-api";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
    finishedKg: string;
    unitsSold: string;
    material: string;
    overhead: string;
    costPerKg: string;
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
            {labels.finishedKg}
          </p>
          <p className="font-data mt-1 text-lg">{formatKg(data.finishedKg ?? 0)}</p>
        </div>
        <div>
          <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {labels.unitsSold}
          </p>
          <p className="font-data mt-1 text-lg">{data.unitsSold ?? 0}</p>
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
            {labels.costPerKg}
          </p>
          <p className="font-data mt-1 text-lg">
            {data.costPerKg != null ? formatMoney(data.costPerKg) : "—"}
          </p>
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

function FamilyProductTable({
  family,
  title,
  rows,
  emptyLabel,
  totalLabel,
  labels,
  familyCostPerKg,
  familyOverheadPerKg,
}: {
  family: "hub" | "drum";
  title: string;
  rows: ProductionMarginProduct[];
  emptyLabel: string;
  totalLabel: string;
  labels: {
    product: string;
    pieces: string;
    finishedKg: string;
    scrapKg: string;
    daigKg: string;
    materialCost: string;
    overhead: string;
    overheadPerKg: string;
    totalCost: string;
    costPerPiece: string;
    costPerKg: string;
    sellPerPiece: string;
    soldPrice: string;
    netProfit: string;
    margin: string;
  };
  familyCostPerKg?: number | null;
  familyOverheadPerKg?: number | null;
}) {
  const isDrum = family === "drum";
  const headerBg = isDrum ? "bg-amber-600" : "bg-sky-600";
  const headerText = "text-white";
  const totals = rows.reduce(
    (acc, p) => {
      acc.pieces += p.pieces || 0;
      acc.finishedKg += p.finishedKg || 0;
      acc.scrapKg += p.scrapKg || 0;
      acc.daigKg += p.daigKg || 0;
      acc.materialCost += p.materialCost || 0;
      acc.overhead += p.overhead || 0;
      acc.totalCost += p.totalCost || 0;
      acc.sellValue += p.sellValue || 0;
      acc.profit += p.profit || 0;
      return acc;
    },
    {
      pieces: 0,
      finishedKg: 0,
      scrapKg: 0,
      daigKg: 0,
      materialCost: 0,
      overhead: 0,
      totalCost: 0,
      sellValue: 0,
      profit: 0,
    }
  );
  const marginPct =
    totals.sellValue > 0
      ? Math.round((totals.profit / totals.sellValue) * 10000) / 100
      : null;
  const avgCostPerPiece = totals.pieces > 0 ? totals.totalCost / totals.pieces : 0;
  const avgCostPerKg =
    familyCostPerKg != null
      ? familyCostPerKg
      : totals.finishedKg > 0
        ? totals.totalCost / totals.finishedKg
        : null;
  const avgOverheadPerKg =
    familyOverheadPerKg != null
      ? familyOverheadPerKg
      : totals.finishedKg > 0
        ? totals.overhead / totals.finishedKg
        : null;
  const avgSellPerPiece =
    rows.reduce((s, p) => s + (p.unitsSoldPeriod || 0), 0) > 0
      ? totals.sellValue / rows.reduce((s, p) => s + (p.unitsSoldPeriod || 0), 0)
      : 0;

  return (
    <Card className="gap-0 overflow-visible py-0">
      <div className={`sticky top-0 z-20 rounded-t-xl shadow-md ${headerBg} ${headerText}`}>
        <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <h2 className="text-nameplate text-base tracking-[0.12em] uppercase sm:text-lg">
            {title}
          </h2>
          <div className="font-data flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-95">
            <p>
              {labels.overheadPerKg}:{" "}
              <span className="text-base font-semibold">
                {avgOverheadPerKg != null ? formatMoney(avgOverheadPerKg) : "—"}
              </span>
            </p>
            <p>
              {labels.costPerKg}:{" "}
              <span className="text-base font-semibold">
                {avgCostPerKg != null ? formatMoney(avgCostPerKg) : "—"}
              </span>
              <span className="ml-2 text-xs opacity-80">
                ({formatKg(totals.finishedKg)})
              </span>
            </p>
          </div>
        </div>
      </div>
      <CardContent className="px-0 pt-0">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <Table containerClassName="overflow-visible">
            <TableHeader className={`sticky top-12 z-10 shadow-sm [&_tr]:border-b-0`}>
              <TableRow className={`hover:bg-transparent ${headerBg}`}>
                <TableHead className={`${headerBg} ${headerText} font-semibold`}>
                  {labels.product}
                </TableHead>
                <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                  {labels.pieces}
                </TableHead>
                <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                  {labels.finishedKg}
                </TableHead>
                {isDrum ? (
                  <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                    {labels.daigKg}
                  </TableHead>
                ) : (
                  <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                    {labels.scrapKg}
                  </TableHead>
                )}
                <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                  {labels.materialCost}
                </TableHead>
                <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                  {labels.overhead}
                </TableHead>
                <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                  {labels.overheadPerKg}
                </TableHead>
                <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                  {labels.totalCost}
                </TableHead>
                <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                  {labels.costPerKg}
                </TableHead>
                <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                  {labels.costPerPiece}
                </TableHead>
                <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                  {labels.sellPerPiece}
                </TableHead>
                <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                  {labels.soldPrice}
                </TableHead>
                <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                  {labels.netProfit}
                </TableHead>
                <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                  {labels.margin}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow
                  key={p.productId}
                  className={
                    isDrum
                      ? "border-amber-500/10 bg-amber-500/5 hover:bg-amber-500/10"
                      : "border-sky-500/10 bg-sky-500/5 hover:bg-sky-500/10"
                  }
                >
                  <TableCell>
                    <span>{p.name}</span>
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">{p.pieces}</TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatKg(p.finishedKg ?? 0)}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatKg(isDrum ? p.daigKg : p.scrapKg)}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatMoney(p.materialCost)}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatMoney(p.overhead)}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {p.overheadPerKg != null
                      ? formatMoney(p.overheadPerKg)
                      : p.finishedKg
                        ? formatMoney(p.overhead / p.finishedKg)
                        : "—"}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatMoney(p.totalCost)}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {p.costPerKg != null
                      ? formatMoney(p.costPerKg)
                      : p.finishedKg
                        ? formatMoney(p.totalCost / p.finishedKg)
                        : "—"}
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
              ))}
            </TableBody>
            <TableFooter>
              <TableRow
                className={
                  isDrum
                    ? "bg-amber-600/15 font-medium hover:bg-amber-600/15"
                    : "bg-sky-600/15 font-medium hover:bg-sky-600/15"
                }
              >
                <TableCell>{totalLabel}</TableCell>
                <TableCell className="font-data text-right text-xs">{totals.pieces}</TableCell>
                <TableCell className="font-data text-right text-xs">
                  {formatKg(totals.finishedKg)}
                </TableCell>
                <TableCell className="font-data text-right text-xs">
                  {formatKg(isDrum ? totals.daigKg : totals.scrapKg)}
                </TableCell>
                <TableCell className="font-data text-right text-xs">
                  {formatMoney(totals.materialCost)}
                </TableCell>
                <TableCell className="font-data text-right text-xs">
                  {formatMoney(totals.overhead)}
                </TableCell>
                <TableCell className="font-data text-right text-xs">
                  {avgOverheadPerKg != null ? formatMoney(avgOverheadPerKg) : "—"}
                </TableCell>
                <TableCell className="font-data text-right text-xs">
                  {formatMoney(totals.totalCost)}
                </TableCell>
                <TableCell className="font-data text-right text-xs">
                  {avgCostPerKg != null ? formatMoney(avgCostPerKg) : "—"}
                </TableCell>
                <TableCell className="font-data text-right text-xs">
                  {formatMoney(avgCostPerPiece)}
                </TableCell>
                <TableCell className="font-data text-right text-xs">
                  {formatMoney(avgSellPerPiece)}
                </TableCell>
                <TableCell className="font-data text-right text-xs">
                  {formatMoney(totals.sellValue)}
                </TableCell>
                <TableCell className="font-data text-right text-xs">
                  {formatMoney(totals.profit)}
                </TableCell>
                <TableCell className="font-data text-right text-xs">
                  {marginPct != null ? `${marginPct}%` : "—"}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
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

  const hubProducts = useMemo(
    () => (report?.products || []).filter((p) => (p.family || "hub") !== "drum"),
    [report]
  );
  const drumProducts = useMemo(
    () => (report?.products || []).filter((p) => p.family === "drum"),
    [report]
  );

  const familyLabels = {
    pieces: t("prodMargin.pieces"),
    finishedKg: t("prodMargin.finishedKg"),
    unitsSold: t("prodMargin.unitsSold"),
    material: t("prodMargin.materialCost"),
    overhead: t("prodMargin.overhead"),
    costPerKg: t("prodMargin.costPerKg"),
    sellValue: t("prodMargin.sellValue"),
    profit: t("prodMargin.netProfit"),
    margin: t("prodMargin.margin"),
  };

  const productTableLabels = {
    product: t("common.product"),
    pieces: t("prodMargin.pieces"),
    finishedKg: t("prodMargin.finishedKg"),
    scrapKg: t("prodMargin.scrapKg"),
    daigKg: t("prodMargin.daigKg"),
    materialCost: t("prodMargin.materialCost"),
    overhead: t("prodMargin.overhead"),
    overheadPerKg: t("prodMargin.overheadPerKg"),
    totalCost: t("prodMargin.totalCost"),
    costPerPiece: t("prodMargin.costPerPiece"),
    costPerKg: t("prodMargin.costPerKg"),
    sellPerPiece: t("prodMargin.sellPerPiece"),
    soldPrice: t("prodMargin.sellValue"),
    netProfit: t("prodMargin.netProfit"),
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
                money: formatMoney(
                  report.purchasedVsUsed?.used.scrapAmount ?? summary.scrapCost ?? 0
                ),
                accent: "bg-chart-4",
              },
              {
                label: t("prodMargin.daigUsed"),
                value: formatKg(summary.daigKg),
                hint: t("prodMargin.inclWaste"),
                money: formatMoney(
                  report.purchasedVsUsed?.used.daigAmount ?? summary.daigCost ?? 0
                ),
                accent: "bg-chart-2",
              },
              {
                label: t("prodMargin.materialPurchased"),
                value: formatMoney(report.purchasedVsUsed?.purchased.totalAmount ?? 0),
                hint: `${formatKg(report.purchasedVsUsed?.purchased.totalKg ?? 0)} · ${t("prodMargin.purchasedHint")}`,
                accent: "bg-primary",
              },
              {
                label: t("prodMargin.materialUsed"),
                value: formatMoney(report.purchasedVsUsed?.used.totalAmount ?? summary.materialCost),
                hint: `${formatKg(report.purchasedVsUsed?.used.totalKg ?? summary.scrapKg + summary.daigKg)} · ${t("prodMargin.usedHint")}`,
                accent: "bg-chart-5",
              },
              {
                label: t("prodMargin.ikHubCostKg"),
                value:
                  report.channelManufacture?.ikEngineering.hub.totalPerKg != null
                    ? formatMoney(report.channelManufacture.ikEngineering.hub.totalPerKg)
                    : summary.hubCostPerKg != null
                      ? formatMoney(summary.hubCostPerKg)
                      : "—",
                hint: `${formatKg(summary.hubFinishedKg ?? 0)} · ${t("prodMargin.ikCostHint")}`,
                accent: "bg-sky-600",
              },
              {
                label: t("prodMargin.ikDrumCostKg"),
                value:
                  report.channelManufacture?.ikEngineering.drum.totalPerKg != null
                    ? formatMoney(report.channelManufacture.ikEngineering.drum.totalPerKg)
                    : summary.drumCostPerKg != null
                      ? formatMoney(summary.drumCostPerKg)
                      : "—",
                hint: `${formatKg(summary.drumFinishedKg ?? 0)} · ${t("prodMargin.ikCostHint")}`,
                accent: "bg-amber-600",
              },
              {
                label: t("prodMargin.hubOverheadPerKg"),
                value:
                  report.channelManufacture?.ikEngineering.hub
                    ? formatMoney(
                        (report.channelManufacture.ikEngineering.hub.salariesPerKg || 0) +
                          (report.channelManufacture.ikEngineering.hub.mfgExpensesPerKg || 0)
                      )
                    : summary.hubOverheadPerKg != null
                      ? formatMoney(summary.hubOverheadPerKg)
                      : "—",
                hint: t("prodMargin.overheadPerKgHint"),
                accent: "bg-sky-500",
              },
              {
                label: t("prodMargin.drumOverheadPerKg"),
                value:
                  report.channelManufacture?.ikEngineering.drum
                    ? formatMoney(
                        (report.channelManufacture.ikEngineering.drum.salariesPerKg || 0) +
                          (report.channelManufacture.ikEngineering.drum.mfgExpensesPerKg || 0)
                      )
                    : summary.drumOverheadPerKg != null
                      ? formatMoney(summary.drumOverheadPerKg)
                      : "—",
                hint: t("prodMargin.overheadPerKgHint"),
                accent: "bg-amber-500",
              },
              {
                label: t("prodMargin.salesChargesKg"),
                value:
                  report.channelManufacture?.powerEngineering.salesmanAddOnPerKg != null
                    ? formatMoney(report.channelManufacture.powerEngineering.salesmanAddOnPerKg)
                    : "—",
                hint: report.channelManufacture?.powerEngineering.salesmanLoad
                  ? `${formatMoney(report.channelManufacture.powerEngineering.salesmanLoad)} · ${t("prodMargin.salesChargesHint")}`
                  : t("prodMargin.salesChargesHint"),
                accent: "bg-amber-400",
              },
              {
                label: t("prodMargin.peHubCostKg"),
                value:
                  report.channelManufacture?.powerEngineering.hub.totalPerKg != null
                    ? formatMoney(report.channelManufacture.powerEngineering.hub.totalPerKg)
                    : "—",
                hint: t("prodMargin.peCostHint"),
                accent: "bg-orange-600",
              },
              {
                label: t("prodMargin.peDrumCostKg"),
                value:
                  report.channelManufacture?.powerEngineering.drum.totalPerKg != null
                    ? formatMoney(report.channelManufacture.powerEngineering.drum.totalPerKg)
                    : "—",
                hint: t("prodMargin.peCostHint"),
                accent: "bg-orange-500",
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
                hint: t("prodMargin.sellCountHint", {
                  units: String(summary.unitsSold ?? 0),
                  builties: String(summary.builtyCount ?? 0),
                }),
                accent: "bg-chart-3",
              },
              {
                label: t("prodMargin.hubSalePl"),
                value: formatMoney(report.byFamily?.hub?.profit ?? 0),
                hint:
                  (report.byFamily?.hub?.finishedKg ?? 0) > 0
                    ? formatMoney(
                        (report.byFamily.hub.profit || 0) /
                          (report.byFamily.hub.finishedKg || 1)
                      )
                    : "—",
                accent: "bg-chart-3",
                tone: (report.byFamily?.hub?.profit ?? 0) < 0 ? ("loss" as const) : ("profit" as const),
              },
              {
                label: t("prodMargin.drumSalePl"),
                value: formatMoney(report.byFamily?.drum?.profit ?? 0),
                hint:
                  (report.byFamily?.drum?.finishedKg ?? 0) > 0
                    ? formatMoney(
                        (report.byFamily.drum.profit || 0) /
                          (report.byFamily.drum.finishedKg || 1)
                      )
                    : "—",
                accent: "bg-chart-3",
                tone: (report.byFamily?.drum?.profit ?? 0) < 0 ? ("loss" as const) : ("profit" as const),
              },
              {
                label: t("prodMargin.netProfit"),
                value: formatMoney(summary.profit),
                hint: t("prodMargin.sellMinusCost"),
                accent: isProfit ? "bg-chart-3" : "bg-destructive",
                tone: isProfit ? ("profit" as const) : ("loss" as const),
              },
            ].map((stat) => (
              <Card
                key={stat.label}
                className={cn(
                  "relative overflow-hidden py-0",
                  "tone" in stat &&
                    stat.tone === "profit" &&
                    "border-emerald-600/40 bg-emerald-600 text-white",
                  "tone" in stat &&
                    stat.tone === "loss" &&
                    "border-red-600/40 bg-red-600 text-white"
                )}
              >
                {"tone" in stat && stat.tone ? null : (
                  <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
                )}
                <CardContent className="p-5">
                  <p
                    className={cn(
                      "font-data text-[10px] tracking-[0.15em] uppercase",
                      "tone" in stat && stat.tone
                        ? "text-white/80"
                        : "text-muted-foreground"
                    )}
                  >
                    {stat.label}
                  </p>
                  <p className="font-data mt-2 text-2xl font-medium">{stat.value}</p>
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      "tone" in stat && stat.tone ? "text-white/75" : "text-muted-foreground"
                    )}
                  >
                    {stat.hint}
                  </p>
                  {"money" in stat && stat.money ? (
                    <p className="font-data mt-0.5 text-sm font-medium tabular-nums">
                      {stat.money}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          {report.channelManufacture ? (
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-nameplate text-sm">{t("prodMargin.channelMfgTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("prodMargin.channelMfgDesc")}
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {(
                  [
                    {
                      key: "ik" as const,
                      title: t("prodMargin.channelIk"),
                      data: report.channelManufacture.ikEngineering,
                      accent: "border-sky-500/40",
                      showAddOn: false,
                    },
                    {
                      key: "power" as const,
                      title: t("prodMargin.channelPower"),
                      data: report.channelManufacture.powerEngineering,
                      accent: "border-amber-500/40",
                      showAddOn: true,
                    },
                  ] as const
                ).map((channel) => (
                  <Card key={channel.key} className={`border ${channel.accent}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-nameplate text-sm">{channel.title}</CardTitle>
                      {channel.showAddOn &&
                      "salesmanLoad" in channel.data &&
                      channel.data.salesmanLoad > 0 ? (
                        <CardDescription>
                          {t("prodMargin.salesmanAddOnKg")}:{" "}
                          {formatMoney(channel.data.salesmanAddOnPerKg)} ·{" "}
                          {formatMoney(channel.data.salesmanLoad)}
                          {"salesmanSoldKg" in channel.data &&
                          channel.data.salesmanSoldKg
                            ? ` · ${formatKg(channel.data.salesmanSoldKg)}`
                            : ""}
                        </CardDescription>
                      ) : null}
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      {(
                        [
                          { fam: "hub" as const, label: t("prodMargin.hubLine") },
                          { fam: "drum" as const, label: t("prodMargin.drumLine") },
                        ] as const
                      ).map((col) => {
                        const line = channel.data[col.fam];
                        return (
                          <div
                            key={col.fam}
                            className="rounded-md border bg-muted/20 p-3 text-sm"
                          >
                            <p className="font-data mb-2 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                              {col.label}
                            </p>
                            <div className="flex flex-col gap-1.5">
                              <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">
                                  {t("prodMargin.rawMaterialKg")}
                                </span>
                                <span className="font-data">
                                  {line.materialPerKg != null
                                    ? formatMoney(line.materialPerKg)
                                    : "—"}
                                </span>
                              </div>

                              {(line.expenseLines?.length || 0) > 0 ? (
                                <>
                                  <p className="font-data mt-1 text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                                    {t("prodMargin.mfgExpensesKg")}
                                  </p>
                                  {line.expenseLines!.map((e) => (
                                    <div
                                      key={e.id}
                                      className="flex justify-between gap-2 pl-2"
                                    >
                                      <span className="text-muted-foreground">{e.label}</span>
                                      <span className="font-data">{formatMoney(e.perKg)}</span>
                                    </div>
                                  ))}
                                </>
                              ) : (
                                <div className="flex justify-between gap-2">
                                  <span className="text-muted-foreground">
                                    {t("prodMargin.mfgExpensesKg")}
                                  </span>
                                  <span className="font-data">
                                    {line.mfgExpensesPerKg != null
                                      ? formatMoney(line.mfgExpensesPerKg)
                                      : "—"}
                                  </span>
                                </div>
                              )}

                              {(line.salaryLines?.length || 0) > 0 ? (
                                <>
                                  <p className="font-data mt-1 text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                                    {t("prodMargin.salariesKg")}
                                  </p>
                                  {line.salaryLines!.map((e) => (
                                    <div
                                      key={e.id}
                                      className="flex justify-between gap-2 pl-2"
                                    >
                                      <span className="text-muted-foreground">{e.label}</span>
                                      <span className="font-data">{formatMoney(e.perKg)}</span>
                                    </div>
                                  ))}
                                </>
                              ) : (
                                <div className="flex justify-between gap-2">
                                  <span className="text-muted-foreground">
                                    {t("prodMargin.salariesKg")}
                                  </span>
                                  <span className="font-data">
                                    {line.salariesPerKg != null
                                      ? formatMoney(line.salariesPerKg)
                                      : "—"}
                                  </span>
                                </div>
                              )}

                              {channel.showAddOn ? (
                                <div className="flex justify-between gap-2">
                                  <span className="text-muted-foreground">
                                    {t("prodMargin.salesmanAddOnKg")}
                                  </span>
                                  <span className="font-data">
                                    {formatMoney(line.salesmanAddOnPerKg || 0)}
                                  </span>
                                </div>
                              ) : null}
                              <div className="mt-1 flex justify-between gap-2 border-t pt-1.5 font-semibold">
                                <span>{t("prodMargin.totalMfgKg")}</span>
                                <span className="font-data">
                                  {line.totalPerKg != null
                                    ? formatMoney(line.totalPerKg)
                                    : "—"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}

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

          {report.purchasedVsUsed && (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">
                  {t("prodMargin.purchasedVsUsed")}
                </CardTitle>
                <CardDescription>{t("prodMargin.purchasedVsUsedDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="font-data">
                    {t("prodMargin.avgScrapRate")}: {formatMoney(report.rates.avgScrapRate)}/kg
                    <span className="ml-1 opacity-70">
                      (
                      {report.rates.scrapSource === "all_time"
                        ? t("prodMargin.rateAllTime")
                        : t("prodMargin.rateThisPeriod")}
                      )
                    </span>
                  </span>
                  <span className="font-data">
                    {t("prodMargin.avgDaigRate")}: {formatMoney(report.rates.avgDaigRate)}/kg
                    <span className="ml-1 opacity-70">
                      (
                      {report.rates.daigSource === "all_time"
                        ? t("prodMargin.rateAllTime")
                        : t("prodMargin.rateThisPeriod")}
                      )
                    </span>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("prodMargin.material")}</TableHead>
                        <TableHead className="text-right">{t("prodMargin.purchased")} · {t("prodMargin.kg")}</TableHead>
                        <TableHead className="text-right">{t("prodMargin.purchased")} · {t("prodMargin.amount")}</TableHead>
                        <TableHead className="text-right">{t("prodMargin.used")} · {t("prodMargin.kg")}</TableHead>
                        <TableHead className="text-right">{t("prodMargin.used")} · {t("prodMargin.amount")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>{t("prodMargin.scrap")}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(report.purchasedVsUsed.purchased.scrapKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.purchasedVsUsed.purchased.scrapAmount)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(report.purchasedVsUsed.used.scrapKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.purchasedVsUsed.used.scrapAmount)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>{t("prodMargin.daig")}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(report.purchasedVsUsed.purchased.daigKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.purchasedVsUsed.purchased.daigAmount)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(report.purchasedVsUsed.used.daigKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.purchasedVsUsed.used.daigAmount)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="font-medium">
                        <TableCell>{t("prodMargin.total")}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(report.purchasedVsUsed.purchased.totalKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.purchasedVsUsed.purchased.totalAmount)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(report.purchasedVsUsed.used.totalKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.purchasedVsUsed.used.totalAmount)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <p>{t("prodMargin.purchasedHint")}</p>
                  <p>{t("prodMargin.usedHint")}</p>
                </div>
              </CardContent>
            </Card>
          )}

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

          <FamilyProductTable
            family="hub"
            title={`${t("prodMargin.byProduct")} · ${t("prodMargin.hub")}`}
            rows={hubProducts}
            emptyLabel={t("prodMargin.noProduction")}
            totalLabel={t("prodMargin.total")}
            labels={productTableLabels}
            familyCostPerKg={report.byFamily.hub.costPerKg ?? summary.hubCostPerKg}
            familyOverheadPerKg={
              report.byFamily.hub.overheadPerKg ?? summary.hubOverheadPerKg
            }
          />
          <FamilyProductTable
            family="drum"
            title={`${t("prodMargin.byProduct")} · ${t("prodMargin.drum")}`}
            rows={drumProducts}
            emptyLabel={t("prodMargin.noProduction")}
            totalLabel={t("prodMargin.total")}
            labels={productTableLabels}
            familyCostPerKg={report.byFamily.drum.costPerKg ?? summary.drumCostPerKg}
            familyOverheadPerKg={
              report.byFamily.drum.overheadPerKg ?? summary.drumOverheadPerKg
            }
          />
        </>
      )}
    </div>
  );
}
