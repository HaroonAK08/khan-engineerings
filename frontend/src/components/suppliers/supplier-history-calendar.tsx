"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  apiError,
  deleteLedgerEntry,
  deletePurchase,
  formatDate,
  formatMoney,
  updateLedgerEntry,
  updatePurchase,
} from "@/lib/materials-api";
import type { LedgerEntry } from "@/types/materials";
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
type HistoryKind = "purchase" | "payment";

type Props = {
  supplierId?: string;
  kind: HistoryKind;
  entries: LedgerEntry[];
  onChanged: () => void | Promise<void>;
  showSupplierNames?: boolean;
};

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

function entryDay(e: LedgerEntry) {
  return startOfDay(new Date(e.entryDate));
}

function isInternalNote(notes: string) {
  return /^sup-[a-z0-9-]+$/i.test(notes.trim());
}

function entryAmount(e: LedgerEntry) {
  return e.amount;
}

function purchaseIdOf(e: LedgerEntry) {
  if (!e.purchase) return "";
  if (typeof e.purchase === "string") return e.purchase;
  return e.purchase._id;
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

export function SupplierHistoryCalendar({
  supplierId,
  kind,
  entries,
  onChanged,
  showSupplierNames = false,
}: Props) {
  const { t, isUrdu } = useI18n();
  const locale = isUrdu ? "ur-PK" : "en-PK";
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formQty, setFormQty] = useState("");
  const [formRate, setFormRate] = useState("");
  const [formMaterial, setFormMaterial] = useState<"scrap" | "daig">("scrap");
  const [formInvoice, setFormInvoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(
    () => entries.filter((e) => e.type === kind),
    [entries, kind]
  );

  const formTotal = useMemo(() => {
    const qty = Number(formQty);
    const rate = Number(formRate);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
    return roundMoney(qty * rate);
  }, [formQty, formRate]);

  function openEdit(e: LedgerEntry) {
    setEditing(e);
    setFormDate(dayKey(entryDay(e)));
    if (kind === "payment") {
      setFormAmount(String(e.amount));
      setFormNote(e.notes && !isInternalNote(e.notes) ? e.notes : "");
    } else {
      const p = e.purchase && typeof e.purchase === "object" ? e.purchase : null;
      setFormQty(String(p?.quantityKg ?? ""));
      setFormRate(String(p?.ratePerKg ?? ""));
      setFormMaterial((p?.materialType || "scrap") === "daig" ? "daig" : "scrap");
      setFormInvoice(p?.invoiceNo || "");
      setFormNote(p?.notes || (e.notes && !isInternalNote(e.notes) ? e.notes : ""));
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
          invoiceNo: formInvoice.trim(),
          notes: formNote.trim(),
        });
        toast.success(t("supplierDetail.entryUpdated"));
      }
      setDialogOpen(false);
      setCursor(startOfDay(new Date(`${formDate}T12:00:00`)));
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

  const totalsByDay = useMemo(() => {
    const map = new Map<string, { total: number; count: number; items: LedgerEntry[] }>();
    for (const e of filtered) {
      const key = dayKey(entryDay(e));
      const prev = map.get(key);
      if (prev) {
        prev.total += entryAmount(e);
        prev.count += 1;
        prev.items.push(e);
      } else {
        map.set(key, { total: entryAmount(e), count: 1, items: [e] });
      }
    }
    return map;
  }, [filtered]);

  const totalsByMonth = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const e of filtered) {
      const key = monthKey(entryDay(e));
      const prev = map.get(key);
      if (prev) {
        prev.total += entryAmount(e);
        prev.count += 1;
      } else {
        map.set(key, { total: entryAmount(e), count: 1 });
      }
    }
    return map;
  }, [filtered]);

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

  const dayEntries = useMemo(
    () => totalsByDay.get(dayKey(cursor))?.items ?? [],
    [cursor, totalsByDay]
  );

  const dayTotal = useMemo(
    () => dayEntries.reduce((s, e) => s + entryAmount(e), 0),
    [dayEntries]
  );

  const monthTotal = useMemo(
    () => totalsByMonth.get(monthKey(cursor))?.total ?? 0,
    [cursor, totalsByMonth]
  );

  const yearTotal = useMemo(() => {
    const y = cursor.getFullYear();
    return filtered.reduce(
      (sum, e) => (entryDay(e).getFullYear() === y ? sum + entryAmount(e) : sum),
      0
    );
  }, [cursor, filtered]);

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
    () => filtered.reduce((s, e) => s + entryAmount(e), 0),
    [filtered]
  );

  const summaryAmount =
    viewMode === "daily" ? dayTotal : viewMode === "monthly" ? monthTotal : yearTotal;

  const modes: { id: ViewMode; label: string }[] = [
    { id: "daily", label: t("sal.viewDaily") },
    { id: "monthly", label: t("sal.viewMonthly") },
    { id: "yearly", label: t("sal.viewYearly") },
  ];

  const periodLabel =
    kind === "purchase"
      ? t("supplierDetail.periodPurchased", { amount: formatMoney(summaryAmount) })
      : t("supplierDetail.periodPaid", { amount: formatMoney(summaryAmount) });

  const totalLabel =
    kind === "purchase"
      ? t("supplierDetail.purchasesTotal", { amount: formatMoney(allTotal) })
      : t("supplierDetail.paymentsTotal", { amount: formatMoney(allTotal) });

  const emptyDay =
    kind === "purchase"
      ? t("supplierDetail.noPurchaseOnDay")
      : t("supplierDetail.noPaymentOnDay");

  const countLabel = (count: number) =>
    kind === "purchase"
      ? t("supplierDetail.purchaseCount", { count })
      : t("supplierDetail.paymentCount", { count });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-end gap-2">
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
                <p className="font-data text-xs text-muted-foreground">{periodLabel}</p>
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
            <div className="font-data text-sm text-muted-foreground">{totalLabel}</div>
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
                          ? kind === "payment"
                            ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40"
                            : "border-red-300 bg-red-50 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40"
                          : "border-border/70 bg-background hover:bg-muted/40",
                        isSelected
                          ? kind === "payment"
                            ? "ring-2 ring-emerald-500"
                            : "ring-2 ring-red-500"
                          : "",
                        isToday ? "border-foreground/40" : "",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "font-data text-sm font-medium",
                          isToday
                            ? kind === "payment"
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-red-700 dark:text-red-400"
                            : "",
                        ].join(" ")}
                      >
                        {cell.date.getDate()}
                      </span>
                      {info ? (
                        <>
                          <span
                            className={[
                              "font-data mt-auto text-[11px] font-semibold sm:text-xs",
                              kind === "payment"
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-red-700 dark:text-red-300",
                            ].join(" ")}
                          >
                            {formatMoney(info.total)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {countLabel(info.count)}
                          </span>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t("supplierDetail.tapDayHint")}</p>
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
                        ? kind === "payment"
                          ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40"
                          : "border-red-300 bg-red-50 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40"
                        : "border-border/70 hover:bg-muted/40",
                      isCurrent
                        ? kind === "payment"
                          ? "ring-2 ring-emerald-500/60"
                          : "ring-2 ring-red-500/60"
                        : "",
                    ].join(" ")}
                  >
                    <span className="text-sm font-medium">{label}</span>
                    <span className="font-data mt-3 text-lg font-semibold">
                      {info ? formatMoney(info.total) : "—"}
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {info ? countLabel(info.count) : emptyDay}
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
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{t("exp.amount")}</p>
                  <p className="font-data text-lg font-semibold">{formatMoney(dayTotal)}</p>
                </div>
              </div>

              {dayEntries.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{emptyDay}</p>
              ) : (
                <div className="overflow-hidden rounded-xl border">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <span>{t("exp.colDetail")}</span>
                    <span>
                      {t("exp.amount")} / {t("exp.actions")}
                    </span>
                  </div>
                  {dayEntries
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
                    )
                    .map((e) => {
                      const purchase =
                        e.purchase && typeof e.purchase === "object" ? e.purchase : null;
                      const detail =
                        e.notes && !isInternalNote(e.notes)
                          ? e.notes
                          : kind === "purchase"
                            ? t("supplierDetail.typePurchase")
                            : t("supplierDetail.typePayment");
                      const supplierName = showSupplierNames
                        ? supplierNameOf(e, isUrdu)
                        : "";
                      return (
                        <div
                          key={e._id}
                          className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {supplierName ? `${supplierName} · ` : ""}
                              {detail}
                            </p>
                            {purchase ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {purchase.quantityKg} kg · {formatMoney(purchase.ratePerKg)}
                                /kg
                                {purchase.invoiceNo ? ` · ${purchase.invoiceNo}` : ""}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={[
                                "font-data text-sm font-medium",
                                kind === "payment"
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "",
                              ].join(" ")}
                            >
                              {kind === "payment" ? "−" : "+"}
                              {formatMoney(entryAmount(e))}
                            </span>
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
                        </div>
                      );
                    })}
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
                <div className="flex flex-col gap-1.5">
                  <Label>{t("purchases.invoiceOptional")}</Label>
                  <Input
                    value={formInvoice}
                    onChange={(e) => setFormInvoice(e.target.value)}
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
