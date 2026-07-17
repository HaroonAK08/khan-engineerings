"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiError, formatKg } from "@/lib/materials-api";
import { getProductionReport, listProducts } from "@/lib/production-api";
import type { Product, ProductionReport } from "@/types/production";
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

export default function ProductionReportsPage() {
  const [report, setReport] = useState<ProductionReport | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [product, setProduct] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { dateFrom?: string; dateTo?: string; product?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (product) params.product = product;
      const [reportData, productData] = await Promise.all([
        getProductionReport(params),
        listProducts(),
      ]);
      setReport(reportData);
      setProducts(productData);
    } catch (err) {
      toast.error(apiError(err, "Failed to load report"));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, product]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/production"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Production
        </Link>
        <h1 className="text-nameplate text-xl">Production reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Material used, waste, good pieces, and rejects.
        </p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-3">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
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
                label: "Raw material used",
                value: `${formatKg(report.totals.netConsumedKg)} kg`,
                hint: "net consumed (input − returned)",
                accent: "bg-chart-1",
              },
              {
                label: "Material wasted",
                value: `${formatKg(report.totals.materialLossKg)} kg`,
                hint: `${report.totals.lossRate}% of input`,
                accent: "bg-chart-4",
              },
              {
                label: "Finished pieces",
                value: String(report.totals.goodUnits),
                hint: "good units",
                accent: "bg-chart-3",
              },
              {
                label: "Defective pieces",
                value: String(report.totals.rejectedUnits),
                hint: `${report.totals.rejectRate}% reject rate`,
                accent: "bg-chart-2",
              },
            ].map((stat) => (
              <Card key={stat.label} className="relative overflow-hidden py-0">
                <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
                <CardContent className="p-5">
                  <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="font-data mt-2 text-2xl font-medium">{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Summary</CardTitle>
              <CardDescription>
                {report.totals.batchCount} batches · {formatKg(report.totals.inputScrapKg)} kg charged
                · {formatKg(report.totals.returnedScrapKg)} kg returned
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">By product</CardTitle>
            </CardHeader>
            <CardContent>
              {report.byProduct.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No production in this range
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Batches</TableHead>
                      <TableHead className="text-right">Used (kg)</TableHead>
                      <TableHead className="text-right">Loss (kg)</TableHead>
                      <TableHead className="text-right">Good</TableHead>
                      <TableHead className="text-right">Reject</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byProduct.map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.batchCount}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(row.netConsumedKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(row.materialLossKg)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.goodUnits}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.rejectedUnits}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
