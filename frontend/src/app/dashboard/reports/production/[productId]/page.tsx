"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatDate, formatKg } from "@/lib/materials-api";
import { getProductProductionReport, type ProductProductionReport } from "@/lib/production-api";
import { downloadReportExport } from "@/lib/reports-api";
import { currentMonthRange } from "@/lib/date-range";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function ProductProductionReportPage() {
  const { t } = useI18n();
  const params = useParams<{ productId: string }>();
  const searchParams = useSearchParams();
  const productId = params.productId;
  const defaults = currentMonthRange();

  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") || defaults.from);
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") || defaults.to);
  const [report, setReport] = useState<ProductProductionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      setReport(
        await getProductProductionReport(productId, {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        })
      );
    } catch (err) {
      toast.error(apiError(err, t("prodProductReport.loadFailed")));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [productId, dateFrom, dateTo, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function onExport(format: "pdf") {
    if (!productId) return;
    setExporting(format);
    try {
      await downloadReportExport("production", {
        format,
        product: productId,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      toast.success(t("common.downloaded", { format: format.toUpperCase() }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setExporting(null);
    }
  }

  const backHref = `/dashboard/reports/production?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`;

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t("prodReports.title")}
          </Link>
          <h1 className="text-nameplate text-xl">
            {report?.product.name || t("prodProductReport.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("prodProductReport.subtitle")}
          </p>
          {report?.product && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-data text-[10px] uppercase">
                {report.product.family}
              </Badge>
              {report.product.weightKg != null && Number(report.product.weightKg) > 0 && (
                <span className="font-data text-xs text-muted-foreground">
                  {formatKg(Number(report.product.weightKg))} kg
                </span>
              )}
            </div>
          )}
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
              { label: t("prodReports.runs"), value: String(report.totals.runCount) },
              { label: t("prodReports.pieces"), value: String(report.totals.pieces) },
              {
                label: t("prod.wastePercent"),
                value: `${report.totals.wastePercent}%`,
              },
              {
                label: t("prodReports.materialUsed"),
                value: `${formatKg(report.totals.usedKg)} kg`,
              },
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
                {t("prodProductReport.byDate")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {report.byDate.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  {t("prodReports.noProdRange")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("prod.col.date")}</TableHead>
                      <TableHead className="text-right">{t("prodReports.runs")}</TableHead>
                      <TableHead className="text-right">{t("prodReports.pieces")}</TableHead>
                      <TableHead className="text-right">{t("prodReportsHub.usedKg")}</TableHead>
                      <TableHead className="text-right">{t("prodProductReport.wasteKg")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byDate.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell className="font-data text-xs">
                          {formatDate(row.date)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">{row.runs}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.quantity}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(row.usedKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(row.wasteKg)}
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
              <CardTitle className="text-nameplate text-sm">
                {t("prodProductReport.runDetails")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {report.runs.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                  {t("prodReports.noProdRange")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("prod.col.date")}</TableHead>
                      <TableHead className="text-right">{t("prod.col.qty")}</TableHead>
                      <TableHead className="text-right">{t("prodReportsHub.usedKg")}</TableHead>
                      <TableHead className="text-right">{t("prodProductReport.wasteKg")}</TableHead>
                      <TableHead className="text-right">{t("prod.wastePercent")}</TableHead>
                      <TableHead>{t("prod.chargeMaterial")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="font-data text-xs">
                          {formatDate(run.productionDate)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {run.quantity}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(run.usedKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(run.wasteKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {run.wastePercent}%
                        </TableCell>
                        <TableCell className="text-xs capitalize">{run.materialType}</TableCell>
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
