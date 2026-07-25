"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import { deleteFactoryExpense, updateFactoryExpense } from "@/lib/expenses-api";
import {
  listSalaryPayments,
  listWorkers,
  payWorker,
  type Worker,
} from "@/lib/workers-api";
import type { BatchExpense } from "@/types/production";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";

type ViewMode = "daily" | "monthly" | "yearly";

function displayWorkerName(
  w: { name: string; nameUr?: string } | string | null | undefined,
  isUrdu: boolean
) {
  if (!w) return "—";
  if (typeof w === "string") return w;
  if (isUrdu && w.nameUr?.trim()) return w.nameUr.trim();
  return w.name;
}

function workerIdOf(p: BatchExpense) {
  if (!p.worker) return "";
  if (typeof p.worker === "string") return p.worker;
  return p.worker._id;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function paymentDate(p: BatchExpense) {
  return startOfDay(new Date(p.expenseDate));
}

export default function AllSalariesCalendarPage() {
  const { t, isUrdu } = useI18n();
  const locale = isUrdu ? "ur-PK" : "en-PK";

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [payments, setPayments] = useState<BatchExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editingPayment, setEditingPayment] = useState<BatchExpense | null>(null);
  const [formWorkerId, setFormWorkerId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formDate, setFormDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, list] = await Promise.all([
        listWorkers({ active: "true" }),
        listSalaryPayments(),
      ]);
      setWorkers(w);
      setPayments(list);
    } catch (err) {
      toast.error(apiError(err, t("sal.historyLoadFailed")));
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadPayments = useCallback(async () => {
    try {
      setPayments(await listSalaryPayments());
    } catch (err) {
      toast.error(apiError(err, t("sal.historyLoadFailed")));
    }
  }, [t]);

  function openAddPayment(date: Date) {
    setDialogMode("add");
    setEditingPayment(null);
    setFormWorkerId(workers[0]?._id || "");
    setFormAmount("");
    setFormNote("");
    setFormDate(dayKey(date));
    setDialogOpen(true);
  }

  function openEditPayment(p: BatchExpense) {
    setDialogMode("edit");
    setEditingPayment(p);
    setFormWorkerId(workerIdOf(p));
    setFormAmount(String(p.amount));
    setFormNote(p.notes?.trim() || "");
    setFormDate(dayKey(startOfDay(new Date(p.expenseDate))));
    setDialogOpen(true);
  }

  async function saveDialog() {
    const amount = Number(formAmount);
    if (dialogMode === "add" && !formWorkerId) {
      toast.error(t("sal.pickWorker"));
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("sal.enterAmount"));
      return;
    }
    if (!formDate) {
      toast.error(t("sal.pickDate"));
      return;
    }
    setSaving(true);
    try {
      if (dialogMode === "add") {
        await payWorker(formWorkerId, {
          expenseDate: formDate,
          amount,
          notes: formNote.trim() || undefined,
        });
        toast.success(t("sal.paymentAdded"));
      } else if (editingPayment) {
        await updateFactoryExpense(editingPayment._id, {
          amount,
          expenseDate: formDate,
          notes: formNote.trim(),
        });
        toast.success(t("sal.paymentUpdated"));
      }
      setDialogOpen(false);
      setCursor(startOfDay(new Date(`${formDate}T12:00:00`)));
      await reloadPayments();
    } catch (err) {
      toast.error(apiError(err, t("sal.paymentSaveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function removePayment() {
    if (!editingPayment) return;
    if (!confirm(t("sal.confirmDeletePayment"))) return;
    setDeleting(true);
    try {
      await deleteFactoryExpense(editingPayment._id);
      toast.success(t("sal.paymentDeleted"));
      setDialogOpen(false);
      await reloadPayments();
    } catch (err) {
      toast.error(apiError(err, t("sal.paymentDeleteFailed")));
    } finally {
      setDeleting(false);
    }
  }

  async function deletePaymentDirect(p: BatchExpense) {
    if (!confirm(t("sal.confirmDeletePayment"))) return;
    try {
      await deleteFactoryExpense(p._id);
      toast.success(t("sal.paymentDeleted"));
      await reloadPayments();
    } catch (err) {
      toast.error(apiError(err, t("sal.paymentDeleteFailed")));
    }
  }

  const totalsByDay = useMemo(() => {
    const map = new Map<string, { total: number; count: number; items: BatchExpense[] }>();
    for (const p of payments) {
      const key = dayKey(paymentDate(p));
      const prev = map.get(key);
      if (prev) {
        prev.total += p.amount;
        prev.count += 1;
        prev.items.push(p);
      } else {
        map.set(key, { total: p.amount, count: 1, items: [p] });
      }
    }
    return map;
  }, [payments]);

  const totalsByMonth = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const p of payments) {
      const key = monthKey(paymentDate(p));
      const prev = map.get(key);
      if (prev) {
        prev.total += p.amount;
        prev.count += 1;
      } else {
        map.set(key, { total: p.amount, count: 1 });
      }
    }
    return map;
  }, [payments]);

  const periodTitle = useMemo(() => {
    if (viewMode === "yearly") return String(cursor.getFullYear());
    if (viewMode === "monthly") {
      return cursor.toLocaleDateString(locale, { month: "long", year: "numeric" });
    }
    return cursor.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [cursor, viewMode, locale]);

  function shiftCursor(dir: -1 | 1) {
    setCursor((prev) => {
      const next = new Date(prev);
      if (viewMode === "yearly") next.setFullYear(prev.getFullYear() + dir);
      else if (viewMode === "monthly") next.setMonth(prev.getMonth() + dir);
      else next.setDate(prev.getDate() + dir);
      return startOfDay(next);
    });
  }

  const monthCells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ date: null, key: `pad-${i}` });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      cells.push({ date, key: dayKey(date) });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ date: null, key: `end-${cells.length}` });
    }
    return cells;
  }, [cursor]);

  const dayPayments = useMemo(() => {
    return totalsByDay.get(dayKey(cursor))?.items ?? [];
  }, [cursor, totalsByDay]);

  const dayTotal = useMemo(
    () => dayPayments.reduce((s, p) => s + p.amount, 0),
    [dayPayments]
  );

  const monthTotal = useMemo(() => {
    return totalsByMonth.get(monthKey(cursor))?.total ?? 0;
  }, [cursor, totalsByMonth]);

  const yearTotal = useMemo(() => {
    const y = cursor.getFullYear();
    return payments.reduce((sum, p) => {
      return paymentDate(p).getFullYear() === y ? sum + p.amount : sum;
    }, 0);
  }, [cursor, payments]);

  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(locale, { weekday: "short" });
    });
  }, [locale]);

  const today = startOfDay(new Date());
  const allTotal = useMemo(
    () => payments.reduce((s, p) => s + p.amount, 0),
    [payments]
  );

  const summaryAmount =
    viewMode === "daily" ? dayTotal : viewMode === "monthly" ? monthTotal : yearTotal;

  const modes: { id: ViewMode; label: string }[] = [
    { id: "daily", label: t("sal.viewDaily") },
    { id: "monthly", label: t("sal.viewMonthly") },
    { id: "yearly", label: t("sal.viewYearly") },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/expenses/salaries"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t("sal.backToSalaries")}
          </Link>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("sal.allCalendarEyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("sal.allCalendarTitle")}</h1>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            {t("sal.allCalendarDesc")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {modes.map((m) => (
            <Button
              key={m.id}
              type="button"
              size="sm"
              variant={viewMode === m.id ? "default" : "outline"}
              onClick={() => setViewMode(m.id)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4 border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => shiftCursor(-1)}
                aria-label="Previous"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <div className="min-w-[180px] text-center">
                <p className="text-nameplate text-lg font-medium">{periodTitle}</p>
                <p className="font-data text-xs text-muted-foreground">
                  {t("sal.periodPaid", { amount: formatMoney(summaryAmount) })}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => shiftCursor(1)}
                aria-label="Next"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="font-data text-sm text-muted-foreground">
              {t("sal.historyTotal", { amount: formatMoney(allTotal) })}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5">
          {viewMode === "monthly" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {weekdays.map((label) => (
                  <div
                    key={label}
                    className="py-2 text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {label}
                  </div>
                ))}
                {monthCells.map((cell) => {
                  if (!cell.date) {
                    return <div key={cell.key} className="min-h-[72px] sm:min-h-[88px]" />;
                  }
                  const info = totalsByDay.get(cell.key);
                  const isToday = sameDay(cell.date, today);
                  const isSelected = sameDay(cell.date, cursor);
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => {
                        setCursor(cell.date!);
                        setViewMode("daily");
                      }}
                      className={[
                        "flex min-h-[72px] flex-col rounded-xl border p-1.5 text-left transition-colors sm:min-h-[88px] sm:p-2",
                        info
                          ? "border-red-300 bg-red-50 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40"
                          : "border-border/70 bg-background hover:bg-muted/40",
                        isSelected ? "ring-2 ring-red-500" : "",
                        isToday ? "border-foreground/40" : "",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "font-data text-sm font-medium",
                          isToday ? "text-red-700 dark:text-red-400" : "",
                        ].join(" ")}
                      >
                        {cell.date.getDate()}
                      </span>
                      {info ? (
                        <>
                          <span className="font-data mt-auto text-[11px] font-semibold text-red-700 dark:text-red-300 sm:text-xs">
                            {formatMoney(info.total)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {t("sal.paymentCount", { count: info.count })}
                          </span>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t("sal.tapDayHint")}</p>
            </div>
          )}

          {viewMode === "yearly" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 12 }, (_, month) => {
                const date = new Date(cursor.getFullYear(), month, 1);
                const key = monthKey(date);
                const info = totalsByMonth.get(key);
                const label = date.toLocaleDateString(locale, { month: "long" });
                const isCurrent =
                  today.getFullYear() === cursor.getFullYear() &&
                  today.getMonth() === month;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setCursor(startOfDay(new Date(cursor.getFullYear(), month, 1)));
                      setViewMode("monthly");
                    }}
                    className={[
                      "flex flex-col rounded-xl border p-4 text-left transition-colors",
                      info
                        ? "border-red-300 bg-red-50 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40"
                        : "border-border/70 hover:bg-muted/40",
                      isCurrent ? "ring-2 ring-red-500/60" : "",
                    ].join(" ")}
                  >
                    <span className="text-sm font-medium">{label}</span>
                    <span className="font-data mt-3 text-lg font-semibold">
                      {info ? formatMoney(info.total) : "—"}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {info
                        ? t("sal.paymentCount", { count: info.count })
                        : t("sal.noPayInPeriod")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {viewMode === "daily" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 px-4 py-3">
                <div>
                  <p className="text-sm text-muted-foreground">{t("common.date")}</p>
                  <p className="font-data text-base font-medium">
                    {formatDate(cursor.toISOString())}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">{t("sal.colJama")}</p>
                    <p className="font-data text-lg font-semibold">
                      {formatMoney(dayTotal)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="gap-1.5"
                    onClick={() => openAddPayment(cursor)}
                  >
                    <Plus className="size-4" />
                    {t("sal.addPayment")}
                  </Button>
                </div>
              </div>

              {dayPayments.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <p className="text-sm text-muted-foreground">
                    {t("sal.noPayInPeriod")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => openAddPayment(cursor)}
                  >
                    <Plus className="size-4" />
                    {t("sal.addPayment")}
                  </Button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <span>{t("salReports.colWorker")}</span>
                    <span>{t("sal.colJama")} / {t("exp.actions")}</span>
                  </div>
                  {dayPayments
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(a.expenseDate).getTime() -
                        new Date(b.expenseDate).getTime()
                    )
                    .map((p) => (
                      <div
                        key={p._id}
                        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className="truncate text-sm font-medium"
                            dir={
                              isUrdu &&
                              typeof p.worker === "object" &&
                              p.worker?.nameUr?.trim()
                                ? "rtl"
                                : undefined
                            }
                          >
                            {displayWorkerName(p.worker, isUrdu)}
                          </p>
                          {p.notes?.trim() ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {p.notes.trim()}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-data text-sm font-medium">
                            {formatMoney(p.amount)}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => openEditPayment(p)}
                          >
                            <Pencil className="size-3.5" />
                            {t("sal.editPayment")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="gap-1"
                            onClick={() => void deletePaymentDirect(p)}
                          >
                            <Trash2 className="size-3.5" />
                            {t("common.delete")}
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => setViewMode("monthly")}
              >
                {t("sal.backToMonth")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "add" ? t("sal.addPayment") : t("sal.editPayment")}
            </DialogTitle>
            <DialogDescription>{t("sal.allCalendarTitle")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {dialogMode === "add" && (
              <div className="flex flex-col gap-1.5">
                <Label>{t("salReports.worker")}</Label>
                <select
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
                  value={formWorkerId}
                  onChange={(e) => setFormWorkerId(e.target.value)}
                >
                  <option value="">{t("sal.pickWorker")}</option>
                  {workers.map((w) => (
                    <option key={w._id} value={w._id}>
                      {displayWorkerName(w, isUrdu)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {dialogMode === "edit" && editingPayment && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                {displayWorkerName(editingPayment.worker, isUrdu)}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>{t("sal.paymentAmount")}</Label>
              <Input
                type="number"
                step="1"
                min={1}
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="h-11 text-base"
                placeholder={t("sal.phAmount")}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("sal.payDate")}</Label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("exp.noteOptional")}</Label>
              <Input
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="h-11"
                placeholder={t("sal.notePh")}
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            {dialogMode === "edit" ? (
              <Button
                type="button"
                variant="destructive"
                className="gap-1.5"
                disabled={deleting || saving}
                onClick={() => void removePayment()}
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                {t("common.delete")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                {t("sal.cancel")}
              </Button>
              <Button
                type="button"
                className="gap-1.5"
                disabled={saving || deleting}
                onClick={() => void saveDialog()}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
