"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import {
  apiError,
  deleteLedgerEntry,
  deletePurchase,
  formatDate,
  formatKg,
  formatMoney,
  updateLedgerEntry,
  updatePurchase,
} from "@/lib/materials-api";
import type { LedgerEntry } from "@/types/materials";
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

type HistoryKind = "purchase" | "payment";

type Props = {
  supplierId?: string;
  kind: HistoryKind;
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

function paidOf(p: NonNullable<ReturnType<typeof purchaseOf>>) {
  return roundMoney(p.amountPaid || 0);
}

function balanceOf(p: NonNullable<ReturnType<typeof purchaseOf>>) {
  if (typeof p.balance === "number") return roundMoney(p.balance);
  return roundMoney(Math.max(0, payableOf(p) - paidOf(p)));
}

export function SupplierHistoryCalendar({
  supplierId,
  kind,
  entries,
  onChanged,
  showSupplierNames = false,
}: Props) {
  const { t, isUrdu } = useI18n();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formQty, setFormQty] = useState("");
  const [formRate, setFormRate] = useState("");
  const [formMaterial, setFormMaterial] = useState<"scrap" | "daig">("scrap");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    let list = entries.filter((e) => e.type === kind);
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
  }, [entries, kind, dateFrom, dateTo]);

  const total = useMemo(
    () => filtered.reduce((s, e) => s + e.amount, 0),
    [filtered]
  );

  const formTotal = useMemo(() => {
    const qty = Number(formQty);
    const rate = Number(formRate);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
    return roundMoney(qty * rate);
  }, [formQty, formRate]);

  const today = todayInput();
  const month = currentMonthRange();
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
    const m = currentMonthRange();
    setDateFrom(m.from);
    setDateTo(m.to);
  }

  function setAllRange() {
    setDateFrom("");
    setDateTo("");
  }

  function materialLabel(type?: string) {
    return type === "daig" ? t("prod.daig") : t("prod.scrap");
  }

  function payStatus(p: NonNullable<ReturnType<typeof purchaseOf>>) {
    const paid = paidOf(p);
    const payable = payableOf(p);
    if (paid <= 0) return "unpaid" as const;
    if (paid + 0.001 >= payable) return "paid" as const;
    return "partial" as const;
  }

  function purchaseDetail(e: LedgerEntry) {
    const p = purchaseOf(e);
    if (!p) return t("supplierDetail.purchaseHistory");
    return `${materialLabel(p.materialType)} · ${formatKg(p.quantityKg)} kg · ${formatMoney(p.ratePerKg)}/kg`;
  }

  function paymentDetail(e: LedgerEntry) {
    const p = purchaseOf(e);
    if (!p) {
      return e.notes && !isInternalNote(e.notes)
        ? e.notes
        : t("supplierDetail.paymentHistory");
    }
    return t("supplierDetail.paymentForPurchase", {
      detail: `${materialLabel(p.materialType)} · ${formatKg(p.quantityKg)} kg`,
      date: formatDate(p.purchaseDate || e.entryDate),
    });
  }

  function openEdit(e: LedgerEntry) {
    setEditing(e);
    setFormDate(dayKey(new Date(e.entryDate)));
    if (kind === "payment") {
      setFormAmount(String(e.amount));
      setFormNote(e.notes && !isInternalNote(e.notes) ? e.notes : "");
    } else {
      const p = purchaseOf(e);
      setFormQty(String(p?.quantityKg ?? ""));
      setFormRate(String(p?.ratePerKg ?? ""));
      setFormMaterial((p?.materialType || "scrap") === "daig" ? "daig" : "scrap");
    }
    setDialogOpen(true);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!formDate) {
      toast.error(t("supplierDetail.pickDate"));
      return;
    }
    if (kind === "payment") {
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
      if (kind === "payment") {
        await updateLedgerEntry(supplierId || supplierIdOf(editing), editing._id, {
          amount: Number(formAmount),
          entryDate: formDate,
          notes: formNote.trim() || "Payment",
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
      kind === "payment"
        ? t("supplierDetail.confirmDeletePayment")
        : t("supplierDetail.confirmDeletePurchase");
    if (!confirm(confirmMsg)) return;
    setDeleting(true);
    try {
      if (kind === "payment") {
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
      kind === "payment"
        ? t("supplierDetail.confirmDeletePayment")
        : t("supplierDetail.confirmDeletePurchase");
    if (!confirm(confirmMsg)) return;
    try {
      if (kind === "payment") {
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

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14">
            <p className="text-sm text-muted-foreground">
              {hasDateFilter
                ? t("sal.ledgerEmptyFiltered")
                : kind === "payment"
                  ? t("supplierDetail.noPaymentOnDay")
                  : t("supplierDetail.noPurchaseOnDay")}
            </p>
            {hasDateFilter ? (
              <Button type="button" variant="outline" onClick={setAllRange}>
                {t("sal.filterAll")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : kind === "purchase" ? (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  {showSupplierNames ? (
                    <TableHead>{t("purchases.col.supplier")}</TableHead>
                  ) : null}
                  <TableHead>{t("exp.colDetail")}</TableHead>
                  <TableHead className="text-end">{t("common.amount")}</TableHead>
                  <TableHead className="text-end">{t("customerDetail.paid")}</TableHead>
                  <TableHead className="text-end">{t("common.balance")}</TableHead>
                  <TableHead className="text-end">{t("exp.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => {
                  const p = purchaseOf(e);
                  const remaining = p ? balanceOf(p) : 0;
                  const isPaid = p ? payStatus(p) === "paid" : false;
                  return (
                    <TableRow
                      key={e._id}
                      className={isPaid ? "bg-emerald-50 hover:bg-emerald-50/90 dark:bg-emerald-950/40" : undefined}
                    >
                      <TableCell className="font-data whitespace-nowrap">
                        {formatDate(e.entryDate)}
                      </TableCell>
                      {showSupplierNames ? (
                        <TableCell className="font-medium">
                          {supplierNameOf(e, isUrdu) || "—"}
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <span className="text-sm">{purchaseDetail(e)}</span>
                      </TableCell>
                      <TableCell className="font-data text-end whitespace-nowrap">
                        {formatMoney(p ? payableOf(p) : e.amount)}
                      </TableCell>
                      <TableCell className="font-data text-end whitespace-nowrap">
                        {formatMoney(p ? paidOf(p) : 0)}
                      </TableCell>
                      <TableCell className="font-data text-end whitespace-nowrap">
                        {formatMoney(remaining)}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => openEdit(e)}
                          >
                            <Pencil className="size-3.5" />
                            {t("common.edit")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="gap-1"
                            onClick={() => void deleteDirect(e)}
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
                  <TableCell
                    colSpan={showSupplierNames ? 3 : 2}
                    className="font-semibold"
                  >
                    {t("exp.totalSpent")}
                  </TableCell>
                  <TableCell className="font-data text-end text-base font-semibold whitespace-nowrap">
                    {formatMoney(total)}
                  </TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  {showSupplierNames ? (
                    <TableHead>{t("purchases.col.supplier")}</TableHead>
                  ) : null}
                  <TableHead>{t("supplierDetail.paidFor")}</TableHead>
                  <TableHead className="text-end">{t("exp.amount")}</TableHead>
                  <TableHead className="text-end">{t("exp.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e._id}>
                    <TableCell className="font-data whitespace-nowrap">
                      {formatDate(e.entryDate)}
                    </TableCell>
                    {showSupplierNames ? (
                      <TableCell className="font-medium">
                        {supplierNameOf(e, isUrdu) || "—"}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <span className="text-sm">{paymentDetail(e)}</span>
                    </TableCell>
                    <TableCell className="font-data text-end font-medium whitespace-nowrap">
                      {formatMoney(e.amount)}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => openEdit(e)}
                        >
                          <Pencil className="size-3.5" />
                          {t("sal.editPayment")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="gap-1"
                          onClick={() => void deleteDirect(e)}
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
                  <TableCell
                    colSpan={showSupplierNames ? 3 : 2}
                    className="font-semibold"
                  >
                    {t("customerDetail.totalPaid")}
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
              {kind === "payment"
                ? t("supplierDetail.editPayment")
                : t("supplierDetail.editPurchase")}
            </DialogTitle>
            <DialogDescription>
              {kind === "payment"
                ? t("supplierDetail.paymentHistory")
                : t("supplierDetail.purchaseHistory")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {kind === "payment" ? (
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
