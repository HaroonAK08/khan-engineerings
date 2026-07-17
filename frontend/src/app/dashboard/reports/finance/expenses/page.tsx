"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { apiError, formatMoney } from "@/lib/materials-api";
import { getExpenseBreakdown, getManufacturingFinance, getSupplierExpenses } from "@/lib/finance-api";
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

export default function FinanceExpensesPage() {
  const defaults = monthDefaults();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [breakdown, setBreakdown] = useState<Awaited<ReturnType<typeof getExpenseBreakdown>> | null>(
    null
  );
  const [mfg, setMfg] = useState<Awaited<ReturnType<typeof getManufacturingFinance>> | null>(null);
  const [suppliers, setSuppliers] = useState<
    Array<{
      supplierId: string;
      name: string;
      purchaseSpend: number;
      cashPaid: number;
      purchaseCount: number;
      kg: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { dateFrom, dateTo };
      const [bd, mf, supp] = await Promise.all([
        getExpenseBreakdown(params),
        getManufacturingFinance(params),
        getSupplierExpenses(params),
      ]);
      setBreakdown(bd);
      setMfg(mf);
      setSuppliers(supp.suppliers);
    } catch (err) {
      toast.error(apiError(err, "Failed to load expense analysis"));
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
          <h1 className="text-nameplate text-xl">Expense analysis</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Spot unnecessary spend — manufacturing hotspots and supplier outflows.
          </p>
        </div>
        <div className="flex gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {loading || !breakdown || !mfg ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {breakdown.buckets.map((b) => (
              <Card key={b.id} className="py-0">
                <CardContent className="p-5">
                  <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                    {b.label}
                  </p>
                  <p className="font-data mt-2 text-xl font-medium">{formatMoney(b.amount)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {breakdown.hotspots.length > 0 && (
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Expense hotspots</CardTitle>
                <CardDescription>Largest buckets — review for waste.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {breakdown.hotspots.map((h, i) => (
                    <li key={h.id} className="flex justify-between">
                      <span>
                        {i + 1}. {h.label}
                      </span>
                      <span className="font-data">{formatMoney(h.amount)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Manufacturing by stage</CardTitle>
                <CardDescription>
                  Total ops {formatMoney(mfg.operating.totalOperatingCost)}
                  {mfg.mostExpensiveStage
                    ? ` · Heaviest: ${mfg.mostExpensiveStage.label}`
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stage</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mfg.byStage.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground">
                          No batch expenses
                        </TableCell>
                      </TableRow>
                    ) : (
                      mfg.byStage.map((s) => (
                        <TableRow key={s.stage}>
                          <TableCell>{s.label}</TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(s.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Manufacturing by category</CardTitle>
                <CardDescription>
                  Material estimate {formatMoney(mfg.materialEstimate.total)} (
                  {mfg.materialEstimate.netKg.toFixed(1)} kg)
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mfg.byCategory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground">
                          No categories
                        </TableCell>
                      </TableRow>
                    ) : (
                      mfg.byCategory.map((c) => (
                        <TableRow key={c.category}>
                          <TableCell>{c.label}</TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {c.sharePct}%
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(c.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Supplier expenses</CardTitle>
              <CardDescription>Purchase spend and cash paid in period.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Purchases</TableHead>
                    <TableHead className="text-right">Kg</TableHead>
                    <TableHead className="text-right">Cash paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No supplier spend
                      </TableCell>
                    </TableRow>
                  ) : (
                    suppliers.map((s) => (
                      <TableRow key={s.supplierId}>
                        <TableCell>
                          <Link
                            href={`/dashboard/suppliers/${s.supplierId}`}
                            className="hover:text-primary hover:underline"
                          >
                            {s.name}
                          </Link>
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(s.purchaseSpend)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {s.kg.toFixed(1)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(s.cashPaid)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
