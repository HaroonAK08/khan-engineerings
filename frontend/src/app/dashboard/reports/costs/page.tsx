"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatMoney } from "@/lib/materials-api";
import { getCostReport } from "@/lib/production-api";
import type { CostReport } from "@/types/production";
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

export default function ExpenseReportsPage() {
  const { t } = useI18n();
  const d = monthDefaults();
  const [dateFrom, setDateFrom] = useState(d.from);
  const [dateTo, setDateTo] = useState(d.to);
  const [report, setReport] = useState<CostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getCostReport({ dateFrom, dateTo }));
    } catch (err) {
      toast.error(apiError(err, t("expReports.loadFailed")));
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
      await downloadReportExport("expenses", { format, dateFrom, dateTo });
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
          <h1 className="text-nameplate text-xl">{t("expReports.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("expReports.subtitle")}</p>
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
          <div className="grid grid-cols-2 gap-3">
            <Card className="py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("expReports.totalOperating")}
                </p>
                <p className="font-data mt-1 text-xl">
                  {formatMoney(report.totals.totalOperatingCost)}
                </p>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("expReports.expenseLines")}
                </p>
                <p className="font-data mt-1 text-xl">{report.totals.expenseCount}</p>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">{t("expReports.byStage")}</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("costReports.stage")}</TableHead>
                      <TableHead className="text-right">{t("common.amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byStage.map((s) => (
                      <TableRow key={s.stage}>
                        <TableCell>{s.label}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(s.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">{t("expReports.byCategory")}</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.category")}</TableHead>
                      <TableHead className="text-right">{t("common.amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byCategory.map((c) => (
                      <TableRow key={c.category}>
                        <TableCell>{c.label}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(c.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
