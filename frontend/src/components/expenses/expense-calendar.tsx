"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createFactoryExpense,
  deleteFactoryExpense,
  listFactoryExpenses,
  updateFactoryExpense,
} from "@/lib/expenses-api";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
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
import { useI18n, type MessageKey } from "@/hooks/use-i18n";

type ViewMode = "daily" | "monthly" | "yearly";

export type ExpenseCategoryOption = {
  id: string;
  labelKey: MessageKey;
};

type Props = {
  title: string;
  description?: string;
  backHref: string;
  backLabel: string;
  /** Single category (electricity / taxes) or list for "other". */
  categories: string[] | ExpenseCategoryOption[];
  defaultCategory?: string;
  fallbackDetail: string;
};

function isOptionList(
  cats: string[] | ExpenseCategoryOption[]
): cats is ExpenseCategoryOption[] {
  return cats.length > 0 && typeof cats[0] !== "string";
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

function entryDate(e: BatchExpense) {
  return startOfDay(new Date(e.expenseDate));
}

export function ExpenseCalendar({
  title,
  description,
  backHref,
  backLabel,
  categories,
  defaultCategory,
  fallbackDetail,
}: Props) {
  const { t, isUrdu } = useI18n();
  const locale = isUrdu ? "ur-PK" : "en-PK";

  const categoryIds = useMemo(() => {
    if (isOptionList(categories)) return categories.map((c) => c.id);
    return categories as string[];
  }, [categories]);

  const categorySet = useMemo(() => new Set(categoryIds), [categoryIds]);
  const multiCategory = categoryIds.length > 1;

  const [expenses, setExpenses] = useState<BatchExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editing, setEditing] = useState<BatchExpense | null>(null);
  const [formCategory, setFormCategory] = useState(
    defaultCategory || categoryIds[0] || "other"
  );
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formDate, setFormDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function categoryLabel(id: string) {
    if (isOptionList(categories)) {
      const found = categories.find((c) => c.id === id);
      if (found) return t(found.labelKey);
    }
    return fallbackDetail;
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listFactoryExpenses();
      setExpenses(
        all.filter(
          (e) =>
            categorySet.has(e.category) &&
            e.category !== "fixed_salary" &&
            !e.worker
        )
      );
    } catch (err) {
      toast.error(apiError(err, t("exp.historyLoadFailed")));
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [categorySet, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function openAdd(date: Date) {
    setDialogMode("add");
    setEditing(null);
    setFormCategory(defaultCategory || categoryIds[0] || "other");
    setFormAmount("");
    setFormNote("");
    setFormDate(dayKey(date));
    setDialogOpen(true);
  }

  function openEdit(e: BatchExpense) {
    setDialogMode("edit");
    setEditing(e);
    setFormCategory(e.category);
    setFormAmount(String(e.amount));
    setFormNote(e.notes?.trim() || "");
    setFormDate(dayKey(startOfDay(new Date(e.expenseDate))));
    setDialogOpen(true);
  }

  async function saveDialog() {
    const amount = Number(formAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("exp.enterAmount"));
      return;
    }
    if (!formDate) {
      toast.error(t("exp.pickDate"));
      return;
    }
    setSaving(true);
    try {
      if (dialogMode === "add") {
        await createFactoryExpense({
          category: formCategory,
          amount,
          expenseDate: formDate,
          notes: formNote.trim() || undefined,
        });
        toast.success(t("exp.entryAdded"));
      } else if (editing) {
        await updateFactoryExpense(editing._id, {
          amount,
          expenseDate: formDate,
          notes: formNote.trim(),
          ...(multiCategory ? { category: formCategory } : {}),
        });
        toast.success(t("exp.entryUpdated"));
      }
      setDialogOpen(false);
      setCursor(startOfDay(new Date(`${formDate}T12:00:00`)));
      await load();
    } catch (err) {
      toast.error(apiError(err, t("exp.entrySaveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry() {
    if (!editing) return;
    if (!confirm(t("exp.confirmDeleteEntry"))) return;
    setDeleting(true);
    try {
      await deleteFactoryExpense(editing._id);
      toast.success(t("exp.entryDeleted"));
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("exp.entryDeleteFailed")));
    } finally {
      setDeleting(false);
    }
  }

  async function deleteEntryDirect(e: BatchExpense) {
    if (!confirm(t("exp.confirmDeleteEntry"))) return;
    try {
      await deleteFactoryExpense(e._id);
      toast.success(t("exp.entryDeleted"));
      await load();
    } catch (err) {
      toast.error(apiError(err, t("exp.entryDeleteFailed")));
    }
  }

  const totalsByDay = useMemo(() => {
    const map = new Map<string, { total: number; count: number; items: BatchExpense[] }>();
    for (const e of expenses) {
      const key = dayKey(entryDate(e));
      const prev = map.get(key);
      if (prev) {
        prev.total += e.amount;
        prev.count += 1;
        prev.items.push(e);
      } else {
        map.set(key, { total: e.amount, count: 1, items: [e] });
      }
    }
    return map;
  }, [expenses]);

  const totalsByMonth = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const e of expenses) {
      const key = monthKey(entryDate(e));
      const prev = map.get(key);
      if (prev) {
        prev.total += e.amount;
        prev.count += 1;
      } else {
        map.set(key, { total: e.amount, count: 1 });
      }
    }
    return map;
  }, [expenses]);

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
    () => dayEntries.reduce((s, e) => s + e.amount, 0),
    [dayEntries]
  );

  const monthTotal = useMemo(
    () => totalsByMonth.get(monthKey(cursor))?.total ?? 0,
    [cursor, totalsByMonth]
  );

  const yearTotal = useMemo(() => {
    const y = cursor.getFullYear();
    return expenses.reduce(
      (sum, e) => (entryDate(e).getFullYear() === y ? sum + e.amount : sum),
      0
    );
  }, [cursor, expenses]);

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
    () => expenses.reduce((s, e) => s + e.amount, 0),
    [expenses]
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
            href={backHref}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {backLabel}
          </Link>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("exp.historyTitle")}
          </p>
          <h1 className="text-nameplate text-xl">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">{description}</p>
          ) : null}
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
                  {t("exp.periodSpent", { amount: formatMoney(summaryAmount) })}
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
              {t("exp.historyTotal", { amount: formatMoney(allTotal) })}
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
                            {t("exp.entryCount", { count: info.count })}
                          </span>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t("exp.tapDayHint")}</p>
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
                        ? t("exp.entryCount", { count: info.count })
                        : t("exp.noEntryInPeriod")}
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
                    <p className="text-sm text-muted-foreground">{t("exp.amount")}</p>
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
                    {t("exp.addEntry")}
                  </Button>
                </div>
              </div>

              {dayEntries.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <p className="text-sm text-muted-foreground">
                    {t("exp.noEntryInPeriod")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => openAdd(cursor)}
                  >
                    <Plus className="size-4" />
                    {t("exp.addEntry")}
                  </Button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <span>{t("exp.colDetail")}</span>
                    <span>{t("exp.amount")} / {t("exp.actions")}</span>
                  </div>
                  {dayEntries
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(a.expenseDate).getTime() -
                        new Date(b.expenseDate).getTime()
                    )
                    .map((e) => (
                      <div
                        key={e._id}
                        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {e.notes?.trim() || categoryLabel(e.category)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {multiCategory ? categoryLabel(e.category) : null}
                            {e.quantity != null && e.quantity > 0
                              ? `${multiCategory ? " · " : ""}${t("other.qtyLabel", {
                                  qty: e.quantity,
                                  unit: e.quantityUnit || "kg",
                                })}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-data text-sm font-medium">
                            {formatMoney(e.amount)}
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
                            onClick={() => void deleteEntryDirect(e)}
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
              {dialogMode === "add" ? t("exp.addEntry") : t("exp.editEntry")}
            </DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {multiCategory && isOptionList(categories) ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("other.category")}</Label>
                <select
                  className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {t(c.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label>{t("exp.amount")}</Label>
              <Input
                type="number"
                step="1"
                min={1}
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="h-11 text-base"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("exp.date")}</Label>
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
