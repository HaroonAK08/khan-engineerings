"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { History, Loader2, Paintbrush } from "lucide-react";
import { createFactoryExpense, listFactoryExpenses } from "@/lib/expenses-api";
import { apiError, formatMoney, withSameDayConfirm } from "@/lib/materials-api";
import type { BatchExpense } from "@/types/production";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UrduPhoneticInput } from "@/components/ui/urdu-phonetic-input";
import { Label } from "@/components/ui/label";
import { useI18n, type MessageKey } from "@/hooks/use-i18n";
import { todayInput } from "@/lib/date-range";

const OTHER_CATEGORIES: Array<{ id: string; labelKey: MessageKey }> = [
  { id: "paint", labelKey: "other.cat.paint" },
  { id: "lpg_gas", labelKey: "other.cat.lpg" },
  { id: "petrol", labelKey: "other.cat.petrol" },
  { id: "silica_sand", labelKey: "other.cat.silica" },
  { id: "sheera", labelKey: "other.cat.sheera" },
  { id: "tools", labelKey: "other.cat.tools" },
  { id: "machine", labelKey: "other.cat.machine" },
  { id: "repairs", labelKey: "other.cat.repairs" },
  { id: "other", labelKey: "other.cat.other" },
];

const OTHER_IDS = new Set(OTHER_CATEGORIES.map((c) => c.id));

/** Categories that are usually amount-only (no purchased qty). */
const AMOUNT_ONLY_CATEGORIES = new Set(["machine", "repairs", "other"]);

const amountOnlyCategory = (id: string) => AMOUNT_ONLY_CATEGORIES.has(id);
const categoryUsesQuantityByDefault = (id: string) => !amountOnlyCategory(id);

export default function OtherExpensesPage() {
  const { t } = useI18n();

  const [expenses, setExpenses] = useState<BatchExpense[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [category, setCategory] = useState("paint");
  const [trackQuantity, setTrackQuantity] = useState(true);
  const [priceMode, setPriceMode] = useState<"rate" | "total">("rate");
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("kg");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayInput());
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  function selectCategory(id: string) {
    setCategory(id);
    if (id !== "other") setTitle("");
    setTrackQuantity(categoryUsesQuantityByDefault(id));
    if (id === "petrol" || id === "lpg_gas") {
      setQuantityUnit("L");
    }
    if (amountOnlyCategory(id)) {
      setQuantity("");
      setQuantityUnit("kg");
      setRate("");
      setPriceMode("total");
    } else {
      setPriceMode("rate");
    }
  }

  const calculatedTotal = useMemo(() => {
    if (!trackQuantity || priceMode !== "rate") return null;
    const qty = Number(quantity);
    const r = Number(rate);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(r) || r <= 0) return null;
    return Math.round(qty * r * 100) / 100;
  }, [trackQuantity, priceMode, quantity, rate]);

  const load = useCallback(async () => {
    try {
      const all = await listFactoryExpenses();
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
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [load]);

  const total = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);

  async function onSave() {
    let value: number;
    if (trackQuantity && priceMode === "rate") {
      if (calculatedTotal == null) {
        toast.error("Enter quantity and rate");
        return;
      }
      value = calculatedTotal;
    } else {
      value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) {
        toast.error("Enter the amount");
        return;
      }
    }

    let qty: number | undefined;
    let unit: string | undefined;
    if (trackQuantity) {
      if (quantity.trim()) {
        qty = Number(quantity);
        if (!Number.isFinite(qty) || qty < 0) {
          toast.error("Enter a valid quantity");
          return;
        }
      } else {
        toast.error("Enter quantity, or switch to Amount only");
        return;
      }
      unit = quantityUnit.trim() || "kg";
    }

    const rateNote =
      trackQuantity && priceMode === "rate" && rate.trim()
        ? `@ ${rate.trim()}/${unit}`
        : "";
    const combinedNotes = [note.trim(), rateNote].filter(Boolean).join(" · ") || undefined;
    const expenseTitle = category === "other" ? title.trim() : "";
    if (category === "other" && !expenseTitle) {
      toast.error(t("other.nameRequired"));
      return;
    }

    setBusyId(category);
    try {
      const body = {
        category,
        amount: value,
        expenseDate,
        ...(expenseTitle ? { title: expenseTitle } : {}),
        notes: combinedNotes,
        ...(trackQuantity && qty != null
          ? { quantity: qty, quantityUnit: unit }
          : {}),
      };
      const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
        createFactoryExpense({ ...body, confirmDuplicate })
      );
      if (cancelled) return;
      toast.success("Expense saved");
      setQuantity("");
      setQuantityUnit("kg");
      setRate("");
      setAmount("");
      setTitle("");
      setNote("");
      setExpenseDate(todayInput());
      setTrackQuantity(categoryUsesQuantityByDefault(category));
      setPriceMode(categoryUsesQuantityByDefault(category) ? "rate" : "total");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Save failed"));
    } finally {
      setBusyId(null);
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/expenses/other/history"
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
                  onClick={() => selectCategory(c.id)}
                  className="gap-1.5"
                >
                  {c.id === "paint" ? <Paintbrush className="size-3.5" /> : null}
                  {t(c.labelKey)}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
            <Label>{t("other.qtyMode")}</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={trackQuantity ? "default" : "outline"}
                onClick={() => {
                  setTrackQuantity(true);
                  setPriceMode("rate");
                }}
              >
                {t("other.withQty")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!trackQuantity ? "default" : "outline"}
                onClick={() => {
                  setTrackQuantity(false);
                  setQuantity("");
                  setRate("");
                  setPriceMode("total");
                }}
              >
                {t("other.amountOnly")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("other.qtyModeHint")}</p>
          </div>

          {trackQuantity ? (
            <>
              <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
                <Label>{t("other.priceMode")}</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={priceMode === "rate" ? "default" : "outline"}
                    onClick={() => {
                      setPriceMode("rate");
                      setAmount("");
                    }}
                  >
                    {t("other.byRate")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={priceMode === "total" ? "default" : "outline"}
                    onClick={() => {
                      setPriceMode("total");
                      setRate("");
                    }}
                  >
                    {t("other.byTotal")}
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("other.quantity")}</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder={t("other.phQuantity")}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="h-11 text-base"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("other.unit")}</Label>
                <select
                  className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-base dark:bg-input/30"
                  value={quantityUnit}
                  onChange={(e) => setQuantityUnit(e.target.value)}
                >
                  <option value="kg">kg</option>
                  <option value="pcs">pcs</option>
                  <option value="L">L</option>
                  <option value="m">m</option>
                  <option value="box">box</option>
                  <option value="can">can</option>
                  <option value="set">set</option>
                </select>
              </div>
              {priceMode === "rate" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>{t("other.rate", { unit: quantityUnit || "kg" })}</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder={t("other.phRate")}
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      className="h-11 text-base"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{t("other.totalCalc")}</Label>
                    <div className="font-data flex h-11 items-center rounded-lg border border-border bg-muted/40 px-3 text-base">
                      {calculatedTotal != null ? formatMoney(calculatedTotal) : "—"}
                    </div>
                  </div>
                </>
              ) : (
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
              )}
            </>
          ) : (
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
          )}

          <div className="flex flex-col gap-1.5">
            <Label>{t("exp.date")}</Label>
            <Input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="h-11"
            />
          </div>
          {category === "other" ? (
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
              <Label>{t("other.expenseName")}</Label>
              <UrduPhoneticInput
                placeholder={t("other.phExpenseName")}
                value={title}
                onChange={setTitle}
                className="h-11"
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
            <Label>{t("exp.noteOptional")}</Label>
            <UrduPhoneticInput
              placeholder={t("other.phDetails")}
              value={note}
              onChange={setNote}
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
    </div>
  );
}
