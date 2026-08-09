"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { DateRangeFilter } from "@/components/date-range-filter";
import { apiError, formatDate, formatKg, formatMoney } from "@/lib/materials-api";
import {
  getPartySalesMargin,
  type PartySalesMarginGroup,
  type PartySalesMarginParty,
  type PartySalesMarginReport,
} from "@/lib/finance-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { channelColors } from "@/lib/channel-colors";
import { cn } from "@/lib/utils";

const headCell =
  "sticky top-0 z-20 h-10 bg-slate-800 px-2.5 text-[11px] font-bold tracking-wide text-white uppercase whitespace-nowrap border-b-0 shadow-sm dark:bg-slate-900";

const stickyPartyHead = cn(
  headCell,
  "left-0 z-40 w-44 min-w-44 max-w-44 shadow-[4px_0_12px_-6px_rgba(0,0,0,0.45)]"
);

const stickyGroupHead = (withParty: boolean) =>
  cn(
    headCell,
    "z-30 w-40 min-w-40 max-w-40 overflow-hidden shadow-[4px_0_12px_-6px_rgba(0,0,0,0.35)]",
    withParty ? "left-44" : "left-0 z-40"
  );

type PlTone = "loss" | "mixed" | "profit";

function plTone(row: { profit: number; hubProfit: number; drumProfit: number }): PlTone {
  if (row.profit < 0) return "loss";
  if (row.hubProfit < 0 || row.drumProfit < 0) return "mixed";
  return "profit";
}

const plToneBg = (tone: PlTone, deep = false) => {
  if (tone === "loss") return deep ? "bg-red-700" : "bg-red-600";
  if (tone === "mixed") return deep ? "bg-amber-600" : "bg-amber-500";
  return deep ? "bg-emerald-700" : "bg-emerald-600";
};

const plRowClass = (tone: PlTone, deep = false) => {
  if (tone === "loss") {
    return deep
      ? "bg-red-700 text-white hover:bg-red-700"
      : "bg-red-600 text-white hover:bg-red-600";
  }
  if (tone === "mixed") {
    return deep
      ? "bg-amber-600 text-white hover:bg-amber-600"
      : "bg-amber-500 text-white hover:bg-amber-500";
  }
  return deep
    ? "bg-emerald-700 text-white hover:bg-emerald-700"
    : "bg-emerald-600 text-white hover:bg-emerald-600";
};

const stickyPartyCell = (tone: PlTone, deep = false) =>
  cn(
    "sticky left-0 z-20 w-44 min-w-44 max-w-44 truncate font-bold text-white shadow-[4px_0_12px_-6px_rgba(0,0,0,0.35)]",
    plToneBg(tone, deep)
  );

const stickyGroupCell = (withParty: boolean, tone: PlTone, deep = false) =>
  cn(
    "sticky z-10 w-40 min-w-40 max-w-40 overflow-hidden font-bold text-white shadow-[4px_0_12px_-6px_rgba(0,0,0,0.3)]",
    withParty ? "left-44" : "left-0",
    plToneBg(tone, deep)
  );

const numCell = "font-data px-2.5 py-2.5 text-right text-xs font-bold tabular-nums text-white";

function moneyOrDash(n: number | null | undefined) {
  return n == null ? "—" : formatMoney(n);
}

function roundMoneyLocal(n: number) {
  return Math.round((n || 0) * 100) / 100;
}

function perKg(amount: number, kg: number) {
  return kg > 0 ? roundMoneyLocal(amount / kg) : null;
}

function meanNullable(values: Array<number | null | undefined>) {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return roundMoneyLocal(nums.reduce((s, v) => s + v, 0) / nums.length);
}

function emptyGroupTotals(
  label: string,
  salesmanChannel: boolean
): PartySalesMarginParty & { partyCount?: number } {
  return {
    partyId: "",
    partyName: "",
    groupId: null,
    groupName: label,
    salesmanChannel,
    hubQty: 0,
    drumQty: 0,
    totalQty: 0,
    hubKg: 0,
    drumKg: 0,
    totalKg: 0,
    hubSale: 0,
    drumSale: 0,
    totalSale: 0,
    hubSalePerKg: null,
    drumSalePerKg: null,
    avgSalePerKg: null,
    hubMfgPerKg: null,
    drumMfgPerKg: null,
    avgMfgPerKg: null,
    hubMfg: 0,
    drumMfg: 0,
    totalMfg: 0,
    hubProfit: 0,
    drumProfit: 0,
    profit: 0,
    hubProfitPerKg: null,
    drumProfitPerKg: null,
    profitPerKg: null,
    partyCount: 0,
  };
}

function sumChannelGroups(
  groups: PartySalesMarginGroup[],
  label: string
): PartySalesMarginParty & { partyCount?: number } {
  const salesmanChannel = groups[0]?.salesmanChannel ?? false;
  const row = emptyGroupTotals(label, salesmanChannel);
  for (const g of groups) {
    row.hubQty += g.hubQty || 0;
    row.drumQty += g.drumQty || 0;
    row.totalQty += g.totalQty || 0;
    row.hubKg += g.hubKg || 0;
    row.drumKg += g.drumKg || 0;
    row.totalKg += g.totalKg || 0;
    row.hubSale += g.hubSale || 0;
    row.drumSale += g.drumSale || 0;
    row.totalSale += g.totalSale || 0;
    row.hubMfg += g.hubMfg || 0;
    row.drumMfg += g.drumMfg || 0;
    row.totalMfg += g.totalMfg || 0;
    row.hubProfit += g.hubProfit || 0;
    row.drumProfit += g.drumProfit || 0;
    row.profit += g.profit || 0;
    row.partyCount = (row.partyCount || 0) + (g.partyCount || 0);
  }
  row.hubSalePerKg = perKg(row.hubSale, row.hubKg);
  row.drumSalePerKg = perKg(row.drumSale, row.drumKg);
  row.avgSalePerKg = perKg(row.totalSale, row.totalKg);
  row.hubMfgPerKg = meanNullable(groups.map((g) => g.hubMfgPerKg));
  row.drumMfgPerKg = meanNullable(groups.map((g) => g.drumMfgPerKg));
  row.avgMfgPerKg = perKg(row.totalMfg, row.totalKg);
  row.hubProfitPerKg = perKg(row.hubProfit, row.hubKg);
  row.drumProfitPerKg = perKg(row.drumProfit, row.drumKg);
  row.profitPerKg = perKg(row.profit, row.totalKg);
  return row;
}

function PlCell({
  value,
  perKg: perKgValue,
  solid,
}: {
  value: number;
  perKg?: number | null;
  solid?: boolean;
}) {
  const loss = value < 0;
  return (
    <>
      <TableCell
        className={cn(
          numCell,
          !solid && (loss ? "text-destructive" : "text-chart-3")
        )}
      >
        {formatMoney(value)}
      </TableCell>
      {perKgValue !== undefined ? (
        <TableCell
          className={cn(
            numCell,
            solid ? "text-white" : loss ? "text-destructive" : "text-chart-3"
          )}
        >
          {moneyOrDash(perKgValue)}
        </TableCell>
      ) : null}
    </>
  );
}

function RowCells({
  row,
  showParty,
  deep,
}: {
  row: PartySalesMarginParty & { partyCount?: number };
  showParty: boolean;
  deep?: boolean;
}) {
  const tone = plTone(row);
  return (
    <>
      {showParty ? (
        <TableCell className={stickyPartyCell(tone, deep)}>{row.partyName}</TableCell>
      ) : null}
      <TableCell className={stickyGroupCell(showParty, tone, deep)}>
        <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden">
          <span className="min-w-0 truncate font-bold" title={row.groupName}>
            {row.groupName}
          </span>
          <Badge
            variant="secondary"
            className={cn(
              "font-data shrink-0 border text-[9px] font-bold",
              row.salesmanChannel ? channelColors.power.badge : channelColors.ik.badge
            )}
          >
            {row.salesmanChannel ? "PE" : "IK"}
          </Badge>
          {row.partyCount != null ? (
            <span className="shrink-0 text-xs font-semibold text-white">· {row.partyCount}</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className={numCell}>{row.hubQty ?? 0}</TableCell>
      <TableCell className={numCell}>{row.drumQty ?? 0}</TableCell>
      <TableCell className={numCell}>{row.totalQty ?? 0}</TableCell>
      <TableCell className={numCell}>{formatKg(row.hubKg)}</TableCell>
      <TableCell className={numCell}>{formatKg(row.drumKg)}</TableCell>
      <TableCell className={numCell}>{formatKg(row.totalKg)}</TableCell>
      <TableCell className={numCell}>{formatMoney(row.hubSale)}</TableCell>
      <TableCell className={numCell}>{formatMoney(row.drumSale)}</TableCell>
      <TableCell className={numCell}>{formatMoney(row.totalSale)}</TableCell>
      <TableCell className={numCell}>{moneyOrDash(row.hubSalePerKg)}</TableCell>
      <TableCell className={numCell}>{moneyOrDash(row.drumSalePerKg)}</TableCell>
      <TableCell className={numCell}>{moneyOrDash(row.avgSalePerKg)}</TableCell>
      <TableCell className={numCell}>{moneyOrDash(row.hubMfgPerKg)}</TableCell>
      <TableCell className={numCell}>{moneyOrDash(row.drumMfgPerKg)}</TableCell>
      <TableCell className={numCell}>{moneyOrDash(row.avgMfgPerKg)}</TableCell>
      <TableCell className={numCell}>{formatMoney(row.hubMfg)}</TableCell>
      <TableCell className={numCell}>{formatMoney(row.drumMfg)}</TableCell>
      <TableCell className={numCell}>{formatMoney(row.totalMfg)}</TableCell>
      <PlCell value={row.hubProfit} perKg={row.hubProfitPerKg} solid />
      <PlCell value={row.drumProfit} perKg={row.drumProfitPerKg} solid />
      <PlCell value={row.profit} perKg={row.profitPerKg} solid />
    </>
  );
}

function MarginTableHeads({ showParty }: { showParty: boolean }) {
  const { t } = useI18n();
  const right = cn(headCell, "text-right");
  return (
    <TableRow className="hover:bg-transparent border-0">
      {showParty ? (
        <TableHead className={stickyPartyHead}>{t("partyMargin.party")}</TableHead>
      ) : null}
      <TableHead className={stickyGroupHead(showParty)}>{t("partyMargin.group")}</TableHead>
      <TableHead className={right}>{t("partyMargin.hubQty")}</TableHead>
      <TableHead className={right}>{t("partyMargin.drumQty")}</TableHead>
      <TableHead className={right}>{t("partyMargin.totalQty")}</TableHead>
      <TableHead className={right}>{t("partyMargin.hubKg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.drumKg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.totalKg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.hubSale")}</TableHead>
      <TableHead className={right}>{t("partyMargin.drumSale")}</TableHead>
      <TableHead className={right}>{t("partyMargin.totalSale")}</TableHead>
      <TableHead className={right}>{t("partyMargin.hubSaleKg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.drumSaleKg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.avgSaleKg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.hubMfgKg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.drumMfgKg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.avgMfgKg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.hubMfg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.drumMfg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.totalMfg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.hubProfit")}</TableHead>
      <TableHead className={right}>{t("partyMargin.hubProfitKg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.drumProfit")}</TableHead>
      <TableHead className={right}>{t("partyMargin.drumProfitKg")}</TableHead>
      <TableHead className={right}>{t("partyMargin.profit")}</TableHead>
      <TableHead className={right}>{t("partyMargin.profitKg")}</TableHead>
    </TableRow>
  );
}

export default function PartySalesMarginPage() {
  const { t } = useI18n();
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();
  const [report, setReport] = useState<PartySalesMarginReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<"all" | "salesman" | "direct">("all");

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      setReport(await getPartySalesMargin({ dateFrom, dateTo }));
    } catch (err) {
      toast.error(apiError(err, t("partyMargin.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, hydrated, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  const parties = useMemo(() => {
    let list = report?.parties || [];
    if (channel === "salesman") list = list.filter((p) => p.salesmanChannel);
    if (channel === "direct") list = list.filter((p) => !p.salesmanChannel);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.partyName.toLowerCase().includes(q) ||
          p.groupName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [report, channel, search]);

  const powerGroups = useMemo(
    () => (report?.groups || []).filter((g) => g.salesmanChannel),
    [report]
  );
  const ikGroups = useMemo(
    () => (report?.groups || []).filter((g) => !g.salesmanChannel),
    [report]
  );

  const powerAll = useMemo(
    () => (powerGroups.length ? sumChannelGroups(powerGroups, t("partyMargin.channelAllShort")) : null),
    [powerGroups, t]
  );
  const ikMerged = useMemo(
    () =>
      ikGroups.length
        ? sumChannelGroups(ikGroups, t("partyMargin.direct"))
        : null,
    [ikGroups, t]
  );

  const filteredTotals = useMemo(() => {
    return parties.reduce(
      (acc, p) => {
        acc.hubQty += p.hubQty || 0;
        acc.drumQty += p.drumQty || 0;
        acc.totalQty += p.totalQty || 0;
        acc.hubKg += p.hubKg;
        acc.drumKg += p.drumKg;
        acc.totalKg += p.totalKg;
        acc.hubSale += p.hubSale;
        acc.drumSale += p.drumSale;
        acc.totalSale += p.totalSale;
        acc.hubMfg += p.hubMfg;
        acc.drumMfg += p.drumMfg;
        acc.totalMfg += p.totalMfg;
        acc.hubProfit += p.hubProfit;
        acc.drumProfit += p.drumProfit;
        acc.profit += p.profit;
        return acc;
      },
      {
        hubQty: 0,
        drumQty: 0,
        totalQty: 0,
        hubKg: 0,
        drumKg: 0,
        totalKg: 0,
        hubSale: 0,
        drumSale: 0,
        totalSale: 0,
        hubMfg: 0,
        drumMfg: 0,
        totalMfg: 0,
        hubProfit: 0,
        drumProfit: 0,
        profit: 0,
      }
    );
  }, [parties]);

  const rates = report?.rates;
  const totals = report?.totals;
  const isProfit = (totals?.profit ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-6">
      <FinanceSubnav />

      <DateRangeFilter />

      {loading || !report || !rates || !totals ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                {
                  label: t("partyMargin.factoryHub"),
                  value: moneyOrDash(rates.hubFactoryCostPerKg),
                  fill: "hub" as const,
                },
                {
                  label: t("partyMargin.factoryDrum"),
                  value: moneyOrDash(rates.drumFactoryCostPerKg),
                  fill: "drum" as const,
                },
                {
                  label: t("partyMargin.salesmanHub"),
                  value: moneyOrDash(rates.hubMfgSalesman),
                  fill: "power" as const,
                },
                {
                  label: t("partyMargin.salesmanDrum"),
                  value: moneyOrDash(rates.drumMfgSalesman),
                  fill: "power" as const,
                },
                {
                  label: t("partyMargin.salesmanLoad"),
                  value: formatMoney(rates.salesmanLoad),
                  hint: `${formatKg(rates.salesmanSoldKg)} · ${t("partyMargin.salesmanPerKg")} ${formatMoney(rates.salesmanPerSoldKg)}`,
                  fill: "power" as const,
                },
                {
                  label: t("partyMargin.elecHub"),
                  value: moneyOrDash(report.electricity.hubPerKg),
                  fill: "hub" as const,
                },
                {
                  label: t("partyMargin.elecDrum"),
                  value: moneyOrDash(report.electricity.drumPerKg),
                  fill: "drum" as const,
                },
                {
                  label: t("partyMargin.hubProfit"),
                  value: formatMoney(totals.hubProfit),
                  hint: moneyOrDash(totals.hubProfitPerKg),
                  accent: totals.hubProfit < 0 ? "text-destructive" : "text-chart-3",
                  boldLabel: true,
                },
                {
                  label: t("partyMargin.drumProfit"),
                  value: formatMoney(totals.drumProfit),
                  hint: moneyOrDash(totals.drumProfitPerKg),
                  accent: totals.drumProfit < 0 ? "text-destructive" : "text-chart-3",
                  boldLabel: true,
                },
                {
                  label: isProfit ? t("partyMargin.totalProfit") : t("partyMargin.totalLoss"),
                  value: formatMoney(totals.profit),
                  hint: moneyOrDash(totals.profitPerKg),
                  accent: isProfit ? "text-chart-3" : "text-destructive",
                  boldLabel: true,
                },
              ] as Array<{
                label: string;
                value: string;
                hint?: string;
                hints?: string[];
                fill?: "hub" | "drum" | "ik" | "power";
                accent?: string;
                boldLabel?: boolean;
              }>
            ).map((card) => {
              const isDrumFill = card.fill === "drum";
              const isPowerFill = card.fill === "power";
              const isIkFill = card.fill === "ik";
              const fillText = isDrumFill
                ? "text-yellow-950"
                : isIkFill
                  ? channelColors.ik.text
                  : isPowerFill
                    ? channelColors.power.text
                    : "text-white";
              const filled =
                card.accent?.includes("text-chart-3")
                  ? "border-emerald-600/40 bg-emerald-600 text-white"
                  : card.accent?.includes("text-destructive")
                    ? "border-red-600/40 bg-red-600 text-white"
                    : card.fill === "hub"
                      ? "border-sky-700/40 bg-sky-600 text-white"
                      : isDrumFill
                        ? "border-yellow-400/50 bg-yellow-300 text-yellow-950"
                        : isIkFill
                          ? channelColors.ik.fill
                          : isPowerFill
                            ? channelColors.power.fill
                            : "";
              const lines = card.hints?.length
                ? card.hints
                : card.hint
                  ? [card.hint]
                  : [];
              return (
              <Card
                key={card.label}
                className={cn("py-0", filled)}
              >
                <CardContent className="p-4">
                  <p
                    className={cn(
                      "font-data text-[10px] tracking-[0.12em] uppercase",
                      filled
                        ? cn("text-sm font-bold tracking-[0.18em]", fillText)
                        : "text-muted-foreground",
                      !filled &&
                        card.boldLabel &&
                        "text-sm font-bold tracking-[0.2em]"
                    )}
                  >
                    {card.label}
                  </p>
                  <p
                    className={cn(
                      "font-data mt-1 text-xl",
                      filled ? cn("font-bold", fillText) : card.accent
                    )}
                  >
                    {card.value}
                  </p>
                  {lines.map((line) => (
                    <p
                      key={line}
                      className={cn(
                        "mt-1 text-xs font-bold",
                        filled
                          ? isDrumFill
                            ? "text-yellow-950"
                            : isIkFill
                              ? channelColors.ik.text
                              : isPowerFill
                                ? channelColors.power.text
                                : "text-white"
                          : "text-muted-foreground"
                      )}
                    >
                      {line}
                    </p>
                  ))}
                </CardContent>
              </Card>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className={cn("border", channelColors.power.soft)}>
              <CardHeader className="pb-2">
                <CardTitle className={cn("text-nameplate text-sm", channelColors.power.heading)}>
                  {t("partyMargin.salesman")}
                </CardTitle>
                <CardDescription className={channelColors.power.softText}>
                  {(report.mainChannels?.powerEngineering.memberGroups.length
                    ? report.mainChannels.powerEngineering.memberGroups.join(", ")
                    : t("partyMargin.powerMembers")) +
                    ` · ${formatKg(totals.salesman.totalKg)} · ${moneyOrDash(totals.salesman.profitPerKg)}/kg`}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className={cn("text-xs", channelColors.power.softText)}>
                    {t("partyMargin.totalSale")}
                  </p>
                  <p className={cn("font-data text-lg font-semibold", channelColors.power.softText)}>
                    {formatMoney(totals.salesman.totalSale)}
                  </p>
                </div>
                <div>
                  <p className={cn("text-xs", channelColors.power.softText)}>
                    {t("partyMargin.totalMfg")}
                  </p>
                  <p className={cn("font-data text-lg font-semibold", channelColors.power.softText)}>
                    {formatMoney(totals.salesman.totalMfg)}
                  </p>
                </div>
                <div>
                  <p className={cn("text-xs", channelColors.power.softText)}>
                    {t("partyMargin.hubProfit")}
                  </p>
                  <p
                    className={cn(
                      "font-data text-lg font-semibold",
                      totals.salesman.hubProfit < 0
                        ? "text-destructive"
                        : channelColors.power.softText
                    )}
                  >
                    {formatMoney(totals.salesman.hubProfit)}
                  </p>
                </div>
                <div>
                  <p className={cn("text-xs", channelColors.power.softText)}>
                    {t("partyMargin.drumProfit")}
                  </p>
                  <p
                    className={cn(
                      "font-data text-lg font-semibold",
                      totals.salesman.drumProfit < 0
                        ? "text-destructive"
                        : channelColors.power.softText
                    )}
                  >
                    {formatMoney(totals.salesman.drumProfit)}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className={cn("text-xs", channelColors.power.softText)}>
                    {t("partyMargin.profit")}
                  </p>
                  <p
                    className={cn(
                      "font-data text-2xl font-bold",
                      totals.salesman.profit < 0
                        ? "text-destructive"
                        : channelColors.power.softText
                    )}
                  >
                    {formatMoney(totals.salesman.profit)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className={cn("border", channelColors.ik.soft)}>
              <CardHeader className="pb-2">
                <CardTitle className={cn("text-nameplate text-sm", channelColors.ik.heading)}>
                  {t("partyMargin.direct")}
                </CardTitle>
                <CardDescription className={channelColors.ik.softText}>
                  {(report.mainChannels?.ikEngineering.memberGroups.length
                    ? report.mainChannels.ikEngineering.memberGroups.join(", ")
                    : t("partyMargin.ikMembers")) +
                    ` · ${formatKg(totals.direct.totalKg)} · ${moneyOrDash(totals.direct.profitPerKg)}/kg`}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className={cn("text-xs", channelColors.ik.softText)}>
                    {t("partyMargin.totalSale")}
                  </p>
                  <p className={cn("font-data text-lg font-semibold", channelColors.ik.softText)}>
                    {formatMoney(totals.direct.totalSale)}
                  </p>
                </div>
                <div>
                  <p className={cn("text-xs", channelColors.ik.softText)}>
                    {t("partyMargin.totalMfg")}
                  </p>
                  <p className={cn("font-data text-lg font-semibold", channelColors.ik.softText)}>
                    {formatMoney(totals.direct.totalMfg)}
                  </p>
                </div>
                <div>
                  <p className={cn("text-xs", channelColors.ik.softText)}>
                    {t("partyMargin.hubProfit")}
                  </p>
                  <p
                    className={cn(
                      "font-data text-lg font-semibold",
                      totals.direct.hubProfit < 0 ? "text-destructive" : channelColors.ik.softText
                    )}
                  >
                    {formatMoney(totals.direct.hubProfit)}
                  </p>
                </div>
                <div>
                  <p className={cn("text-xs", channelColors.ik.softText)}>
                    {t("partyMargin.drumProfit")}
                  </p>
                  <p
                    className={cn(
                      "font-data text-lg font-semibold",
                      totals.direct.drumProfit < 0 ? "text-destructive" : channelColors.ik.softText
                    )}
                  >
                    {formatMoney(totals.direct.drumProfit)}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className={cn("text-xs", channelColors.ik.softText)}>
                    {t("partyMargin.profit")}
                  </p>
                  <p
                    className={cn(
                      "font-data text-2xl font-bold",
                      totals.direct.profit < 0 ? "text-destructive" : channelColors.ik.softText
                    )}
                  >
                    {formatMoney(totals.direct.profit)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">
                {t("partyMargin.channelExpenses")}
              </CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                {t("partyMargin.channelExpensesDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{t("partyMargin.tourTotal")}</p>
                  <p className="font-data text-lg">
                    {formatMoney(report.channelExpenses?.tourTotal || 0)}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    {t("partyMargin.salesmanPayTotal")}
                  </p>
                  <p className="font-data text-lg">
                    {formatMoney(report.channelExpenses?.salesmanPayTotal || 0)}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{t("partyMargin.salesmanLoad")}</p>
                  <p className="font-data text-lg">
                    {formatMoney(report.channelExpenses?.total || rates.salesmanLoad)}
                  </p>
                </div>
              </div>

              {(report.channelExpenses?.items.length || 0) === 0 ? (
                <p className="text-sm text-muted-foreground">{t("partyMargin.expenseEmpty")}</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("partyMargin.expenseDate")}</TableHead>
                        <TableHead>{t("partyMargin.channel")}</TableHead>
                        <TableHead>{t("partyMargin.pickSalesman")}</TableHead>
                        <TableHead>{t("partyMargin.expenseNote")}</TableHead>
                        <TableHead className="text-right">
                          {t("partyMargin.expenseAmount")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(report.channelExpenses?.items || []).map((e) => (
                        <TableRow key={e._id}>
                          <TableCell className="font-data text-xs">
                            {formatDate(e.expenseDate)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-data text-[10px]">
                              {e.category === "tour_expenses"
                                ? t("partyMargin.catTour")
                                : t("partyMargin.catSalesman")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {e.salesmanName || "—"}
                          </TableCell>
                          <TableCell className="max-w-[16rem] truncate text-sm text-muted-foreground">
                            {e.notes || e.title || "—"}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(e.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="px-4 pt-4 pb-2 sm:px-5">
              <CardTitle className="text-nameplate text-sm font-bold">
                {t("partyMargin.byGroup")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table
                className="min-w-[1100px] border-separate border-spacing-0"
                containerClassName="max-h-[min(70vh,40rem)] overflow-auto"
              >
                <TableHeader className="sticky top-0 z-40 [&_tr]:border-b-0">
                  <MarginTableHeads showParty={false} />
                </TableHeader>
                <TableBody>
                  {powerGroups.length > 0 ? (
                    <>
                      <TableRow className="hover:bg-muted/40 border-0">
                        <TableCell
                          colSpan={26}
                          className="sticky left-0 bg-muted/50 py-2 text-xs font-bold tracking-wide"
                        >
                          {t("partyMargin.salesman")}
                          <span className="ml-2 font-semibold text-muted-foreground">
                            · {powerGroups.map((g) => g.groupName).join(", ")}
                          </span>
                        </TableCell>
                      </TableRow>
                      {powerGroups.map((g) => (
                        <TableRow
                          key={g.groupId || g.groupName}
                          className={cn("border-0", plRowClass(plTone(g)))}
                        >
                          <RowCells row={g} showParty={false} />
                        </TableRow>
                      ))}
                      {powerAll ? (
                        <TableRow
                          className={cn(
                            "border-0 border-t-2 border-white/30",
                            plRowClass(plTone(powerAll), true)
                          )}
                        >
                          <RowCells row={powerAll} showParty={false} deep />
                        </TableRow>
                      ) : null}
                    </>
                  ) : null}
                  {ikMerged ? (
                    <>
                      <TableRow className="hover:bg-muted/40 border-0">
                        <TableCell
                          colSpan={26}
                          className="sticky left-0 bg-muted/50 py-2 text-xs font-bold tracking-wide"
                        >
                          {t("partyMargin.direct")}
                          <span className="ml-2 font-semibold text-muted-foreground">
                            · {ikGroups.map((g) => g.groupName).join(", ")}
                          </span>
                        </TableCell>
                      </TableRow>
                      <TableRow
                        className={cn("border-0", plRowClass(plTone(ikMerged), true))}
                      >
                        <RowCells row={ikMerged} showParty={false} deep />
                      </TableRow>
                    </>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
              <div>
                <CardTitle className="text-nameplate text-sm font-bold">
                  {t("partyMargin.byParty")}
                </CardTitle>
                <CardDescription>
                  {parties.length} {t("partyMargin.parties")}
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["all", t("partyMargin.filterAll")],
                      ["salesman", t("partyMargin.filterSalesman")],
                      ["direct", t("partyMargin.filterDirect")],
                    ] as const
                  ).map(([id, label]) => (
                    <Button
                      key={id}
                      type="button"
                      size="sm"
                      variant={channel === id ? "default" : "outline"}
                      onClick={() => setChannel(id)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("partyMargin.search")}
                  className="h-9 w-full sm:w-56"
                />
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {parties.length === 0 ? (
                <p className="px-6 py-10 text-sm text-muted-foreground">
                  {t("partyMargin.noRows")}
                </p>
              ) : (
                <Table
                  className="min-w-[1100px] border-separate border-spacing-0"
                  containerClassName="max-h-[min(75vh,48rem)] overflow-auto"
                >
                  <TableHeader className="sticky top-0 z-40 [&_tr]:border-b-0">
                    <MarginTableHeads showParty />
                  </TableHeader>
                  <TableBody>
                    {parties.map((p) => (
                      <TableRow
                        key={p.partyId}
                        className={cn("border-0", plRowClass(plTone(p)))}
                      >
                        <RowCells row={p} showParty />
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="sticky bottom-0 z-30 bg-transparent">
                    <TableRow
                      className={cn(
                        "border-0 border-t-2 border-white/30 font-bold",
                        plRowClass(plTone(filteredTotals), true)
                      )}
                    >
                      <TableCell
                        colSpan={2}
                        className={cn(
                          "sticky left-0 z-20 w-80 min-w-80 max-w-80 px-2.5 py-3 text-sm font-bold text-white shadow-[4px_0_12px_-6px_rgba(0,0,0,0.35)]",
                          plToneBg(plTone(filteredTotals), true)
                        )}
                      >
                        {t("prodMargin.total")}
                      </TableCell>
                      <TableCell className={numCell}>{filteredTotals.hubQty}</TableCell>
                      <TableCell className={numCell}>{filteredTotals.drumQty}</TableCell>
                      <TableCell className={numCell}>{filteredTotals.totalQty}</TableCell>
                      <TableCell className={numCell}>
                        {formatKg(filteredTotals.hubKg)}
                      </TableCell>
                      <TableCell className={numCell}>
                        {formatKg(filteredTotals.drumKg)}
                      </TableCell>
                      <TableCell className={numCell}>
                        {formatKg(filteredTotals.totalKg)}
                      </TableCell>
                      <TableCell className={numCell}>
                        {formatMoney(filteredTotals.hubSale)}
                      </TableCell>
                      <TableCell className={numCell}>
                        {formatMoney(filteredTotals.drumSale)}
                      </TableCell>
                      <TableCell className={numCell}>
                        {formatMoney(filteredTotals.totalSale)}
                      </TableCell>
                      <TableCell colSpan={6} className={numCell} />
                      <TableCell className={numCell}>
                        {formatMoney(filteredTotals.hubMfg)}
                      </TableCell>
                      <TableCell className={numCell}>
                        {formatMoney(filteredTotals.drumMfg)}
                      </TableCell>
                      <TableCell className={numCell}>
                        {formatMoney(filteredTotals.totalMfg)}
                      </TableCell>
                      <PlCell
                        value={filteredTotals.hubProfit}
                        perKg={
                          filteredTotals.hubKg > 0
                            ? filteredTotals.hubProfit / filteredTotals.hubKg
                            : null
                        }
                        solid
                      />
                      <PlCell
                        value={filteredTotals.drumProfit}
                        perKg={
                          filteredTotals.drumKg > 0
                            ? filteredTotals.drumProfit / filteredTotals.drumKg
                            : null
                        }
                        solid
                      />
                      <PlCell
                        value={filteredTotals.profit}
                        perKg={
                          filteredTotals.totalKg > 0
                            ? filteredTotals.profit / filteredTotals.totalKg
                            : null
                        }
                        solid
                      />
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
