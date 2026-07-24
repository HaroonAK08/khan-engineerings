"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  listSalaryPayments,
  listWorkers,
  type PayType,
  type Worker,
} from "@/lib/workers-api";
import type { BatchExpense } from "@/types/production";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

function monthDefaults() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

function displayWorkerName(
  w: { name: string; nameUr?: string } | string | null | undefined,
  isUrdu: boolean
) {
  if (!w) return "—";
  if (typeof w === "string") return w;
  if (isUrdu && w.nameUr?.trim()) return w.nameUr.trim();
  return w.name;
}

export default function SalaryReportsPage() {
  const { t, isUrdu } = useI18n();
  const d = monthDefaults();
  const [dateFrom, setDateFrom] = useState(d.from);
  const [dateTo, setDateTo] = useState(d.to);
  const [workerId, setWorkerId] = useState("all");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [payments, setPayments] = useState<BatchExpense[]>([]);
  const [loading, setLoading] = useState(true);

  function payTypeLabel(type: PayType | null | undefined) {
    if (type === "weekly") return t("sal.weekly");
    if (type === "monthly") return t("sal.monthly");
    if (type === "per_unit") return t("sal.perUnit");
    return "—";
  }

  useEffect(() => {
    void (async () => {
      try {
        setWorkers(await listWorkers());
      } catch (err) {
        toast.error(apiError(err, t("salReports.loadWorkersFailed")));
      }
    })();
  }, [t]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSalaryPayments({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        workerId: workerId === "all" ? undefined : workerId,
      });
      setPayments(list);
    } catch (err) {
      toast.error(apiError(err, t("salReports.loadFailed")));
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, workerId, t]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

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
          <div className="grid gap-1.5">
            <Label>{t("common.from")}</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("common.to")}</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
                      <TableHead>{t("salReports.colType")}</TableHead>
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
                        <TableCell>
                          {p.payType ? (
                            <Badge variant="secondary">{payTypeLabel(p.payType)}</Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground">
                          {p.units != null
                            ? `${p.units} units${p.notes ? ` · ${p.notes}` : ""}`
                            : p.notes || "—"}
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
