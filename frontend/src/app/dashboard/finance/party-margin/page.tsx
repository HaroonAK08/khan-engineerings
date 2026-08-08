"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { DateRangeFilter } from "@/components/date-range-filter";
import { apiError, formatDate, formatKg, formatMoney } from "@/lib/materials-api";
import {
  getPartySalesMargin,
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
import { cn } from "@/lib/utils";

const headCell =
  "bg-slate-800 text-white font-semibold whitespace-nowrap border-b-0 shadow-sm dark:bg-slate-900";

const stickyPartyHead =
  "sticky left-0 z-30 w-44 min-w-44 max-w-44 bg-slate-800 text-white shadow-[4px_0_8px_-4px_rgba(0,0,0,0.35)] dark:bg-slate-900";

const stickyGroupHead = (withParty: boolean) =>
  cn(
    "sticky z-20 w-36 min-w-36 max-w-36 bg-slate-800 text-white shadow-[4px_0_8px_-4px_rgba(0,0,0,0.25)] dark:bg-slate-900",
    withParty ? "left-44" : "left-0"
  );

const stickyPartyCell = (loss: boolean) =>
  cn(
    "sticky left-0 z-20 w-44 min-w-44 max-w-44 truncate font-medium shadow-[4px_0_8px_-4px_rgba(0,0,0,0.2)]",
    loss ? "bg-red-50 dark:bg-red-950" : "bg-emerald-50 dark:bg-emerald-950"
  );

const stickyGroupCell = (withParty: boolean, loss: boolean, tint?: "profit" | "loss" | "none") =>
  cn(
    "sticky z-10 w-36 min-w-36 max-w-36 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15)]",
    withParty ? "left-44" : "left-0",
    tint === "loss" || loss
      ? "bg-red-50 dark:bg-red-950"
      : tint === "profit"
        ? "bg-emerald-50 dark:bg-emerald-950"
        : "bg-background"
  );

function moneyOrDash(n: number | null | undefined) {
  return n == null ? "—" : formatMoney(n);
}

function PlCell({ value, perKg }: { value: number; perKg?: number | null }) {
  const loss = value < 0;
  return (
    <>
      <TableCell
        className={cn(
          "font-data text-right text-xs font-semibold",
          loss ? "text-destructive" : "text-chart-3"
        )}
      >
        {formatMoney(value)}
      </TableCell>
      {perKg !== undefined ? (
        <TableCell
          className={cn(
            "font-data text-right text-xs",
            loss ? "text-destructive" : "text-chart-3"
          )}
        >
          {moneyOrDash(perKg)}
        </TableCell>
      ) : null}
    </>
  );
}

function RowCells({
  row,
  showParty,
}: {
  row: PartySalesMarginParty & { partyCount?: number };
  showParty: boolean;
}) {
  const loss = row.profit < 0;
  const groupTint: "profit" | "loss" | "none" = loss ? "loss" : "profit";
  return (
    <>
      {showParty ? (
        <TableCell className={stickyPartyCell(loss)}>{row.partyName}</TableCell>
      ) : null}
      <TableCell className={stickyGroupCell(showParty, loss, groupTint)}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span>{row.groupName}</span>
          <Badge
            variant="secondary"
            className={cn(
              "font-data text-[9px]",
              row.salesmanChannel
                ? "border-amber-400/40 bg-amber-500/20 text-amber-900 dark:text-amber-100"
                : "border-sky-400/40 bg-sky-500/20 text-sky-900 dark:text-sky-100"
            )}
          >
            {row.salesmanChannel ? "PE" : "IK"}
          </Badge>
          {row.partyCount != null ? (
            <span className="text-xs text-muted-foreground">· {row.partyCount}</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="font-data text-right text-xs">{row.hubQty ?? 0}</TableCell>
      <TableCell className="font-data text-right text-xs">{row.drumQty ?? 0}</TableCell>
      <TableCell className="font-data text-right text-xs">{row.totalQty ?? 0}</TableCell>
      <TableCell className="font-data text-right text-xs">{formatKg(row.hubKg)}</TableCell>
      <TableCell className="font-data text-right text-xs">{formatKg(row.drumKg)}</TableCell>
      <TableCell className="font-data text-right text-xs">{formatKg(row.totalKg)}</TableCell>
      <TableCell className="font-data text-right text-xs">{formatMoney(row.hubSale)}</TableCell>
      <TableCell className="font-data text-right text-xs">{formatMoney(row.drumSale)}</TableCell>
      <TableCell className="font-data text-right text-xs">{formatMoney(row.totalSale)}</TableCell>
      <TableCell className="font-data text-right text-xs">{moneyOrDash(row.hubSalePerKg)}</TableCell>
      <TableCell className="font-data text-right text-xs">{moneyOrDash(row.drumSalePerKg)}</TableCell>
      <TableCell className="font-data text-right text-xs">{moneyOrDash(row.avgSalePerKg)}</TableCell>
      <TableCell className="font-data text-right text-xs">{moneyOrDash(row.hubMfgPerKg)}</TableCell>
      <TableCell className="font-data text-right text-xs">{moneyOrDash(row.drumMfgPerKg)}</TableCell>
      <TableCell className="font-data text-right text-xs">{moneyOrDash(row.avgMfgPerKg)}</TableCell>
      <TableCell className="font-data text-right text-xs">{formatMoney(row.hubMfg)}</TableCell>
      <TableCell className="font-data text-right text-xs">{formatMoney(row.drumMfg)}</TableCell>
      <TableCell className="font-data text-right text-xs">{formatMoney(row.totalMfg)}</TableCell>
      <PlCell value={row.hubProfit} perKg={row.hubProfitPerKg} />
      <PlCell value={row.drumProfit} perKg={row.drumProfitPerKg} />
      <PlCell value={row.profit} perKg={row.profitPerKg} />
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("common.financeEyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("partyMargin.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("partyMargin.subtitle")}
          </p>
        </div>
        <DateRangeFilter />
      </div>

      {loading || !report || !rates || !totals ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: t("partyMargin.factoryHub"),
                value: moneyOrDash(rates.hubFactoryCostPerKg),
              },
              {
                label: t("partyMargin.factoryDrum"),
                value: moneyOrDash(rates.drumFactoryCostPerKg),
              },
              {
                label: t("partyMargin.salesmanHub"),
                value: moneyOrDash(rates.hubMfgSalesman),
              },
              {
                label: t("partyMargin.salesmanDrum"),
                value: moneyOrDash(rates.drumMfgSalesman),
              },
              {
                label: t("partyMargin.salesmanLoad"),
                value: formatMoney(rates.salesmanLoad),
                hint: `${formatKg(rates.salesmanSoldKg)} · ${t("partyMargin.salesmanPerKg")} ${formatMoney(rates.salesmanPerSoldKg)}`,
              },
              {
                label: t("partyMargin.elecHub"),
                value: moneyOrDash(report.electricity.hubPerKg),
              },
              {
                label: t("partyMargin.elecDrum"),
                value: moneyOrDash(report.electricity.drumPerKg),
              },
              {
                label: t("partyMargin.hubProfit"),
                value: formatMoney(totals.hubProfit),
                hint: moneyOrDash(totals.hubProfitPerKg),
                accent: totals.hubProfit < 0 ? "text-destructive" : "text-chart-3",
              },
              {
                label: t("partyMargin.drumProfit"),
                value: formatMoney(totals.drumProfit),
                hint: moneyOrDash(totals.drumProfitPerKg),
                accent: totals.drumProfit < 0 ? "text-destructive" : "text-chart-3",
              },
              {
                label: isProfit ? t("partyMargin.totalProfit") : t("partyMargin.totalLoss"),
                value: formatMoney(totals.profit),
                hint: moneyOrDash(totals.profitPerKg),
                accent: isProfit ? "text-chart-3" : "text-destructive",
              },
            ].map((card) => (
              <Card key={card.label} className="py-0">
                <CardContent className="p-4">
                  <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                    {card.label}
                  </p>
                  <p className={cn("font-data mt-1 text-xl", card.accent)}>{card.value}</p>
                  {card.hint ? (
                    <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-nameplate text-sm">{t("partyMargin.salesman")}</CardTitle>
                <CardDescription>
                  {(report.mainChannels?.powerEngineering.memberGroups.length
                    ? report.mainChannels.powerEngineering.memberGroups.join(", ")
                    : t("partyMargin.powerMembers")) +
                    ` · ${formatKg(totals.salesman.totalKg)} · ${moneyOrDash(totals.salesman.profitPerKg)}/kg`}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t("partyMargin.totalSale")}</p>
                  <p className="font-data text-lg">{formatMoney(totals.salesman.totalSale)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("partyMargin.totalMfg")}</p>
                  <p className="font-data text-lg">{formatMoney(totals.salesman.totalMfg)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("partyMargin.hubProfit")}</p>
                  <p
                    className={cn(
                      "font-data text-lg",
                      totals.salesman.hubProfit < 0 ? "text-destructive" : "text-chart-3"
                    )}
                  >
                    {formatMoney(totals.salesman.hubProfit)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("partyMargin.drumProfit")}</p>
                  <p
                    className={cn(
                      "font-data text-lg",
                      totals.salesman.drumProfit < 0 ? "text-destructive" : "text-chart-3"
                    )}
                  >
                    {formatMoney(totals.salesman.drumProfit)}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">{t("partyMargin.profit")}</p>
                  <p
                    className={cn(
                      "font-data text-2xl",
                      totals.salesman.profit < 0 ? "text-destructive" : "text-chart-3"
                    )}
                  >
                    {formatMoney(totals.salesman.profit)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-nameplate text-sm">{t("partyMargin.direct")}</CardTitle>
                <CardDescription>
                  {(report.mainChannels?.ikEngineering.memberGroups.length
                    ? report.mainChannels.ikEngineering.memberGroups.join(", ")
                    : t("partyMargin.ikMembers")) +
                    ` · ${formatKg(totals.direct.totalKg)} · ${moneyOrDash(totals.direct.profitPerKg)}/kg`}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t("partyMargin.totalSale")}</p>
                  <p className="font-data text-lg">{formatMoney(totals.direct.totalSale)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("partyMargin.totalMfg")}</p>
                  <p className="font-data text-lg">{formatMoney(totals.direct.totalMfg)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("partyMargin.hubProfit")}</p>
                  <p
                    className={cn(
                      "font-data text-lg",
                      totals.direct.hubProfit < 0 ? "text-destructive" : "text-chart-3"
                    )}
                  >
                    {formatMoney(totals.direct.hubProfit)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("partyMargin.drumProfit")}</p>
                  <p
                    className={cn(
                      "font-data text-lg",
                      totals.direct.drumProfit < 0 ? "text-destructive" : "text-chart-3"
                    )}
                  >
                    {formatMoney(totals.direct.drumProfit)}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">{t("partyMargin.profit")}</p>
                  <p
                    className={cn(
                      "font-data text-2xl",
                      totals.direct.profit < 0 ? "text-destructive" : "text-chart-3"
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
              <CardTitle className="text-nameplate text-sm">{t("partyMargin.byGroup")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table containerClassName="max-h-[min(70vh,40rem)] overflow-auto">
                <TableHeader className="sticky top-0 z-40 [&_tr]:border-b-0">
                  <MarginTableHeads showParty={false} />
                </TableHeader>
                <TableBody>
                  {powerGroups.length > 0 ? (
                    <>
                      <TableRow className="hover:bg-amber-500/10">
                        <TableCell
                          colSpan={26}
                          className="sticky left-0 bg-amber-500/15 py-2 text-xs font-semibold tracking-wide text-amber-950 dark:text-amber-100"
                        >
                          {t("partyMargin.salesman")}
                          <span className="ml-2 font-normal text-muted-foreground">
                            · {powerGroups.map((g) => g.groupName).join(", ")}
                          </span>
                        </TableCell>
                      </TableRow>
                      {powerGroups.map((g) => (
                        <TableRow
                          key={g.groupId || g.groupName}
                          className={g.profit < 0 ? "bg-destructive/5" : "bg-chart-3/5"}
                        >
                          <RowCells row={g} showParty={false} />
                        </TableRow>
                      ))}
                    </>
                  ) : null}
                  {ikGroups.length > 0 ? (
                    <>
                      <TableRow className="hover:bg-sky-500/10">
                        <TableCell
                          colSpan={26}
                          className="sticky left-0 bg-sky-500/15 py-2 text-xs font-semibold tracking-wide text-sky-950 dark:text-sky-100"
                        >
                          {t("partyMargin.direct")}
                          <span className="ml-2 font-normal text-muted-foreground">
                            · {ikGroups.map((g) => g.groupName).join(", ")}
                          </span>
                        </TableCell>
                      </TableRow>
                      {ikGroups.map((g) => (
                        <TableRow
                          key={g.groupId || g.groupName}
                          className={g.profit < 0 ? "bg-destructive/5" : "bg-chart-3/5"}
                        >
                          <RowCells row={g} showParty={false} />
                        </TableRow>
                      ))}
                    </>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="gap-3 px-4 pt-4 pb-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
              <div>
                <CardTitle className="text-nameplate text-sm">{t("partyMargin.byParty")}</CardTitle>
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
                <Table containerClassName="max-h-[min(75vh,48rem)] overflow-auto">
                  <TableHeader className="sticky top-0 z-40 [&_tr]:border-b-0">
                    <MarginTableHeads showParty />
                  </TableHeader>
                  <TableBody>
                    {parties.map((p) => (
                      <TableRow
                        key={p.partyId}
                        className={
                          p.profit < 0 ? "bg-destructive/5" : "bg-chart-3/5"
                        }
                      >
                        <RowCells row={p} showParty />
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="sticky bottom-0 z-30">
                    <TableRow className="border-t-2 border-slate-800/40 bg-muted/95 font-medium hover:bg-muted/95">
                      <TableCell
                        colSpan={2}
                        className="sticky left-0 z-20 w-80 min-w-80 max-w-80 bg-muted font-semibold shadow-[4px_0_8px_-4px_rgba(0,0,0,0.2)]"
                      >
                        {t("prodMargin.total")}
                      </TableCell>
                      <TableCell className="font-data bg-muted text-right text-xs">
                        {filteredTotals.hubQty}
                      </TableCell>
                      <TableCell className="font-data bg-muted text-right text-xs">
                        {filteredTotals.drumQty}
                      </TableCell>
                      <TableCell className="font-data bg-muted text-right text-xs">
                        {filteredTotals.totalQty}
                      </TableCell>
                      <TableCell className="font-data bg-muted text-right text-xs">
                        {formatKg(filteredTotals.hubKg)}
                      </TableCell>
                      <TableCell className="font-data bg-muted text-right text-xs">
                        {formatKg(filteredTotals.drumKg)}
                      </TableCell>
                      <TableCell className="font-data bg-muted text-right text-xs">
                        {formatKg(filteredTotals.totalKg)}
                      </TableCell>
                      <TableCell className="font-data bg-muted text-right text-xs">
                        {formatMoney(filteredTotals.hubSale)}
                      </TableCell>
                      <TableCell className="font-data bg-muted text-right text-xs">
                        {formatMoney(filteredTotals.drumSale)}
                      </TableCell>
                      <TableCell className="font-data bg-muted text-right text-xs">
                        {formatMoney(filteredTotals.totalSale)}
                      </TableCell>
                      <TableCell colSpan={6} className="bg-muted" />
                      <TableCell className="font-data bg-muted text-right text-xs">
                        {formatMoney(filteredTotals.hubMfg)}
                      </TableCell>
                      <TableCell className="font-data bg-muted text-right text-xs">
                        {formatMoney(filteredTotals.drumMfg)}
                      </TableCell>
                      <TableCell className="font-data bg-muted text-right text-xs">
                        {formatMoney(filteredTotals.totalMfg)}
                      </TableCell>
                      <PlCell
                        value={filteredTotals.hubProfit}
                        perKg={
                          filteredTotals.hubKg > 0
                            ? filteredTotals.hubProfit / filteredTotals.hubKg
                            : null
                        }
                      />
                      <PlCell
                        value={filteredTotals.drumProfit}
                        perKg={
                          filteredTotals.drumKg > 0
                            ? filteredTotals.drumProfit / filteredTotals.drumKg
                            : null
                        }
                      />
                      <PlCell
                        value={filteredTotals.profit}
                        perKg={
                          filteredTotals.totalKg > 0
                            ? filteredTotals.profit / filteredTotals.totalKg
                            : null
                        }
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
