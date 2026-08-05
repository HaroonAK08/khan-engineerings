"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createFactoryExpense,
  deleteFactoryExpense,
  listFactoryExpenses,
  updateFactoryExpense,
} from "@/lib/expenses-api";
import { apiError, formatDate, formatMoney, withSameDayConfirm } from "@/lib/materials-api";
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
import { useI18n, type MessageKey } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";

export type ExpenseCategoryOption = {
  id: string;
  labelKey: MessageKey;
};

type Props = {
  title: string;
  description?: string;
  backHref: string;
  backLabel: string;
  categories: string[] | ExpenseCategoryOption[];
  defaultCategory?: string;
  fallbackDetail: string;
};

function isOptionList(
  cats: string[] | ExpenseCategoryOption[]
): cats is ExpenseCategoryOption[] {
  return cats.length > 0 && typeof cats[0] !== "string";
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
  const { t } = useI18n();

  const categoryIds = useMemo(() => {
    if (isOptionList(categories)) return categories.map((c) => c.id);
    return categories as string[];
  }, [categories]);

  const categorySet = useMemo(() => new Set(categoryIds), [categoryIds]);
  const multiCategory = categoryIds.length > 1;

  const [expenses, setExpenses] = useState<BatchExpense[]>([]);
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editing, setEditing] = useState<BatchExpense | null>(null);
  const [formCategory, setFormCategory] = useState(
    defaultCategory || categoryIds[0] || "other"
  );
  const [formAmount, setFormAmount] = useState("");
  const [formTitle, setFormTitle] = useState("");
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

  function expenseLabel(e: BatchExpense) {
    return e.title?.trim() || e.notes?.trim() || categoryLabel(e.category);
  }

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const all = await listFactoryExpenses({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setExpenses(
        all.filter(
          (e) =>
            categorySet.has(e.category) &&
            e.category !== "fixed_salary" &&
            e.category !== "salesman_commission" &&
            !e.worker &&
            !e.salesman
        )
      );
    } catch (err) {
      toast.error(apiError(err, t("exp.historyLoadFailed")));
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [categorySet, t, dateFrom, dateTo, hydrated]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  function openAdd() {
    setDialogMode("add");
    setEditing(null);
    setFormCategory(defaultCategory || categoryIds[0] || "other");
    setFormAmount("");
    setFormTitle("");
    setFormNote("");
    setFormDate(todayInput());
    setDialogOpen(true);
  }

  function openEdit(e: BatchExpense) {
    setDialogMode("edit");
    setEditing(e);
    setFormCategory(e.category);
    setFormAmount(String(e.amount));
    setFormTitle(e.title?.trim() || "");
    setFormNote(e.notes?.trim() || "");
    setFormDate(toDateInput(new Date(e.expenseDate)));
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
        const body = {
          category: formCategory,
          amount,
          expenseDate: formDate,
          ...(formCategory === "other" && formTitle.trim()
            ? { title: formTitle.trim() }
            : {}),
          notes: formNote.trim() || undefined,
        };
        const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
          createFactoryExpense({ ...body, confirmDuplicate })
        );
        if (cancelled) return;
        toast.success(t("exp.entryAdded"));
      } else if (editing) {
        await updateFactoryExpense(editing._id, {
          amount,
          expenseDate: formDate,
          title: formCategory === "other" ? formTitle.trim() : "",
          notes: formNote.trim(),
          ...(multiCategory ? { category: formCategory } : {}),
        });
        toast.success(t("exp.entryUpdated"));
      }
      setDialogOpen(false);
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

  const sorted = useMemo(
    () =>
      expenses
        .slice()
        .sort(
          (a, b) =>
            new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime()
        ),
    [expenses]
  );

  const total = useMemo(() => sorted.reduce((s, e) => s + e.amount, 0), [sorted]);

  const hasDateFilter = Boolean(dateFrom || dateTo);

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
            {t("exp.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <Button type="button" className="gap-1.5" onClick={openAdd}>
          <Plus className="size-4" />
          {t("exp.addEntry")}
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

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14">
            <p className="text-sm text-muted-foreground">
              {hasDateFilter ? t("sal.ledgerEmptyFiltered") : t("exp.historyEmpty")}
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
                onClick={openAdd}
              >
                <Plus className="size-4" />
                {t("exp.addEntry")}
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
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("exp.colDetail")}</TableHead>
                  <TableHead className="text-end">{t("exp.amount")}</TableHead>
                  <TableHead className="text-end">{t("exp.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((e) => (
                  <TableRow
                    key={e._id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => openEdit(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        openEdit(e);
                      }
                    }}
                  >
                    <TableCell className="font-data whitespace-nowrap">
                      {formatDate(e.expenseDate)}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{expenseLabel(e)}</span>
                      {multiCategory ||
                      (e.title?.trim() && e.title.trim() !== categoryLabel(e.category)) ||
                      (e.notes?.trim() && e.notes.trim() !== expenseLabel(e)) ? (
                        <p className="text-xs text-muted-foreground">
                          {categoryLabel(e.category)}
                          {e.notes?.trim() && e.title?.trim() ? ` · ${e.notes.trim()}` : ""}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-data text-end font-medium whitespace-nowrap">
                      {formatMoney(e.amount)}
                    </TableCell>
                    <TableCell
                      className="text-end"
                      onClick={(ev) => ev.stopPropagation()}
                    >
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
                          onClick={() => void deleteEntryDirect(e)}
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
                    {t("exp.totalSpent")}
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
            {formCategory === "other" ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("other.expenseName")}</Label>
                <UrduPhoneticInput
                  value={formTitle}
                  onChange={setFormTitle}
                  className="h-11"
                  placeholder={t("other.phExpenseName")}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label>{t("exp.noteOptional")}</Label>
              <UrduPhoneticInput
                value={formNote}
                onChange={setFormNote}
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
