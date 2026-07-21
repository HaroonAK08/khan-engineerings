"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import { getSalesReport, type SalesReport } from "@/lib/sales-api";
import { downloadReportExport } from "@/lib/reports-api";
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

function monthDefaults() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function SalesReportsHubPage() {
  const { t } = useI18n();
  const defaults = monthDefaults();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getSalesReport({ dateFrom, dateTo }));
    } catch (err) {
      toast.error(apiError(err, t("salesReportsHub.loadFailed")));
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
      await downloadReportExport("sales", { format, dateFrom, dateTo });
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("rep.salesTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("salesReportsHub.subtitle")}</p>
        </div>
        <ExportButtons exporting={exporting} onExport={onExport} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      {loading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: t("customerDetail.orders"), value: String(report.totals.orderCount) },
              { label: t("salesReports.sales"), value: formatMoney(report.totals.totalSales) },
              { label: t("salesReports.collected"), value: formatMoney(report.totals.totalPaid) },
              { label: t("dash.outstanding"), value: formatMoney(report.totals.outstanding) },
            ].map((s) => (
              <Card key={s.label} className="py-0">
                <CardContent className="p-4">
                  <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                    {s.label}
                  </p>
                  <p className="font-data mt-1 text-xl">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">
                {t("salesReportsHub.outstandingInvoices")}
              </CardTitle>
              <CardDescription>{t("salesReportsHub.unpaidDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.invoice")}</TableHead>
                    <TableHead>{t("common.customer")}</TableHead>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead className="text-right">{t("common.balance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.outstanding.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        {t("salesReportsHub.none")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.outstanding.map((o) => (
                      <TableRow key={o.orderId}>
                        <TableCell>
                          <Link
                            href={`/dashboard/orders/${o.orderId}`}
                            className="font-data text-xs hover:underline"
                          >
                            {o.invoiceNo}
                          </Link>
                        </TableCell>
                        <TableCell>{o.customer}</TableCell>
                        <TableCell className="font-data text-xs">
                          {formatDate(o.orderDate)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(o.balance)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
