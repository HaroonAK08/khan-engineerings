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
import { useI18n } from "@/hooks/use-i18n";

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
  const { t } = useI18n();
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
      toast.error(apiError(err, t("financeOverview.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, t]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function onExport(format: "xlsx" | "pdf") {
    setExporting(format);
    try {
      await downloadReportExport("finance", { format, dateFrom, dateTo });
      toast.success(t("common.downloaded", { format: format.toUpperCase() }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
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
            {t("common.financeEyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("financeOverview.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("financeOverview.subtitle")}</p>
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
                      ? t("financeOverview.profitPeriod")
                      : t("financeOverview.lossPeriod")}
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
                  {t("financeOverview.margin")}{" "}
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
                label: t("financeOverview.revenue"),
                value: formatMoney(overview.profitAndLoss.revenue),
                hint: t("financeOverview.invoicesOtherIncome"),
                accent: "bg-chart-1",
              },
              {
                label: t("financeOverview.cogsOps"),
                value: formatMoney(overview.profitAndLoss.cogs),
                hint: t("financeOverview.purchasesManufacturing"),
                accent: "bg-chart-4",
              },
              {
                label: t("financeOverview.cashIn"),
                value: formatMoney(overview.cashFlow.cashIn),
                hint: t("financeOverview.customerPaymentsOther"),
                accent: "bg-chart-3",
              },
              {
                label: t("financeOverview.cashOut"),
                value: formatMoney(overview.cashFlow.cashOut),
                hint: t("financeOverview.supplierPayMfgOther"),
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
                <CardTitle className="text-nameplate text-sm">{t("financeOverview.profitLoss")}</CardTitle>
                <CardDescription>{t("financeOverview.accrualView")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {[
                  [t("financeOverview.revenue"), overview.profitAndLoss.revenue],
                  [t("financeOverview.cogsLabel"), overview.profitAndLoss.cogs],
                  [t("financeOverview.grossProfit"), overview.profitAndLoss.grossProfit],
                  [t("financeOverview.otherExpenses"), overview.profitAndLoss.otherExpenses],
                  [t("financeOverview.netProfit"), overview.profitAndLoss.netProfit],
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
                <CardTitle className="text-nameplate text-sm">{t("financeOverview.cashFlow")}</CardTitle>
                <CardDescription>{t("financeOverview.moneyMoved")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {[
                  [t("financeOverview.cashIn"), overview.cashFlow.cashIn],
                  [t("financeOverview.cashOut"), overview.cashFlow.cashOut],
                  [t("financeOverview.netCash"), overview.cashFlow.net],
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
                  {t("financeOverview.customerPaymentsLbl")}{" "}
                  {formatMoney(overview.income.customerPayments)} ·{" "}
                  {t("financeOverview.supplierPaymentsLbl")}{" "}
                  {formatMoney(overview.expenses.supplierPayments)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">
                  {t("financeOverview.topRevenueCustomers")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topCustomers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("salesReports.noSalesPeriod")}</p>
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
                              {t("common.top")}
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
                <CardTitle className="text-nameplate text-sm">
                  {t("financeOverview.topSupplierSpend")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topSuppliers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("financeOverview.noPurchasesPeriod")}
                  </p>
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
                <CardTitle className="text-nameplate text-sm">
                  {t("financeOverview.bestProductProfit")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topProduct ? (
                  <div>
                    <p className="text-lg font-medium">{topProduct.name}</p>
                    <p className="font-data mt-1 text-sm">
                      {t("financeOverview.profitLabel")} {formatMoney(topProduct.profit)}
                    </p>
                    <Link
                      href="/dashboard/reports/finance/profit"
                      className="mt-3 inline-block text-sm text-primary hover:underline"
                    >
                      {t("financeOverview.fullProductAnalysis")}
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("financeOverview.noProductSales")}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
