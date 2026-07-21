"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import { getSalesReport, type SalesReport } from "@/lib/sales-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";

export default function SalesReportsPage() {
  const { t } = useI18n();
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      setReport(await getSalesReport(params));
    } catch (err) {
      toast.error(apiError(err, t("salesReports.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, t]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/orders"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {t("orders.title")}
        </Link>
        <h1 className="text-nameplate text-xl">{t("salesReports.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("salesReports.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </CardContent>
      </Card>

      {loading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: t("customerDetail.orders"), value: String(report.totals.orderCount), accent: "bg-chart-1" },
              {
                label: t("customerDetail.totalSales"),
                value: formatMoney(report.totals.totalSales),
                accent: "bg-chart-2",
              },
              {
                label: t("salesReports.collected"),
                value: formatMoney(report.totals.totalPaid),
                accent: "bg-chart-3",
              },
              {
                label: t("dash.outstanding"),
                value: formatMoney(report.totals.outstanding),
                accent: "bg-chart-4",
              },
            ].map((stat) => (
              <Card key={stat.label} className="relative overflow-hidden py-0">
                <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
                <CardContent className="p-5">
                  <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="font-data mt-2 text-2xl font-medium">{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">{t("salesReports.whoOwes")}</CardTitle>
              <CardDescription>{t("salesReports.whoOwesDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {report.whoOwes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("salesReports.noOutstanding")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.customer")}</TableHead>
                      <TableHead className="text-right">{t("salesReports.invoices")}</TableHead>
                      <TableHead className="text-right">{t("common.balance")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.whoOwes.map((row) => (
                      <TableRow key={row.customerId}>
                        <TableCell>
                          <Link
                            href={`/dashboard/customers/${row.customerId}`}
                            className="hover:text-primary hover:underline"
                          >
                            {row.name}
                          </Link>
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">{row.invoices}</TableCell>
                        <TableCell className="font-data text-right text-xs">
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
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">{t("salesReports.unpaidPartial")}</CardTitle>
            </CardHeader>
            <CardContent>
              {report.outstanding.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("salesReports.allPaid")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.invoice")}</TableHead>
                      <TableHead>{t("common.customer")}</TableHead>
                      <TableHead>{t("common.date")}</TableHead>
                      <TableHead className="text-right">{t("common.balance")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.outstanding.map((row) => (
                      <TableRow key={row.orderId}>
                        <TableCell>
                          <Link
                            href={`/dashboard/orders/${row.orderId}`}
                            className="font-data text-xs hover:text-primary hover:underline"
                          >
                            {row.invoiceNo}
                          </Link>
                        </TableCell>
                        <TableCell>{row.customer}</TableCell>
                        <TableCell className="font-data text-xs">
                          {formatDate(row.orderDate)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(row.balance)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-data text-[9px] uppercase">
                            {row.paymentStatus}
                          </Badge>
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
              <CardTitle className="text-nameplate text-sm">{t("dash.topCustomers")}</CardTitle>
              <CardDescription>{t("salesReports.topCustomersDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {report.topCustomers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("salesReports.noSalesPeriod")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.customer")}</TableHead>
                      <TableHead className="text-right">{t("customerDetail.orders")}</TableHead>
                      <TableHead className="text-right">{t("salesReports.sales")}</TableHead>
                      <TableHead className="text-right">{t("dash.outstanding")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.topCustomers.map((row, i) => (
                      <TableRow key={row.customerId}>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <Link
                              href={`/dashboard/customers/${row.customerId}`}
                              className="hover:text-primary hover:underline"
                            >
                              {row.name}
                            </Link>
                            {i === 0 && (
                              <Badge variant="secondary" className="font-data text-[9px]">
                                {t("common.top")}
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.orderCount}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(row.totalSales)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(row.outstanding)}
                        </TableCell>
                      </TableRow>
                    ))}
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
