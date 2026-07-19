"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Paintbrush, Trash2 } from "lucide-react";
import {
  createFactoryExpense,
  deleteFactoryExpense,
  listFactoryExpenses,
} from "@/lib/expenses-api";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import type { BatchExpense } from "@/types/production";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, type MessageKey } from "@/hooks/use-i18n";

function monthDefaults() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

const OTHER_CATEGORIES: Array<{ id: string; labelKey: MessageKey }> = [
  { id: "paint", labelKey: "other.cat.paint" },
  { id: "lpg_gas", labelKey: "other.cat.lpg" },
  { id: "silica_sand", labelKey: "other.cat.silica" },
  { id: "sheera", labelKey: "other.cat.sheera" },
  { id: "tools", labelKey: "other.cat.tools" },
  { id: "machine", labelKey: "other.cat.machine" },
  { id: "repairs", labelKey: "other.cat.repairs" },
  { id: "other", labelKey: "other.cat.other" },
];

const OTHER_IDS = new Set(OTHER_CATEGORIES.map((c) => c.id));

export default function OtherExpensesPage() {
  const { t } = useI18n();
  const defaults = monthDefaults();

  function categoryLabel(id: string) {
    const cat = OTHER_CATEGORIES.find((c) => c.id === id);
    return cat ? t(cat.labelKey) : id;
  }
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [expenses, setExpenses] = useState<BatchExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [category, setCategory] = useState("paint");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayInput());
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listFactoryExpenses({ dateFrom, dateTo });
      setExpenses(
        all.filter(
          (e) =>
            OTHER_IDS.has(e.category) &&
            e.category !== "fixed_salary" &&
            !e.worker
        )
      );
    } catch (err) {
      toast.error(apiError(err, "Failed to load expenses"));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 150);
    return () => clearTimeout(t);
  }, [load]);

  const total = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

  async function onSave() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the amount");
      return;
    }
    setBusyId(category);
    try {
      await createFactoryExpense({
        category,
        amount: value,
        expenseDate,
        notes: note.trim() || undefined,
      });
      toast.success("Expense saved");
      setAmount("");
      setNote("");
      setExpenseDate(todayInput());
      await load();
    } catch (err) {
      toast.error(apiError(err, "Save failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Remove this expense?")) return;
    try {
      await deleteFactoryExpense(id);
      toast.success("Removed");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Delete failed"));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("exp.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("other.title")}</h1>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">{t("other.desc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <Card className="py-0 max-w-xs">
        <CardContent className="p-4">
          <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {t("exp.periodTotal")}
          </p>
          <p className="font-data mt-1 text-xl">{formatMoney(total)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
            <Label>{t("other.category")}</Label>
            <div className="flex flex-wrap gap-2">
              {OTHER_CATEGORIES.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant={category === c.id ? "default" : "outline"}
                  onClick={() => setCategory(c.id)}
                  className="gap-1.5"
                >
                  {c.id === "paint" ? <Paintbrush className="size-3.5" /> : null}
                  {t(c.labelKey)}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("exp.amount")}</Label>
            <Input
              type="number"
              step="1"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("exp.date")}</Label>
            <Input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>{t("exp.noteOptional")}</Label>
            <Input
              placeholder={t("other.phDetails")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button
              type="button"
              size="lg"
              className="gap-2"
              disabled={busyId === category}
              onClick={() => void onSave()}
            >
              {busyId === category && <Loader2 className="size-4 animate-spin" />}
              {t("other.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      ) : expenses.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-nameplate text-sm">Expense history</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-4 pb-4">
            {expenses.map((e) => (
              <div
                key={e._id}
                className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {e.notes || categoryLabel(e.category)}
                  </p>
                  <p className="font-data text-xs text-muted-foreground">
                    {formatDate(e.expenseDate)} · {categoryLabel(e.category)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-data text-sm">{formatMoney(e.amount)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground"
                    onClick={() => void onDelete(e._id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">{t("other.empty")}</p>
      )}
    </div>
  );
}
