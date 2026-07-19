"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { deleteFactoryExpense } from "@/lib/expenses-api";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  createWorker,
  deactivateWorker,
  listSalaryPayments,
  listWorkers,
  payWorker,
  type PayDay,
  type PayType,
  type Worker,
} from "@/lib/workers-api";
import type { BatchExpense } from "@/types/production";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";

function monthDefaults() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function workerName(w: BatchExpense["worker"]) {
  if (!w) return "";
  if (typeof w === "string") return w;
  return w.name;
}

export default function SalariesPage() {
  const { t } = useI18n();
  const defaults = monthDefaults();

  function payTypeLabel(type: PayType | null | undefined) {
    if (type === "weekly") return t("sal.weekly");
    if (type === "monthly") return t("sal.monthly");
    if (type === "per_unit") return t("sal.perUnit");
    return "—";
  }
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [payments, setPayments] = useState<BatchExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [payingId, setPayingId] = useState<string | null>(null);
  const [payType, setPayType] = useState<PayType>("weekly");
  const [payAmount, setPayAmount] = useState("");
  const [payUnits, setPayUnits] = useState("");
  const [payUnitRate, setPayUnitRate] = useState("");
  const [payDay, setPayDay] = useState<PayDay>("monday");
  const [payDate, setPayDate] = useState(todayInput());
  const [payNote, setPayNote] = useState("");

  const [search, setSearch] = useState("");
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [newName, setNewName] = useState("");
  const [newJob, setNewJob] = useState("");
  const [newUnitLabel, setNewUnitLabel] = useState("hub");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, p] = await Promise.all([
        listWorkers({ active: "true" }),
        listSalaryPayments({ dateFrom, dateTo }),
      ]);
      setWorkers(w);
      setPayments(p);
    } catch (err) {
      toast.error(apiError(err, "Failed to load salaries"));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 150);
    return () => clearTimeout(t);
  }, [load]);

  const periodTotal = useMemo(
    () => payments.reduce((s, e) => s + e.amount, 0),
    [payments]
  );

  const lastPayByWorker = useMemo(() => {
    const map = new Map<string, BatchExpense>();
    for (const p of payments) {
      const id =
        typeof p.worker === "string" ? p.worker : p.worker && "_id" in p.worker ? p.worker._id : "";
      if (!id || map.has(id)) continue;
      map.set(id, p);
    }
    return map;
  }, [payments]);

  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.job && w.job.toLowerCase().includes(q))
    );
  }, [workers, search]);

  function openPay(w: Worker) {
    setPayingId(w._id);
    const preferred = w.payType || "weekly";
    setPayType(preferred);
    setPayAmount(preferred !== "per_unit" && w.rate != null ? String(w.rate) : "");
    setPayUnits("");
    setPayUnitRate(preferred === "per_unit" && w.rate != null ? String(w.rate) : "");
    setPayDate(todayInput());
    setPayNote("");
    const day =
      w.payDays?.includes("monday")
        ? "monday"
        : w.payDays?.includes("thursday")
          ? "thursday"
          : "monday";
    setPayDay(day);
  }

  async function confirmPay(w: Worker) {
    if (!payDate) {
      toast.error("Pick the pay date");
      return;
    }
    setBusyId(w._id);
    try {
      if (payType === "per_unit") {
        const units = Number(payUnits);
        const unitRate = Number(payUnitRate);
        if (!Number.isFinite(units) || units <= 0) {
          toast.error("Enter how many units");
          return;
        }
        if (!Number.isFinite(unitRate) || unitRate <= 0) {
          toast.error("Enter pay per unit");
          return;
        }
        await payWorker(w._id, {
          expenseDate: payDate,
          payType,
          units,
          unitRate,
          notes: payNote.trim() || undefined,
        });
      } else {
        const amount = Number(payAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
          toast.error("Enter the amount for this pay");
          return;
        }
        await payWorker(w._id, {
          expenseDate: payDate,
          payType,
          amount,
          payDay: payType === "weekly" ? payDay : undefined,
          notes: payNote.trim() || undefined,
        });
      }
      toast.success(`Paid ${w.name} · ${formatDate(payDate)}`);
      setPayingId(null);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Pay failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function onAddWorker() {
    const name = newName.trim();
    if (!name) {
      toast.error("Enter worker name");
      return;
    }
    setBusyId("add-worker");
    try {
      await createWorker({
        name,
        job: newJob.trim(),
        unitLabel: newUnitLabel.trim() || "piece",
      });
      toast.success("Worker added");
      setNewName("");
      setNewJob("");
      setShowAddWorker(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Could not add worker"));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Remove this payment?")) return;
    try {
      await deleteFactoryExpense(id);
      toast.success("Removed");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Delete failed"));
    }
  }

  async function onDeactivateWorker(w: Worker) {
    if (!confirm(`Remove ${w.name} from the active list?`)) return;
    try {
      await deactivateWorker(w._id);
      toast.success("Worker removed");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Could not remove worker"));
    }
  }

  const unitPreview =
    payType === "per_unit" && Number(payUnits) > 0 && Number(payUnitRate) > 0
      ? Number(payUnits) * Number(payUnitRate)
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("sal.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("sal.title")}</h1>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">{t("sal.desc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {t("sal.activeWorkers")}
            </p>
            <p className="font-data mt-1 text-xl">{workers.length}</p>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {t("sal.paidPeriod")}
            </p>
            <p className="font-data mt-1 text-xl">{formatMoney(periodTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      ) : (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-nameplate text-base">{t("sal.workers")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("sal.workersDesc")}</p>
            </div>
            <Button
              type="button"
              variant={showAddWorker ? "outline" : "default"}
              onClick={() => setShowAddWorker((v) => !v)}
            >
              <Plus className="size-4" />
              {showAddWorker ? t("sal.cancel") : t("sal.addWorker")}
            </Button>
          </div>

          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={t("sal.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {showAddWorker && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-nameplate text-sm">{t("sal.newWorker")}</CardTitle>
                <CardDescription>{t("sal.newWorkerDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.name")}</Label>
                  <Input
                    placeholder={t("sal.phName")}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.job")}</Label>
                  <Input
                    placeholder={t("sal.phJob")}
                    value={newJob}
                    onChange={(e) => setNewJob(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.unitName")}</Label>
                  <Input
                    value={newUnitLabel}
                    onChange={(e) => setNewUnitLabel(e.target.value)}
                    placeholder={t("sal.phUnit")}
                  />
                </div>
                <div className="flex items-end sm:col-span-2 lg:col-span-3">
                  <Button
                    type="button"
                    disabled={busyId === "add-worker"}
                    className="gap-2"
                    onClick={() => void onAddWorker()}
                  >
                    {busyId === "add-worker" && <Loader2 className="size-4 animate-spin" />}
                    {t("sal.saveWorker")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {workers.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t("sal.noWorkers")}
              </CardContent>
            </Card>
          ) : filteredWorkers.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t("sal.noMatch", { query: search.trim() })}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filteredWorkers.map((w) => {
                const isPaying = payingId === w._id;
                const last = lastPayByWorker.get(w._id);
                return (
                  <Card key={w._id}>
                    <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-medium tracking-tight">{w.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            {w.job ? <span>{w.job}</span> : null}
                            {last ? (
                              <span className="font-data text-xs">
                                {t("sal.lastPaid", {
                                  date: formatDate(last.expenseDate),
                                  amount: formatMoney(last.amount),
                                })}
                                {last.payType ? ` · ${payTypeLabel(last.payType)}` : ""}
                              </span>
                            ) : (
                              <span className="text-xs">{t("sal.noPayPeriod")}</span>
                            )}
                            {w.rate != null && (
                              <span className="font-data text-xs text-muted-foreground/80">
                                {t("sal.lastRemembered", { amount: formatMoney(w.rate) })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {!isPaying && (
                            <Button type="button" onClick={() => openPay(w)}>
                              {t("sal.payNow")}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground"
                            onClick={() => void onDeactivateWorker(w)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>

                      {isPaying && (
                        <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
                          <div className="mb-3 flex flex-wrap gap-2">
                            <span className="w-full text-sm text-muted-foreground">
                              {t("sal.payType")}
                            </span>
                            {(
                              [
                                ["weekly", t("sal.weekly")],
                                ["monthly", t("sal.monthly")],
                                ["per_unit", t("sal.perUnit")],
                              ] as const
                            ).map(([id, label]) => (
                              <Button
                                key={id}
                                type="button"
                                size="lg"
                                variant={payType === id ? "default" : "outline"}
                                className="min-w-[110px]"
                                onClick={() => {
                                  setPayType(id);
                                  if (id === "per_unit") {
                                    setPayAmount("");
                                    if (w.rate != null && w.payType === "per_unit") {
                                      setPayUnitRate(String(w.rate));
                                    }
                                  } else if (w.rate != null && w.payType !== "per_unit") {
                                    setPayAmount(String(w.rate));
                                  }
                                }}
                              >
                                {label}
                              </Button>
                            ))}
                          </div>

                          {payType === "weekly" && (
                            <div className="mb-3 flex flex-wrap gap-2">
                              <span className="w-full text-sm text-muted-foreground">
                                {t("sal.payDay")}
                              </span>
                              {(
                                [
                                  ["monday", t("sal.monday")],
                                  ["thursday", t("sal.thursday")],
                                ] as const
                              ).map(([id, label]) => (
                                <Button
                                  key={id}
                                  type="button"
                                  size="lg"
                                  variant={payDay === id ? "default" : "outline"}
                                  className="min-w-[120px]"
                                  onClick={() => setPayDay(id)}
                                >
                                  {label}
                                </Button>
                              ))}
                            </div>
                          )}

                          <div className="grid gap-3 sm:grid-cols-3">
                            {payType === "per_unit" ? (
                              <>
                                <div className="flex flex-col gap-1.5">
                                  <Label>How many {w.unitLabel || "units"}?</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={payUnits}
                                    onChange={(e) => setPayUnits(e.target.value)}
                                    className="h-11 text-base"
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <Label>Pay per {w.unitLabel || "unit"}</Label>
                                  <Input
                                    type="number"
                                    step="1"
                                    value={payUnitRate}
                                    onChange={(e) => setPayUnitRate(e.target.value)}
                                    className="h-11 text-base"
                                    placeholder="Can change each time"
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <Label>Total</Label>
                                  <p className="font-data flex h-11 items-center text-lg">
                                    {unitPreview != null ? formatMoney(unitPreview) : "—"}
                                  </p>
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                <Label>
                                  {payType === "weekly" ? t("sal.weekAmount") : t("sal.monthAmount")}
                                </Label>
                                <Input
                                  type="number"
                                  step="1"
                                  value={payAmount}
                                  onChange={(e) => setPayAmount(e.target.value)}
                                  className="h-11 text-base"
                                  placeholder="Enter amount — can differ each time"
                                />
                              </div>
                            )}
                            <div className="flex flex-col gap-1.5">
                              <Label>{t("sal.payDate")}</Label>
                              <Input
                                type="date"
                                value={payDate}
                                onChange={(e) => setPayDate(e.target.value)}
                                className="h-11"
                                required
                              />
                            </div>
                            <div className="flex flex-col gap-1.5 sm:col-span-2">
                              <Label>{t("exp.noteOptional")}</Label>
                              <Input
                                value={payNote}
                                onChange={(e) => setPayNote(e.target.value)}
                                className="h-11"
                                placeholder={t("sal.notePh")}
                              />
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="lg"
                              className="min-w-[140px] gap-2"
                              disabled={busyId === w._id}
                              onClick={() => void confirmPay(w)}
                            >
                              {busyId === w._id && <Loader2 className="size-4 animate-spin" />}
                              {t("sal.confirmPay")}
                            </Button>
                            <Button
                              type="button"
                              size="lg"
                              variant="outline"
                              onClick={() => setPayingId(null)}
                            >
                              {t("sal.cancel")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {payments.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-nameplate text-sm">{t("sal.history")}</CardTitle>
                <CardDescription>{t("sal.historyDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 px-4 pb-4">
                {payments.map((e) => (
                  <div
                    key={e._id}
                    className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {workerName(e.worker) || e.notes || "Salary"}
                        </p>
                        {e.payType && (
                          <Badge variant="secondary">{payTypeLabel(e.payType)}</Badge>
                        )}
                      </div>
                      <p className="font-data text-xs text-muted-foreground">
                        {formatDate(e.expenseDate)}
                        {e.units != null
                          ? ` · ${e.units} units`
                          : e.notes
                            ? ` · ${e.notes}`
                            : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-data text-sm">{formatMoney(e.amount)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground"
                        onClick={() => void onDelete(e._id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
