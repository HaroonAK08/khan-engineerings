"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";
import {
  getPartySalesMargin,
  getProductionMargin,
  type PartySalesMarginReport,
  type ProductionMarginFamily,
  type ProductionMarginProduct,
  type ProductionMarginReport,
} from "@/lib/finance-api";
import { splitCastingKhrad } from "@/lib/casting-khrad";
import { DateRangeFilter } from "@/components/date-range-filter";
import { ChargesCalculator } from "@/components/finance/charges-calculator";
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
  variant,
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
  variant: "hub" | "drum";
}) {
  const isDrum = variant === "drum";
  const cardFill = isDrum
    ? "border-yellow-600/40 bg-yellow-500 text-yellow-950"
    : "border-sky-700/40 bg-sky-600 text-white";
  const labelTone = isDrum
    ? "font-semibold text-yellow-950"
    : "font-semibold text-white";
  const valueTone = isDrum
    ? "font-bold text-yellow-950"
    : "font-bold text-white";

  return (
    <Card className={cardFill}>
      <CardHeader className="pb-3">
        <CardTitle className={cn("text-nameplate text-sm font-bold", valueTone)}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className={cn("font-data text-[10px] tracking-[0.12em] uppercase", labelTone)}>
            {labels.pieces}
          </p>
          <p className={cn("font-data mt-1 text-lg", valueTone)}>{data.pieces}</p>
        </div>
        <div>
          <p className={cn("font-data text-[10px] tracking-[0.12em] uppercase", labelTone)}>
            {labels.finishedKg}
          </p>
          <p className={cn("font-data mt-1 text-lg", valueTone)}>
            {formatKg(data.finishedKg ?? 0)}
          </p>
        </div>
        <div>
          <p className={cn("font-data text-[10px] tracking-[0.12em] uppercase", labelTone)}>
            {labels.unitsSold}
          </p>
          <p className={cn("font-data mt-1 text-lg", valueTone)}>{data.unitsSold ?? 0}</p>
        </div>
        <div>
          <p className={cn("font-data text-[10px] tracking-[0.12em] uppercase", labelTone)}>
            {labels.material}
          </p>
          <p className={cn("font-data mt-1 text-lg", valueTone)}>
            {formatMoney(data.materialCost)}
          </p>
        </div>
        <div>
          <p className={cn("font-data text-[10px] tracking-[0.12em] uppercase", labelTone)}>
            {labels.overhead}
          </p>
          <p className={cn("font-data mt-1 text-lg", valueTone)}>
            {formatMoney(data.overhead)}
          </p>
        </div>
        <div>
          <p className={cn("font-data text-[10px] tracking-[0.12em] uppercase", labelTone)}>
            {labels.costPerKg}
          </p>
          <p className={cn("font-data mt-1 text-lg", valueTone)}>
            {data.costPerKg != null ? formatMoney(data.costPerKg) : "—"}
          </p>
        </div>
        <div>
          <p className={cn("font-data text-[10px] tracking-[0.12em] uppercase", labelTone)}>
            {labels.sellValue}
          </p>
          <p className={cn("font-data mt-1 text-lg", valueTone)}>
            {formatMoney(data.sellValue)}
          </p>
        </div>
        <div>
          <p className={cn("font-data text-[10px] tracking-[0.12em] uppercase", labelTone)}>
            {labels.profit}
          </p>
          <p className={cn("font-data mt-1 text-lg", valueTone)}>
            {formatMoney(data.profit)}
          </p>
        </div>
        <div>
          <p className={cn("font-data text-[10px] tracking-[0.12em] uppercase", labelTone)}>
            {labels.margin}
          </p>
          <p className={cn("font-data mt-1 text-lg", valueTone)}>
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
    unitsSold: string;
    sellPerPiece: string;
    soldPrice: string;
    soldCost: string;
    netProfit: string;
    margin: string;
  };
  familyCostPerKg?: number | null;
  familyOverheadPerKg?: number | null;
}) {
  const { t } = useI18n();
  const isDrum = family === "drum";
  const headerBg = isDrum ? "bg-yellow-500" : "bg-sky-600";
  const headerText = isDrum ? "text-yellow-950" : "text-white";
  const totals = rows.reduce(
    (acc, p) => {
      acc.pieces += p.pieces || 0;
      acc.finishedKg += p.finishedKg || 0;
      acc.scrapKg += p.scrapKg || 0;
      acc.daigKg += p.daigKg || 0;
      acc.materialCost += p.materialCost || 0;
      acc.overhead += p.overhead || 0;
      acc.totalCost += p.totalCost || 0;
      acc.unitsSold += p.unitsSoldPeriod || 0;
      acc.sellValue += p.sellValue || 0;
      acc.soldCogs += p.soldCogs || 0;
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
      unitsSold: 0,
      sellValue: 0,
      soldCogs: 0,
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
    totals.unitsSold > 0 ? totals.sellValue / totals.unitsSold : null;

  // Sticky header cells (vertical) + first column (horizontal).
  const headClass = cn(
    "sticky top-0 z-20 h-10 px-2.5 text-[11px] font-bold tracking-wide uppercase",
    headerBg,
    headerText
  );
  const stickyHead = cn(
    headClass,
    "left-0 z-40 min-w-[11rem] max-w-[14rem] shadow-[4px_0_12px_-6px_rgba(0,0,0,0.45)]"
  );
  const numHead = cn(headClass, "text-right");
  const salesHead = cn(numHead, "border-l border-white/30");

  function rowTone(profit: number) {
    const loss = profit < 0;
    const fill = loss
      ? "bg-red-600 text-white hover:bg-red-600"
      : "bg-emerald-600 text-white hover:bg-emerald-600";
    const sticky = loss
      ? "bg-red-600 shadow-[4px_0_12px_-6px_rgba(0,0,0,0.35)]"
      : "bg-emerald-600 shadow-[4px_0_12px_-6px_rgba(0,0,0,0.35)]";
    return { fill, sticky, loss };
  }

  const numCell =
    "font-data px-2.5 py-2.5 text-right text-xs font-bold tabular-nums text-white";
  const salesCell = cn(numCell, "border-l border-white/25");

  const totalLoss = totals.profit < 0;
  const totalFill = totalLoss
    ? "bg-red-700 text-white hover:bg-red-700"
    : "bg-emerald-700 text-white hover:bg-emerald-700";
  const totalSticky = totalLoss ? "bg-red-700" : "bg-emerald-700";

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className={cn("sticky top-0 z-30 rounded-t-xl shadow-md", headerBg, headerText)}>
        <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <h2 className="text-nameplate text-base font-bold tracking-[0.12em] uppercase sm:text-lg">
            {title}
          </h2>
          <div className="font-data flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
            <p>
              {labels.overheadPerKg}:{" "}
              <span className="text-base font-bold">
                {avgOverheadPerKg != null ? formatMoney(avgOverheadPerKg) : "—"}
              </span>
            </p>
            <p>
              {labels.costPerKg}:{" "}
              <span className="text-base font-bold">
                {avgCostPerKg != null ? formatMoney(avgCostPerKg) : "—"}
              </span>
              <span className="ml-2 text-xs font-semibold opacity-90">
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
          <Table
            className="min-w-[1100px] border-separate border-spacing-0"
            containerClassName="max-h-[min(70vh,42rem)] overflow-auto"
          >
            <TableHeader>
              <TableRow className={cn("hover:bg-transparent border-0", headerBg)}>
                <TableHead className={stickyHead}>{labels.product}</TableHead>
                <TableHead className={numHead}>{labels.pieces}</TableHead>
                <TableHead className={numHead}>{labels.finishedKg}</TableHead>
                <TableHead className={numHead}>
                  {isDrum ? labels.daigKg : labels.scrapKg}
                </TableHead>
                <TableHead className={numHead}>{labels.materialCost}</TableHead>
                <TableHead className={numHead}>{labels.overhead}</TableHead>
                <TableHead className={numHead}>{labels.overheadPerKg}</TableHead>
                <TableHead className={numHead}>{labels.totalCost}</TableHead>
                <TableHead className={numHead}>{labels.costPerKg}</TableHead>
                <TableHead className={numHead}>{labels.costPerPiece}</TableHead>
                <TableHead className={salesHead}>{labels.unitsSold}</TableHead>
                <TableHead className={numHead}>{labels.sellPerPiece}</TableHead>
                <TableHead className={numHead}>{labels.soldPrice}</TableHead>
                <TableHead className={numHead}>{labels.soldCost}</TableHead>
                <TableHead className={numHead}>{labels.netProfit}</TableHead>
                <TableHead className={numHead}>{labels.margin}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const saleOnly = Boolean(p.saleOnly) || !(p.pieces > 0);
                const produced = !saleOnly;
                const tone = rowTone(p.profit || 0);
                return (
                  <TableRow key={p.productId} className={cn("border-0", tone.fill)}>
                    <TableCell
                      className={cn(
                        "sticky left-0 z-10 min-w-[11rem] max-w-[14rem] px-2.5 py-2.5",
                        tone.sticky
                      )}
                    >
                      <span className="block truncate text-sm font-bold text-white">
                        {p.name}
                      </span>
                      {saleOnly ? (
                        <span className="mt-0.5 block text-[10px] font-semibold leading-tight text-white">
                          {t("prodMargin.saleOnlyHint")}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className={numCell}>
                      {produced ? p.pieces : "—"}
                    </TableCell>
                    <TableCell className={numCell}>
                      {produced ? formatKg(p.finishedKg ?? 0) : "—"}
                    </TableCell>
                    <TableCell className={numCell}>
                      {produced
                        ? formatKg(isDrum ? p.daigKg : p.scrapKg)
                        : "—"}
                    </TableCell>
                    <TableCell className={numCell}>
                      {produced ? formatMoney(p.materialCost) : "—"}
                    </TableCell>
                    <TableCell className={numCell}>
                      {produced ? formatMoney(p.overhead) : "—"}
                    </TableCell>
                    <TableCell className={numCell}>
                      {produced && p.overheadPerKg != null
                        ? formatMoney(p.overheadPerKg)
                        : produced && p.finishedKg
                          ? formatMoney(p.overhead / p.finishedKg)
                          : "—"}
                    </TableCell>
                    <TableCell className={numCell}>
                      {produced ? formatMoney(p.totalCost) : "—"}
                    </TableCell>
                    <TableCell className={numCell}>
                      {produced && p.costPerKg != null
                        ? formatMoney(p.costPerKg)
                        : produced && p.finishedKg
                          ? formatMoney(p.totalCost / p.finishedKg)
                          : "—"}
                    </TableCell>
                    <TableCell className={numCell}>
                      {p.costPerPiece > 0 ? formatMoney(p.costPerPiece) : "—"}
                    </TableCell>
                    <TableCell className={salesCell}>
                      {p.unitsSoldPeriod ?? 0}
                    </TableCell>
                    <TableCell className={numCell}>
                      {(p.unitsSoldPeriod || 0) > 0
                        ? formatMoney(p.sellPricePerPiece)
                        : "—"}
                    </TableCell>
                    <TableCell className={numCell}>
                      {formatMoney(p.sellValue)}
                    </TableCell>
                    <TableCell className={numCell}>
                      {formatMoney(p.soldCogs ?? 0)}
                    </TableCell>
                    <TableCell className={cn(numCell, "font-bold")}>
                      {formatMoney(p.profit)}
                    </TableCell>
                    <TableCell className={cn(numCell, "font-bold")}>
                      {p.marginPct != null ? `${p.marginPct}%` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter className="bg-transparent">
              <TableRow className={cn("border-0 font-bold", totalFill)}>
                <TableCell
                  className={cn(
                    "sticky left-0 z-10 min-w-[11rem] max-w-[14rem] px-2.5 py-3 text-sm font-bold text-white shadow-[4px_0_12px_-6px_rgba(0,0,0,0.35)]",
                    totalSticky
                  )}
                >
                  {totalLabel}
                </TableCell>
                <TableCell className={numCell}>{totals.pieces}</TableCell>
                <TableCell className={numCell}>
                  {formatKg(totals.finishedKg)}
                </TableCell>
                <TableCell className={numCell}>
                  {formatKg(isDrum ? totals.daigKg : totals.scrapKg)}
                </TableCell>
                <TableCell className={numCell}>
                  {formatMoney(totals.materialCost)}
                </TableCell>
                <TableCell className={numCell}>
                  {formatMoney(totals.overhead)}
                </TableCell>
                <TableCell className={numCell}>
                  {avgOverheadPerKg != null ? formatMoney(avgOverheadPerKg) : "—"}
                </TableCell>
                <TableCell className={numCell}>
                  {formatMoney(totals.totalCost)}
                </TableCell>
                <TableCell className={numCell}>
                  {avgCostPerKg != null ? formatMoney(avgCostPerKg) : "—"}
                </TableCell>
                <TableCell className={numCell}>
                  {formatMoney(avgCostPerPiece)}
                </TableCell>
                <TableCell className={salesCell}>{totals.unitsSold}</TableCell>
                <TableCell className={numCell}>
                  {avgSellPerPiece != null ? formatMoney(avgSellPerPiece) : "—"}
                </TableCell>
                <TableCell className={numCell}>
                  {formatMoney(totals.sellValue)}
                </TableCell>
                <TableCell className={numCell}>
                  {formatMoney(totals.soldCogs)}
                </TableCell>
                <TableCell className={cn(numCell, "font-bold")}>
                  {formatMoney(totals.profit)}
                </TableCell>
                <TableCell className={cn(numCell, "font-bold")}>
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
  const [partyMargin, setPartyMargin] = useState<PartySalesMarginReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const [data, party] = await Promise.all([
        getProductionMargin({ dateFrom, dateTo }),
        getPartySalesMargin({ dateFrom, dateTo }),
      ]);
      setReport(data);
      setPartyMargin(party);
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
  const partyTotals = partyMargin?.totals;
  const isProfit = (partyTotals?.profit ?? summary?.profit ?? 0) >= 0;

  function avgSalePerKg(sale: number, kg: number) {
    if (!kg || kg <= 0) return null;
    return Math.round((sale / kg) * 100) / 100;
  }

  const salePerKg = {
    hub: partyTotals ? avgSalePerKg(partyTotals.hubSale, partyTotals.hubKg) : null,
    drum: partyTotals ? avgSalePerKg(partyTotals.drumSale, partyTotals.drumKg) : null,
    ikHub: partyTotals
      ? avgSalePerKg(partyTotals.direct.hubSale, partyTotals.direct.hubKg)
      : null,
    ikDrum: partyTotals
      ? avgSalePerKg(partyTotals.direct.drumSale, partyTotals.direct.drumKg)
      : null,
    peHub: partyTotals
      ? avgSalePerKg(partyTotals.salesman.hubSale, partyTotals.salesman.hubKg)
      : null,
    peDrum: partyTotals
      ? avgSalePerKg(partyTotals.salesman.drumSale, partyTotals.salesman.drumKg)
      : null,
  };

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
    unitsSold: t("prodMargin.unitsSold"),
    sellPerPiece: t("prodMargin.sellPerPiece"),
    soldPrice: t("prodMargin.soldTotal"),
    soldCost: t("prodMargin.soldCost"),
    netProfit: t("prodMargin.netProfit"),
    margin: t("prodMargin.margin"),
  };

  return (
    <div className="flex flex-col gap-6">
      <FinanceSubnav />

      <DateRangeFilter />

      {loading || !report || !summary || !partyTotals ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {(() => {
            type StatCard = {
              label: string;
              value: string;
              valueAddon?: string;
              hint?: string;
              hints?: string[];
              money?: string;
              accent: string;
              fill?: "hub" | "drum";
              boldLabel?: boolean;
              tone?: "profit" | "loss";
            };

            function renderStatCards(stats: StatCard[]) {
              return (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {stats.map((stat) => {
                    const isDrumFill = stat.fill === "drum";
                    const cardFill =
                      stat.fill === "hub"
                        ? "border-sky-700/40 bg-sky-600 text-white"
                        : isDrumFill
                          ? "border-yellow-600/40 bg-yellow-500 text-yellow-950"
                          : stat.tone === "profit"
                            ? "border-emerald-600/40 bg-emerald-600 text-white"
                            : stat.tone === "loss"
                              ? "border-red-600/40 bg-red-600 text-white"
                              : "";
                    const onFill = Boolean(cardFill);
                    const fillText = isDrumFill ? "text-yellow-950" : "text-white";
                    const fillMuted = isDrumFill ? "text-yellow-950/80" : "text-white/90";
                    return (
                      <Card
                        key={stat.label}
                        className={cn("relative overflow-hidden py-0", cardFill)}
                      >
                        {!cardFill ? (
                          <span
                            className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`}
                            aria-hidden
                          />
                        ) : null}
                        <CardContent className="p-5">
                          <p
                            className={cn(
                              "font-data text-[10px] tracking-[0.15em] uppercase",
                              onFill
                                ? cn("text-sm font-bold tracking-[0.18em]", fillText)
                                : "text-muted-foreground",
                              !onFill &&
                                stat.boldLabel &&
                                "text-sm font-bold tracking-[0.2em]"
                            )}
                          >
                            {stat.label}
                          </p>
                          <p
                            className={cn(
                              "font-data mt-2 text-2xl",
                              onFill ? cn("font-bold", fillText) : "font-medium"
                            )}
                          >
                            {stat.value}
                            {stat.valueAddon ? (
                              <span
                                className={cn(
                                  "ml-2 align-middle text-sm font-semibold tabular-nums",
                                  onFill ? fillMuted : "text-muted-foreground"
                                )}
                              >
                                {stat.valueAddon}
                              </span>
                            ) : null}
                          </p>
                          {(stat.hints?.length ? stat.hints : stat.hint ? [stat.hint] : []).map(
                            (line) => (
                              <p
                                key={line}
                                className={cn(
                                  "mt-1 text-xs",
                                  onFill
                                    ? cn("font-semibold", fillMuted)
                                    : "text-muted-foreground"
                                )}
                              >
                                {line}
                              </p>
                            )
                          )}
                          {stat.money ? (
                            <p
                              className={cn(
                                "font-data mt-0.5 text-sm tabular-nums",
                                onFill ? cn("font-bold", fillText) : "font-medium"
                              )}
                            >
                              {stat.money}
                            </p>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              );
            }

            const overviewStats: StatCard[] = [
              {
                label: t("prodMargin.pieces"),
                value: String(summary.pieces),
                hints: [
                  `${t("prodMargin.hubLine")} ${report.byFamily.hub.pieces}`,
                  `${t("prodMargin.drumLine")} ${report.byFamily.drum.pieces}`,
                ],
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
                value: formatMoney(
                  report.purchasedVsUsed?.used.totalAmount ?? summary.materialCost
                ),
                hint: `${formatKg(report.purchasedVsUsed?.used.totalKg ?? summary.scrapKg + summary.daigKg)} · ${t("prodMargin.usedHint")}`,
                accent: "bg-chart-5",
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
                accent: "bg-chart-4",
              },
              {
                label: t("prodMargin.electricityCharges"),
                value: formatMoney(summary.overheadPools?.electricity ?? 0),
                hint: t("prodMargin.electricityPeriodHint"),
                accent: "bg-chart-2",
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
                label: t("partyMargin.hubProfit"),
                value: formatMoney(partyTotals.hubProfit),
                hint:
                  partyTotals.hubProfitPerKg != null
                    ? formatMoney(partyTotals.hubProfitPerKg)
                    : "—",
                accent: partyTotals.hubProfit < 0 ? "bg-destructive" : "bg-chart-3",
                boldLabel: true,
                tone: partyTotals.hubProfit < 0 ? "loss" : "profit",
              },
              {
                label: t("partyMargin.drumProfit"),
                value: formatMoney(partyTotals.drumProfit),
                hint:
                  partyTotals.drumProfitPerKg != null
                    ? formatMoney(partyTotals.drumProfitPerKg)
                    : "—",
                accent: partyTotals.drumProfit < 0 ? "bg-destructive" : "bg-chart-3",
                boldLabel: true,
                tone: partyTotals.drumProfit < 0 ? "loss" : "profit",
              },
              {
                label: isProfit ? t("partyMargin.totalProfit") : t("partyMargin.totalLoss"),
                value: formatMoney(partyTotals.profit),
                hint:
                  partyTotals.profitPerKg != null
                    ? formatMoney(partyTotals.profitPerKg)
                    : "—",
                accent: isProfit ? "bg-chart-3" : "bg-destructive",
                boldLabel: true,
                tone: isProfit ? "profit" : "loss",
              },
            ];

            const peSalesAddonPerKg =
              report.channelManufacture?.powerEngineering.salesmanAddOnPerKg;
            const peSalesAddon =
              peSalesAddonPerKg != null && peSalesAddonPerKg > 0
                ? `+ ${formatMoney(peSalesAddonPerKg)}`
                : undefined;

            const hubSplit = splitCastingKhrad(
              report.channelManufacture?.ikEngineering.hub,
              "hub"
            );
            const drumSplit = splitCastingKhrad(
              report.channelManufacture?.ikEngineering.drum,
              "drum"
            );

            const hubStats: StatCard[] = [
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
                fill: "hub",
              },
              {
                label: t("prodMargin.ikHubSaleKg"),
                value: salePerKg.ikHub != null ? formatMoney(salePerKg.ikHub) : "—",
                hint: `${formatKg(partyTotals.direct.hubKg)} · ${t("prodMargin.channelIk")}`,
                accent: "bg-sky-500",
                fill: "hub",
              },
              {
                label: t("prodMargin.peHubCostKg"),
                value:
                  report.channelManufacture?.powerEngineering.hub.totalPerKg != null
                    ? formatMoney(report.channelManufacture.powerEngineering.hub.totalPerKg)
                    : "—",
                valueAddon: peSalesAddon,
                hint: t("prodMargin.peCostHint"),
                accent: "bg-sky-700",
                fill: "hub",
              },
              {
                label: t("prodMargin.peHubSaleKg"),
                value: salePerKg.peHub != null ? formatMoney(salePerKg.peHub) : "—",
                hint: `${formatKg(partyTotals.salesman.hubKg)} · ${t("prodMargin.channelPower")}`,
                accent: "bg-sky-700",
                fill: "hub",
              },
              {
                label: t("prodMargin.castingCostKg"),
                value:
                  hubSplit.castingPerKg != null ? formatMoney(hubSplit.castingPerKg) : "—",
                hint: t("prodMargin.castingCostHint"),
                accent: "bg-sky-500",
                fill: "hub",
              },
              {
                label: t("prodMargin.khradCostKg"),
                value: hubSplit.khradPerKg != null ? formatMoney(hubSplit.khradPerKg) : "—",
                hint: t("prodMargin.khradCostHint"),
                accent: "bg-sky-500",
                fill: "hub",
              },
              {
                label: t("prodMargin.hubSaleKg"),
                value: salePerKg.hub != null ? formatMoney(salePerKg.hub) : "—",
                hint: `${formatKg(partyTotals.hubKg)} · ${t("prodMargin.saleKgHint")}`,
                accent: "bg-sky-600",
                fill: "hub",
              },
            ];

            const drumStats: StatCard[] = [
              {
                label: t("prodMargin.ikDrumCostKg"),
                value:
                  report.channelManufacture?.ikEngineering.drum.totalPerKg != null
                    ? formatMoney(report.channelManufacture.ikEngineering.drum.totalPerKg)
                    : summary.drumCostPerKg != null
                      ? formatMoney(summary.drumCostPerKg)
                      : "—",
                hint: `${formatKg(summary.drumFinishedKg ?? 0)} · ${t("prodMargin.ikCostHint")}`,
                accent: "bg-yellow-500",
                fill: "drum",
              },
              {
                label: t("prodMargin.ikDrumSaleKg"),
                value: salePerKg.ikDrum != null ? formatMoney(salePerKg.ikDrum) : "—",
                hint: `${formatKg(partyTotals.direct.drumKg)} · ${t("prodMargin.channelIk")}`,
                accent: "bg-yellow-500",
                fill: "drum",
              },
              {
                label: t("prodMargin.peDrumCostKg"),
                value:
                  report.channelManufacture?.powerEngineering.drum.totalPerKg != null
                    ? formatMoney(report.channelManufacture.powerEngineering.drum.totalPerKg)
                    : "—",
                valueAddon: peSalesAddon,
                hint: t("prodMargin.peCostHint"),
                accent: "bg-yellow-600",
                fill: "drum",
              },
              {
                label: t("prodMargin.peDrumSaleKg"),
                value: salePerKg.peDrum != null ? formatMoney(salePerKg.peDrum) : "—",
                hint: `${formatKg(partyTotals.salesman.drumKg)} · ${t("prodMargin.channelPower")}`,
                accent: "bg-yellow-600",
                fill: "drum",
              },
              {
                label: t("prodMargin.castingCostKg"),
                value:
                  drumSplit.castingPerKg != null ? formatMoney(drumSplit.castingPerKg) : "—",
                hint: t("prodMargin.drumCastingCostHint"),
                accent: "bg-yellow-500",
                fill: "drum",
              },
              {
                label: t("prodMargin.khradCostKg"),
                value:
                  drumSplit.khradPerKg != null ? formatMoney(drumSplit.khradPerKg) : "—",
                hint: t("prodMargin.khradCostHint"),
                accent: "bg-yellow-500",
                fill: "drum",
              },
              {
                label: t("prodMargin.drumSaleKg"),
                value: salePerKg.drum != null ? formatMoney(salePerKg.drum) : "—",
                hint: `${formatKg(partyTotals.drumKg)} · ${t("prodMargin.saleKgHint")}`,
                accent: "bg-yellow-500",
                fill: "drum",
              },
            ];

            return (
              <div className="flex flex-col gap-6">
                {renderStatCards(overviewStats)}

                <div className="flex flex-col gap-3">
                  <h2 className="text-nameplate text-sm font-bold text-sky-700 dark:text-sky-400">
                    {t("prodMargin.hub")}
                  </h2>
                  {renderStatCards(hubStats)}
                </div>

                <div className="flex flex-col gap-3">
                  <h2 className="text-nameplate text-sm font-bold text-yellow-600 dark:text-yellow-400">
                    {t("prodMargin.drum")}
                  </h2>
                  {renderStatCards(drumStats)}
                </div>
              </div>
            );
          })()}

          {report.channelManufacture ? (
            <div className="flex flex-col gap-3">
              <h2 className="text-nameplate text-sm">{t("prodMargin.channelMfgTitle")}</h2>
              {(() => {
                const factory = report.channelManufacture.ikEngineering;
                const power = report.channelManufacture.powerEngineering;
                const families = [
                  { fam: "hub" as const, label: t("prodMargin.hubLine") },
                  { fam: "drum" as const, label: t("prodMargin.drumLine") },
                ];
                const moneyOrDash = (value: number | null | undefined) =>
                  value != null ? formatMoney(value) : "—";

                return (
                  <>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-nameplate text-sm">
                          {t("prodMargin.factoryCostKg")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-4 sm:grid-cols-2">
                        {families.map((col) => {
                          const line = factory[col.fam];
                          const split = splitCastingKhrad(line, col.fam);
                          const isDrum = col.fam === "drum";
                          const panelFill = isDrum
                            ? "border-yellow-600/40 bg-yellow-500 text-yellow-950"
                            : "border-sky-700/40 bg-sky-600 text-white";
                          const muted = isDrum
                            ? "font-medium text-yellow-950/85"
                            : "font-medium text-white/90";
                          const value = isDrum
                            ? "font-semibold text-yellow-950"
                            : "font-semibold text-white";
                          const rule = isDrum ? "border-yellow-950/35" : "border-white/35";
                          const sectionTitle = isDrum
                            ? "font-extrabold text-yellow-950"
                            : "font-extrabold text-white";
                          const sectionTotal = isDrum
                            ? "bg-yellow-950/15 text-yellow-950"
                            : "bg-white/15 text-white";
                          const grandTotal = isDrum
                            ? "bg-yellow-950/25 text-yellow-950"
                            : "bg-white/25 text-white";

                          const renderSplitSection = (
                            title: string,
                            rows: typeof split.castingLines,
                            total: number | null
                          ) => (
                            <div className="flex flex-col gap-1.5">
                              <p
                                className={cn(
                                  "font-data mt-1 text-xs tracking-[0.14em] uppercase",
                                  sectionTitle
                                )}
                              >
                                {title}
                              </p>
                              {rows.length > 0 ? (
                                rows.map((row) => (
                                  <div
                                    key={row.id}
                                    className="flex justify-between gap-2 pl-2 text-sm"
                                  >
                                    <span className={muted}>
                                      {row.kind === "material"
                                        ? t("prodMargin.rawMaterialKg")
                                        : row.halfShare
                                          ? `${row.label} (${t("prodMargin.halfShare")})`
                                          : row.label}
                                    </span>
                                    <span className={cn("font-data", value)}>
                                      {formatMoney(row.perKg)}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="flex justify-between gap-2 pl-2 text-sm">
                                  <span className={muted}>—</span>
                                  <span className={cn("font-data", value)}>—</span>
                                </div>
                              )}
                              <div
                                className={cn(
                                  "mt-0.5 flex justify-between gap-2 rounded-sm border-t px-1.5 py-1.5 text-sm font-extrabold",
                                  rule,
                                  sectionTotal
                                )}
                              >
                                <span className="uppercase tracking-wide">{title}</span>
                                <span className="font-data text-base tabular-nums">
                                  {moneyOrDash(total)}
                                </span>
                              </div>
                            </div>
                          );

                          return (
                            <div
                              key={col.fam}
                              className={cn("rounded-md border p-3 text-sm", panelFill)}
                            >
                              <p
                                className={cn(
                                  "font-data mb-2 text-[11px] tracking-[0.14em] uppercase",
                                  sectionTitle
                                )}
                              >
                                {col.label}
                              </p>
                              <div className="flex flex-col gap-3">
                                {renderSplitSection(
                                  t("prodMargin.castingCost"),
                                  split.castingLines,
                                  split.castingPerKg
                                )}
                                {renderSplitSection(
                                  t("prodMargin.khradCost"),
                                  split.khradLines,
                                  split.khradPerKg
                                )}
                                <div
                                  className={cn(
                                    "mt-1 flex justify-between gap-2 rounded-sm border-t-2 px-1.5 py-2 text-sm font-extrabold",
                                    rule,
                                    grandTotal
                                  )}
                                >
                                  <span className="uppercase tracking-wide">
                                    {t("prodMargin.totalMfgKg")}
                                  </span>
                                  <span className="font-data text-lg tabular-nums">
                                    {moneyOrDash(line.totalPerKg)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-md border border-sky-500/40 bg-muted/20 p-3 text-sm">
                        <p className="text-nameplate text-sm">{t("prodMargin.channelIkMfg")}</p>
                        <div className="mt-2 flex flex-col gap-1.5">
                          {families.map((col) => {
                            const totalPerKg = factory[col.fam].totalPerKg;
                            return (
                              <div key={col.fam} className="flex justify-between gap-2">
                                <span className="text-muted-foreground">{col.label}</span>
                                <span className="font-data">
                                  {totalPerKg != null
                                    ? `${formatMoney(totalPerKg)} / kg`
                                    : "—"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-md border bg-muted/20 p-3 text-sm">
                        <p className="text-nameplate text-sm">{t("prodMargin.salesmanAddOnKg")}</p>
                        <p className="font-data mt-2 text-lg">
                          {formatMoney(power.salesmanAddOnPerKg)}
                        </p>
                        {power.salesmanLoad > 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatMoney(power.salesmanLoad)}
                            {power.salesmanSoldKg
                              ? ` · ${formatKg(power.salesmanSoldKg)}`
                              : ""}
                          </p>
                        ) : null}
                      </div>

                      <div className="rounded-md border border-yellow-500/40 bg-muted/20 p-3 text-sm">
                        <p className="text-nameplate text-sm">{t("prodMargin.channelPowerMfg")}</p>
                        <div className="mt-2 flex flex-col gap-1.5">
                          {families.map((col) => {
                            const totalPerKg = power[col.fam].totalPerKg;
                            return (
                              <div key={col.fam} className="flex justify-between gap-2">
                                <span className="text-muted-foreground">{col.label}</span>
                                <span className="font-data">
                                  {totalPerKg != null
                                    ? `${formatMoney(totalPerKg)} / kg`
                                    : "—"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : null}

          <ChargesCalculator dateFrom={dateFrom} dateTo={dateTo} />

          <div className="grid gap-4 lg:grid-cols-2">
            <FamilyCard
              title={t("prodMargin.hubSummary")}
              data={report.byFamily.hub}
              labels={familyLabels}
              variant="hub"
            />
            <FamilyCard
              title={t("prodMargin.drumSummary")}
              data={report.byFamily.drum}
              labels={familyLabels}
              variant="drum"
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
                      <TableHead className="text-right">{t("prodMargin.amountPerKg")}</TableHead>
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
                        <TableCell className="font-data text-right text-xs font-semibold">
                          {formatMoney(row.amount)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs font-bold">
                          {row.amountPerKg != null ? formatMoney(row.amountPerKg) : "—"}
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
