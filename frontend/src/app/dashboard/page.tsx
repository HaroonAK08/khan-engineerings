"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Factory,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Banknote,
} from "lucide-react";
import { apiError, formatDate, formatKg, formatMoney } from "@/lib/materials-api";
import { getDashboard, type DashboardData } from "@/lib/dashboard-api";
import { useI18n } from "@/hooks/use-i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function MiniBars({
  data,
  colorClass = "bg-primary/80",
  formatValue = formatMoney,
}: {
  data: Array<{ label: string; value: number }>;
  colorClass?: string;
  formatValue?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div className="flex h-36 items-end gap-1.5 sm:gap-2">
      {data.map((d) => {
        const h = Math.max(4, (Math.abs(d.value) / max) * 100);
        const negative = d.value < 0;
        return (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t-sm ${negative ? "bg-destructive/70" : colorClass}`}
              style={{ height: `${h}%` }}
              title={`${d.label}: ${formatValue(d.value)}`}
            />
            <span className="font-data text-[9px] text-muted-foreground">
              {d.label.slice(5) || d.label.slice(0, 3)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const ACTIVITY_TYPE_KEYS: Record<string, MessageKey> = {
  expense: "dash.activity.expense",
  purchase: "dash.activity.purchase",
  production: "dash.activity.production",
  sale: "dash.activity.sale",
  payment: "dash.activity.payment",
};

function activityTypeLabel(type: string, t: (key: MessageKey) => string) {
  const key = ACTIVITY_TYPE_KEYS[type];
  return key ? t(key) : type.replace("_", " ");
}

const QUICK_ACTIONS: Array<{ href: string; labelKey: MessageKey; icon: typeof Truck }> = [
  { href: "/dashboard/inventory/purchases", labelKey: "dash.qa.purchase", icon: Truck },
  { href: "/dashboard/production", labelKey: "dash.qa.batch", icon: Factory },
  { href: "/dashboard/orders/new", labelKey: "dash.qa.order", icon: Plus },
  { href: "/dashboard/customers", labelKey: "dash.qa.payment", icon: Banknote },
  { href: "/dashboard/claims", labelKey: "dash.qa.claim", icon: RotateCcw },
  { href: "/dashboard/reports", labelKey: "dash.qa.reports", icon: Wallet },
];

export default function DashboardPage() {
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getDashboard());
    } catch (err) {
      toast.error(apiError(err, t("dash.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-sm text-muted-foreground">{t("dash.loadError")}</p>
        <Button onClick={() => void load()} variant="outline" className="gap-2">
          <RefreshCw className="size-4" />
          {t("dash.retry")}
        </Button>
      </div>
    );
  }

  const { kpis } = data;

  const kpiCards = [
    {
      label: t("dash.salesToday"),
      value: formatMoney(kpis.salesToday),
      hint: t("dash.ordersCount", { count: kpis.salesTodayCount }),
      accent: "bg-chart-1",
    },
    {
      label: t("dash.salesMonth"),
      value: formatMoney(kpis.salesMonth),
      hint: t("dash.invoicesIncome"),
      accent: "bg-chart-2",
    },
    {
      label: t("dash.profitMonth"),
      value: formatMoney(kpis.profitMonth),
      hint:
        kpis.marginPct != null
          ? t("dash.margin", { pct: kpis.marginPct })
          : kpis.profitIsPositive
            ? t("dash.inBlack")
            : t("dash.inRed"),
      accent: kpis.profitIsPositive ? "bg-chart-3" : "bg-destructive",
      icon: kpis.profitIsPositive ? TrendingUp : TrendingDown,
    },
    {
      label: t("dash.cashBalance"),
      value: formatMoney(kpis.cashBalance),
      hint: t("dash.cashFlow", { amount: formatMoney(kpis.cashFlowMonth) }),
      accent: "bg-chart-4",
    },
    {
      label: t("dash.outstanding"),
      value: formatMoney(kpis.outstandingPayments),
      hint: t("dash.receivables"),
      accent: "bg-chart-5",
    },
    {
      label: t("dash.rawScrap"),
      value: `${formatKg(kpis.rawMaterialKg)} kg`,
      hint: t("dash.onHand"),
      accent: "bg-chart-1",
    },
    {
      label: t("dash.finishedGoods"),
      value: String(Math.round(kpis.finishedGoodsUnits)),
      hint: t("dash.unitsWarehouse"),
      accent: "bg-chart-2",
    },
    {
      label: t("dash.productionToday"),
      value: String(kpis.productionToday),
      hint: t("dash.batches", { count: kpis.productionTodayBatches }),
      accent: "bg-chart-3",
    },
    {
      label: t("dash.expensesToday"),
      value: formatMoney(kpis.expensesToday),
      hint: t("dash.opsManual"),
      accent: "bg-chart-4",
    },
    {
      label: t("dash.pendingOrders"),
      value: String(kpis.pendingOrders),
      hint: t("dash.awaitingDispatch"),
      accent: "bg-chart-5",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("dash.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("dash.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dash.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-data text-[10px] text-muted-foreground">
            {t("dash.updated", { time: new Date(data.generatedAt).toLocaleTimeString() })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {t("dash.refresh")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kpiCards.map((stat) => {
          const Icon = "icon" in stat ? stat.icon : null;
          return (
            <Card key={stat.label} className="relative overflow-hidden py-0">
              <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
                </div>
                <p className="font-data mt-2 text-xl font-medium sm:text-2xl">{stat.value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{stat.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-nameplate text-sm">{t("dash.quickEntry")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
              >
                <Icon className="size-3.5" />
                {t(a.labelKey)}
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("dash.sales6mo")}</CardTitle>
            <CardDescription>{t("dash.sales6moDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <MiniBars data={data.charts.sales} colorClass="bg-chart-1/85" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("dash.expenses6mo")}</CardTitle>
            <CardDescription>{t("dash.expenses6moDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <MiniBars data={data.charts.expenses} colorClass="bg-chart-2/85" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("dash.production6mo")}</CardTitle>
            <CardDescription>{t("dash.production6moDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <MiniBars
              data={data.charts.production.map((p) => ({
                label: p.label,
                value: p.goodUnits,
              }))}
              colorClass="bg-chart-3/85"
              formatValue={(n) => String(n)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-nameplate text-sm">{t("dash.outstandingPayments")}</CardTitle>
              <CardDescription>{t("dash.whoOwes")}</CardDescription>
            </div>
            <Link
              href="/dashboard/orders/reports"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              {t("dash.viewAll")}
            </Link>
          </CardHeader>
          <CardContent className="px-0">
            {data.outstanding.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">{t("dash.allCaughtUp")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dash.invoice")}</TableHead>
                    <TableHead>{t("dash.customer")}</TableHead>
                    <TableHead className="text-right">{t("dash.balance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.outstanding.map((o) => (
                    <TableRow key={o.orderId}>
                      <TableCell>
                        <Link
                          href={`/dashboard/orders/${o.orderId}`}
                          className="font-data text-xs hover:text-primary hover:underline"
                        >
                          {o.invoiceNo || o.orderNo}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{o.customer}</TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatMoney(o.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className={data.lowStock.count > 0 ? "border-destructive/30" : undefined}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-nameplate text-sm">{t("dash.lowStockAlerts")}</CardTitle>
              <CardDescription>
                {data.lowStock.count === 0
                  ? t("dash.stockHealthy")
                  : t("dash.alertsCount", { count: data.lowStock.count })}
              </CardDescription>
            </div>
            <Link
              href="/dashboard/inventory/finished"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              <Boxes className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {data.lowStock.count === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dash.noLowStock")}</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {data.lowStock.raw && (
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    <span>{data.lowStock.raw.message}</span>
                  </li>
                )}
                {data.lowStock.finished.map((item) => (
                  <li
                    key={item.productId || item.name}
                    className="flex justify-between gap-2 border-b border-border/50 py-1.5 last:border-0"
                  >
                    <span>{item.name}</span>
                    <span className="font-data text-xs text-muted-foreground">
                      {item.quantity} / {item.lowStockThreshold}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("dash.topCustomers")}</CardTitle>
            <CardDescription>{t("dash.topCustomersDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dash.noSales")}</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {data.topCustomers.map((c, i) => (
                  <li key={c.customerId} className="flex justify-between gap-2">
                    <Link
                      href={`/dashboard/customers/${c.customerId}`}
                      className="hover:text-primary hover:underline"
                    >
                      {i === 0 && (
                        <Badge variant="secondary" className="mr-1 font-data text-[9px]">
                          {t("common.top")}
                        </Badge>
                      )}
                      {c.name}
                    </Link>
                    <span className="font-data text-xs">{formatMoney(c.totalSales)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("dash.topSuppliers")}</CardTitle>
            <CardDescription>{t("dash.topSuppliersDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topSuppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dash.noPurchases")}</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {data.topSuppliers.map((s) => (
                  <li key={s.supplierId} className="flex justify-between gap-2">
                    <Link
                      href={`/dashboard/suppliers/${s.supplierId}`}
                      className="hover:text-primary hover:underline"
                    >
                      {s.name}
                    </Link>
                    <span className="font-data text-xs">{formatMoney(s.purchaseSpend)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("dash.prodSummary")}</CardTitle>
            <CardDescription>{t("dash.prodSummaryDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("dash.today")}
                </p>
                <p className="font-data mt-1 text-lg">{data.productionSummary.today.goodUnits}</p>
                <p className="text-xs text-muted-foreground">
                  {t("dash.todayBatches", {
                    batches: data.productionSummary.today.batches,
                    rate: data.productionSummary.today.rejectRate,
                  })}
                </p>
              </div>
              <div>
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("dash.month")}
                </p>
                <p className="font-data mt-1 text-lg">{data.productionSummary.month.goodUnits}</p>
                <p className="text-xs text-muted-foreground">
                  {t("dash.monthBatches", {
                    batches: data.productionSummary.month.batches,
                    kg: formatKg(data.productionSummary.month.netConsumedKg),
                  })}
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/production/reports"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit gap-1.5")}
            >
              <ClipboardList className="size-3.5" />
              {t("dash.yieldReports")}
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-nameplate text-sm">{t("dash.recentActivity")}</CardTitle>
            <CardDescription>{t("dash.recentActivityDesc")}</CardDescription>
          </div>
          <Badge variant="secondary" className="font-data text-[10px]">
            {t("dash.live")}
          </Badge>
        </CardHeader>
        <CardContent>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("dash.noActivity")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.recentActivity.map((e, i) => (
                <li key={`${e.at}-${i}`}>
                  <Link
                    href={e.href}
                    className="font-data flex items-baseline gap-3 border-b border-border/60 py-2 text-xs transition-colors last:border-0 hover:text-primary"
                  >
                    <span className="w-28 shrink-0 text-muted-foreground">
                      {formatDate(e.at)}
                    </span>
                    <Badge variant="outline" className="font-data shrink-0 text-[9px] uppercase">
                      {activityTypeLabel(e.type, t)}
                    </Badge>
                    <span className="min-w-0 truncate">{e.message}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
