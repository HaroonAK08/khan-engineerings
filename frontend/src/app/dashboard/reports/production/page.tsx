"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DateRangeFilter } from "@/components/date-range-filter";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";
import { getProductionReport } from "@/lib/production-api";
import type { ProductionReport } from "@/types/production";
import { downloadReportExport } from "@/lib/reports-api";
import { Card, CardContent } from "@/components/ui/card";
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

export default function ProductionReportsHubPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { dateFrom, dateTo, setRange, hydrated } = usePersistedDateRange();
  const [report, setReport] = useState<ProductionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  useEffect(() => {
    const from = searchParams.get("dateFrom");
    const to = searchParams.get("dateTo");
    if (from || to) setRange(from || "", to || "");
  }, [searchParams, setRange]);

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      setReport(await getProductionReport({ dateFrom, dateTo }));
    } catch (err) {
      toast.error(apiError(err, t("prodReportsHub.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, hydrated, t]);

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
    const isDrum = family === "drum";
    const headerBg = isDrum ? "bg-yellow-500" : "bg-sky-600";
    const headerText = isDrum ? "text-yellow-950" : "text-white";
    const totals = rows.reduce(
      (acc, p) => {
        acc.pieces += p.goodUnits || 0;
        acc.materialKg += family === "hub" ? p.scrapKg ?? 0 : p.daigKg ?? 0;
        acc.soldPrice += p.soldPrice ?? 0;
        acc.unitsSold += p.unitsSold ?? 0;
        return acc;
      },
      { pieces: 0, materialKg: 0, soldPrice: 0, unitsSold: 0 }
    );
    const avgSell =
      totals.unitsSold > 0 ? totals.soldPrice / totals.unitsSold : 0;

    return (
      <Card className="gap-0 overflow-visible py-0">
        <div className={`sticky top-0 z-20 rounded-t-xl shadow-md ${headerBg} ${headerText}`}>
          <div className="px-4 py-3 sm:px-5">
            <h2 className="text-nameplate text-base tracking-[0.12em] uppercase sm:text-lg">
              {title}
            </h2>
          </div>
        </div>
        <CardContent className="px-0 pt-0">
          {rows.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              {t("prodReports.noProdRange")}
            </p>
          ) : (
            <Table containerClassName="overflow-visible">
              <TableHeader className="sticky top-12 z-10 shadow-sm [&_tr]:border-b-0">
                <TableRow className={`hover:bg-transparent ${headerBg}`}>
                  <TableHead className={`${headerBg} ${headerText} font-semibold`}>
                    {t("common.product")}
                  </TableHead>
                  <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                    {t("prodReports.pieces")}
                  </TableHead>
                  <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                    {family === "hub" ? t("prod.scrap") : t("prod.daig")}
                  </TableHead>
                  <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                    {t("prodMargin.sellPerPiece")}
                  </TableHead>
                  <TableHead className={`${headerBg} ${headerText} text-right font-semibold`}>
                    {t("prodMargin.sellValue")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const href = `/dashboard/reports/production/${p.productId}?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`;
                  return (
                    <TableRow
                      key={String(p.productId)}
                      className={
                        isDrum
                          ? "cursor-pointer border-yellow-500/20 bg-yellow-400/15 hover:bg-yellow-400/25"
                          : "cursor-pointer border-sky-500/10 bg-sky-500/5 hover:bg-sky-500/10"
                      }
                    >
                      <TableCell>
                        <Link href={href} className="block font-medium hover:underline">
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        <Link href={href} className="block">
                          {p.goodUnits}
                        </Link>
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        <Link href={href} className="block">
                          {formatKg(family === "hub" ? (p.scrapKg ?? 0) : (p.daigKg ?? 0))}
                        </Link>
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        <Link href={href} className="block">
                          {formatMoney(p.avgSellPerPiece ?? 0)}
                        </Link>
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        <Link href={href} className="block">
                          {formatMoney(p.soldPrice ?? 0)}
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow
                  className={
                    isDrum
                      ? "bg-yellow-400/20 font-medium hover:bg-yellow-400/20"
                      : "bg-sky-600/15 font-medium hover:bg-sky-600/15"
                  }
                >
                  <TableCell>{t("prodMargin.total")}</TableCell>
                  <TableCell className="font-data text-right text-xs">{totals.pieces}</TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatKg(totals.materialKg)}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatMoney(avgSell)}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatMoney(totals.soldPrice)}
                  </TableCell>
                </TableRow>
              </TableFooter>
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
      <DateRangeFilter />
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
            <Card className="border-yellow-500/30 bg-yellow-400/10 py-0">
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
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-emerald-500/30 bg-emerald-500/5 py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("prod.scrap")}
                </p>
                <p className="font-data mt-1 text-xl">
                  {formatKg(
                    report.totals.byMaterial?.scrap ??
                      report.totals.scrapKg ??
                      0
                  )}{" "}
                  kg
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("prodReports.materialUsed").toLowerCase()}
                </p>
              </CardContent>
            </Card>
            <Card className="border-violet-500/30 bg-violet-500/5 py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("prod.daig")}
                </p>
                <p className="font-data mt-1 text-xl">
                  {formatKg(
                    report.totals.byMaterial?.daig ?? report.totals.daigKg ?? 0
                  )}{" "}
                  kg
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("prodReports.materialUsed").toLowerCase()}
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
