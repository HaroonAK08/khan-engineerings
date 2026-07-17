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

function monthDefaults() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

export default function PurchaseReportsPage() {
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
      toast.error(apiError(err, "Failed to load purchase report"));
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
      await downloadReportExport("purchases", { format, dateFrom, dateTo });
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
          <h1 className="text-nameplate text-xl">Purchase reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Scrap spend and rates by supplier.</p>
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
              { label: "Purchases", value: String(report.totals.purchaseCount) },
              { label: "Kg", value: formatKg(report.totals.totalKg) },
              { label: "Spend", value: formatMoney(report.totals.totalSpend) },
              { label: "Avg rate", value: formatMoney(report.totals.avgRate) },
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
              <CardTitle className="text-nameplate text-sm">By supplier</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Kg</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Avg rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.bySupplier.map((s) => (
                    <TableRow key={String(s.supplierId)}>
                      <TableCell>{s.name}</TableCell>
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
