"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { History, Loader2, Paintbrush, Plus } from "lucide-react";
import { createFactoryExpense, listFactoryExpenses } from "@/lib/expenses-api";
import { apiError, formatMoney, withSameDayConfirm } from "@/lib/materials-api";
import type { BatchExpense } from "@/types/production";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UrduPhoneticInput } from "@/components/ui/urdu-phonetic-input";
import { Label } from "@/components/ui/label";
import { useI18n, type MessageKey } from "@/hooks/use-i18n";
import { todayInput } from "@/lib/date-range";
import { ExpenseScopeChips } from "@/components/expenses/expense-scope-chips";
import type { ExpenseScope } from "@/lib/workers-api";
import {
  isAlwaysCommonExpenseCategory,
  matchesExpenseScope,
  usePersistedExpenseScope,
} from "@/hooks/use-persisted-expense-scope";

const OTHER_CATEGORIES: Array<{ id: string; labelKey: MessageKey }> = [
  { id: "paint", labelKey: "other.cat.paint" },
  { id: "lpg_gas", labelKey: "other.cat.lpg" },
  { id: "petrol", labelKey: "other.cat.petrol" },
  { id: "silica_sand", labelKey: "other.cat.silica" },
  { id: "silicate", labelKey: "other.cat.silicate" },
  { id: "sheera", labelKey: "other.cat.sheera" },
  { id: "chemicals", labelKey: "other.cat.chemicals" },
  { id: "tools", labelKey: "other.cat.tools" },
  { id: "machine", labelKey: "other.cat.machine" },
  { id: "repairs", labelKey: "other.cat.repairs" },
  { id: "other", labelKey: "other.cat.other" },
];

const OTHER_IDS = new Set(OTHER_CATEGORIES.map((c) => c.id));
const CUSTOM_CATEGORY_STORAGE_KEY = "ke.other-expense-categories";

type CustomCategory = { id: string; label: string };

function slugifyCategory(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function loadCustomCategories(): CustomCategory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_CATEGORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is CustomCategory =>
          !!row &&
          typeof row === "object" &&
          typeof (row as CustomCategory).id === "string" &&
          typeof (row as CustomCategory).label === "string" &&
          (row as CustomCategory).label.trim().length > 0
      )
      .map((row) => ({ id: row.id, label: row.label.trim() }));
  } catch {
    return [];
  }
}

function saveCustomCategories(rows: CustomCategory[]) {
  window.localStorage.setItem(CUSTOM_CATEGORY_STORAGE_KEY, JSON.stringify(rows));
}

/** Categories that are usually amount-only (no purchased qty). */
const AMOUNT_ONLY_CATEGORIES = new Set(["machine", "repairs", "other"]);

const amountOnlyCategory = (id: string) => AMOUNT_ONLY_CATEGORIES.has(id);
const categoryUsesQuantityByDefault = (id: string) => !amountOnlyCategory(id);
const isCustomCategoryId = (id: string) => id.startsWith("custom:");

export default function OtherExpensesPage() {
  const { t } = useI18n();

  const [expenses, setExpenses] = useState<BatchExpense[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [category, setCategory] = useState("paint");
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [trackQuantity, setTrackQuantity] = useState(true);
  const [priceMode, setPriceMode] = useState<"rate" | "total">("rate");
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState("kg");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayInput());
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const { scope: scopeFilter, formDefault } = usePersistedExpenseScope();
  const [scope, setScope] = useState<ExpenseScope>(formDefault);

  const scopeLabels = {
    hub: t("exp.scopeHub"),
    drum: t("exp.scopeDrum"),
    common: t("exp.scopeCommon"),
  };

  const selectedCustom = useMemo(
    () => (isCustomCategoryId(category) ? customCategories.find((c) => c.id === category) : null),
    [category, customCategories]
  );
  const expenseCategoryId = selectedCustom ? "other" : category;
  const alwaysCommon = isAlwaysCommonExpenseCategory(expenseCategoryId);
  const saveScope = alwaysCommon ? "common" : scope;

  useEffect(() => {
    setCustomCategories(loadCustomCategories());
  }, []);

  function selectCategory(id: string) {
    setCategory(id);
    if (isCustomCategoryId(id)) {
      const custom = customCategories.find((c) => c.id === id);
      setTitle(custom?.label ?? "");
      setTrackQuantity(true);
      setPriceMode("rate");
      return;
    }
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

  function onCreateCategory() {
    const label = newCategoryName.trim();
    if (!label) {
      toast.error(t("other.createCategoryRequired"));
      return;
    }
    const builtInMatch = OTHER_CATEGORIES.some(
      (c) => t(c.labelKey).toLowerCase() === label.toLowerCase()
    );
    const customMatch = customCategories.some(
      (c) => c.label.toLowerCase() === label.toLowerCase()
    );
    if (builtInMatch || customMatch) {
      toast.error(t("other.createCategoryExists"));
      return;
    }
    const slug = slugifyCategory(label) || `cat_${Date.now()}`;
    const id = `custom:${slug}`;
    if (customCategories.some((c) => c.id === id) || OTHER_IDS.has(slug)) {
      toast.error(t("other.createCategoryExists"));
      return;
    }
    const next = [...customCategories, { id, label }];
    setCustomCategories(next);
    saveCustomCategories(next);
    setNewCategoryName("");
    setCreateOpen(false);
    setCategory(id);
    setTitle(label);
    setTrackQuantity(true);
    setPriceMode("rate");
    toast.success(t("other.createCategoryAdded"));
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
            e.category !== "salesman_commission" &&
            !e.worker &&
            !e.salesman
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

  useEffect(() => {
    if (alwaysCommon) setScope("common");
    else setScope(formDefault);
  }, [alwaysCommon, formDefault]);

  const total = useMemo(
    () =>
      expenses
        .filter((e) => matchesExpenseScope(e.scope, scopeFilter, e.category))
        .reduce((s, e) => s + e.amount, 0),
    [expenses, scopeFilter]
  );

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
    const expenseTitle =
      selectedCustom?.label.trim() || (expenseCategoryId === "other" ? title.trim() : "");
    if (expenseCategoryId === "other" && !expenseTitle) {
      toast.error(t("other.nameRequired"));
      return;
    }

    setBusyId(category);
    try {
      const body = {
        category: expenseCategoryId,
        amount: value,
        expenseDate,
        scope: saveScope,
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
      if (!selectedCustom) setTitle("");
      setNote("");
      setScope(formDefault);
      setExpenseDate(todayInput());
      setTrackQuantity(categoryUsesQuantityByDefault(expenseCategoryId));
      setPriceMode(categoryUsesQuantityByDefault(expenseCategoryId) ? "rate" : "total");
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
            <div className="flex items-center justify-between gap-2">
              <Label>{t("other.category")}</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  setNewCategoryName("");
                  setCreateOpen(true);
                }}
              >
                <Plus className="size-3.5" />
                {t("other.createCategory")}
              </Button>
            </div>
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
              {customCategories.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  size="sm"
                  variant={category === c.id ? "default" : "outline"}
                  onClick={() => selectCategory(c.id)}
                >
                  {c.label}
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
          {expenseCategoryId === "other" && !selectedCustom ? (
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
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
            <Label>{t("exp.scope")}</Label>
            {alwaysCommon ? (
              <p className="text-sm text-muted-foreground">{t("exp.scopeAlwaysCommon")}</p>
            ) : (
              <>
                <ExpenseScopeChips
                  value={scope}
                  onChange={(next) => {
                    if (next !== "all") setScope(next);
                  }}
                  labels={scopeLabels}
                />
                <p className="text-xs text-muted-foreground">{t("exp.scopeHint")}</p>
              </>
            )}
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-nameplate text-base">
              {t("other.createCategoryTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label>{t("other.createCategoryName")}</Label>
            <UrduPhoneticInput
              placeholder={t("other.phCreateCategory")}
              value={newCategoryName}
              onChange={setNewCategoryName}
              className="h-11"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {t("cus.cancel")}
            </Button>
            <Button type="button" onClick={onCreateCategory}>
              {t("other.createCategorySave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
