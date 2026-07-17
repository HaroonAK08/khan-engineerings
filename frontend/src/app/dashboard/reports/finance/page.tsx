"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  getCustomerRevenue,
  getFinanceOverview,
  getProductProfit,
  getSupplierExpenses,
  type FinanceOverview,
} from "@/lib/finance-api";
import { downloadReportExport } from "@/lib/reports-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function monthDefaults() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function FinanceOverviewPage() {
  const defaults = monthDefaults();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [topCustomers, setTopCustomers] = useState<
    Array<{ customerId: string; name: string; revenue: number }>
  >([]);
  const [topSuppliers, setTopSuppliers] = useState<
    Array<{ supplierId: string; name: string; purchaseSpend: number }>
  >([]);
  const [topProduct, setTopProduct] = useState<{ name: string; profit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { dateFrom, dateTo };
      const [ov, cust, supp, prod] = await Promise.all([
        getFinanceOverview(params),
        getCustomerRevenue(params),
        getSupplierExpenses(params),
        getProductProfit(params),
      ]);
      setOverview(ov);
      setTopCustomers(cust.customers.slice(0, 5));
      setTopSuppliers(supp.suppliers.slice(0, 5));
      setTopProduct(prod.topEarner);
    } catch (err) {
      toast.error(apiError(err, "Failed to load finance overview"));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function onExport(format: "xlsx" | "pdf") {
    setExporting(format);
    try {
      await downloadReportExport("finance", { format, dateFrom, dateTo });
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (err) {
      toast.error(apiError(err, "Export failed"));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <FinanceSubnav />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            Phase 7 · Finance
          </p>
          <h1 className="text-nameplate text-xl">Profit & cash flow</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Where money comes from and where it goes.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <ExportButtons exporting={exporting} onExport={onExport} />
          <div className="flex gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      {loading || !overview ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <Card
            className={
              overview.profitAndLoss.isProfit ? "border-chart-3/40" : "border-destructive/40"
            }
          >
            <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                {overview.profitAndLoss.isProfit ? (
                  <TrendingUp className="size-5 text-chart-3" />
                ) : (
                  <TrendingDown className="size-5 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    {overview.profitAndLoss.isProfit
                      ? "Profit this period"
                      : "Loss this period"}
                  </p>
                  <p className="font-data text-xs text-muted-foreground">
                    {formatDate(overview.period.from)} → {formatDate(overview.period.to)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-data text-3xl">
                  {formatMoney(overview.profitAndLoss.netProfit)}
                </p>
                <p className="font-data text-xs text-muted-foreground">
                  Margin{" "}
                  {overview.profitAndLoss.marginPct != null
                    ? `${overview.profitAndLoss.marginPct}%`
                    : "—"}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Revenue",
                value: formatMoney(overview.profitAndLoss.revenue),
                hint: "Invoices + other income",
                accent: "bg-chart-1",
              },
              {
                label: "COGS / ops",
                value: formatMoney(overview.profitAndLoss.cogs),
                hint: "Purchases + manufacturing",
                accent: "bg-chart-4",
              },
              {
                label: "Cash in",
                value: formatMoney(overview.cashFlow.cashIn),
                hint: "Customer payments + other",
                accent: "bg-chart-3",
              },
              {
                label: "Cash out",
                value: formatMoney(overview.cashFlow.cashOut),
                hint: "Supplier pay + mfg + other",
                accent: "bg-chart-2",
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

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Profit & loss</CardTitle>
                <CardDescription>Accrual view for the selected dates.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {[
                  ["Revenue", overview.profitAndLoss.revenue],
                  ["COGS (purchases + mfg ops)", overview.profitAndLoss.cogs],
                  ["Gross profit", overview.profitAndLoss.grossProfit],
                  ["Other expenses", overview.profitAndLoss.otherExpenses],
                  ["Net profit", overview.profitAndLoss.netProfit],
                ].map(([label, value], i, arr) => (
                  <div
                    key={String(label)}
                    className={`flex justify-between ${
                      i === arr.length - 1 ? "border-t border-border pt-2 font-medium" : ""
                    }`}
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-data">{formatMoney(Number(value))}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Cash flow</CardTitle>
                <CardDescription>Money that actually moved.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {[
                  ["Cash in", overview.cashFlow.cashIn],
                  ["Cash out", overview.cashFlow.cashOut],
                  ["Net cash", overview.cashFlow.net],
                ].map(([label, value], i, arr) => (
                  <div
                    key={String(label)}
                    className={`flex justify-between ${
                      i === arr.length - 1 ? "border-t border-border pt-2 font-medium" : ""
                    }`}
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-data">{formatMoney(Number(value))}</span>
                  </div>
                ))}
                <p className="pt-2 text-xs text-muted-foreground">
                  Customer payments {formatMoney(overview.income.customerPayments)} · Supplier
                  payments {formatMoney(overview.expenses.supplierPayments)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Top revenue customers</CardTitle>
              </CardHeader>
              <CardContent>
                {topCustomers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sales in period</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {topCustomers.map((c, i) => (
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
                        <span className="font-data text-xs">{formatMoney(c.revenue)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Top supplier spend</CardTitle>
              </CardHeader>
              <CardContent>
                {topSuppliers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No purchases in period</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {topSuppliers.map((s) => (
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
                <CardTitle className="text-nameplate text-sm">Best product profit</CardTitle>
              </CardHeader>
              <CardContent>
                {topProduct ? (
                  <div>
                    <p className="text-lg font-medium">{topProduct.name}</p>
                    <p className="font-data mt-1 text-sm">
                      Profit {formatMoney(topProduct.profit)}
                    </p>
                    <Link
                      href="/dashboard/reports/finance/profit"
                      className="mt-3 inline-block text-sm text-primary hover:underline"
                    >
                      Full product analysis →
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No product sales yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
