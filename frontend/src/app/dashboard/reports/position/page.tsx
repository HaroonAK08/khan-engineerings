"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import { downloadReportExport, getPositionReport, type PositionReport } from "@/lib/reports-api";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";

export default function PositionReportPage() {
  const { t } = useI18n();
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();
  const [report, setReport] = useState<PositionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const params: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      setReport(await getPositionReport(params));
    } catch (err) {
      toast.error(apiError(err, t("posReports.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, hydrated, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function onExport(format: "pdf") {
    setExporting(format);
    try {
      await downloadReportExport("position", {
        format,
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

  const addedAssets = report?.assets.added || [];

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("rep.positionTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("posReports.subtitle")}</p>
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-nameplate text-sm">{t("posReports.money")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    label: t("posReports.receivable"),
                    value: formatMoney(report.totals.totalReceivable),
                  },
                  {
                    label: t("posReports.payable"),
                    value: formatMoney(report.totals.totalPayable),
                  },
                  {
                    label: t("posReports.creditHeld"),
                    value: formatMoney(report.totals.creditHeld),
                    hint: t("posReports.creditHeldHint"),
                  },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-border/70 px-4 py-3">
                    <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                      {s.label}
                    </p>
                    <p className="font-data mt-1 text-xl">{s.value}</p>
                    {"hint" in s && s.hint ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">{s.hint}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-nameplate text-sm">{t("posReports.inventory")}</CardTitle>
              <CardDescription>{t("posReports.inventoryHint")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div>
                <p className="mb-2 text-sm font-medium">{t("posReports.raw")}</p>
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("posReports.raw")}</TableHead>
                        <TableHead className="text-right">{t("posReports.kg")}</TableHead>
                        <TableHead className="text-right">{t("posReports.purchaseValue")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>{t("posReports.scrap")}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {report.inventory.scrap.kg}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.inventory.scrap.value)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>{t("posReports.daig")}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {report.inventory.daig.kg}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.inventory.daig.value)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">{t("posReports.rawTotal")}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {Number(
                            (
                              Number(report.inventory.scrap.kg) + Number(report.inventory.daig.kg)
                            ).toFixed(3)
                          )}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.inventory.rawValue)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{t("posReports.finished")}</p>
                <div className="overflow-hidden rounded-lg border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("posReports.finished")}</TableHead>
                        <TableHead className="text-right">{t("posReports.units")}</TableHead>
                        <TableHead className="text-right">{t("posReports.saleValue")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>{t("posReports.hub")}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {report.inventory.hub.units}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.inventory.hub.saleValue)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>{t("posReports.drum")}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {report.inventory.drum.units}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.inventory.drum.saleValue)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">
                          {t("posReports.altogether")}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {report.inventory.finished.units}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.inventory.finished.saleValue)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-nameplate text-sm">{t("posReports.assets")}</CardTitle>
                  <CardDescription className="mt-1">{t("posReports.assetsHint")}</CardDescription>
                </div>
                <Link
                  href="/dashboard/finance/assets"
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm hover:bg-muted"
                >
                  {t("posReports.assetsOpen")}
                </Link>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    label: t("posReports.assetsTotal"),
                    value: formatMoney(report.assets.total),
                  },
                  {
                    label: t("posReports.assetsIncreased"),
                    value: formatMoney(report.assets.increased),
                  },
                  {
                    label: t("posReports.newItems"),
                    value: String(report.assets.newItemCount),
                  },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-border/70 px-4 py-3">
                    <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                      {s.label}
                    </p>
                    <p className="font-data mt-1 text-xl">{s.value}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">{t("posReports.addedThisPeriod")}</p>
                {addedAssets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("posReports.noAddedAssets")}</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("assets.col.name")}</TableHead>
                          <TableHead className="text-right">{t("assets.col.qty")}</TableHead>
                          <TableHead className="text-right">{t("assets.col.value")}</TableHead>
                          <TableHead className="text-right">{t("assets.col.date")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {addedAssets.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <p>{item.name}</p>
                              {item.category ? (
                                <p className="text-[11px] text-muted-foreground">{item.category}</p>
                              ) : null}
                            </TableCell>
                            <TableCell className="font-data text-right text-xs">
                              {item.quantity}
                            </TableCell>
                            <TableCell className="font-data text-right text-xs">
                              {formatMoney(item.value)}
                            </TableCell>
                            <TableCell className="font-data text-right text-xs">
                              {formatDate(item.date)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
