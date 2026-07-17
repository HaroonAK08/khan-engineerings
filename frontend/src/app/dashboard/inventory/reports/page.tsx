"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { InventorySubnav } from "@/components/layout/inventory-subnav";
import { apiError, formatDate, formatKg, formatMoney, getPurchaseReport } from "@/lib/materials-api";
import { getLiveInventoryReport, type InventoryReport } from "@/lib/inventory-api";
import type { PurchaseReport } from "@/types/materials";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function InventoryReportsPage() {
  const [report, setReport] = useState<InventoryReport | null>(null);
  const [purchaseReport, setPurchaseReport] = useState<PurchaseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const [live, purchases] = await Promise.all([
        getLiveInventoryReport(params),
        getPurchaseReport(params),
      ]);
      setReport(live);
      setPurchaseReport(purchases);
    } catch (err) {
      toast.error(apiError(err, "Failed to load reports"));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <InventorySubnav />
      <div>
        <h1 className="text-nameplate text-xl">Inventory reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stock on hand, low items, and what was produced this period.
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </CardContent>
      </Card>

      {loading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Scrap available",
                value: `${formatKg(report.raw.availableKg ?? report.raw.totalKg)} kg`,
                accent: "bg-chart-1",
              },
              {
                label: "Finished on hand",
                value: `${report.finishedStock.totalUnits} pcs`,
                accent: "bg-chart-3",
              },
              {
                label: "Produced (period)",
                value: String(report.producedThisPeriod.totals.goodUnits),
                accent: "bg-chart-2",
              },
              {
                label: "Low stock SKUs",
                value: String(report.lowStock.length),
                accent: "bg-chart-4",
              },
            ].map((stat) => (
              <Card key={stat.label} className="relative overflow-hidden py-0">
                <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
                <CardContent className="p-5">
                  <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="font-data mt-2 text-2xl font-medium">{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Produced this period</CardTitle>
              <CardDescription>
                {formatDate(report.period.from)} → {formatDate(report.period.to)} ·{" "}
                {report.producedThisPeriod.totals.batchCount} batches
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.producedThisPeriod.byProduct.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No production in this period
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Batches</TableHead>
                      <TableHead className="text-right">Good</TableHead>
                      <TableHead className="text-right">Reject</TableHead>
                      <TableHead className="text-right">Scrap used</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.producedThisPeriod.byProduct.map((row) => (
                      <TableRow key={String(row.productId)}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.batchCount}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.goodUnits}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.rejectedUnits}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(row.netConsumedKg)} kg
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {report.lowStock.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Running low</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {report.lowStock.map((item) => (
                  <Badge key={`${item.productId}-${item.warehouseId}`} variant="destructive">
                    {item.name}: {item.quantity}/{item.lowStockThreshold}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          {purchaseReport && (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Scrap purchases (period)</CardTitle>
                <CardDescription>
                  {purchaseReport.totals.purchaseCount} purchases ·{" "}
                  {formatKg(purchaseReport.totals.totalKg)} kg ·{" "}
                  {formatMoney(purchaseReport.totals.totalSpend)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/dashboard/inventory/purchases" className="text-sm text-primary hover:underline">
                  Open purchases →
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
