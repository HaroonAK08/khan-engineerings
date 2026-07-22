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

/** Categories that are usually amount-only (no purchased qty). */
const AMOUNT_ONLY_CATEGORIES = new Set(["machine", "repairs", "other"]);

const amountOnlyCategory = (id: string) => AMOUNT_ONLY_CATEGORIES.has(id);
const categoryUsesQuantityByDefault = (id: string) => !amountOnlyCategory(id);

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
  const [trackQuantity, setTrackQuantity] = useState(true);
  const [priceMode, setPriceMode] = useState<"rate" | "total">("rate");
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("kg");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayInput());
  const [note, setNote] = useState("");

  function selectCategory(id: string) {
    setCategory(id);
    setTrackQuantity(categoryUsesQuantityByDefault(id));
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

    setBusyId(category);
    try {
      await createFactoryExpense({
        category,
        amount: value,
        expenseDate,
        notes: combinedNotes,
        ...(trackQuantity && qty != null
          ? { quantity: qty, quantityUnit: unit }
          : {}),
      });
      toast.success("Expense saved");
      setQuantity("");
      setQuantityUnit("kg");
      setRate("");
      setAmount("");
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
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
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
            <CardTitle className="text-nameplate text-sm">{t("other.history")}</CardTitle>
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
                    {e.quantity != null && e.quantity > 0
                      ? ` · ${t("other.qtyLabel", {
                          qty: e.quantity,
                          unit: e.quantityUnit || "kg",
                        })}`
                      : ""}
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
