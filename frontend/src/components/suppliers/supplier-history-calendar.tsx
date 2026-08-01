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

type KhataRow = {
  entry: LedgerEntry;
  debit: number;
  credit: number;
  baqaya: number;
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

function entryTime(e: LedgerEntry) {
  return new Date(e.entryDate).getTime();
}

function payableOf(p: NonNullable<ReturnType<typeof purchaseOf>>) {
  return roundMoney((p.totalAmount || 0) + (p.freightAmount || 0));
}

function formatBaqaya(baqaya: number) {
  const abs = formatMoney(Math.abs(baqaya));
  if (baqaya > 0.001) return abs;
  if (baqaya < -0.001) return `+ ${abs}`;
  return formatMoney(0);
}

function baqayaClass(baqaya: number) {
  if (baqaya > 0.001) return "text-amber-700 dark:text-amber-400";
  if (baqaya < -0.001) return "text-emerald-700 dark:text-emerald-400";
  return undefined;
}

/** Classic khata: oldest → newest, baqaya after each line. */
function buildKhataRows(entries: LedgerEntry[]): KhataRow[] {
  const bySupplier = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    if (e.type === "adjustment" && (e.signedAmount ?? 0) <= 0) continue;
    const sid = supplierIdOf(e);
    const list = bySupplier.get(sid) || [];
    list.push(e);
    bySupplier.set(sid, list);
  }

  const rows: KhataRow[] = [];
  for (const [, list] of bySupplier) {
    const ordered = list
      .slice()
      .sort((a, b) => entryTime(a) - entryTime(b) || a._id.localeCompare(b._id));

    let baqaya = 0;
    for (const e of ordered) {
      let debit = 0;
      let credit = 0;
      if (e.type === "payment") {
        credit = roundMoney(e.amount || 0);
        baqaya = roundMoney(baqaya - credit);
      } else if (e.type === "adjustment") {
        debit = roundMoney(e.signedAmount ?? e.amount ?? 0);
        baqaya = roundMoney(baqaya + debit);
      } else {
        const p = purchaseOf(e);
        debit = p ? payableOf(p) : roundMoney(e.amount || 0);
        baqaya = roundMoney(baqaya + debit);
      }
      rows.push({ entry: e, debit, credit, baqaya });
    }
  }
  return rows;
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

  const allRows = useMemo(() => buildKhataRows(entries), [entries]);

  const filteredRows = useMemo(() => {
    let list = allRows;
    if (dateFrom) {
      list = list.filter((r) => dayKey(new Date(r.entry.entryDate)) >= dateFrom);
    }
    if (dateTo) {
      list = list.filter((r) => dayKey(new Date(r.entry.entryDate)) <= dateTo);
    }
    // Khata order: oldest at top, latest baqaya at bottom.
    return list
      .slice()
      .sort(
        (a, b) =>
          entryTime(a.entry) - entryTime(b.entry) ||
          a.entry._id.localeCompare(b.entry._id)
      );
  }, [allRows, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const totalDebit = roundMoney(filteredRows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = roundMoney(filteredRows.reduce((s, r) => s + r.credit, 0));
    // Closing baqaya: last line per supplier in filtered set, summed.
    const lastBySup = new Map<string, number>();
    for (const r of filteredRows) {
      lastBySup.set(supplierIdOf(r.entry), r.baqaya);
    }
    let closing = 0;
    for (const v of lastBySup.values()) closing = roundMoney(closing + v);
    // If date filter skips early lines, baqaya on rows is still full-history — fix for filter:
    // Recompute filtered-only running when date filter is on.
    if (dateFrom || dateTo) {
      const bySup = new Map<string, KhataRow[]>();
      for (const r of filteredRows) {
        const sid = supplierIdOf(r.entry);
        const list = bySup.get(sid) || [];
        list.push(r);
        bySup.set(sid, list);
      }
      closing = 0;
      for (const [, rows] of bySup) {
        let b = 0;
        for (const r of rows) {
          b = roundMoney(b + r.debit - r.credit);
        }
        closing = roundMoney(closing + b);
      }
    }
    return { totalDebit, totalCredit, closing };
  }, [filteredRows, dateFrom, dateTo]);

  // When date-filtered, show baqaya as running within filtered window only.
  const displayRows = useMemo(() => {
    if (!dateFrom && !dateTo) return filteredRows;
    const bySup = new Map<string, KhataRow[]>();
    for (const r of filteredRows) {
      const sid = supplierIdOf(r.entry);
      const list = bySup.get(sid) || [];
      list.push(r);
      bySup.set(sid, list);
    }
    const out: KhataRow[] = [];
    for (const [, rows] of bySup) {
      let b = 0;
      for (const r of rows) {
        b = roundMoney(b + r.debit - r.credit);
        out.push({ ...r, baqaya: b });
      }
    }
    return out.sort(
      (a, b) =>
        entryTime(a.entry) - entryTime(b.entry) ||
        a.entry._id.localeCompare(b.entry._id)
    );
  }, [filteredRows, dateFrom, dateTo]);

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

  function rowDetail(e: LedgerEntry) {
    if (e.type === "payment") {
      return e.notes && !isInternalNote(e.notes)
        ? e.notes
        : t("supplierDetail.khataPayment");
    }
    if (e.type === "adjustment") {
      return e.notes && !isInternalNote(e.notes)
        ? e.notes
        : t("supplierDetail.previousPending");
    }
    const p = purchaseOf(e);
    if (!p) return t("supplierDetail.purchaseHistory");
    return `${materialLabel(p.materialType)} · ${formatKg(p.quantityKg)} kg · ${formatMoney(p.ratePerKg)}/kg`;
  }

  function openEdit(e: LedgerEntry) {
    setEditing(e);
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
      }
      toast.success(t("supplierDetail.entryUpdated"));
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
              <Label>{t("supplierDetail.khataBaqaya")}</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3">
                <span
                  className={`font-data text-base font-semibold ${baqayaClass(totals.closing) || ""}`}
                >
                  {formatBaqaya(totals.closing)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {displayRows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14">
            <p className="text-sm text-muted-foreground">
              {hasDateFilter
                ? t("sal.ledgerEmptyFiltered")
                : t("supplierDetail.noLedger")}
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
                  <TableHead>{t("exp.colDetail")}</TableHead>
                  <TableHead className="w-[8rem] text-end">
                    {t("supplierDetail.khataDebit")}
                  </TableHead>
                  <TableHead className="w-[8rem] text-end">
                    {t("supplierDetail.khataCredit")}
                  </TableHead>
                  <TableHead className="w-[8rem] text-end">
                    {t("supplierDetail.khataBaqaya")}
                  </TableHead>
                  <TableHead className="w-[7.5rem] text-end">{t("exp.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((row) => {
                  const e = row.entry;
                  const isPayment = e.type === "payment";
                  const isCleared = Math.abs(row.baqaya) <= 0.001;
                  return (
                    <TableRow
                      key={e._id}
                      className={
                        isPayment
                          ? "bg-emerald-100 hover:bg-emerald-100/90 dark:bg-emerald-900/50 dark:hover:bg-emerald-900/60"
                          : isCleared
                            ? "bg-muted/40 hover:bg-muted/50"
                            : undefined
                      }
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
                        <span
                          className={`text-sm ${isPayment ? "font-medium text-emerald-800 dark:text-emerald-300" : ""}`}
                        >
                          {rowDetail(e)}
                        </span>
                      </TableCell>
                      <TableCell className="font-data text-end whitespace-nowrap">
                        {row.debit > 0 ? formatMoney(row.debit) : "—"}
                      </TableCell>
                      <TableCell
                        className={`font-data text-end whitespace-nowrap ${
                          row.credit > 0
                            ? "font-semibold text-emerald-700 dark:text-emerald-400"
                            : ""
                        }`}
                      >
                        {row.credit > 0 ? formatMoney(row.credit) : "—"}
                      </TableCell>
                      <TableCell
                        className={`font-data text-end whitespace-nowrap font-medium ${baqayaClass(row.baqaya) || ""}`}
                      >
                        {formatBaqaya(row.baqaya)}
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            title={t("common.edit")}
                            aria-label={t("common.edit")}
                            onClick={() => openEdit(e)}
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
                    {t("supplierDetail.totals")}
                  </TableCell>
                  <TableCell className="font-data text-end text-base font-semibold whitespace-nowrap">
                    {formatMoney(totals.totalDebit)}
                  </TableCell>
                  <TableCell className="font-data text-end text-base font-semibold whitespace-nowrap">
                    {formatMoney(totals.totalCredit)}
                  </TableCell>
                  <TableCell
                    className={`font-data text-end text-base font-semibold whitespace-nowrap ${baqayaClass(totals.closing) || ""}`}
                  >
                    {formatBaqaya(totals.closing)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {editing?.type === "payment"
                ? t("supplierDetail.editPayment")
                : editing?.type === "adjustment"
                  ? t("supplierDetail.editPreviousPending")
                  : t("supplierDetail.editPurchase")}
            </DialogTitle>
            <DialogDescription>
              {editing ? rowDetail(editing) : ""}
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
                    onChange={(e) =>
                      setFormMaterial(e.target.value as "scrap" | "daig")
                    }
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
