"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  ReportViewToggle,
  type ReportViewMode,
} from "@/components/reports/report-view-toggle";
import {
  apiError,
  formatDate,
  formatMoney,
  formatKg,
  getPurchaseReport,
} from "@/lib/materials-api";
import type { PurchaseReport } from "@/types/materials";
import { downloadReportExport } from "@/lib/reports-api";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";

export default function PurchaseReportsPage() {
  const { t } = useI18n();
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();
  const [supplierId, setSupplierId] = useState("");
  const [view, setView] = useState<ReportViewMode>("whole");
  const [report, setReport] = useState<PurchaseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      setReport(
        await getPurchaseReport({
          dateFrom,
          dateTo,
          supplier: supplierId || undefined,
        })
      );
    } catch (err) {
      toast.error(apiError(err, t("purchReports.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, hydrated, supplierId, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function onExport(format: "pdf") {
    setExporting(format);
    try {
      await downloadReportExport("purchases", {
        format,
        dateFrom,
        dateTo,
        supplier: supplierId || undefined,
        view: supplierId ? "party" : view,
      });
      toast.success(t("common.downloaded", { format: format.toUpperCase() }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setExporting(null);
    }
  }

  function openSupplier(s: { supplierId: string; name: string }) {
    if (!s.supplierId) return;
    setSupplierId(s.supplierId);
    setView("party");
  }

  function backToSuppliers() {
    setSupplierId("");
    setView("party");
  }

  const byParty = report?.byParty || [];
  const records = report?.records || [];
  const drilledSupplier = Boolean(supplierId);

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("rep.purchaseTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("purchReports.subtitle")}</p>
        </div>
        <ExportButtons exporting={exporting} onExport={onExport} />
      </div>
      <DateRangeFilter />
      <ReportViewToggle
        value={view}
        onChange={(next) => {
          setSupplierId("");
          setView(next);
        }}
        modes={["whole", "party"]}
      />

      {drilledSupplier ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={backToSuppliers}>
            {t("purchReports.backToSuppliers")}
          </Button>
          <p className="text-sm text-muted-foreground">
            {report?.party?.name || t("common.supplier")}
          </p>
          {report?.party?.id ? (
            <Link
              href={`/dashboard/suppliers/${report.party.id}`}
              className="text-sm text-primary hover:underline"
            >
              {t("purchReports.openSupplierPage")}
            </Link>
          ) : null}
        </div>
      ) : null}

      {loading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: t("purchases.count"), value: String(report.totals.purchaseCount) },
              { label: t("purchReports.kg"), value: formatKg(report.totals.totalKg) },
              { label: t("purchReports.spend"), value: formatMoney(report.totals.totalSpend) },
              { label: t("purchReports.avgRate"), value: formatMoney(report.totals.avgRate) },
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

          {view === "party" && !drilledSupplier ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">{t("purchReports.bySupplier")}</CardTitle>
                <CardDescription>{t("purchReports.clickSupplier")}</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.supplier")}</TableHead>
                      <TableHead className="text-right">{t("purchReports.count")}</TableHead>
                      <TableHead className="text-right">{t("purchReports.kg")}</TableHead>
                      <TableHead className="text-right">{t("purchReports.spend")}</TableHead>
                      <TableHead className="text-right">{t("purchReports.avgRate")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byParty.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          {t("purchReports.none")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      byParty.map((s) => (
                        <TableRow
                          key={s.supplierId || s.name}
                          tabIndex={0}
                          className="cursor-pointer"
                          onClick={() => openSupplier(s)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openSupplier(s);
                            }
                          }}
                        >
                          <TableCell className="font-medium text-primary underline-offset-2 hover:underline">
                            {s.name}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {s.purchaseCount}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatKg(s.totalKg)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(s.totalSpend)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(s.avgRate)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {byParty.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-medium">{t("recvReports.grandTotal")}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {report.totals.purchaseCount}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(report.totals.totalKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.totals.totalSpend)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.totals.avgRate)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {(view === "whole" || drilledSupplier) && !loading ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">
                  {drilledSupplier
                    ? t("purchReports.supplierRecords", {
                        name: report.party?.name || t("common.supplier"),
                      })
                    : t("purchReports.allRecords")}
                </CardTitle>
                <CardDescription>
                  {drilledSupplier
                    ? t("purchReports.supplierPdfHint")
                    : t("purchReports.allRecordsDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.date")}</TableHead>
                      {!drilledSupplier ? (
                        <TableHead>{t("common.supplier")}</TableHead>
                      ) : null}
                      <TableHead>{t("prod.chargeMaterial")}</TableHead>
                      <TableHead className="text-right">{t("purchReports.kg")}</TableHead>
                      <TableHead className="text-right">{t("purchReports.avgRate")}</TableHead>
                      <TableHead className="text-right">{t("purchReports.spend")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={drilledSupplier ? 5 : 6}
                          className="text-muted-foreground"
                        >
                          {t("purchReports.none")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      records.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-data text-xs whitespace-nowrap">
                            {formatDate(r.date)}
                          </TableCell>
                          {!drilledSupplier ? (
                            <TableCell className="text-sm">{r.supplierName}</TableCell>
                          ) : null}
                          <TableCell className="capitalize text-muted-foreground">
                            {r.materialType || "scrap"}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatKg(r.quantityKg)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(r.ratePerKg)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(r.spend)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {records.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell
                          colSpan={drilledSupplier ? 3 : 4}
                          className="font-medium"
                        >
                          {t("recvReports.grandTotal")}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(report.totals.totalKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.totals.avgRate)}
                        </TableCell>
                        <TableCell className="font-data text-right text-sm font-medium">
                          {formatMoney(report.totals.totalSpend)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
