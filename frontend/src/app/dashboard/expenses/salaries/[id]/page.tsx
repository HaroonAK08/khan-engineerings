"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import { deleteFactoryExpense, updateFactoryExpense } from "@/lib/expenses-api";
import {
  getWorker,
  listSalaryPayments,
  payWorker,
  type Worker,
} from "@/lib/workers-api";
import type { BatchExpense } from "@/types/production";
import { currentMonthRange, toDateInput, todayInput } from "@/lib/date-range";
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

function displayWorkerName(
  w: { name: string; nameUr?: string } | null | undefined,
  isUrdu: boolean
) {
  if (!w) return "";
  if (isUrdu && w.nameUr?.trim()) return w.nameUr.trim();
  return w.name;
}

function displayJob(
  job: string,
  t: (key: "sal.jobMolder" | "sal.jobHelper") => string
) {
  const key = job.trim().toLowerCase();
  if (key === "molder") return t("sal.jobMolder");
  if (key === "helper") return t("sal.jobHelper");
  return job;
}

export default function WorkerSalaryLedgerPage() {
  const { t, isUrdu } = useI18n();
  const params = useParams();
  const id = String(params.id);
  const month = currentMonthRange();

  const [worker, setWorker] = useState<Worker | null>(null);
  const [payments, setPayments] = useState<BatchExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(month.from);
  const [dateTo, setDateTo] = useState(month.to);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editingPayment, setEditingPayment] = useState<BatchExpense | null>(null);
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formDate, setFormDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, list] = await Promise.all([
        getWorker(id),
        listSalaryPayments({
          workerId: id,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      ]);
      setWorker(w);
      setPayments(list);
    } catch (err) {
      toast.error(apiError(err, t("sal.historyLoadFailed")));
      setWorker(null);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [id, t, dateFrom, dateTo]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  const reloadPayments = useCallback(async () => {
    try {
      setPayments(
        await listSalaryPayments({
          workerId: id,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        })
      );
    } catch (err) {
      toast.error(apiError(err, t("sal.historyLoadFailed")));
    }
  }, [id, t, dateFrom, dateTo]);

  function openAddPayment() {
    setDialogMode("add");
    setEditingPayment(null);
    setFormAmount("");
    setFormNote("");
    setFormDate(todayInput());
    setDialogOpen(true);
  }

  function openEditPayment(p: BatchExpense) {
    setDialogMode("edit");
    setEditingPayment(p);
    setFormAmount(String(p.amount));
    setFormNote(p.notes?.trim() || "");
    setFormDate(toDateInput(new Date(p.expenseDate)));
    setDialogOpen(true);
  }

  async function saveDialog() {
    const amount = Number(formAmount);
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
        await payWorker(id, {
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

  const sortedPayments = useMemo(
    () =>
      payments
        .slice()
        .sort(
          (a, b) =>
            new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime()
        ),
    [payments]
  );

  const total = useMemo(
    () => sortedPayments.reduce((s, p) => s + p.amount, 0),
    [sortedPayments]
  );

  const workerName = displayWorkerName(worker, isUrdu);

  if (loading && !worker) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">{t("sal.historyLoadFailed")}</p>
        <Link
          href="/dashboard/expenses/salaries"
          className="text-sm text-primary hover:underline"
        >
          {t("sal.backToSalaries")}
        </Link>
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
            {t("sal.khataTitle")}
          </p>
          <h1
            className="text-nameplate text-xl"
            dir={isUrdu && worker.nameUr?.trim() ? "rtl" : undefined}
          >
            {workerName}
          </h1>
          {worker.job ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {displayJob(worker.job, t)}
            </p>
          ) : null}
        </div>
        <Button type="button" className="gap-1.5" onClick={openAddPayment}>
          <Plus className="size-4" />
          {t("sal.addPayment")}
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
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
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : sortedPayments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14">
            <p className="text-sm text-muted-foreground">{t("sal.historyEmpty")}</p>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={openAddPayment}
            >
              <Plus className="size-4" />
              {t("sal.addPayment")}
            </Button>
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
                  <TableHead className="text-end">{t("sal.colAmountPaid")}</TableHead>
                  <TableHead className="text-end">{t("exp.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPayments.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="font-data whitespace-nowrap">
                      {formatDate(p.expenseDate)}
                    </TableCell>
                    <TableCell
                      dir={isUrdu && worker.nameUr?.trim() ? "rtl" : undefined}
                    >
                      {workerName}
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
                ))}
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
            <DialogDescription>{workerName}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
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
