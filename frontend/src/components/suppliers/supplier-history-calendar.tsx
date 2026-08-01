"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Banknote, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  apiError,
  deleteLedgerEntry,
  deletePurchase,
  formatDate,
  formatKg,
  formatMoney,
  recordPayment,
  updateLedgerEntry,
  updatePurchase,
  withSameDayConfirm,
} from "@/lib/materials-api";
import type { LedgerEntry } from "@/types/materials";
import { thisMonthRange, toDateInput, todayInput } from "@/lib/date-range";
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

type Props = {
  supplierId?: string;
  entries: LedgerEntry[];
  onChanged: () => void | Promise<void>;
  showSupplierNames?: boolean;
};

function isInternalNote(notes: string) {
  return /^sup-[a-z0-9-]+$/i.test(notes.trim());
}

function purchaseIdOf(e: LedgerEntry) {
  if (!e.purchase) return "";
  if (typeof e.purchase === "string") return e.purchase;
  return e.purchase._id;
}

function purchaseOf(e: LedgerEntry) {
  return e.purchase && typeof e.purchase === "object" ? e.purchase : null;
}

function supplierIdOf(e: LedgerEntry) {
  return typeof e.supplier === "string" ? e.supplier : e.supplier._id;
}

function supplierNameOf(e: LedgerEntry, isUrdu: boolean) {
  if (typeof e.supplier === "string") return "";
  if (isUrdu && e.supplier.nameUr?.trim()) return e.supplier.nameUr.trim();
  return e.supplier.name;
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function dayKey(d: Date) {
  return toDateInput(d);
}

function payableOf(p: NonNullable<ReturnType<typeof purchaseOf>>) {
  return roundMoney((p.totalAmount || 0) + (p.freightAmount || 0));
}

type PaidSlice = { amount: number; date: string; entryId: string };

type PurchaseRowView = {
  entry: LedgerEntry;
  amount: number;
  previous: number;
  previousPlusAmount: number;
  paidSlices: PaidSlice[];
  paidTotal: number;
  balance: number;
};

function formatBalanceDisplay(balance: number) {
  const abs = formatMoney(Math.abs(balance));
  if (balance > 0.001) return `− ${abs}`;
  if (balance < -0.001) return `+ ${abs}`;
  return formatMoney(0);
}

function balanceToneClass(balance: number) {
  if (balance > 0.001) return "text-amber-700 dark:text-amber-400";
  if (balance < -0.001) return "text-emerald-700 dark:text-emerald-400";
  return undefined;
}

function entryTime(e: LedgerEntry) {
  return new Date(e.entryDate).getTime();
}

function buildPurchaseRows(entries: LedgerEntry[]): Map<string, PurchaseRowView> {
  const bySupplier = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const sid = supplierIdOf(e);
    const list = bySupplier.get(sid) || [];
    list.push(e);
    bySupplier.set(sid, list);
  }

  const result = new Map<string, PurchaseRowView>();

  for (const [, list] of bySupplier) {
    // Purchases + previous pending (positive adjustments), oldest first.
    const dues = list
      .filter(
        (e) =>
          e.type === "purchase" ||
          (e.type === "adjustment" && (e.signedAmount ?? 0) > 0)
      )
      .slice()
      .sort((a, b) => entryTime(a) - entryTime(b) || a._id.localeCompare(b._id));

    const payments = list
      .filter((e) => e.type === "payment")
      .slice()
      .sort((a, b) => entryTime(a) - entryTime(b) || a._id.localeCompare(b._id))
      .map((e) => ({
        entryId: e._id,
        date: e.entryDate,
        left: roundMoney(e.amount || 0),
        purchaseId: purchaseIdOf(e) || "",
        appliesTo:
          typeof e.appliesTo === "string"
            ? e.appliesTo
            : e.appliesTo && typeof e.appliesTo === "object" && "_id" in e.appliesTo
              ? String((e.appliesTo as { _id: string })._id)
              : "",
      }));

    let runningOutstanding = 0;
    let lastDueId: string | null = null;
    for (const e of dues) {
      const p = purchaseOf(e);
      const amount =
        e.type === "adjustment"
          ? roundMoney(e.signedAmount ?? e.amount ?? 0)
          : p
            ? payableOf(p)
            : roundMoney(e.amount || 0);
      const previous = runningOutstanding;
      const previousPlusAmount = roundMoney(previous + amount);
      const duePurchaseId = purchaseIdOf(e);

      const paidSlices: PaidSlice[] = [];

      // 1) Payments recorded against this row keep their full amount (overpay = advance).
      for (const pay of payments) {
        if (pay.left <= 0) continue;
        const linkedToPurchase =
          Boolean(duePurchaseId) && pay.purchaseId === duePurchaseId;
        const linkedToEntry = pay.appliesTo === e._id;
        if (!linkedToPurchase && !linkedToEntry) continue;
        paidSlices.push({ amount: pay.left, date: pay.date, entryId: pay.entryId });
        pay.left = 0;
      }

      let paidTotal = roundMoney(paidSlices.reduce((s, x) => s + x.amount, 0));
      let need = roundMoney(Math.max(0, amount - paidTotal));

      // 2) Unlinked payments: while this row still needs money, take the whole
      //    payment (no split). That way overpay shows as +advance on this record.
      for (const pay of payments) {
        if (need <= 0) break;
        if (pay.left <= 0) continue;
        if (pay.purchaseId || pay.appliesTo) continue;
        const take = pay.left;
        paidSlices.push({ amount: take, date: pay.date, entryId: pay.entryId });
        pay.left = 0;
        paidTotal = roundMoney(paidTotal + take);
        need = roundMoney(Math.max(0, amount - paidTotal));
      }

      paidTotal = roundMoney(paidSlices.reduce((s, x) => s + x.amount, 0));
      const rowRemaining = roundMoney(amount - paidTotal);
      const carried = roundMoney(previous + rowRemaining);
      // Overpay on this record → show +advance here; credit still flows into later rows.
      const balance = rowRemaining < -0.001 ? rowRemaining : carried;
      runningOutstanding = carried;
      lastDueId = e._id;

      result.set(e._id, {
        entry: e,
        amount,
        previous,
        previousPlusAmount,
        paidSlices,
        paidTotal,
        balance,
      });
    }

    // Extra unlinked payments after all dues → advance on the latest due row.
    const leftover = roundMoney(payments.reduce((s, pay) => s + pay.left, 0));
    if (leftover > 0.001 && lastDueId) {
      const last = result.get(lastDueId);
      if (last) {
        for (const pay of payments) {
          if (pay.left <= 0) continue;
          last.paidSlices.push({
            amount: pay.left,
            date: pay.date,
            entryId: pay.entryId,
          });
          last.paidTotal = roundMoney(last.paidTotal + pay.left);
          pay.left = 0;
        }
        const rowRemaining = roundMoney(last.amount - last.paidTotal);
        const carried = roundMoney(last.previous + rowRemaining);
        last.balance = rowRemaining < -0.001 ? rowRemaining : carried;
      }
    }
  }

  return result;
}

export function SupplierHistoryCalendar({
  supplierId,
  entries,
  onChanged,
  showSupplierNames = false,
}: Props) {
  const { t, isUrdu } = useI18n();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showPreviousPending, setShowPreviousPending] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [editingRow, setEditingRow] = useState<PurchaseRowView | null>(null);
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formQty, setFormQty] = useState("");
  const [formRate, setFormRate] = useState("");
  const [formMaterial, setFormMaterial] = useState<"scrap" | "daig">("scrap");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [payFor, setPayFor] = useState<PurchaseRowView | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayInput());
  const [payNote, setPayNote] = useState("");
  const [savingPay, setSavingPay] = useState(false);

  const [editingPayment, setEditingPayment] = useState<LedgerEntry | null>(null);
  const [payEditAmount, setPayEditAmount] = useState("");
  const [payEditDate, setPayEditDate] = useState("");
  const [payEditNote, setPayEditNote] = useState("");
  const [savingPaymentEdit, setSavingPaymentEdit] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  const purchaseRowsById = useMemo(() => buildPurchaseRows(entries), [entries]);

  const filtered = useMemo(() => {
    let list = entries.filter((e) => {
      if (e.type === "purchase") return true;
      if (e.type === "adjustment" && (e.signedAmount ?? 0) > 0) {
        return showPreviousPending;
      }
      return false;
    });
    if (dateFrom) {
      const from = dateFrom;
      list = list.filter((e) => dayKey(new Date(e.entryDate)) >= from);
    }
    if (dateTo) {
      const to = dateTo;
      list = list.filter((e) => dayKey(new Date(e.entryDate)) <= to);
    }
    return list
      .slice()
      .sort(
        (a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
      );
  }, [entries, dateFrom, dateTo, showPreviousPending]);

  const purchaseViews = useMemo(() => {
    return filtered
      .map((e) => purchaseRowsById.get(e._id))
      .filter((row): row is PurchaseRowView => Boolean(row));
  }, [filtered, purchaseRowsById]);

  const total = useMemo(
    () =>
      purchaseViews
        .filter((row) => row.entry.type === "purchase")
        .reduce((s, row) => s + row.amount, 0),
    [purchaseViews]
  );

  const formTotal = useMemo(() => {
    const qty = Number(formQty);
    const rate = Number(formRate);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
    return roundMoney(qty * rate);
  }, [formQty, formRate]);

  const today = todayInput();
  const month = thisMonthRange();
  const isTodayRange = dateFrom === today && dateTo === today;
  const isMonthRange = dateFrom === month.from && dateTo === month.to;
  const isAllRange = !dateFrom && !dateTo;
  const hasDateFilter = Boolean(dateFrom || dateTo);

  function setTodayRange() {
    const d = todayInput();
    setDateFrom(d);
    setDateTo(d);
  }

  function setThisMonthRange() {
    const m = thisMonthRange();
    setDateFrom(m.from);
    setDateTo(m.to);
  }

  function setAllRange() {
    setDateFrom("");
    setDateTo("");
  }

  function materialLabel(type?: string) {
    return type === "daig" ? "D" : "S";
  }

  function purchaseDetail(e: LedgerEntry) {
    if (e.type === "adjustment") {
      return e.notes && !isInternalNote(e.notes)
        ? e.notes
        : t("supplierDetail.previousPending");
    }
    const p = purchaseOf(e);
    if (!p) return t("supplierDetail.purchaseHistory");
    return `${materialLabel(p.materialType)} · ${formatKg(p.quantityKg)} kg · ${formatMoney(p.ratePerKg)}/kg`;
  }

  const rowPayments = useMemo(() => {
    if (!editingRow) return [] as LedgerEntry[];
    const ids = [...new Set(editingRow.paidSlices.map((s) => s.entryId))];
    return ids
      .map((id) => entries.find((e) => e._id === id && e.type === "payment"))
      .filter((e): e is LedgerEntry => Boolean(e))
      .sort((a, b) => entryTime(a) - entryTime(b));
  }, [editingRow, entries]);

  useEffect(() => {
    if (!dialogOpen || !editing || editing.type === "payment") return;
    const fresh = purchaseRowsById.get(editing._id);
    setEditingRow(fresh || null);
  }, [purchaseRowsById, editing, dialogOpen]);

  function openEdit(e: LedgerEntry, row?: PurchaseRowView) {
    setEditing(e);
    setEditingRow(row || null);
    setEditingPayment(null);
    setFormDate(dayKey(new Date(e.entryDate)));
    if (e.type === "payment" || e.type === "adjustment") {
      setFormAmount(
        String(e.type === "adjustment" ? (e.signedAmount ?? e.amount) : e.amount)
      );
      setFormNote(e.notes && !isInternalNote(e.notes) ? e.notes : "");
    } else {
      const p = purchaseOf(e);
      setFormQty(String(p?.quantityKg ?? ""));
      setFormRate(String(p?.ratePerKg ?? ""));
      setFormMaterial((p?.materialType || "scrap") === "daig" ? "daig" : "scrap");
    }
    setDialogOpen(true);
  }

  function openPaymentEdit(payment: LedgerEntry) {
    setEditingPayment(payment);
    setPayEditAmount(String(payment.amount));
    setPayEditDate(dayKey(new Date(payment.entryDate)));
    setPayEditNote(
      payment.notes && !isInternalNote(payment.notes) ? payment.notes : ""
    );
  }

  async function savePaymentEdit() {
    if (!editingPayment) return;
    const amount = Number(payEditAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("supplierDetail.enterAmount"));
      return;
    }
    if (!payEditDate) {
      toast.error(t("supplierDetail.pickDate"));
      return;
    }
    const sid = supplierId || supplierIdOf(editingPayment);
    setSavingPaymentEdit(true);
    try {
      await updateLedgerEntry(sid, editingPayment._id, {
        amount,
        entryDate: payEditDate,
        notes: payEditNote.trim() || "Payment",
      });
      toast.success(t("supplierDetail.entryUpdated"));
      setEditingPayment(null);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.entrySaveFailed")));
    } finally {
      setSavingPaymentEdit(false);
    }
  }

  async function deletePayment(payment: LedgerEntry) {
    if (!confirm(t("supplierDetail.confirmDeletePayment"))) return;
    const sid = supplierId || supplierIdOf(payment);
    setDeletingPaymentId(payment._id);
    try {
      await deleteLedgerEntry(sid, payment._id);
      toast.success(t("supplierDetail.entryDeleted"));
      if (editingPayment?._id === payment._id) setEditingPayment(null);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.entryDeleteFailed")));
    } finally {
      setDeletingPaymentId(null);
    }
  }

  function openPay(row: PurchaseRowView) {
    const dueHere = roundMoney(Math.max(0, row.amount - row.paidTotal));
    setPayFor(row);
    setPayAmount(dueHere > 0 ? String(dueHere) : row.balance > 0 ? String(row.balance) : "");
    setPayDate(todayInput());
    setPayNote("");
    setPayOpen(true);
  }

  async function submitPay() {
    if (!payFor) return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("supplierDetail.enterAmount"));
      return;
    }
    if (!payDate) {
      toast.error(t("supplierDetail.pickDate"));
      return;
    }
    const sid = supplierId || supplierIdOf(payFor.entry);
    if (!sid) {
      toast.error(t("supplierDetail.paymentFailed"));
      return;
    }

    setSavingPay(true);
    try {
      const target = payFor.entry;
      const body = {
        amount,
        entryDate: payDate,
        notes: payNote.trim() || undefined,
        purchaseId:
          target.type === "purchase" ? purchaseIdOf(target) || undefined : undefined,
        appliesTo: target.type === "adjustment" ? target._id : undefined,
      };
      const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
        recordPayment(sid, { ...body, confirmDuplicate })
      );
      if (cancelled) return;
      toast.success(t("supplierDetail.paymentRecorded"));
      setPayOpen(false);
      setPayFor(null);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.paymentFailed")));
    } finally {
      setSavingPay(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    if (!formDate) {
      toast.error(t("supplierDetail.pickDate"));
      return;
    }
    if (editing.type === "payment" || editing.type === "adjustment") {
      const amount = Number(formAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error(t("supplierDetail.enterAmount"));
        return;
      }
    } else {
      const purchaseId = purchaseIdOf(editing);
      if (!purchaseId) {
        toast.error(t("supplierDetail.purchaseMissing"));
        return;
      }
      const qty = Math.round(Number(formQty));
      const rate = Number(formRate);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error(t("purchases.enterQty"));
        return;
      }
      if (!Number.isFinite(rate) || rate <= 0) {
        toast.error(t("purchases.enterRate"));
        return;
      }
    }

    setSaving(true);
    try {
      if (editing.type === "payment" || editing.type === "adjustment") {
        await updateLedgerEntry(supplierId || supplierIdOf(editing), editing._id, {
          amount: Number(formAmount),
          entryDate: formDate,
          notes:
            formNote.trim() ||
            (editing.type === "adjustment" ? "Previous pending" : "Payment"),
        });
        toast.success(t("supplierDetail.entryUpdated"));
      } else {
        const qty = Math.round(Number(formQty));
        const rate = Number(formRate);
        await updatePurchase(purchaseIdOf(editing), {
          materialType: formMaterial,
          quantityKg: qty,
          ratePerKg: rate,
          totalAmount: roundMoney(qty * rate),
          purchaseDate: formDate,
        });
        toast.success(t("supplierDetail.entryUpdated"));
      }
      setDialogOpen(false);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.entrySaveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry() {
    if (!editing) return;
    const confirmMsg =
      editing.type === "payment"
        ? t("supplierDetail.confirmDeletePayment")
        : editing.type === "adjustment"
          ? t("supplierDetail.confirmDeletePreviousPending")
          : t("supplierDetail.confirmDeletePurchase");
    if (!confirm(confirmMsg)) return;
    setDeleting(true);
    try {
      if (editing.type === "payment" || editing.type === "adjustment") {
        await deleteLedgerEntry(supplierId || supplierIdOf(editing), editing._id);
      } else {
        const purchaseId = purchaseIdOf(editing);
        if (!purchaseId) {
          toast.error(t("supplierDetail.purchaseMissing"));
          return;
        }
        await deletePurchase(purchaseId);
      }
      toast.success(t("supplierDetail.entryDeleted"));
      setDialogOpen(false);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.entryDeleteFailed")));
    } finally {
      setDeleting(false);
    }
  }

  async function deleteDirect(e: LedgerEntry) {
    const confirmMsg =
      e.type === "payment"
        ? t("supplierDetail.confirmDeletePayment")
        : e.type === "adjustment"
          ? t("supplierDetail.confirmDeletePreviousPending")
          : t("supplierDetail.confirmDeletePurchase");
    if (!confirm(confirmMsg)) return;
    try {
      if (e.type === "payment" || e.type === "adjustment") {
        await deleteLedgerEntry(supplierId || supplierIdOf(e), e._id);
      } else {
        const purchaseId = purchaseIdOf(e);
        if (!purchaseId) {
          toast.error(t("supplierDetail.purchaseMissing"));
          return;
        }
        await deletePurchase(purchaseId);
      }
      toast.success(t("supplierDetail.entryDeleted"));
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.entryDeleteFailed")));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={isAllRange ? "default" : "outline"}
              onClick={setAllRange}
            >
              {t("sal.filterAll")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isTodayRange ? "default" : "outline"}
              onClick={setTodayRange}
            >
              {t("sal.filterToday")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isMonthRange ? "default" : "outline"}
              onClick={setThisMonthRange}
            >
              {t("sal.filterThisMonth")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={showPreviousPending ? "default" : "outline"}
              onClick={() => setShowPreviousPending((v) => !v)}
            >
              {showPreviousPending
                ? t("supplierDetail.hidePreviousPending")
                : t("supplierDetail.showPreviousPending")}
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
              <Label>{t("exp.totalSpent")}</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3">
                <span className="font-data text-base font-semibold">
                  {formatMoney(total)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {purchaseViews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14">
            <p className="text-sm text-muted-foreground">
              {hasDateFilter
                ? t("sal.ledgerEmptyFiltered")
                : t("supplierDetail.noPurchaseOnDay")}
            </p>
            {hasDateFilter ? (
              <Button type="button" variant="outline" onClick={setAllRange}>
                {t("sal.filterAll")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <Table className="table-fixed" containerClassName="overflow-x-hidden">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[7.5rem]">{t("common.date")}</TableHead>
                  {showSupplierNames ? (
                    <TableHead className="w-[8rem]">{t("purchases.col.supplier")}</TableHead>
                  ) : null}
                  <TableHead className="w-[11rem]">{t("exp.colDetail")}</TableHead>
                  <TableHead className="w-[7rem] text-end">{t("common.amount")}</TableHead>
                  <TableHead className="w-[8rem] text-end">
                    {t("supplierDetail.previousPlusAmount")}
                  </TableHead>
                  <TableHead className="min-w-0 text-end">{t("customerDetail.paid")}</TableHead>
                  <TableHead className="w-[7rem] text-end">{t("common.balance")}</TableHead>
                  <TableHead className="w-[7.5rem] text-end">{t("exp.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseViews.map((row) => {
                  const e = row.entry;
                  const isPaid = row.amount - row.paidTotal <= 0.001;
                  return (
                    <TableRow
                      key={e._id}
                      className={isPaid ? "bg-emerald-50 hover:bg-emerald-50/90 dark:bg-emerald-950/40" : undefined}
                    >
                      <TableCell className="font-data whitespace-nowrap">
                        {formatDate(e.entryDate)}
                      </TableCell>
                      {showSupplierNames ? (
                        <TableCell className="truncate font-medium">
                          {supplierNameOf(e, isUrdu) || "—"}
                        </TableCell>
                      ) : null}
                      <TableCell className="whitespace-normal">
                        <span className="text-sm">{purchaseDetail(e)}</span>
                      </TableCell>
                      <TableCell className="font-data text-end whitespace-nowrap">
                        {formatMoney(row.amount)}
                      </TableCell>
                      <TableCell className="font-data text-end whitespace-nowrap">
                        {formatMoney(row.previousPlusAmount)}
                      </TableCell>
                      <TableCell className="whitespace-normal text-end">
                        {row.paidSlices.length === 0 ? (
                          <span className="font-data text-muted-foreground">
                            {t("supplierDetail.noPaymentsYet")}
                          </span>
                        ) : (
                          <div className="flex flex-col items-end gap-0.5">
                            {row.paidSlices.map((slice) => (
                              <span
                                key={`${slice.entryId}-${slice.amount}`}
                                className="font-data text-sm leading-snug"
                              >
                                {t("supplierDetail.paidOnDate", {
                                  amount: formatMoney(slice.amount),
                                  date: formatDate(slice.date),
                                })}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className={`font-data text-end whitespace-nowrap ${balanceToneClass(row.balance) || ""}`}
                        title={
                          row.balance > 0.001
                            ? t("supplierDetail.balanceOwedHint")
                            : row.balance < -0.001
                              ? t("supplierDetail.advanceHint")
                              : undefined
                        }
                      >
                        {formatBalanceDisplay(row.balance)}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            title={t("supplierDetail.pay")}
                            aria-label={t("supplierDetail.pay")}
                            onClick={() => openPay(row)}
                          >
                            <Banknote className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            title={t("common.edit")}
                            aria-label={t("common.edit")}
                            onClick={() => openEdit(e, row)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="destructive"
                            title={t("common.delete")}
                            aria-label={t("common.delete")}
                            onClick={() => void deleteDirect(e)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell
                    colSpan={showSupplierNames ? 3 : 2}
                    className="font-semibold"
                  >
                    {t("exp.totalSpent")}
                  </TableCell>
                  <TableCell className="font-data text-end text-base font-semibold whitespace-nowrap">
                    {formatMoney(total)}
                  </TableCell>
                  <TableCell colSpan={4} />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={payOpen}
        onOpenChange={(open) => {
          setPayOpen(open);
          if (!open) setPayFor(null);
        }}
      >
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("supplierDetail.recordPayment")}</DialogTitle>
            <DialogDescription>
              {payFor
                ? purchaseDetail(payFor.entry)
                : t("supplierDetail.recordPaymentDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("supplierDetail.payAmount")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="h-11 text-base"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("common.date")}</Label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("exp.noteOptional")}</Label>
              <Input
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className="h-11"
              />
            </div>
            {payFor && payFor.balance > 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("common.balance")}: {formatMoney(payFor.balance)}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPayOpen(false)}
            >
              {t("sal.cancel")}
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              disabled={savingPay}
              onClick={() => void submitPay()}
            >
              {savingPay ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-4" />}
              {t("supplierDetail.submitPayment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setEditingRow(null);
            setEditingPayment(null);
          }
        }}
      >
        <DialogContent showCloseButton className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing?.type === "payment"
                ? t("supplierDetail.editPayment")
                : editing?.type === "adjustment"
                  ? t("supplierDetail.editPreviousPending")
                  : t("supplierDetail.editPurchase")}
            </DialogTitle>
            <DialogDescription>
              {editing?.type === "payment"
                ? t("supplierDetail.paymentHistory")
                : editing?.type === "adjustment"
                  ? t("supplierDetail.previousPending")
                  : t("supplierDetail.purchaseHistory")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {editing?.type === "payment" || editing?.type === "adjustment" ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("exp.amount")}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="h-11 text-base"
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("common.date")}</Label>
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
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("purchases.material")}</Label>
                  <select
                    className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
                    value={formMaterial}
                    onChange={(e) => setFormMaterial(e.target.value as "scrap" | "daig")}
                  >
                    <option value="scrap">{t("prod.scrap")}</option>
                    <option value="daig">{t("prod.daig")}</option>
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label>{t("purchases.quantityKg")}</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={formQty}
                      onChange={(e) => setFormQty(e.target.value)}
                      className="h-11 text-base"
                      autoFocus
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{t("purchases.ratePerKg")}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={formRate}
                      onChange={(e) => setFormRate(e.target.value)}
                      className="h-11 text-base"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("purchases.totalAmount")}</Label>
                  <div className="font-data flex h-11 items-center rounded-lg border border-border bg-muted/40 px-3 text-base">
                    {formTotal > 0 ? formatMoney(formTotal) : "—"}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("purchases.purchaseDate")}</Label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="h-11"
                  />
                </div>
              </>
            )}

            {editing && editing.type !== "payment" ? (
              <div className="mt-1 rounded-lg border border-border p-3">
                <p className="mb-2 text-sm font-medium">
                  {t("supplierDetail.paymentsOnRecord")}
                </p>
                {rowPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("supplierDetail.noPaymentsYet")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {rowPayments.map((payment) => {
                      const isEditingThis = editingPayment?._id === payment._id;
                      return (
                        <div
                          key={payment._id}
                          className="rounded-md border border-border/70 bg-muted/20 p-2.5"
                        >
                          {isEditingThis ? (
                            <div className="grid gap-2">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="flex flex-col gap-1">
                                  <Label>{t("exp.amount")}</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={payEditAmount}
                                    onChange={(e) => setPayEditAmount(e.target.value)}
                                    className="h-9"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <Label>{t("common.date")}</Label>
                                  <Input
                                    type="date"
                                    value={payEditDate}
                                    onChange={(e) => setPayEditDate(e.target.value)}
                                    className="h-9"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Label>{t("exp.noteOptional")}</Label>
                                <Input
                                  value={payEditNote}
                                  onChange={(e) => setPayEditNote(e.target.value)}
                                  className="h-9"
                                />
                              </div>
                              <div className="flex flex-wrap justify-end gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={savingPaymentEdit}
                                  onClick={() => setEditingPayment(null)}
                                >
                                  {t("sal.cancel")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="gap-1"
                                  disabled={savingPaymentEdit}
                                  onClick={() => void savePaymentEdit()}
                                >
                                  {savingPaymentEdit ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : null}
                                  {t("common.save")}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-data text-sm font-medium">
                                  {formatMoney(payment.amount)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(payment.entryDate)}
                                  {payment.notes && !isInternalNote(payment.notes)
                                    ? ` · ${payment.notes}`
                                    : ""}
                                </p>
                              </div>
                              <div className="inline-flex shrink-0 gap-1">
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="outline"
                                  title={t("common.edit")}
                                  aria-label={t("common.edit")}
                                  onClick={() => openPaymentEdit(payment)}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="destructive"
                                  title={t("common.delete")}
                                  aria-label={t("common.delete")}
                                  disabled={deletingPaymentId === payment._id}
                                  onClick={() => void deletePayment(payment)}
                                >
                                  {deletingPaymentId === payment._id ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="size-3.5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              className="gap-1.5"
              disabled={deleting || saving}
              onClick={() => void removeEntry()}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {t("common.delete")}
            </Button>
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
                onClick={() => void saveEdit()}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("common.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
