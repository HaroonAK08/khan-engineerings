"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatKg } from "@/lib/materials-api";
import { getProductionReport } from "@/lib/production-api";
import type { ProductionReport } from "@/types/production";
import { downloadReportExport } from "@/lib/reports-api";
import { currentMonthRange } from "@/lib/date-range";
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

export default function ProductionReportsHubPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const d = currentMonthRange();
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") || d.from);
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") || d.to);
  const [report, setReport] = useState<ProductionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getProductionReport({ dateFrom, dateTo }));
    } catch (err) {
      toast.error(apiError(err, t("prodReportsHub.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, t]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const hubProducts = useMemo(
    () => (report?.byProduct || []).filter((p) => (p.family || "hub") === "hub"),
    [report]
  );
  const drumProducts = useMemo(
    () => (report?.byProduct || []).filter((p) => p.family === "drum"),
    [report]
  );

  async function onExport(format: "pdf") {
    setExporting(format);
    try {
      await downloadReportExport("production", { format, dateFrom, dateTo });
      toast.success(t("common.downloaded", { format: format.toUpperCase() }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setExporting(null);
    }
  }

  function renderFamilyTable(
    family: "hub" | "drum",
    rows: NonNullable<ProductionReport["byProduct"]>
  ) {
    const title = family === "hub" ? t("prod.hub") : t("prod.drum");
    const accent =
      family === "hub"
        ? "border-sky-500/30 bg-sky-500/5"
        : "border-amber-500/30 bg-amber-500/5";

    return (
      <Card className={accent}>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              {t("prodReports.noProdRange")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.product")}</TableHead>
                  <TableHead className="text-right">{t("prodReports.runs")}</TableHead>
                  <TableHead className="text-right">{t("prodReports.pieces")}</TableHead>
                  <TableHead className="text-right">{t("prodReportsHub.usedKg")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const href = `/dashboard/reports/production/${p.productId}?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`;
                  return (
                    <TableRow
                      key={String(p.productId)}
                      className="cursor-pointer hover:bg-muted/50"
                    >
                      <TableCell>
                        <Link href={href} className="block font-medium hover:underline">
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        <Link href={href} className="block">
                          {p.batchCount}
                        </Link>
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        <Link href={href} className="block">
                          {p.goodUnits}
                        </Link>
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        <Link href={href} className="block">
                          {formatKg(p.netConsumedKg)}
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("prodReports.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("prodReportsHub.subtitle")}</p>
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
              { label: t("prodReports.runs"), value: String(report.totals.batchCount) },
              {
                label: t("prodReports.pieces"),
                value: String(report.totals.finishedUnits ?? report.totals.goodUnits),
              },
              {
                label: t("prod.wastePercent"),
                value: `${report.totals.lossRate ?? 0}%`,
              },
              {
                label: t("prodReports.materialUsed"),
                value: `${formatKg(report.totals.netConsumedKg ?? report.totals.totalInputKg ?? 0)} kg`,
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
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-sky-500/30 bg-sky-500/5 py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("prod.hub")}
                </p>
                <p className="font-data mt-1 text-xl">
                  {report.totals.byFamily?.hub ?? 0} {t("prodReports.runs").toLowerCase()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {hubProducts.reduce((s, p) => s + p.goodUnits, 0)} {t("prodReports.pieces").toLowerCase()}
                </p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/30 bg-amber-500/5 py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("prod.drum")}
                </p>
                <p className="font-data mt-1 text-xl">
                  {report.totals.byFamily?.drum ?? 0} {t("prodReports.runs").toLowerCase()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {drumProducts.reduce((s, p) => s + p.goodUnits, 0)} {t("prodReports.pieces").toLowerCase()}
                </p>
              </CardContent>
            </Card>
          </div>
          {renderFamilyTable("hub", hubProducts)}
          {renderFamilyTable("drum", drumProducts)}
        </>
      )}
    </div>
  );
}
