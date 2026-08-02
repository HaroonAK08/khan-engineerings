"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatKg } from "@/lib/materials-api";
import { getLiveInventoryReport, type InventoryReport } from "@/lib/inventory-api";
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

function scrapKgOf(report: InventoryReport) {
  return (
    report.raw?.scrapKg ??
    report.raw?.byMaterial?.scrap?.availableKg ??
    report.raw?.availableKg ??
    report.raw?.totalKg ??
    0
  );
}

function daigKgOf(report: InventoryReport) {
  return report.raw?.daigKg ?? report.raw?.byMaterial?.daig?.availableKg ?? 0;
}

export default function InventoryReportsHubPage() {
  const { t } = useI18n();
  const d = currentMonthRange();
  const [dateFrom, setDateFrom] = useState(d.from);
  const [dateTo, setDateTo] = useState(d.to);
  const [report, setReport] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getLiveInventoryReport({ dateFrom, dateTo }));
    } catch (err) {
      toast.error(apiError(err, t("invReportsHub.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function onExport(format: "pdf") {
    setExporting(format);
    try {
      await downloadReportExport("inventory", { format, dateFrom, dateTo });
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
          <h1 className="text-nameplate text-xl">{t("rep.invTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("invReportsHub.subtitle")}</p>
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
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {[
              {
                label: t("invReportsHub.rawScrap"),
                value: `${formatKg(scrapKgOf(report))} kg`,
              },
              {
                label: t("invReportsHub.rawDaig"),
                value: `${formatKg(daigKgOf(report))} kg`,
              },
              {
                label: t("invReportsHub.finishedHub"),
                value: String(Math.round(report.finishedStock?.hubUnits ?? 0)),
              },
              {
                label: t("invReportsHub.finishedDrum"),
                value: String(Math.round(report.finishedStock?.drumUnits ?? 0)),
              },
              {
                label: t("invReportsHub.finishedTotal"),
                value: String(Math.round(report.finishedStock?.totalUnits ?? 0)),
              },
              {
                label: t("invReportsHub.lowStockSkus"),
                value: String(report.lowStock?.length ?? 0),
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
              <CardTitle className="text-nameplate text-sm">{t("dash.finishedGoods")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.product")}</TableHead>
                    <TableHead>{t("invReportsHub.type")}</TableHead>
                    <TableHead className="text-right">{t("common.qty")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report.finishedStock?.items || []).map((i) => (
                    <TableRow key={`${i.productId}-${i.warehouseId}`}>
                      <TableCell>{i.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {i.family === "drum" ? t("invReportsHub.drum") : t("invReportsHub.hub")}
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">{i.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
