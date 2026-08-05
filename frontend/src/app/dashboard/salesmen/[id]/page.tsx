"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import { deleteFactoryExpense, updateFactoryExpense } from "@/lib/expenses-api";
import {
  getSalesman,
  listSalesmanPayments,
  paySalesman,
  type Salesman,
} from "@/lib/sales-api";
import type { BatchExpense } from "@/types/production";
import { toDateInput, todayInput } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Badge } from "@/components/ui/badge";
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

export default function SalesmanDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const id = String(params.id);
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();

  const [salesman, setSalesman] = useState<Salesman | null>(null);
  const [payments, setPayments] = useState<BatchExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editingPayment, setEditingPayment] = useState<BatchExpense | null>(null);
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formDate, setFormDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const [s, list] = await Promise.all([
        getSalesman(id),
        listSalesmanPayments({
          salesmanId: id,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      ]);
      setSalesman(s);
      setPayments(list);
    } catch (err) {
      toast.error(apiError(err, t("sm.detailLoadFailed")));
      setSalesman(null);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [id, t, dateFrom, dateTo, hydrated]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  const reloadPayments = useCallback(async () => {
    if (!hydrated) return;
    try {
      setPayments(
        await listSalesmanPayments({
          salesmanId: id,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        })
      );
    } catch (err) {
      toast.error(apiError(err, t("sm.detailLoadFailed")));
    }
  }, [id, t, dateFrom, dateTo, hydrated]);

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
      toast.error(t("sm.enterAmount"));
      return;
    }
    if (!formDate) {
      toast.error(t("sm.pickDate"));
      return;
    }
    setSaving(true);
    try {
      if (dialogMode === "add") {
        await paySalesman(id, {
          expenseDate: formDate,
          amount,
          notes: formNote.trim() || undefined,
        });
        toast.success(t("sm.paymentAdded"));
      } else if (editingPayment) {
        await updateFactoryExpense(editingPayment._id, {
          amount,
          expenseDate: formDate,
          notes: formNote.trim(),
        });
        toast.success(t("sm.paymentUpdated"));
      }
      setDialogOpen(false);
      await reloadPayments();
    } catch (err) {
      toast.error(apiError(err, t("sm.paymentSaveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function removePayment() {
    if (!editingPayment) return;
    if (!confirm(t("sm.confirmDeletePayment"))) return;
    setDeleting(true);
    try {
      await deleteFactoryExpense(editingPayment._id);
      toast.success(t("sm.paymentDeleted"));
      setDialogOpen(false);
      await reloadPayments();
    } catch (err) {
      toast.error(apiError(err, t("sm.paymentDeleteFailed")));
    } finally {
      setDeleting(false);
    }
  }

  async function deletePaymentDirect(p: BatchExpense) {
    if (!confirm(t("sm.confirmDeletePayment"))) return;
    try {
      await deleteFactoryExpense(p._id);
      toast.success(t("sm.paymentDeleted"));
      await reloadPayments();
    } catch (err) {
      toast.error(apiError(err, t("sm.paymentDeleteFailed")));
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

  if (loading && !salesman) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!salesman) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">{t("sm.detailLoadFailed")}</p>
        <Link
          href="/dashboard/salesmen"
          className="text-sm text-primary hover:underline"
        >
          {t("sm.backToList")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/salesmen"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t("sm.backToList")}
          </Link>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("sm.detailEyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{salesman.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {salesman.phone ? <span className="font-data">{salesman.phone}</span> : null}
            <Badge
              variant={salesman.isActive ? "secondary" : "outline"}
              className="font-data text-[10px]"
            >
              {salesman.isActive ? t("sm.status.active") : t("sm.status.inactive")}
            </Badge>
          </div>
        </div>
        <Button type="button" className="gap-1.5" onClick={openAddPayment}>
          <Plus className="size-4" />
          {t("sm.addPayment")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <DateRangeFilter showAll />
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : sortedPayments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14">
            <p className="text-sm text-muted-foreground">{t("sm.paymentsEmpty")}</p>
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={openAddPayment}
            >
              <Plus className="size-4" />
              {t("sm.addPayment")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sm.col.date")}</TableHead>
                  <TableHead>{t("sm.col.note")}</TableHead>
                  <TableHead className="text-end">{t("sm.col.amountPaid")}</TableHead>
                  <TableHead className="text-end">{t("sm.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPayments.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="font-data whitespace-nowrap">
                      {formatDate(p.expenseDate)}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-sm text-muted-foreground">
                      {p.notes?.trim() || "—"}
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
                          {t("sm.editPayment")}
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
                    {t("sm.paymentsTotal")}
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
              {dialogMode === "add" ? t("sm.addPayment") : t("sm.editPayment")}
            </DialogTitle>
            <DialogDescription>{salesman.name}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("sm.paymentAmount")}</Label>
              <Input
                type="number"
                step="1"
                min={1}
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="h-11 text-base"
                placeholder={t("sm.phAmount")}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("sm.payDate")}</Label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("sm.noteOptional")}</Label>
              <UrduPhoneticInput
                value={formNote}
                onChange={setFormNote}
                className="h-11"
                placeholder={t("sm.notePh")}
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
                {t("sm.cancel")}
              </Button>
              <Button
                type="button"
                className="gap-1.5"
                disabled={saving || deleting}
                onClick={() => void saveDialog()}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("sm.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
