"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatKg } from "@/lib/materials-api";
import { getProductionReport } from "@/lib/production-api";
import type { ProductionReport } from "@/types/production";
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

function monthDefaults() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

export default function ProductionReportsHubPage() {
  const d = monthDefaults();
  const [dateFrom, setDateFrom] = useState(d.from);
  const [dateTo, setDateTo] = useState(d.to);
  const [report, setReport] = useState<ProductionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getProductionReport({ dateFrom, dateTo }));
    } catch (err) {
      toast.error(apiError(err, "Failed to load production report"));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function onExport(format: "xlsx" | "pdf") {
    setExporting(format);
    try {
      await downloadReportExport("production", { format, dateFrom, dateTo });
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (err) {
      toast.error(apiError(err, "Export failed"));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">Production reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Material used and pieces produced.</p>
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
              { label: "Runs", value: String(report.totals.batchCount) },
              {
                label: "Pieces",
                value: String(report.totals.finishedUnits ?? report.totals.goodUnits),
              },
              {
                label: "Waste %",
                value: `${report.totals.lossRate ?? 0}%`,
              },
              {
                label: "Material used",
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
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">By product</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">Pieces</TableHead>
                    <TableHead className="text-right">Used kg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report.byProduct || []).map((p) => (
                    <TableRow key={String(p.productId)}>
                      <TableCell>{p.name}</TableCell>
                      <TableCell className="font-data text-right text-xs">{p.batchCount}</TableCell>
                      <TableCell className="font-data text-right text-xs">{p.goodUnits}</TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatKg(p.netConsumedKg)}
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
