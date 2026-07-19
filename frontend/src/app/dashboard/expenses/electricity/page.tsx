"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, Zap } from "lucide-react";
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
import { useI18n } from "@/hooks/use-i18n";

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

export default function ElectricityExpensesPage() {
  const { t } = useI18n();
  const defaults = monthDefaults();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [expenses, setExpenses] = useState<BatchExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [amount, setAmount] = useState("");
  const [billDate, setBillDate] = useState(todayInput());
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listFactoryExpenses({ dateFrom, dateTo });
      setExpenses(all.filter((e) => e.category === "electricity"));
    } catch (err) {
      toast.error(apiError(err, "Failed to load electricity bills"));
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
      toast.error("Enter the bill amount");
      return;
    }
    setBusy(true);
    try {
      await createFactoryExpense({
        category: "electricity",
        amount: value,
        expenseDate: billDate,
        notes: note.trim() || undefined,
      });
      toast.success("Electricity bill saved");
      setAmount("");
      setNote("");
      setBillDate(todayInput());
      await load();
    } catch (err) {
      toast.error(apiError(err, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Remove this bill?")) return;
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
          <h1 className="text-nameplate flex items-center gap-2 text-xl">
            <Zap className="size-5" />
            {t("elec.title")}
          </h1>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">{t("elec.desc")}</p>
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
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4 sm:p-5">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>{t("elec.billAmount")}</Label>
            <Input
              type="number"
              step="1"
              placeholder={t("elec.phAmount")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("elec.billDate")}</Label>
            <Input
              type="date"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("exp.noteOptional")}</Label>
            <Input
              placeholder={t("elec.phNote")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="sm:col-span-4">
            <Button
              type="button"
              size="lg"
              className="gap-2"
              disabled={busy}
              onClick={() => void onSave()}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("elec.save")}
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
            <CardTitle className="text-nameplate text-sm">Electricity history</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-4 pb-4">
            {expenses.map((e) => (
              <div
                key={e._id}
                className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{e.notes || "Electricity"}</p>
                  <p className="font-data text-xs text-muted-foreground">
                    {formatDate(e.expenseDate)}
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
        <p className="text-sm text-muted-foreground">{t("elec.empty")}</p>
      )}
    </div>
  );
}
