"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import { deleteFactoryExpense, updateFactoryExpense } from "@/lib/expenses-api";
import {
  listSalaryPayments,
  listWorkers,
  payWorker,
  type Worker,
} from "@/lib/workers-api";
import type { BatchExpense } from "@/types/production";
import { toDateInput, todayInput } from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UrduPhoneticInput } from "@/components/ui/urdu-phonetic-input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import {
  matchesExpenseScope,
  usePersistedExpenseScope,
} from "@/hooks/use-persisted-expense-scope";
import { scopeChipClass } from "@/components/expenses/expense-scope-chips";
import type { ExpenseScope } from "@/lib/workers-api";
import { cn } from "@/lib/utils";
import { WorkerSearchSelect } from "@/components/workers/worker-search-select";

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

export default function AllSalariesLedgerPage() {
  const { t, isUrdu } = useI18n();

  const scopeLabels = {
    hub: t("exp.scopeHub"),
    drum: t("exp.scopeDrum"),
    common: t("exp.scopeCommon"),
  };

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [payments, setPayments] = useState<BatchExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const {
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    setThisMonth,
    setToday,
    clearRange,
    isThisMonth,
    isToday,
    isAll,
    hydrated,
  } = usePersistedDateRange();
  const { scope: scopeFilter } = usePersistedExpenseScope();

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
    if (!hydrated) return;
    setLoading(true);
    try {
      const [w, list] = await Promise.all([
        listWorkers({ active: "true" }),
        listSalaryPayments({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      ]);
      setWorkers(w);
      setPayments(list);
    } catch (err) {
      toast.error(apiError(err, t("sal.historyLoadFailed")));
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [t, dateFrom, dateTo, hydrated]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  const reloadPayments = useCallback(async () => {
    if (!hydrated) return;
    try {
      setPayments(
        await listSalaryPayments({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        })
      );
    } catch (err) {
      toast.error(apiError(err, t("sal.historyLoadFailed")));
    }
  }, [t, dateFrom, dateTo, hydrated]);

  function openAddPayment() {
    setDialogMode("add");
    setEditingPayment(null);
    setFormWorkerId(scopedWorkers[0]?._id || "");
    setFormAmount("");
    setFormNote("");
    setFormDate(todayInput());
    setDialogOpen(true);
  }

  function openEditPayment(p: BatchExpense) {
    setDialogMode("edit");
    setEditingPayment(p);
    setFormWorkerId(workerIdOf(p));
    setFormAmount(String(p.amount));
    setFormNote(p.notes?.trim() || "");
    setFormDate(toDateInput(new Date(p.expenseDate)));
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

  const scopedWorkers = useMemo(
    () => workers.filter((w) => matchesExpenseScope(w.scope, scopeFilter)),
    [workers, scopeFilter]
  );

  const sortedPayments = useMemo(
    () =>
      payments
        .filter((p) => matchesExpenseScope(p.scope, scopeFilter))
        .slice()
        .sort(
          (a, b) =>
            new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime()
        ),
    [payments, scopeFilter]
  );

  const total = useMemo(
    () => sortedPayments.reduce((s, p) => s + p.amount, 0),
    [sortedPayments]
  );

  const hasDateFilter = Boolean(dateFrom || dateTo);

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
        <Button type="button" className="gap-1.5" onClick={openAddPayment}>
          <Plus className="size-4" />
          {t("sal.addPayment")}
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={isAll ? "default" : "outline"}
              onClick={clearRange}
            >
              {t("sal.filterAll")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isToday ? "default" : "outline"}
              onClick={setToday}
            >
              {t("sal.filterToday")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isThisMonth ? "default" : "outline"}
              onClick={setThisMonth}
            >
              {t("sal.filterThisMonth")}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>{t("common.from")}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("common.to")}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("sal.ledgerTotal")}</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3">
                <span className="font-data text-base font-semibold">
                  {formatMoney(total)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : sortedPayments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14">
            <p className="text-sm text-muted-foreground">
              {hasDateFilter ? t("sal.ledgerEmptyFiltered") : t("sal.ledgerEmpty")}
            </p>
            {hasDateFilter ? (
              <Button type="button" variant="outline" onClick={clearRange}>
                {t("sal.filterAll")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={openAddPayment}
              >
                <Plus className="size-4" />
                {t("sal.addPayment")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sal.colTarikh")}</TableHead>
                  <TableHead>{t("sal.colWorkerName")}</TableHead>
                  <TableHead className="text-end">{t("sal.colAmountGiven")}</TableHead>
                  <TableHead className="text-end">{t("exp.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPayments.map((p) => {
                  const wid = workerIdOf(p);
                  const name = displayWorkerName(p.worker, isUrdu);
                  const isUrName =
                    isUrdu &&
                    typeof p.worker === "object" &&
                    !!p.worker?.nameUr?.trim();
                  return (
                    <TableRow key={p._id}>
                      <TableCell className="font-data whitespace-nowrap">
                        {formatDate(p.expenseDate)}
                      </TableCell>
                      <TableCell>
                        {wid ? (
                          <Link
                            href={`/dashboard/expenses/salaries/${wid}`}
                            className="font-medium hover:underline"
                            dir={isUrName ? "rtl" : undefined}
                          >
                            {name}
                          </Link>
                        ) : (
                          <span dir={isUrName ? "rtl" : undefined}>{name}</span>
                        )}
                        <span
                          className={cn(
                            "mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium",
                            scopeChipClass(p.scope || "common")
                          )}
                        >
                          {scopeLabels[(p.scope as ExpenseScope) || "common"]}
                        </span>
                        {p.notes?.trim() ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {p.notes.trim()}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-data text-end font-medium whitespace-nowrap">
                        {formatMoney(p.amount)}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-semibold">
                    {t("sal.ledgerTotal")}
                  </TableCell>
                  <TableCell className="font-data text-end text-base font-semibold whitespace-nowrap">
                    {formatMoney(total)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

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
                <WorkerSearchSelect
                  workers={scopedWorkers}
                  value={formWorkerId}
                  onChange={setFormWorkerId}
                  placeholder={t("sal.pickWorker")}
                />
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
              <UrduPhoneticInput
                value={formNote}
                onChange={setFormNote}
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
