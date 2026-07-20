"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import { getCostReport } from "@/lib/production-api";
import type { CostReport } from "@/types/production";
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

export default function CostReportsPage() {
  const [report, setReport] = useState<CostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      setReport(await getCostReport(params));
    } catch (err) {
      toast.error(apiError(err, "Failed to load cost report"));
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
      <div>
        <Link
          href="/dashboard/production"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Production
        </Link>
        <h1 className="text-nameplate text-xl">Manufacturing costs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Operating spend by category and production run.
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
                label: "Total operating cost",
                value: formatMoney(report.totals.totalOperatingCost),
                hint: `${report.totals.expenseCount} expense entries`,
                accent: "bg-chart-1",
              },
              {
                label: "Most expensive stage",
                value: report.mostExpensiveStage?.label ?? "—",
                hint: report.mostExpensiveStage
                  ? formatMoney(report.mostExpensiveStage.amount)
                  : "no expenses yet",
                accent: "bg-chart-4",
              },
              {
                label: "Expense trend",
                value: report.expenseTrend
                  ? `${report.expenseTrend.changePct != null ? `${report.expenseTrend.changePct > 0 ? "+" : ""}${report.expenseTrend.changePct}%` : "—"}`
                  : "—",
                hint: report.expenseTrend
                  ? `${report.expenseTrend.from} → ${report.expenseTrend.to}`
                  : "need 2+ months of data",
                accent: "bg-chart-2",
              },
              {
                label: "Top category",
                value: report.risingCategories[0]?.label ?? "—",
                hint: report.risingCategories[0]
                  ? formatMoney(report.risingCategories[0].amount)
                  : "no spend yet",
                accent: "bg-chart-3",
              },
            ].map((stat) => (
              <Card key={stat.label} className="relative overflow-hidden py-0">
                <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
                <CardContent className="p-5">
                  <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="font-data mt-2 text-2xl font-medium">{stat.value}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {stat.label === "Expense trend" && report.expenseTrend?.direction === "up" && (
                      <TrendingUp className="size-3 text-destructive" />
                    )}
                    {stat.label === "Expense trend" && report.expenseTrend?.direction === "down" && (
                      <TrendingDown className="size-3 text-chart-3" />
                    )}
                    {stat.hint}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Cost by stage</CardTitle>
                <CardDescription>Which workflow stage costs the most?</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stage</TableHead>
                      <TableHead className="text-right">#</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byStage.map((row) => (
                      <TableRow key={row.stage}>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            {row.label}
                            {report.mostExpensiveStage?.stage === row.stage && row.amount > 0 && (
                              <Badge variant="secondary" className="font-data text-[9px]">
                                HIGHEST
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">{row.count}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(row.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Cost by category</CardTitle>
                <CardDescription>Where expenses concentrate.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">#</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byCategory.map((row) => (
                      <TableRow key={row.category}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="font-data text-right text-xs">{row.count}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(row.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Monthly spend</CardTitle>
              <CardDescription>Track whether expenses are increasing over time.</CardDescription>
            </CardHeader>
            <CardContent>
              {report.byMonth.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No monthly data</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Expenses</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byMonth.map((row) => (
                      <TableRow key={row.label}>
                        <TableCell className="font-data text-xs">{row.label}</TableCell>
                        <TableCell className="font-data text-right text-xs">{row.count}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(row.amount)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.change == null ? (
                            "—"
                          ) : (
                            <span
                              className={
                                row.change > 0
                                  ? "text-destructive"
                                  : row.change < 0
                                    ? "text-chart-3"
                                    : ""
                              }
                            >
                              {row.change > 0 ? "+" : ""}
                              {formatMoney(row.change)}
                              {row.changePct != null ? ` (${row.changePct}%)` : ""}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Costliest batches</CardTitle>
              <CardDescription>Operating cost per batch in range.</CardDescription>
            </CardHeader>
            <CardContent>
              {report.byBatch.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No batch costs yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Good</TableHead>
                      <TableHead className="text-right">Operating</TableHead>
                      <TableHead className="text-right">Per unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byBatch.map((row) => (
                      <TableRow key={row.batchId}>
                        <TableCell>
                          <Link
                            href={`/dashboard/production/${row.batchId}`}
                            className="font-data text-xs hover:text-primary hover:underline"
                          >
                            {row.batchNo}
                          </Link>
                        </TableCell>
                        <TableCell className="font-data text-xs">
                          {row.productionDate ? formatDate(row.productionDate) : "—"}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.goodUnits}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(row.operatingCost)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.costPerGoodUnit != null ? formatMoney(row.costPerGoodUnit) : "—"}
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
