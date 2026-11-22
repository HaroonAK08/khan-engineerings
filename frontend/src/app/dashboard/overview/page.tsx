"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Factory,
  PackageSearch,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  ErrorState,
  RefreshingBar,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/data/states";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";
import { useDashboard } from "@/lib/query";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

/**
 * Business overview.
 *
 * Every figure here comes straight from `GET /api/dashboard`. Nothing is
 * recalculated client-side — the audit (docs/audit/02, BL-020) found that this
 * endpoint had been built and maintained since the start but was never called
 * by any screen, so the owner-facing KPIs it computes were invisible.
 *
 * The hub/drum manufacturing-margin analysis remains the `/dashboard` landing
 * page and is reachable from the subnav above.
 */

type Tone = "neutral" | "good" | "bad" | "warn";

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  href?: string;
}) {
  const toneRing = {
    neutral: "border-border",
    good: "border-emerald-500/40",
    bad: "border-destructive/40",
    warn: "border-amber-500/40",
  }[tone];
  const toneText = {
    neutral: "text-foreground",
    good: "text-emerald-600 dark:text-emerald-400",
    bad: "text-destructive",
    warn: "text-amber-600 dark:text-amber-400",
  }[tone];

  const body = (
    <Card className={cn("h-full transition-colors", toneRing, href && "hover:bg-accent/40")}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="font-data text-[10px] tracking-[0.14em] uppercase text-muted-foreground">
            {label}
          </p>
          <p className={cn("font-data mt-1.5 truncate text-xl font-semibold", toneText)}>
            {value}
          </p>
          {hint ? (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <Icon className="size-4 shrink-0 text-muted-foreground/60" />
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function BusinessOverviewPage() {
  const { t } = useI18n();
  const query = useDashboard();
  const data = query.data;

  const loading = query.isPending && !data;
  const kpis = data?.kpis;

  const monthTrend = useMemo(() => {
    const months = data?.charts.profit ?? [];
    if (months.length < 2) return null;
    const last = months[months.length - 1]?.value ?? 0;
    const prev = months[months.length - 2]?.value ?? 0;
    if (prev === 0) return null;
    return Math.round(((last - prev) / Math.abs(prev)) * 100);
  }, [data]);

  if (query.error && !data) {
    return (
      <div className="flex flex-col gap-6">
        <FinanceSubnav />
        <ErrorState
          title={t("common.loadFailed")}
          description={apiError(query.error, "")}
          onRetry={() => void query.refetch()}
          retryLabel={t("common.retry")}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <FinanceSubnav />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-nameplate text-lg font-semibold">{t("overview.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("overview.subtitle")}</p>
        </div>
        <RefreshingBar active={query.isFetching && !loading} label={t("common.updating")} />
      </div>

      {loading || !kpis ? (
        <>
          <StatCardsSkeleton count={8} />
          <TableSkeleton rows={6} columns={4} />
        </>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("overview.cashBalance")}
              value={formatMoney(kpis.cashBalance)}
              hint={t("overview.cashFlowMonth", { value: formatMoney(kpis.cashFlowMonth) })}
              icon={Wallet}
              tone={kpis.cashBalance >= 0 ? "neutral" : "bad"}
            />
            <StatCard
              label={t("overview.salesToday")}
              value={formatMoney(kpis.salesToday)}
              hint={t("overview.builtyCount", { count: kpis.salesTodayCount })}
              icon={Receipt}
              href="/dashboard/builty"
            />
            <StatCard
              label={t("overview.outstanding")}
              value={formatMoney(kpis.outstandingPayments)}
              hint={t("overview.pendingOrders", { count: kpis.pendingOrders })}
              icon={TrendingDown}
              tone={kpis.outstandingPayments > 0 ? "warn" : "good"}
              href="/dashboard/reports/receivables"
            />
            <StatCard
              label={t("overview.profitMonth")}
              value={formatMoney(kpis.profitMonth)}
              hint={
                kpis.marginPct != null
                  ? t("overview.margin", { value: String(kpis.marginPct) })
                  : undefined
              }
              icon={kpis.profitIsPositive ? TrendingUp : TrendingDown}
              tone={kpis.profitIsPositive ? "good" : "bad"}
            />

            <StatCard
              label={t("overview.rawMaterial")}
              value={formatKg(kpis.rawMaterialKg)}
              icon={Boxes}
              tone={kpis.rawMaterialKg <= 0 ? "bad" : "neutral"}
              href="/dashboard/inventory"
            />
            <StatCard
              label={t("overview.finishedGoods")}
              value={`${kpis.finishedGoodsUnits.toLocaleString()}`}
              hint={t("overview.hubDrum", {
                hub: String(kpis.finishedHubUnits),
                drum: String(kpis.finishedDrumUnits),
              })}
              icon={PackageSearch}
              href="/dashboard/inventory/finished"
            />
            <StatCard
              label={t("overview.productionToday")}
              value={`${kpis.productionToday.toLocaleString()}`}
              hint={t("overview.batchCount", { count: kpis.productionTodayBatches })}
              icon={Factory}
              href="/dashboard/production"
            />
            <StatCard
              label={t("overview.lowStock")}
              value={`${kpis.lowStockCount}`}
              hint={t("overview.expensesToday", { value: formatMoney(kpis.expensesToday) })}
              icon={AlertTriangle}
              tone={kpis.lowStockCount > 0 ? "warn" : "good"}
              href="/dashboard/inventory/alerts"
            />
          </section>

          {monthTrend !== null ? (
            <p className="font-data text-[11px] tracking-[0.1em] text-muted-foreground">
              {t("overview.vsLastMonth", { value: `${monthTrend > 0 ? "+" : ""}${monthTrend}` })}
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-3">
                <CardTitle className="text-nameplate text-sm">
                  {t("overview.topOutstanding")}
                </CardTitle>
                <Link
                  href="/dashboard/reports/receivables"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t("overview.viewAll")} <ArrowRight className="size-3" />
                </Link>
              </CardHeader>
              <CardContent className="pt-0">
                {data.outstanding.length === 0 ? (
                  <EmptyState title={t("overview.noOutstanding")} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("overview.party")}</TableHead>
                        <TableHead>{t("overview.builtyNo")}</TableHead>
                        <TableHead className="text-right">{t("overview.balance")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.outstanding.map((row) => (
                        <TableRow key={row.orderId}>
                          <TableCell className="max-w-[12rem] truncate">{row.customer}</TableCell>
                          <TableCell className="font-data text-xs">{row.orderNo}</TableCell>
                          <TableCell className="font-data text-right">
                            {formatMoney(row.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between pb-3">
                <CardTitle className="text-nameplate text-sm">
                  {t("overview.lowStockItems")}
                </CardTitle>
                <Link
                  href="/dashboard/inventory/alerts"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t("overview.viewAll")} <ArrowRight className="size-3" />
                </Link>
              </CardHeader>
              <CardContent className="pt-0">
                {data.lowStock.raw ? (
                  <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
                    {data.lowStock.raw.message}
                  </div>
                ) : null}
                {data.lowStock.finished.length === 0 && !data.lowStock.raw ? (
                  <EmptyState title={t("overview.stockHealthy")} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("overview.product")}</TableHead>
                        <TableHead className="text-right">{t("overview.onHand")}</TableHead>
                        <TableHead className="text-right">{t("overview.threshold")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.lowStock.finished.map((row) => (
                        <TableRow key={row.productId ?? row.name}>
                          <TableCell className="max-w-[12rem] truncate">{row.name}</TableCell>
                          <TableCell className="font-data text-right">{row.quantity}</TableCell>
                          <TableCell className="font-data text-right text-muted-foreground">
                            {row.lowStockThreshold}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-nameplate text-sm">
                {t("overview.recentActivity")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {data.recentActivity.length === 0 ? (
                <EmptyState title={t("common.noResults")} />
              ) : (
                <ul className="divide-y">
                  {data.recentActivity.map((event, i) => (
                    <li key={`${event.at}-${i}`} className="py-2">
                      <Link
                        href={event.href}
                        className="flex items-center justify-between gap-3 text-sm hover:underline"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                            {event.type.replace("_", " ")}
                          </Badge>
                          <span className="truncate">{event.message}</span>
                        </span>
                        <span className="font-data shrink-0 text-[11px] text-muted-foreground">
                          {new Date(event.at).toLocaleDateString()}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
