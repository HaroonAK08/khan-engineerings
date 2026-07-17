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
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { apiError, formatDate, formatKg, formatMoney } from "@/lib/materials-api";
import { getDashboard, type DashboardData } from "@/lib/dashboard-api";
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

const QUICK_ACTIONS = [
  { href: "/dashboard/orders/new", label: "New order", icon: Plus },
  { href: "/dashboard/inventory/purchases", label: "Log purchase", icon: Truck },
  { href: "/dashboard/production", label: "Production", icon: Factory },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/reports", label: "Reports", icon: Wallet },
  { href: "/dashboard/inventory/alerts", label: "Stock alerts", icon: AlertTriangle },
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getDashboard());
    } catch (err) {
      toast.error(apiError(err, "Failed to load dashboard"));
    } finally {
      setLoading(false);
    }
  }, []);

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
        <p className="text-sm text-muted-foreground">Could not load business summary.</p>
        <Button onClick={() => void load()} variant="outline" className="gap-2">
          <RefreshCw className="size-4" />
          Retry
        </Button>
      </div>
    );
  }

  const { kpis } = data;

  const kpiCards = [
    {
      label: "Today's sales",
      value: formatMoney(kpis.salesToday),
      hint: `${kpis.salesTodayCount} order(s)`,
      accent: "bg-chart-1",
    },
    {
      label: "Monthly sales",
      value: formatMoney(kpis.salesMonth),
      hint: "Invoices + other income",
      accent: "bg-chart-2",
    },
    {
      label: "Monthly profit",
      value: formatMoney(kpis.profitMonth),
      hint:
        kpis.marginPct != null
          ? `Margin ${kpis.marginPct}%`
          : kpis.profitIsPositive
            ? "In the black"
            : "In the red",
      accent: kpis.profitIsPositive ? "bg-chart-3" : "bg-destructive",
      icon: kpis.profitIsPositive ? TrendingUp : TrendingDown,
    },
    {
      label: "Cash balance",
      value: formatMoney(kpis.cashBalance),
      hint: `Month cash flow ${formatMoney(kpis.cashFlowMonth)}`,
      accent: "bg-chart-4",
    },
    {
      label: "Outstanding",
      value: formatMoney(kpis.outstandingPayments),
      hint: "Customer receivables",
      accent: "bg-chart-5",
    },
    {
      label: "Raw scrap stock",
      value: `${formatKg(kpis.rawMaterialKg)} kg`,
      hint: "Available on hand",
      accent: "bg-chart-1",
    },
    {
      label: "Finished goods",
      value: String(Math.round(kpis.finishedGoodsUnits)),
      hint: "Units in warehouse",
      accent: "bg-chart-2",
    },
    {
      label: "Production today",
      value: String(kpis.productionToday),
      hint: `${kpis.productionTodayBatches} batch(es)`,
      accent: "bg-chart-3",
    },
    {
      label: "Expenses today",
      value: formatMoney(kpis.expensesToday),
      hint: "Ops + manual",
      accent: "bg-chart-4",
    },
    {
      label: "Pending orders",
      value: String(kpis.pendingOrders),
      hint: "Awaiting / partial dispatch",
      accent: "bg-chart-5",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            Phase 8 · Business intelligence
          </p>
          <h1 className="text-nameplate text-xl">Factory overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One screen for sales, stock, production, and money.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-data text-[10px] text-muted-foreground">
            Updated {new Date(data.generatedAt).toLocaleTimeString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Refresh
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
          <CardTitle className="text-nameplate text-sm">Quick actions</CardTitle>
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
                {a.label}
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Sales (6 mo)</CardTitle>
            <CardDescription>Invoiced revenue by month</CardDescription>
          </CardHeader>
          <CardContent>
            <MiniBars data={data.charts.sales} colorClass="bg-chart-1/85" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Expenses (6 mo)</CardTitle>
            <CardDescription>Purchases + manufacturing + other</CardDescription>
          </CardHeader>
          <CardContent>
            <MiniBars data={data.charts.expenses} colorClass="bg-chart-2/85" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Production (6 mo)</CardTitle>
            <CardDescription>Good units produced</CardDescription>
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
              <CardTitle className="text-nameplate text-sm">Outstanding payments</CardTitle>
              <CardDescription>Who still owes you</CardDescription>
            </div>
            <Link
              href="/dashboard/orders/reports"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              All →
            </Link>
          </CardHeader>
          <CardContent className="px-0">
            {data.outstanding.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">All caught up</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
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
              <CardTitle className="text-nameplate text-sm">Low stock alerts</CardTitle>
              <CardDescription>
                {data.lowStock.count === 0
                  ? "Stock levels look healthy"
                  : `${data.lowStock.count} alert(s)`}
              </CardDescription>
            </div>
            <Link
              href="/dashboard/inventory/alerts"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              <Boxes className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {data.lowStock.count === 0 ? (
              <p className="text-sm text-muted-foreground">No low-stock items right now.</p>
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
            <CardTitle className="text-nameplate text-sm">Top customers</CardTitle>
            <CardDescription>This month by sales</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet</p>
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
                          TOP
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
            <CardTitle className="text-nameplate text-sm">Top suppliers</CardTitle>
            <CardDescription>This month by purchase spend</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topSuppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No purchases yet</p>
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
            <CardTitle className="text-nameplate text-sm">Production summary</CardTitle>
            <CardDescription>Today vs this month</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  Today
                </p>
                <p className="font-data mt-1 text-lg">{data.productionSummary.today.goodUnits}</p>
                <p className="text-xs text-muted-foreground">
                  {data.productionSummary.today.batches} batches · reject{" "}
                  {data.productionSummary.today.rejectRate}%
                </p>
              </div>
              <div>
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  Month
                </p>
                <p className="font-data mt-1 text-lg">{data.productionSummary.month.goodUnits}</p>
                <p className="text-xs text-muted-foreground">
                  {data.productionSummary.month.batches} batches ·{" "}
                  {formatKg(data.productionSummary.month.netConsumedKg)} kg scrap
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/production/reports"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit gap-1.5")}
            >
              <ClipboardList className="size-3.5" />
              Yield reports
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-nameplate text-sm">Recent activity</CardTitle>
            <CardDescription>Latest sales, payments, purchases, production</CardDescription>
          </div>
          <Badge variant="secondary" className="font-data text-[10px]">
            LIVE
          </Badge>
        </CardHeader>
        <CardContent>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet</p>
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
                      {e.type.replace("_", " ")}
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
