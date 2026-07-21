"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatMoney, formatKg, getPurchaseReport } from "@/lib/materials-api";
import type { PurchaseReport } from "@/types/materials";
import { downloadReportExport } from "@/lib/reports-api";
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

function monthDefaults() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

export default function PurchaseReportsPage() {
  const { t } = useI18n();
  const d = monthDefaults();
  const [dateFrom, setDateFrom] = useState(d.from);
  const [dateTo, setDateTo] = useState(d.to);
  const [report, setReport] = useState<PurchaseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getPurchaseReport({ dateFrom, dateTo }));
    } catch (err) {
      toast.error(apiError(err, t("purchReports.loadFailed")));
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
      await downloadReportExport("purchases", { format, dateFrom, dateTo });
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
          <h1 className="text-nameplate text-xl">{t("rep.purchaseTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("purchReports.subtitle")}</p>
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
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">{t("purchReports.bySupplier")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.supplier")}</TableHead>
                    <TableHead>{t("prod.chargeMaterial")}</TableHead>
                    <TableHead className="text-right">{t("purchReports.count")}</TableHead>
                    <TableHead className="text-right">{t("purchReports.kg")}</TableHead>
                    <TableHead className="text-right">{t("purchReports.spend")}</TableHead>
                    <TableHead className="text-right">{t("purchReports.avgRate")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.bySupplier.map((s, i) => (
                    <TableRow key={`${String(s.supplierId)}-${s.materialType || "scrap"}-${i}`}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {s.materialType || "scrap"}
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
