"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";
import { listProducts } from "@/lib/production-api";
import { getFinishedStock } from "@/lib/inventory-api";
import {
  customerName,
  getBuilty,
  listCustomers,
  productName,
  updateBuilty,
  type Builty,
  type BuiltyLineInput,
  type PricingMode,
} from "@/lib/sales-api";
import type { Product } from "@/types/production";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import {
  familyFilterChipClass,
  familyMetaTextClass,
  familyPickerItemClass,
  familyRowClass,
} from "@/lib/product-family";
import { cn } from "@/lib/utils";

type Line = {
  product: string;
  quantity: number;
  pricingMode: PricingMode;
  ratePerKg: number;
  fixedAmount: number;
};

function emptyLine(): Line {
  return { product: "", quantity: 1, pricingMode: "rate_kg", ratePerKg: 0, fixedAmount: 0 };
}

function toDateInput(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function productIdOf(product: Builty["items"][number]["product"]) {
  if (!product) return "";
  if (typeof product === "string") return product;
  return product._id || "";
}

function lineTotal(products: Product[], line: Line) {
  const product = products.find((p) => p._id === line.product);
  const weightKg = Number(product?.weightKg) || 0;
  const qty = Number(line.quantity) || 0;
  if (line.pricingMode === "fixed") {
    return Math.round(qty * (Number(line.fixedAmount) || 0) * 100) / 100;
  }
  const unit = weightKg * (Number(line.ratePerKg) || 0);
  return Math.round(qty * unit * 100) / 100;
}

function EditBuiltyForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);

  const [builty, setBuilty] = useState<Builty | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  const [builtyNo, setBuiltyNo] = useState("");
  const [billNo, setBillNo] = useState("");
  const [builtyDate, setBuiltyDate] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productPickerIndex, setProductPickerIndex] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productFamilyFilter, setProductFamilyFilter] = useState<"all" | "hub" | "drum">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, p, stock] = await Promise.all([
        getBuilty(id),
        listProducts({ active: "true" }),
        getFinishedStock(),
        listCustomers({ active: "true" }),
      ]);

      const map: Record<string, number> = {};
      for (const item of stock.items) {
        map[item.productId] = (map[item.productId] || 0) + item.quantity;
      }
      for (const item of data.builty.items || []) {
        const pid = productIdOf(item.product);
        if (!pid) continue;
        map[pid] = (map[pid] || 0) + (Number(item.quantity) || 0);
      }

      setBuilty(data.builty);
      setProducts(p);
      setStockByProduct(map);
      setBuiltyNo(data.builty.builtyNo || "");
      setBillNo(data.builty.billNo || "");
      setBuiltyDate(toDateInput(data.builty.builtyDate));
      setLines(
        (data.builty.items || []).length > 0
          ? data.builty.items.map((item) => {
              const mode: PricingMode = item.pricingMode === "fixed" ? "fixed" : "rate_kg";
              return {
                product: productIdOf(item.product),
                quantity: Number(item.quantity) || 1,
                pricingMode: mode,
                ratePerKg: Number(item.ratePerKg) || 0,
                fixedAmount: mode === "fixed" ? Number(item.unitPrice) || 0 : 0,
              };
            })
          : [emptyLine()]
      );
    } catch (err) {
      toast.error(apiError(err, t("builtyDetail.loadFailed")));
      setBuilty(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    let list = products;
    if (productFamilyFilter !== "all") {
      list = list.filter((p) => p.family === productFamilyFilter);
    }
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.family?.toLowerCase().includes(q) ||
        String(p.weightKg ?? "").includes(q)
    );
  }, [products, productSearch, productFamilyFilter]);

  const total = useMemo(
    () => Math.round(lines.reduce((s, l) => s + lineTotal(products, l), 0) * 100) / 100,
    [lines, products]
  );

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!builtyNo.trim()) {
      toast.error(t("builtyNew.needBuiltyNo"));
      return;
    }
    const valid = lines.filter((l) => l.product && Number(l.quantity) > 0);
    if (valid.length === 0) {
      toast.error(t("builtyNew.needItems"));
      return;
    }
    for (const l of valid) {
      if (l.pricingMode === "rate_kg" && !(Number(l.ratePerKg) > 0)) {
        toast.error(t("orderNew.rateRequired"));
        return;
      }
      if (l.pricingMode === "fixed" && !(Number(l.fixedAmount) > 0)) {
        toast.error(t("builtyNew.fixedRequired"));
        return;
      }
    }

    const items: BuiltyLineInput[] = valid.map((l) => ({
      product: l.product,
      quantity: Number(l.quantity),
      pricingMode: l.pricingMode,
      ...(l.pricingMode === "rate_kg"
        ? { ratePerKg: Number(l.ratePerKg) }
        : { fixedAmount: Number(l.fixedAmount) }),
    }));

    setSaving(true);
    try {
      await updateBuilty(id, {
        builtyNo: builtyNo.trim(),
        billNo: billNo.trim(),
        builtyDate,
        items,
      });
      toast.success(t("builty.updated"));
      router.push(`/dashboard/builty/${id}`);
    } catch (err) {
      toast.error(apiError(err, t("builty.updateFailed")));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!builty) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">{t("builtyDetail.loadFailed")}</p>
        <Link href="/dashboard/builty" className="text-sm text-primary hover:underline">
          {t("builty.title")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/builty/${id}`}
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {t("builty.title")}
        </Link>
        <h1 className="text-nameplate text-xl">{t("builty.edit")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("builtyEdit.subtitle")}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("builty.edit")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>{t("builtyNew.party")}</Label>
              <div className="flex h-11 items-center rounded-lg border border-input bg-muted/40 px-2.5 text-base">
                {customerName(builty.customer)}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("builtyNew.builtyNo")}</Label>
              <Input
                value={builtyNo}
                onChange={(e) => setBuiltyNo(e.target.value)}
                placeholder={t("builtyNew.builtyNoHint")}
                className="h-11 text-base"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("builtyNew.billNo")}</Label>
              <Input
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                placeholder={t("builtyNew.billNoHint")}
                className="h-11 text-base"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("builtyNew.date")}</Label>
              <Input
                type="date"
                value={builtyDate}
                onChange={(e) => setBuiltyDate(e.target.value)}
                className="h-11"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("builtyNew.products")}</CardTitle>
            <CardDescription>{t("builtyEdit.productsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const selected = products.find((p) => p._id === line.product);
              const weightKg = Number(selected?.weightKg) || 0;
              const amount = lineTotal(products, line);
              const available = line.product ? stockByProduct[line.product] || 0 : 0;
              const originalItem = builty.items.find(
                (item) => productIdOf(item.product) === line.product
              );
              const displayName = selected
                ? `${selected.name}${weightKg > 0 ? ` · ${formatKg(weightKg)} kg` : ""} · ${t("builtyNew.stock", { qty: available })}`
                : line.product
                  ? `${productName(originalItem?.product || line.product)} · ${t("builtyNew.stock", { qty: available })}`
                  : t("orderNew.productPh");
              return (
                <div
                  key={index}
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border border-border/60 p-3",
                    selected && familyRowClass(selected.family)
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="relative min-w-0 flex-1">
                      <div className="overflow-hidden rounded-lg border border-input">
                        <button
                          type="button"
                          className="flex h-11 w-full items-center px-2.5 text-left text-base hover:bg-muted/50"
                          onClick={() => {
                            setProductPickerIndex(productPickerIndex === index ? null : index);
                            setProductSearch("");
                            setProductFamilyFilter("all");
                          }}
                        >
                          <span
                            className={cn(
                              line.product ? "truncate text-foreground" : "text-muted-foreground",
                              line.product && available < 0 && "text-amber-700 dark:text-amber-400"
                            )}
                          >
                            {displayName}
                          </span>
                        </button>
                        {productPickerIndex === index && (
                          <div className="border-t border-border bg-card">
                            <div className="relative border-b border-border p-2">
                              <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                className="h-9 pl-8"
                                placeholder={t("prod.searchProduct")}
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                            <div className="flex gap-2 border-b border-border px-2 py-2">
                              {(
                                [
                                  { value: "all", label: t("prod.filter.all") },
                                  { value: "hub", label: t("prod.hub") },
                                  { value: "drum", label: t("prod.drum") },
                                ] as const
                              ).map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={cn(
                                    "rounded-md border px-3 py-1 text-xs font-medium",
                                    familyFilterChipClass(
                                      option.value,
                                      productFamilyFilter === option.value
                                    )
                                  )}
                                  onClick={() => setProductFamilyFilter(option.value)}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {filteredProducts.length === 0 ? (
                                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                                  {products.length === 0
                                    ? t("builtyNew.noFinishedStock")
                                    : t("prod.noMatchProduct")}
                                </p>
                              ) : (
                                filteredProducts.map((p) => {
                                  const kg = Number(p.weightKg) || 0;
                                  const avail = stockByProduct[p._id] || 0;
                                  return (
                                    <button
                                      key={p._id}
                                      type="button"
                                      className={cn(
                                        "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm",
                                        familyPickerItemClass(p.family, line.product === p._id)
                                      )}
                                      onClick={() => {
                                        updateLine(index, {
                                          product: p._id,
                                          ratePerKg:
                                            Number(p.pricePerKg) > 0
                                              ? Number(p.pricePerKg)
                                              : line.ratePerKg || 0,
                                        });
                                        setProductPickerIndex(null);
                                        setProductSearch("");
                                        setProductFamilyFilter("all");
                                      }}
                                    >
                                      <span className="font-medium">{p.name}</span>
                                      <span
                                        className={cn(
                                          "text-[10px]",
                                          familyMetaTextClass(p.family),
                                          avail <= 0 && "text-amber-700 dark:text-amber-400"
                                        )}
                                      >
                                        {p.family}
                                        {kg > 0 ? ` · ${formatKg(kg)} kg` : ""}
                                        {` · ${t("builtyNew.stock", { qty: avail })}`}
                                      </span>
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">{t("orderNew.col.qty")}</Label>
                      <Input
                        type="number"
                        step="1"
                        min={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                        className="h-11"
                      />
                      {line.product && available < line.quantity && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          Stock {available} — will go negative
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">{t("builtyNew.pricingMode")}</Label>
                      <div className="flex h-11 overflow-hidden rounded-lg border border-input">
                        <button
                          type="button"
                          className={`flex-1 text-sm ${
                            line.pricingMode === "rate_kg"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground"
                          }`}
                          onClick={() => updateLine(index, { pricingMode: "rate_kg" })}
                        >
                          {t("builtyNew.mode.rate")}
                        </button>
                        <button
                          type="button"
                          className={`flex-1 text-sm ${
                            line.pricingMode === "fixed"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground"
                          }`}
                          onClick={() => updateLine(index, { pricingMode: "fixed" })}
                        >
                          {t("builtyNew.mode.fixed")}
                        </button>
                      </div>
                    </div>
                    {line.pricingMode === "rate_kg" ? (
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">{t("orderNew.col.rate")}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={line.ratePerKg || ""}
                          onChange={(e) =>
                            updateLine(index, {
                              ratePerKg: e.target.value === "" ? 0 : Number(e.target.value),
                            })
                          }
                          placeholder={t("orderNew.ratePerKgPh")}
                          className="h-11"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">{t("builtyNew.fixedAmount")}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={line.fixedAmount || ""}
                          onChange={(e) =>
                            updateLine(index, {
                              fixedAmount: e.target.value === "" ? 0 : Number(e.target.value),
                            })
                          }
                          placeholder={t("builtyNew.fixedPh")}
                          className="h-11"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">{t("orderNew.col.amount")}</Label>
                      <div className="font-data flex h-11 items-center justify-end rounded-lg border border-border bg-muted/40 px-2.5 text-base">
                        {formatMoney(amount)}
                      </div>
                    </div>
                  </div>

                  {line.pricingMode === "rate_kg" && selected && weightKg > 0 && line.ratePerKg > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("orderNew.calcHint", {
                        qty: line.quantity,
                        kg: formatKg(weightKg),
                        rate: formatMoney(line.ratePerKg),
                        amount: formatMoney(amount),
                      })}
                    </p>
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              className="w-fit gap-2"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus className="size-4" />
              {t("builtyNew.addMore")}
            </Button>
            <p className="font-data text-right text-base">
              {t("orderNew.total")} <span className="text-xl">{formatMoney(total)}</span>
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving} className="h-12 w-fit gap-2 px-8 text-base">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("cus.save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 px-8 text-base"
            onClick={() => router.push(`/dashboard/builty/${id}`)}
          >
            {t("cus.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function EditBuiltyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <EditBuiltyForm />
    </Suspense>
  );
}
