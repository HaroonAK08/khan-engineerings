"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { apiError, formatMoney } from "@/lib/materials-api";
import { getProductProfit } from "@/lib/finance-api";
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

function monthDefaults() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function ProductProfitPage() {
  const defaults = monthDefaults();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [products, setProducts] = useState<
    Array<{
      productId: string;
      name: string;
      revenue: number;
      unitsSold: number;
      goodUnitsProduced: number;
      operatingCost: number;
      materialCostShare: number;
      totalCost: number;
      profit: number;
      marginPct: number | null;
    }>
  >([]);
  const [topEarner, setTopEarner] = useState<{
    name: string;
    profit: number;
    revenue: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProductProfit({ dateFrom, dateTo });
      setProducts(data.products);
      setTopEarner(data.topEarner);
    } catch (err) {
      toast.error(apiError(err, "Failed to load product profitability"));
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
      <ReportsSubnav />
      <FinanceSubnav />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            Phase 7 · Finance
          </p>
          <h1 className="text-nameplate text-xl">Product profitability</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Which SKU earns the most after manufacturing cost share.
          </p>
        </div>
        <div className="flex gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {topEarner && (
        <Card className="border-chart-3/40">
          <CardContent className="p-5">
            <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
              Top earner
            </p>
            <p className="mt-1 text-lg font-medium">{topEarner.name}</p>
            <p className="font-data mt-1 text-sm">
              Profit {formatMoney(topEarner.profit)} · Revenue {formatMoney(topEarner.revenue)}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">By product</CardTitle>
          <CardDescription>
            Costs allocate manufacturing ops by production volume; materials by scrap share.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : products.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">No product activity in period</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p, i) => (
                  <TableRow key={p.productId}>
                    <TableCell>
                      <Link
                        href={`/dashboard/production/products`}
                        className="hover:text-primary hover:underline"
                      >
                        {i === 0 && (
                          <Badge variant="secondary" className="mr-1 font-data text-[9px]">
                            #1
                          </Badge>
                        )}
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">{p.unitsSold}</TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(p.revenue)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(p.totalCost)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(p.profit)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {p.marginPct != null ? `${p.marginPct}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
