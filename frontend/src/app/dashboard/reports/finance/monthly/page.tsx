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
import { useI18n } from "@/hooks/use-i18n";

export default function FinanceMonthlyPage() {
  const { t } = useI18n();
  const [months, setMonths] = useState<MonthlyPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMonths(await getFinanceMonthly({ months: 12 }));
    } catch (err) {
      toast.error(apiError(err, t("financeMonthly.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
          {t("common.financeEyebrow")}
        </p>
        <h1 className="text-nameplate text-xl">{t("financeMonthly.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("financeMonthly.subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">{t("financeMonthly.revenueByMonth")}</CardTitle>
              <CardDescription>{t("financeMonthly.barHeightDesc")}</CardDescription>
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
              <CardTitle className="text-nameplate text-sm">{t("financeMonthly.cashInVsOut")}</CardTitle>
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
                  <span className="size-2 rounded-sm bg-chart-3" /> {t("financeOverview.cashIn")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-chart-2" /> {t("financeOverview.cashOut")}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">{t("financeMonthly.monthDetail")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dash.month")}</TableHead>
                    <TableHead className="text-right">{t("financeOverview.revenue")}</TableHead>
                    <TableHead className="text-right">{t("nav.expenses")}</TableHead>
                    <TableHead className="text-right">{t("financeMonthly.net")}</TableHead>
                    <TableHead className="text-right">{t("financeMonthly.cashNet")}</TableHead>
                    <TableHead>{t("financeMonthly.result")}</TableHead>
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
                          {m.isProfit ? t("financeOverview.profitLabel") : t("financeMonthly.loss")}
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
