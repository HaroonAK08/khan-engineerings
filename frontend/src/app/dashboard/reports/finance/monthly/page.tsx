"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { apiError, formatMoney } from "@/lib/materials-api";
import { getFinanceMonthly, type MonthlyPoint } from "@/lib/finance-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function FinanceMonthlyPage() {
  const [months, setMonths] = useState<MonthlyPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMonths(await getFinanceMonthly({ months: 12 }));
    } catch (err) {
      toast.error(apiError(err, "Failed to load monthly reports"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maxRev = Math.max(1, ...months.map((m) => m.revenue));
  const maxCash = Math.max(1, ...months.map((m) => Math.max(m.cashIn, m.cashOut)));

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <FinanceSubnav />

      <div>
        <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          Phase 7 · Finance
        </p>
        <h1 className="text-nameplate text-xl">Monthly reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Twelve-month profit and cash movement.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Revenue by month</CardTitle>
              <CardDescription>Bar height relative to peak revenue.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-40 items-end gap-1.5 sm:gap-2">
                {months.map((m) => (
                  <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t-sm bg-primary/80"
                      style={{ height: `${Math.max(4, (m.revenue / maxRev) * 100)}%` }}
                      title={`${m.label}: ${formatMoney(m.revenue)}`}
                    />
                    <span className="font-data text-[9px] text-muted-foreground">
                      {m.label.slice(0, 3)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Cash in vs out</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-36 items-end gap-1.5 sm:gap-2">
                {months.map((m) => (
                  <div key={m.label} className="flex flex-1 items-end justify-center gap-0.5">
                    <div
                      className="w-[45%] rounded-t-sm bg-chart-3/80"
                      style={{ height: `${Math.max(4, (m.cashIn / maxCash) * 100)}%` }}
                      title={`In ${formatMoney(m.cashIn)}`}
                    />
                    <div
                      className="w-[45%] rounded-t-sm bg-chart-2/80"
                      style={{ height: `${Math.max(4, (m.cashOut / maxCash) * 100)}%` }}
                      title={`Out ${formatMoney(m.cashOut)}`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-chart-3" /> Cash in
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-chart-2" /> Cash out
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Month detail</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Cash net</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {months.map((m) => (
                    <TableRow key={m.label}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatMoney(m.revenue)}
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatMoney(m.expenses)}
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatMoney(m.netProfit)}
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatMoney(m.cashNet)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.isProfit ? "secondary" : "destructive"}>
                          {m.isProfit ? "Profit" : "Loss"}
                        </Badge>
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
