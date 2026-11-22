"use client";

import { queryKeys, useResource } from "@/lib/query";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { formatDate, formatMoney } from "@/lib/materials-api";
import {
  listSalaryPayments,
  listWorkers,
  type Worker,
} from "@/lib/workers-api";
import type { BatchExpense } from "@/types/production";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";

function displayWorkerName(
  w: { name: string; nameUr?: string } | string | null | undefined,
  isUrdu: boolean
) {
  if (!w) return "—";
  if (typeof w === "string") return w;
  if (isUrdu && w.nameUr?.trim()) return w.nameUr.trim();
  return w.name;
}

const EMPTY_WORKERS: Worker[] = [];
const EMPTY_PAYMENTS: BatchExpense[] = [];

export default function SalaryReportsPage() {
  const { t, isUrdu } = useI18n();
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();
  const [workerId, setWorkerId] = useState("all");
  const workerQuery = useResource(queryKeys.workers.list(), () => listWorkers(), {
    errorMessage: t("salReports.loadWorkersFailed"),
  });
  const params = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    workerId: workerId === "all" ? undefined : workerId,
  };
  const query = useResource(queryKeys.expenses.salaries(params),
    (signal) => listSalaryPayments(params, signal),
    { enabled: hydrated, errorMessage: t("salReports.loadFailed") });
  const workers = workerQuery.data ?? EMPTY_WORKERS;
  const payments = query.data?.payments ?? EMPTY_PAYMENTS;
  const loading = !hydrated || query.loading;

  const periodTotal = useMemo(
    () => payments.reduce((s, e) => s + e.amount, 0),
    [payments]
  );

  const totalsByWorker = useMemo(() => {
    const map = new Map<
      string,
      { total: number; count: number; worker: BatchExpense["worker"] }
    >();
    for (const p of payments) {
      const id =
        typeof p.worker === "string" ? p.worker : p.worker && "_id" in p.worker ? p.worker._id : "";
      if (!id) continue;
      const prev = map.get(id);
      if (prev) {
        prev.total += p.amount;
        prev.count += 1;
      } else {
        map.set(id, { total: p.amount, count: 1, worker: p.worker });
      }
    }
    return [...map.entries()]
      .map(([id, row]) => ({ id, ...row }))
      .sort((a, b) => b.total - a.total);
  }, [payments]);

  const selectedWorker = workers.find((w) => w._id === workerId);

  const workerSelectItems = useMemo(() => {
    const items: Record<string, string> = {
      all: t("salReports.allWorkers"),
    };
    for (const w of workers) {
      let label = displayWorkerName(w, isUrdu);
      if (w.job) label += ` · ${w.job}`;
      if (!w.isActive) label += ` (${t("sup.status.inactive")})`;
      items[w._id] = label;
    }
    return items;
  }, [workers, isUrdu, t]);

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div>
        <h1 className="text-nameplate text-xl">{t("salReports.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("salReports.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5 sm:col-span-2 lg:col-span-2">
            <Label>{t("salReports.worker")}</Label>
            <Select
              value={workerId}
              onValueChange={(v) => setWorkerId(v || "all")}
              items={workerSelectItems}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder={t("salReports.allWorkers")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("salReports.allWorkers")}</SelectItem>
                {workers.map((w) => (
                  <SelectItem key={w._id} value={w._id}>
                    {workerSelectItems[w._id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <DateRangeFilter />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("salReports.scope")}
                </p>
                <p className="mt-1 text-base font-medium">
                  {workerId === "all"
                    ? t("salReports.allWorkers")
                    : displayWorkerName(selectedWorker, isUrdu)}
                </p>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("salReports.payments")}
                </p>
                <p className="font-data mt-1 text-xl">{payments.length}</p>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("salReports.totalPaid")}
                </p>
                <p className="font-data mt-1 text-xl">{formatMoney(periodTotal)}</p>
              </CardContent>
            </Card>
          </div>

          {workerId === "all" && totalsByWorker.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-nameplate text-sm">{t("sal.byWorker")}</CardTitle>
                <CardDescription>{t("salReports.byWorkerDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("salReports.colWorker")}</TableHead>
                      <TableHead>{t("salReports.colPayments")}</TableHead>
                      <TableHead className="text-right">{t("salReports.colTotal")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {totalsByWorker.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell
                          dir={
                            isUrdu &&
                            typeof row.worker === "object" &&
                            row.worker?.nameUr?.trim()
                              ? "rtl"
                              : undefined
                          }
                        >
                          {displayWorkerName(row.worker, isUrdu)}
                        </TableCell>
                        <TableCell className="font-data">{row.count}</TableCell>
                        <TableCell className="font-data text-right">
                          {formatMoney(row.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-nameplate text-sm">{t("salReports.detail")}</CardTitle>
              <CardDescription>{t("salReports.detailDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("salReports.empty")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("salReports.colDate")}</TableHead>
                      <TableHead>{t("salReports.colWorker")}</TableHead>
                      <TableHead>{t("salReports.colNote")}</TableHead>
                      <TableHead className="text-right">{t("salReports.colAmount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p._id}>
                        <TableCell className="font-data whitespace-nowrap">
                          {formatDate(p.expenseDate)}
                        </TableCell>
                        <TableCell
                          dir={
                            isUrdu &&
                            typeof p.worker === "object" &&
                            p.worker?.nameUr?.trim()
                              ? "rtl"
                              : undefined
                          }
                        >
                          {displayWorkerName(p.worker, isUrdu)}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground">
                          {p.notes || "—"}
                        </TableCell>
                        <TableCell className="font-data text-right">
                          {formatMoney(p.amount)}
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
