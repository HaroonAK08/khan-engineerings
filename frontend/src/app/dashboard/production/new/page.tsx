"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { todayInput } from "@/lib/date-range";
import { getStock, apiError, formatKg, withSameDayConfirm } from "@/lib/materials-api";
import { listProducts, produce } from "@/lib/production-api";
import {
  VOICE_PRODUCE_ADD_EVENT,
  VOICE_PRODUCE_PENDING_KEY,
  type VoiceProduceFormLine,
  type VoiceProduceFormPayload,
} from "@/lib/voice/produce-bridge";
import {
  familyFilterChipClass,
  familyMetaTextClass,
  familyPickerItemClass,
  familyRowClass,
} from "@/lib/product-family";
import { cn } from "@/lib/utils";
import type { StockSummary } from "@/types/materials";
import type { Product } from "@/types/production";

type ProduceLine = {
  productId: string;
  quantity: number;
  wastePercent: number;
  productionDate: string;
};

const productionSearchInputClass =
  "h-13 rounded-xl border-primary/50 bg-primary/10 pl-12 pr-4 text-base font-medium text-foreground shadow-sm transition-colors placeholder:font-medium placeholder:text-foreground/70 focus-visible:border-primary focus-visible:ring-primary/40";

function compareProductsByName(a: Product, b: Product) {
  return a.name.trim().localeCompare(b.name.trim(), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function emptyLine(productId = ""): ProduceLine {
  return {
    productId,
    quantity: 1,
    wastePercent: 6,
    productionDate: todayInput(),
  };
}

function linePreview(product: Product | null, quantity: number, wastePercent: number) {
  const weight = Number(product?.weightKg) || 0;
  const qty = Number(quantity) || 0;
  const waste = Number(wastePercent);
  const metalKg = Math.round(qty * weight * 1000) / 1000;
  const wasteKg =
    Number.isFinite(waste) && waste >= 0 ? Math.round(metalKg * (waste / 100) * 1000) / 1000 : 0;

  return {
    metalKg,
    wasteKg,
    chargedKg: Math.round((metalKg + wasteKg) * 1000) / 1000,
  };
}

function NewProductionForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProductId = searchParams.get("product") || "";
  const initializedFromQuery = useRef(false);

  const [stock, setStock] = useState<StockSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<ProduceLine[]>([emptyLine()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState<"all" | "hub" | "drum">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stockData, productData] = await Promise.all([getStock(), listProducts({ active: "true" })]);
      setStock(stockData);
      setProducts(productData);
    } catch (err) {
      toast.error(apiError(err, "Failed to load production"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const appendVoiceLines = useCallback((incoming: VoiceProduceFormLine[]) => {
    if (!incoming.length) return;
    setLines((prev) => {
      const mapped = incoming.map((row) => ({
        ...emptyLine(row.productId),
        quantity: Math.max(1, Math.round(Number(row.quantity) || 1)),
        productionDate: row.productionDate || todayInput(),
      }));
      const onlyBlank =
        prev.length === 1 && !prev[0].productId && Number(prev[0].quantity) === 1;
      return onlyBlank ? mapped : [...prev, ...mapped];
    });
  }, []);

  const applyVoicePayload = useCallback(
    (payload: VoiceProduceFormPayload | VoiceProduceFormLine[]) => {
      // Back-compat: older pending payloads were a bare line array
      const detail: VoiceProduceFormPayload = Array.isArray(payload)
        ? { items: payload }
        : payload;

      if (detail.productionDate && (!detail.items || !detail.items.length)) {
        setLines((prev) =>
          prev.map((line) => ({ ...line, productionDate: detail.productionDate! }))
        );
        return;
      }

      if (detail.items?.length) {
        appendVoiceLines(
          detail.items.map((row) => ({
            ...row,
            productionDate: row.productionDate || detail.productionDate,
          }))
        );
      }
    },
    [appendVoiceLines]
  );

  useEffect(() => {
    const onVoiceAdd = (event: Event) => {
      const detail = (event as CustomEvent<VoiceProduceFormPayload | VoiceProduceFormLine[]>)
        .detail;
      if (detail) applyVoicePayload(detail);
    };
    window.addEventListener(VOICE_PRODUCE_ADD_EVENT, onVoiceAdd);

    try {
      const raw = sessionStorage.getItem(VOICE_PRODUCE_PENDING_KEY);
      if (raw) {
        sessionStorage.removeItem(VOICE_PRODUCE_PENDING_KEY);
        const pending = JSON.parse(raw) as VoiceProduceFormPayload | VoiceProduceFormLine[];
        applyVoicePayload(pending);
      }
    } catch {
      /* ignore */
    }

    return () => window.removeEventListener(VOICE_PRODUCE_ADD_EVENT, onVoiceAdd);
  }, [applyVoicePayload]);

  useEffect(() => {
    if (initializedFromQuery.current || !initialProductId || products.length === 0) return;
    if (!products.some((product) => product._id === initialProductId)) return;
    initializedFromQuery.current = true;
    setLines([emptyLine(initialProductId)]);
    const selected = products.find((product) => product._id === initialProductId);
    if (selected?.family === "hub" || selected?.family === "drum") {
      setFamilyFilter(selected.family);
    }
  }, [initialProductId, products]);

  const produceProducts = useMemo(() => {
    let list = products.filter((product) => Number(product.weightKg) > 0);
    if (familyFilter !== "all") {
      list = list.filter((product) => product.family === familyFilter);
    }
    const q = productSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (product) =>
          product.name.toLowerCase().includes(q) ||
          product.family.toLowerCase().includes(q) ||
          String(product.weightKg ?? "").includes(q)
      );
    }
    return [...list].sort(compareProductsByName);
  }, [products, familyFilter, productSearch]);

  const totals = useMemo(() => {
    let scrap = 0;
    let daig = 0;
    let quantity = 0;

    for (const line of lines) {
      quantity += Number(line.quantity) || 0;
      const product = products.find((item) => item._id === line.productId) || null;
      const preview = linePreview(product, line.quantity, line.wastePercent);
      if (product?.family === "drum") daig += preview.chargedKg;
      else if (product?.family === "hub") scrap += preview.chargedKg;
    }

    return {
      quantity,
      scrap: Math.round(scrap * 1000) / 1000,
      daig: Math.round(daig * 1000) / 1000,
    };
  }, [lines, products]);

  function updateLine(index: number, patch: Partial<ProduceLine>) {
    setLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  function addLine(productId = "") {
    setLines((prev) => [...prev, emptyLine(productId)]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, lineIndex) => lineIndex !== index)));
    if (pickerIndex === index) {
      setPickerIndex(null);
      setProductSearch("");
      setFamilyFilter("all");
    } else if (pickerIndex !== null && pickerIndex > index) {
      setPickerIndex(pickerIndex - 1);
    }
  }

  function selectProduct(index: number, product: Product) {
    updateLine(index, { productId: product._id });
    setPickerIndex(null);
    setProductSearch("");
    setFamilyFilter(product.family);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const product = products.find((item) => item._id === line.productId);

      if (!product) {
        toast.error(`Select a product in row ${index + 1}`);
        return;
      }
      if (!(Number(line.quantity) > 0)) {
        toast.error(`Enter valid quantity in row ${index + 1}`);
        return;
      }
      if (!(Number(line.wastePercent) >= 0 && Number(line.wastePercent) <= 99)) {
        toast.error(`Enter valid waste % in row ${index + 1}`);
        return;
      }
      if (!line.productionDate) {
        toast.error(`Select date in row ${index + 1}`);
        return;
      }
      if (!(Number(product.weightKg) > 0)) {
        toast.error(`Product weight missing in row ${index + 1}`);
        return;
      }
    }

    setSaving(true);
    try {
      let produced = 0;
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const product = products.find((item) => item._id === line.productId);
        if (!product) continue;

        const payload = {
          productId: line.productId,
          quantity: Number(line.quantity),
          wastePercent: Number(line.wastePercent),
          materialType: (product.family === "drum" ? "daig" : "scrap") as "scrap" | "daig",
          productionDate: line.productionDate,
        };

        const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
          produce({ ...payload, confirmDuplicate })
        );
        if (cancelled) {
          toast.message(
            produced > 0
              ? `Stopped after ${produced} entr${produced === 1 ? "y" : "ies"}. Remaining rows were not produced.`
              : "Duplicate entry cancelled"
          );
          return;
        }
        produced += 1;
      }
      toast.success(`Produced ${produced} product ${produced === 1 ? "entry" : "entries"}`);
      router.push("/dashboard/production");
    } catch (err) {
      toast.error(apiError(err, "Failed to produce"));
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link
          href="/dashboard/production"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {t("prod.title")}
        </Link>
        <h1 className="text-nameplate text-xl">{t("prod.produceTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add multiple products in one go and submit them together.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("prod.produceTitle")}</CardTitle>
            <CardDescription>Create more than one production entry from the same page.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const selectedProduct = products.find((product) => product._id === line.productId) || null;
              const preview = linePreview(selectedProduct, line.quantity, line.wastePercent);
              const materialType = selectedProduct?.family === "drum" ? "daig" : "scrap";
              const availableForMaterial =
                materialType === "daig"
                  ? stock?.byMaterial?.daig?.availableKg ?? 0
                  : stock?.byMaterial?.scrap?.availableKg ?? stock?.availableKg ?? stock?.totalKg ?? 0;

              return (
                <div
                  key={index}
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border border-border/60 p-3",
                    selectedProduct && familyRowClass(selectedProduct.family)
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Row {index + 1}</p>
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

                  <div className="flex flex-col gap-1.5">
                    <Label>{t("prod.col.product")}</Label>
                    <div className="overflow-hidden rounded-lg border border-input">
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center justify-between px-3 py-2.5 text-left text-base hover:bg-muted/50"
                        onClick={() => {
                          setPickerIndex((prev) => (prev === index ? null : index));
                          setProductSearch("");
                          setFamilyFilter(
                            selectedProduct?.family === "hub" || selectedProduct?.family === "drum"
                              ? selectedProduct.family
                              : "all"
                          );
                        }}
                      >
                        <span className={selectedProduct ? "text-foreground" : "text-muted-foreground"}>
                          {selectedProduct
                            ? `${selectedProduct.name} (${selectedProduct.family}${
                                Number(selectedProduct.weightKg) > 0
                                  ? ` · ${formatKg(Number(selectedProduct.weightKg))} kg`
                                  : ""
                              })`
                            : t("prod.selectProduct")}
                        </span>
                      </button>
                      {pickerIndex === index && (
                        <div className="border-t border-border">
                          <div className="flex flex-wrap gap-2 border-b border-border p-2">
                            {(
                              [
                                ["all", "prod.filter.all"],
                                ["hub", "prod.hub"],
                                ["drum", "prod.drum"],
                              ] as const
                            ).map(([value, labelKey]) => (
                              <Button
                                key={value}
                                type="button"
                                size="default"
                                variant={familyFilter === value ? "default" : "outline"}
                                className={cn(
                                  "min-w-[4.5rem] flex-1 sm:flex-none",
                                  familyFilterChipClass(value, familyFilter === value)
                                )}
                                onClick={() => setFamilyFilter(value)}
                              >
                                {t(labelKey)}
                              </Button>
                            ))}
                          </div>
                          <div className="relative border-b border-border bg-primary/5 p-2">
                            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-primary" />
                            <Input
                              className={productionSearchInputClass}
                              placeholder={t("prod.searchProduct")}
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              autoFocus
                            />
                          </div>
                          <div className="max-h-56 overflow-y-auto">
                            {produceProducts.length === 0 ? (
                              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                                {t("prod.noMatchProduct")}
                              </p>
                            ) : (
                              produceProducts.map((product) => (
                                <button
                                  key={product._id}
                                  type="button"
                                  className={cn(
                                    "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-base",
                                    familyPickerItemClass(
                                      product.family,
                                      line.productId === product._id
                                    )
                                  )}
                                  onClick={() => selectProduct(index, product)}
                                >
                                  <span className="font-medium">{product.name}</span>
                                  <span className={cn("text-sm", familyMetaTextClass(product.family))}>
                                    {product.family}
                                    {` · ${formatKg(Number(product.weightKg) || 0)} kg`}
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("prod.col.qty")}</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("prod.wastePercent")}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={99}
                        step={0.1}
                        value={line.wastePercent}
                        onChange={(e) => updateLine(index, { wastePercent: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("prod.date")}</Label>
                      <Input
                        type="date"
                        value={line.productionDate}
                        onChange={(e) => updateLine(index, { productionDate: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("prod.chargeMaterial")}</Label>
                      <div className="flex h-10 items-center rounded-lg border border-border bg-muted/40 px-3 text-sm">
                        {selectedProduct ? t(`prod.${materialType}`) : "—"}
                      </div>
                    </div>
                  </div>

                  {selectedProduct && (
                    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                      <p>
                        {t("prod.calcMetal")}: {formatKg(preview.metalKg)} kg · {t("prod.calcWaste")}:{" "}
                        {formatKg(preview.wasteKg)} kg
                      </p>
                      <p className="mt-1 font-medium text-foreground">
                        {t("prod.calcDeduct")}: {formatKg(preview.chargedKg)} kg {t(`prod.${materialType}`)} ·{" "}
                        {t("prod.available")}:{" "}
                        <span
                          className={
                            availableForMaterial - preview.chargedKg < 0
                              ? "text-amber-700 dark:text-amber-400"
                              : undefined
                          }
                        >
                          {formatKg(availableForMaterial)} kg
                          {availableForMaterial - preview.chargedKg < 0
                            ? ` → ${formatKg(availableForMaterial - preview.chargedKg)} kg`
                            : ""}
                        </span>
                      </p>
                      {availableForMaterial - preview.chargedKg < 0 && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                          Material will go negative — production is still allowed.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <Button type="button" variant="outline" className="w-fit gap-2" onClick={() => addLine()}>
              <Plus className="size-4" />
              Add another product
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Material summary</CardTitle>
            <CardDescription>Total pieces and material that will be deducted from this submission.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Total qty</p>
              <p className="font-data mt-1 text-xl">{totals.quantity}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{t("prod.scrap")}</p>
              <p className="font-data mt-1 text-xl">{formatKg(totals.scrap)} kg</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{t("prod.daig")}</p>
              <p className="font-data mt-1 text-xl">{formatKg(totals.daig)} kg</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("prod.produceBtn")}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard/production")}>
            {t("prod.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewProductionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <NewProductionForm />
    </Suspense>
  );
}
