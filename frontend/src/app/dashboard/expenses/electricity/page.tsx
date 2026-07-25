"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { History, Loader2, Zap } from "lucide-react";
import { createFactoryExpense, listFactoryExpenses } from "@/lib/expenses-api";
import { apiError, formatMoney } from "@/lib/materials-api";
import type { BatchExpense } from "@/types/production";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { todayInput } from "@/lib/date-range";

export default function ElectricityExpensesPage() {
  const { t } = useI18n();
  const [expenses, setExpenses] = useState<BatchExpense[]>([]);
  const [busy, setBusy] = useState(false);

  const [amount, setAmount] = useState("");
  const [billDate, setBillDate] = useState(todayInput());
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const all = await listFactoryExpenses();
      setExpenses(all.filter((e) => e.category === "electricity"));
    } catch (err) {
      toast.error(apiError(err, "Failed to load electricity bills"));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [load]);

  const total = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

  async function onSave() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the bill amount");
      return;
    }
    if (!billDate) {
      toast.error("Pick the bill date");
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
          <Link
            href="/dashboard/expenses/electricity/history"
            className={buttonVariants({
              variant: "default",
              size: "lg",
              className: "gap-2 min-w-44 px-8 text-base font-semibold shadow-sm",
            })}
          >
            <History className="size-5" />
            {t("exp.showHistory")}
          </Link>
        </div>
      </div>

      <Card className="py-0 max-w-xs">
        <CardContent className="p-4">
          <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {t("exp.totalSpent")}
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
          <div className="flex flex-wrap gap-2 sm:col-span-4">
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
    </div>
  );
}
