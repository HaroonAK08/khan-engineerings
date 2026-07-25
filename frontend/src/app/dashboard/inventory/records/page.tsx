"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  apiError,
  createPurchase,
  deletePurchase,
  formatDate,
  formatKg,
  formatMoney,
  listPurchases,
  listSuppliers,
  supplierName,
  updatePurchase,
} from "@/lib/materials-api";
import type { Purchase, Supplier } from "@/types/materials";
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

function purchaseDay(p: Purchase) {
  return startOfDay(new Date(p.purchaseDate));
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function supplierIdOf(p: Purchase) {
  if (!p.supplier) return "";
  if (typeof p.supplier === "string") return p.supplier;
  return p.supplier._id;
}

export default function InventoryRecordsPage() {
  const { t, isUrdu } = useI18n();
  const locale = isUrdu ? "ur-PK" : "en-PK";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [formSupplier, setFormSupplier] = useState("");
  const [formMaterial, setFormMaterial] = useState<"scrap" | "daig">("scrap");
  const [formQty, setFormQty] = useState("");
  const [formRate, setFormRate] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formInvoice, setFormInvoice] = useState("");
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => s.isActive),
    [suppliers]
  );

  const formTotal = useMemo(() => {
    const qty = Number(formQty);
    const rate = Number(formRate);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
    return roundMoney(qty * rate);
  }, [formQty, formRate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, list] = await Promise.all([listSuppliers(), listPurchases()]);
      setSuppliers(s);
      setPurchases(list);
    } catch (err) {
      toast.error(apiError(err, t("purchases.recordsLoadFailed")));
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function openAdd(date: Date) {
    setDialogMode("add");
    setEditing(null);
    setFormSupplier(activeSuppliers[0]?._id || "");
    setFormMaterial("scrap");
    setFormQty("");
    setFormRate("");
    setFormDate(dayKey(date));
    setFormInvoice("");
    setFormNote("");
    setDialogOpen(true);
  }

  function openEdit(p: Purchase) {
    setDialogMode("edit");
    setEditing(p);
    setFormSupplier(supplierIdOf(p));
    setFormMaterial((p.materialType || "scrap") === "daig" ? "daig" : "scrap");
    setFormQty(String(p.quantityKg));
    setFormRate(String(p.ratePerKg));
    setFormDate(dayKey(startOfDay(new Date(p.purchaseDate))));
    setFormInvoice(p.invoiceNo || "");
    setFormNote(p.notes || "");
    setDialogOpen(true);
  }

  async function saveDialog() {
    const qty = Math.round(Number(formQty));
    const rate = Number(formRate);
    if (!formSupplier) {
      toast.error(t("purchases.selectSupplier"));
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error(t("purchases.enterQty"));
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error(t("purchases.enterRate"));
      return;
    }
    if (!formDate) {
      toast.error(t("purchases.pickDate"));
      return;
    }
    const total = roundMoney(qty * rate);
    setSaving(true);
    try {
      if (dialogMode === "add") {
        await createPurchase({
          supplier: formSupplier,
          materialType: formMaterial,
          quantityKg: qty,
          ratePerKg: rate,
          totalAmount: total,
          purchaseDate: formDate,
          invoiceNo: formInvoice.trim() || undefined,
          notes: formNote.trim() || undefined,
          freightAmount: 0,
          amountPaid: 0,
        });
        toast.success(t("purchases.entryAdded"));
      } else if (editing) {
        await updatePurchase(editing._id, {
          supplier: formSupplier,
          materialType: formMaterial,
          quantityKg: qty,
          ratePerKg: rate,
          totalAmount: total,
          purchaseDate: formDate,
          invoiceNo: formInvoice.trim(),
          notes: formNote.trim(),
        });
        toast.success(t("purchases.entryUpdated"));
      }
      setDialogOpen(false);
      setCursor(startOfDay(new Date(`${formDate}T12:00:00`)));
      await load();
    } catch (err) {
      toast.error(apiError(err, t("purchases.entrySaveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry() {
    if (!editing) return;
    if (!confirm(t("purchases.deleteConfirm"))) return;
    setDeleting(true);
    try {
      await deletePurchase(editing._id);
      toast.success(t("purchases.deleted"));
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("purchases.entryDeleteFailed")));
    } finally {
      setDeleting(false);
    }
  }

  async function deleteDirect(p: Purchase) {
    if (!confirm(t("purchases.deleteConfirm"))) return;
    try {
      await deletePurchase(p._id);
      toast.success(t("purchases.deleted"));
      await load();
    } catch (err) {
      toast.error(apiError(err, t("purchases.entryDeleteFailed")));
    }
  }

  const totalsByDay = useMemo(() => {
    const map = new Map<string, { total: number; count: number; items: Purchase[] }>();
    for (const p of purchases) {
      const key = dayKey(purchaseDay(p));
      const prev = map.get(key);
      const amount = p.payable ?? p.totalAmount + (p.freightAmount || 0);
      if (prev) {
        prev.total += amount;
        prev.count += 1;
        prev.items.push(p);
      } else {
        map.set(key, { total: amount, count: 1, items: [p] });
      }
    }
    return map;
  }, [purchases]);

  const totalsByMonth = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const p of purchases) {
      const key = monthKey(purchaseDay(p));
      const prev = map.get(key);
      const amount = p.payable ?? p.totalAmount + (p.freightAmount || 0);
      if (prev) {
        prev.total += amount;
        prev.count += 1;
      } else {
        map.set(key, { total: amount, count: 1 });
      }
    }
    return map;
  }, [purchases]);

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
    () =>
      dayEntries.reduce(
        (s, p) => s + (p.payable ?? p.totalAmount + (p.freightAmount || 0)),
        0
      ),
    [dayEntries]
  );

  const monthTotal = useMemo(
    () => totalsByMonth.get(monthKey(cursor))?.total ?? 0,
    [cursor, totalsByMonth]
  );

  const yearTotal = useMemo(() => {
    const y = cursor.getFullYear();
    return purchases.reduce((sum, p) => {
      if (purchaseDay(p).getFullYear() !== y) return sum;
      return sum + (p.payable ?? p.totalAmount + (p.freightAmount || 0));
    }, 0);
  }, [cursor, purchases]);

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
    () =>
      purchases.reduce(
        (s, p) => s + (p.payable ?? p.totalAmount + (p.freightAmount || 0)),
        0
      ),
    [purchases]
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
            href="/dashboard/inventory"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t("purchases.backToInventory")}
          </Link>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("purchases.recordsEyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("purchases.recordsTitle")}</h1>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            {t("purchases.recordsDesc")}
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
                  {t("purchases.periodSpent", { amount: formatMoney(summaryAmount) })}
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
              {t("purchases.recordsTotal", { amount: formatMoney(allTotal) })}
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
                            {t("purchases.entryCount", { count: info.count })}
                          </span>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t("purchases.tapDayHint")}</p>
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
                        ? t("purchases.entryCount", { count: info.count })
                        : t("purchases.noEntryInPeriod")}
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
                    <p className="text-sm text-muted-foreground">{t("purchases.col.payable")}</p>
                    <p className="font-data text-lg font-semibold">
                      {formatMoney(dayTotal)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="gap-1.5"
                    onClick={() => openAdd(cursor)}
                  >
                    <Plus className="size-4" />
                    {t("purchases.addEntry")}
                  </Button>
                </div>
              </div>

              {dayEntries.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <p className="text-sm text-muted-foreground">
                    {t("purchases.noEntryInPeriod")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => openAdd(cursor)}
                  >
                    <Plus className="size-4" />
                    {t("purchases.addEntry")}
                  </Button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <span>{t("exp.colDetail")}</span>
                    <span>
                      {t("purchases.col.payable")} / {t("exp.actions")}
                    </span>
                  </div>
                  {dayEntries
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(a.purchaseDate).getTime() -
                        new Date(b.purchaseDate).getTime()
                    )
                    .map((p) => (
                      <div
                        key={p._id}
                        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {supplierName(p.supplier)} ·{" "}
                            {(p.materialType || "scrap") === "daig"
                              ? t("prod.daig")
                              : t("prod.scrap")}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatKg(p.quantityKg)} kg · {formatMoney(p.ratePerKg)}/kg
                            {p.invoiceNo ? ` · ${p.invoiceNo}` : ""}
                            {p.notes?.trim() ? ` · ${p.notes.trim()}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-data text-sm font-medium">
                            {formatMoney(
                              p.payable ?? p.totalAmount + (p.freightAmount || 0)
                            )}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => openEdit(p)}
                          >
                            <Pencil className="size-3.5" />
                            {t("sal.editPayment")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="gap-1"
                            onClick={() => void deleteDirect(p)}
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
              {dialogMode === "add" ? t("purchases.addEntry") : t("purchases.editEntry")}
            </DialogTitle>
            <DialogDescription>{t("purchases.recordsTitle")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("purchases.supplier")}</Label>
              <select
                className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
                value={formSupplier}
                onChange={(e) => setFormSupplier(e.target.value)}
              >
                <option value="">{t("purchases.selectSupplier")}</option>
                {(dialogMode === "edit"
                  ? suppliers
                  : activeSuppliers
                ).map((s) => (
                  <option key={s._id} value={s._id}>
                    {supplierName(s)}
                  </option>
                ))}
              </select>
            </div>
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
          </div>

          <DialogFooter className="sm:justify-between">
            {dialogMode === "edit" ? (
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
