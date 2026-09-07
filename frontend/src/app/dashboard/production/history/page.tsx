"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import { calendarDay, todayInput } from "@/lib/date-range";
import { apiError, formatDate, formatKg, getStock } from "@/lib/materials-api";
import {
  deleteBatch,
  listBatches,
  listProducts,
  updateProduce,
} from "@/lib/production-api";
import type { StockSummary } from "@/types/materials";
import type { Product, ProductionBatch } from "@/types/production";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  familyFilterChipClass,
  familyMetaTextClass,
  familyPickerItemClass,
  familyRowClass,
} from "@/lib/product-family";
import { cn } from "@/lib/utils";
import type { MessageKey } from "@/lib/i18n/messages";

const produceSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  wastePercent: z.number().min(0).max(99),
  metalKg: z.number().positive("Metal kg must be greater than 0"),
  materialType: z.enum(["scrap", "daig"]),
  productionDate: z.string().min(1),
});

type ProduceForm = z.infer<typeof produceSchema>;

const productionSearchInputClass =
  "h-13 rounded-xl border-primary/50 bg-primary/10 pl-12 pr-4 text-base font-medium text-foreground shadow-sm transition-colors placeholder:font-medium placeholder:text-foreground/70 focus-visible:border-primary focus-visible:ring-primary/40";

function batchProductId(batch: ProductionBatch) {
  const out = batch.outputs?.[0]?.product;
  if (out && typeof out === "object") return out._id;
  if (typeof out === "string") return out;
  if (batch.product && typeof batch.product === "object") return batch.product._id;
  if (typeof batch.product === "string") return batch.product;
  return "";
}

function batchProductName(batch: ProductionBatch) {
  const out = batch.outputs?.[0]?.product;
  if (out && typeof out === "object") return out.name;
  if (batch.product && typeof batch.product === "object") return batch.product.name;
  return "—";
}

function batchQty(batch: ProductionBatch) {
  return batch.outputs?.[0]?.quantity ?? batch.goodUnits ?? 0;
}

function batchUsedKg(batch: ProductionBatch) {
  return batch.inputs?.reduce((s, i) => s + (i.quantityKg || 0), 0) || 0;
}

function batchWastePercent(batch: ProductionBatch) {
  const charged = Number(batch.inputs?.[0]?.quantityKg) || 0;
  const waste = Number(batch.furnaceWasteKg) || 0;
  const metal = Math.max(0, charged - waste);
  if (metal <= 0) return 6;
  return Math.round((waste / metal) * 1000) / 10;
}

function batchMetalKg(batch: ProductionBatch) {
  const charged = Number(batch.inputs?.[0]?.quantityKg) || 0;
  const waste = Number(batch.furnaceWasteKg) || 0;
  const metal = Math.max(0, charged - waste);
  if (metal > 0) return Math.round(metal * 1000) / 1000;
  const qty = batchQty(batch);
  const piece = Number(batch.outputs?.[0]?.weightKg) || 0;
  return Math.round(qty * piece * 1000) / 1000;
}

function catalogMetalKg(qty: number, weightKg: number) {
  const q = Number(qty) || 0;
  const w = Number(weightKg) || 0;
  if (q <= 0 || w <= 0) return 0;
  return Math.round(q * w * 1000) / 1000;
}

function batchMaterialType(batch: ProductionBatch): "scrap" | "daig" {
  const t = batch.inputs?.[0]?.materialType;
  return t === "daig" ? "daig" : "scrap";
}

function batchFamily(batch: ProductionBatch): "hub" | "drum" {
  if (batch.family === "hub" || batch.family === "drum") return batch.family;
  const out = batch.outputs?.[0];
  if (out?.family === "hub" || out?.family === "drum") return out.family;
  const product = out?.product;
  if (
    product &&
    typeof product === "object" &&
    (product.family === "hub" || product.family === "drum")
  ) {
    return product.family;
  }
  return batchMaterialType(batch) === "daig" ? "drum" : "hub";
}

function toDateInputValue(value?: string) {
  if (!value) return todayInput();
  const day = calendarDay(value);
  return day || todayInput();
}

function compareProductsByName(a: Product, b: Product) {
  return a.name.trim().localeCompare(b.name.trim(), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

type DayTotals = {
  day: string;
  hubQty: number;
  drumQty: number;
  totalQty: number;
  usedKg: number;
  batches: ProductionBatch[];
};

function summarizeBatches(list: ProductionBatch[]) {
  let hubQty = 0;
  let drumQty = 0;
  let usedKg = 0;
  for (const b of list) {
    const qty = batchQty(b);
    if (batchFamily(b) === "drum") drumQty += qty;
    else hubQty += qty;
    usedKg += batchUsedKg(b);
  }
  return {
    hubQty,
    drumQty,
    totalQty: hubQty + drumQty,
    usedKg: Math.round(usedKg * 1000) / 1000,
  };
}

function groupBatchesByDay(list: ProductionBatch[]): DayTotals[] {
  const map = new Map<string, ProductionBatch[]>();
  for (const b of list) {
    const day = calendarDay(b.productionDate) || "—";
    const rows = map.get(day) || [];
    rows.push(b);
    map.set(day, rows);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, dayBatches]) => {
      const totals = summarizeBatches(dayBatches);
      return { day, batches: dayBatches, ...totals };
    });
}

export default function ProductionHistoryPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { dateFrom, dateTo, hydrated, isAll } = usePersistedDateRange();
  const [stock, setStock] = useState<StockSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [produceFamily, setProduceFamily] = useState<"all" | "hub" | "drum">("all");
  const [listFamily, setListFamily] = useState<"all" | "hub" | "drum">("all");
  const [productSearch, setProductSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [metalCustom, setMetalCustom] = useState(false);

  const form = useForm<ProduceForm>({
    resolver: zodResolver(produceSchema),
    defaultValues: {
      productId: "",
      quantity: 1,
      wastePercent: 6,
      metalKg: 1,
      materialType: "scrap",
      productionDate: todayInput(),
    },
  });

  const productId = form.watch("productId");
  const quantity = form.watch("quantity");
  const wastePercent = form.watch("wastePercent");
  const metalKg = form.watch("metalKg");
  const materialType = form.watch("materialType");

  const selectedProduct = useMemo(
    () => products.find((p) => p._id === productId) || null,
    [products, productId]
  );

  const editingBatch = useMemo(
    () => (editingId ? batches.find((b) => b._id === editingId) || null : null),
    [editingId, batches]
  );

  const preview = useMemo(() => {
    const weight = Number(selectedProduct?.weightKg) || 0;
    const qty = Number(quantity) || 0;
    const waste = Number(wastePercent);
    const catalogMetal = Math.round(qty * weight * 1000) / 1000;
    const metal =
      Number(metalKg) > 0 ? Math.round(Number(metalKg) * 1000) / 1000 : catalogMetal;
    const wasteKg =
      Number.isFinite(waste) && waste >= 0
        ? Math.round(metal * (waste / 100) * 1000) / 1000
        : 0;
    return {
      metalKg: metal,
      wasteKg,
      chargedKg: Math.round((metal + wasteKg) * 1000) / 1000,
      avgPieceKg: qty > 0 && metal > 0 ? Math.round((metal / qty) * 1000) / 1000 : 0,
    };
  }, [selectedProduct, quantity, wastePercent, metalKg]);

  const availableForMaterial = useMemo(() => {
    const base =
      materialType === "daig"
        ? stock?.byMaterial?.daig?.availableKg ?? 0
        : materialType === "scrap"
          ? stock?.byMaterial?.scrap?.availableKg ?? stock?.availableKg ?? stock?.totalKg ?? 0
          : null;
    if (base == null) return null;
    if (!editingBatch) return base;
    const sameMaterial = batchMaterialType(editingBatch) === materialType;
    return sameMaterial ? Math.round((base + batchUsedKg(editingBatch)) * 1000) / 1000 : base;
  }, [materialType, stock, editingBatch]);

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const params: {
        status: string;
        dateFrom?: string;
        dateTo?: string;
        family?: string;
      } = { status: "completed" };
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (listFamily !== "all") params.family = listFamily;
      const [stockData, productData, batchData] = await Promise.all([
        getStock(),
        listProducts({ active: "true" }),
        listBatches(params),
      ]);
      setStock(stockData);
      setProducts(productData);
      setBatches(batchData);
    } catch (err) {
      toast.error(apiError(err, "Failed to load production history"));
    } finally {
      setLoading(false);
    }
  }, [hydrated, dateFrom, dateTo, listFamily]);

  useEffect(() => {
    const timer = setTimeout(load, 150);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedProduct) return;
    form.setValue("materialType", selectedProduct.family === "drum" ? "daig" : "scrap");
  }, [selectedProduct, form]);

  useEffect(() => {
    if (produceFamily === "hub") {
      form.setValue("materialType", "scrap");
    } else if (produceFamily === "drum") {
      form.setValue("materialType", "daig");
    }
  }, [produceFamily, form]);

  const q = searchParams.get("q") || "";
  const visibleBatches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return batches;
    return batches.filter((b) => {
      const name = batchProductName(b).toLowerCase();
      const no = (b.batchNo || "").toLowerCase();
      return name.includes(needle) || no.includes(needle);
    });
  }, [batches, q]);

  const periodSummary = useMemo(() => summarizeBatches(visibleBatches), [visibleBatches]);
  const dayGroups = useMemo(() => groupBatchesByDay(visibleBatches), [visibleBatches]);

  const produceProducts = useMemo(() => {
    let list = products;
    if (produceFamily !== "all") {
      list = list.filter((p) => p.family === produceFamily);
    }
    const search = productSearch.trim().toLowerCase();
    if (search) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(search) || p.family.toLowerCase().includes(search)
      );
    }
    return [...list].sort(compareProductsByName);
  }, [products, produceFamily, productSearch]);

  useEffect(() => {
    if (!productId || !selectedProduct) return;
    if (produceFamily === "all") return;
    if (selectedProduct.family !== produceFamily) {
      form.setValue("productId", "");
    }
  }, [produceFamily, productId, selectedProduct, form]);

  function openEdit(batch: ProductionBatch) {
    const pid = batchProductId(batch);
    const product = products.find((p) => p._id === pid);
    const qty = batchQty(batch) || 1;
    form.reset({
      productId: pid,
      quantity: qty,
      wastePercent: batchWastePercent(batch),
      metalKg: batchMetalKg(batch) || 1,
      materialType: batchMaterialType(batch),
      productionDate: toDateInputValue(batch.productionDate),
    });
    setMetalCustom(false);
    setEditingId(batch._id);
    setProduceFamily(
      product?.family === "hub" || product?.family === "drum" ? product.family : "all"
    );
    setProductSearch("");
    setPickerOpen(false);
    setDialogOpen(true);
  }

  async function onDelete(batch: ProductionBatch) {
    if (!confirm(t("prod.deleteConfirm"))) return;
    setDeletingId(batch._id);
    try {
      await deleteBatch(batch._id);
      toast.success(t("prod.deleted"));
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to delete production"));
    } finally {
      setDeletingId(null);
    }
  }

  async function onSubmit(values: ProduceForm) {
    if (!editingId) return;
    setSaving(true);
    try {
      const batch = await updateProduce(editingId, {
        productId: values.productId,
        quantity: values.quantity,
        wastePercent: values.wastePercent,
        metalKg: values.metalKg,
        materialType: values.materialType,
        productionDate: values.productionDate,
      });
      const calc = (
        batch as ProductionBatch & {
          produceCalc?: { chargedKg: number; materialType: string };
        }
      ).produceCalc;
      toast.success(
        calc
          ? `${t("prod.updated")} · ${formatKg(calc.chargedKg)} kg ${calc.materialType}`
          : t("prod.updated")
      );
      setDialogOpen(false);
      setEditingId(null);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to update"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/production"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {t("prod.title")}
        </Link>
        <h1 className="text-nameplate text-xl">{t("prod.historyTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("prod.historyDesc")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <DateRangeFilter showAll showToday />
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{t("prod.historyFamilyFilter")}</Label>
          <div className="flex flex-wrap gap-2">
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
                size="sm"
                variant={listFamily === value ? "default" : "outline"}
                className={familyFilterChipClass(value, listFamily === value)}
                onClick={() => setListFamily(value)}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-nameplate text-sm">{t("prod.historySummary")}</CardTitle>
          <CardDescription>
            {isAll ? t("common.all") : `${dateFrom || "…"} → ${dateTo || "…"}`}
            {listFamily !== "all" ? ` · ${t(`prod.${listFamily}` as MessageKey)}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: t("prod.historyTotalHub"),
                value: String(periodSummary.hubQty),
                className: "text-sky-700 dark:text-sky-300",
              },
              {
                label: t("prod.historyTotalDrum"),
                value: String(periodSummary.drumQty),
                className: "text-yellow-800 dark:text-yellow-300",
              },
              {
                label: t("prod.historyTotalQty"),
                value: String(periodSummary.totalQty),
              },
              {
                label: t("prod.historyTotalUsed"),
                value: formatKg(periodSummary.usedKg),
              },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border/70 px-4 py-3">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {s.label}
                </p>
                <p className={cn("font-data mt-1 text-xl", s.className)}>{s.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("prod.historyTitle")}</CardTitle>
          <CardDescription>{t("prod.historyDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : visibleBatches.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("prod.noRecent")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("prod.col.product")}</TableHead>
                  <TableHead className="text-right">{t("prod.col.qty")}</TableHead>
                  <TableHead className="text-right">{t("prod.col.usedKg")}</TableHead>
                  <TableHead className="text-right">{t("prod.historyDayHub")}</TableHead>
                  <TableHead className="text-right">{t("prod.historyDayDrum")}</TableHead>
                  <TableHead className="text-right">{t("prod.historyDayTotal")}</TableHead>
                  <TableHead>{t("prod.col.date")}</TableHead>
                  <TableHead className="text-right">{t("prod.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dayGroups.map((group) => (
                  <DayGroupRows
                    key={group.day}
                    group={group}
                    deletingId={deletingId}
                    onEdit={openEdit}
                    onDelete={onDelete}
                    t={t}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setPickerOpen(false);
            setProductSearch("");
            setEditingId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("prod.editTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("prod.col.product")}</Label>
              <div className="flex flex-wrap gap-2">
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
                    variant={produceFamily === value ? "default" : "outline"}
                    className={cn(
                      "min-w-[4.5rem] flex-1 sm:flex-none",
                      familyFilterChipClass(value, produceFamily === value)
                    )}
                    onClick={() => setProduceFamily(value)}
                  >
                    {t(labelKey)}
                  </Button>
                ))}
              </div>
              <div className="overflow-hidden rounded-lg border border-input">
                <button
                  type="button"
                  className={cn(
                    "flex min-h-11 w-full items-center justify-between px-3 py-2.5 text-left text-base hover:bg-muted/50",
                    selectedProduct && familyRowClass(selectedProduct.family)
                  )}
                  onClick={() => setPickerOpen((v) => !v)}
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
                {pickerOpen && (
                  <div className="border-t border-border">
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
                        produceProducts.map((p) => {
                          const hasWeight = Number(p.weightKg) > 0;
                          const active = productId === p._id;
                          return (
                            <button
                              key={p._id}
                              type="button"
                              disabled={!hasWeight}
                              className={cn(
                                "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-base disabled:cursor-not-allowed disabled:opacity-40",
                                familyPickerItemClass(p.family, active)
                              )}
                              onClick={() => {
                                const qty = Number(form.getValues("quantity")) || 0;
                                const nextMetal = catalogMetalKg(qty, Number(p.weightKg) || 0);
                                form.setValue("productId", p._id, { shouldValidate: true });
                                if (nextMetal > 0) {
                                  form.setValue("metalKg", nextMetal, { shouldValidate: true });
                                }
                                setMetalCustom(false);
                                setPickerOpen(false);
                                setProductSearch("");
                              }}
                            >
                              <span className="font-medium">{p.name}</span>
                              <span className={cn("text-sm", familyMetaTextClass(p.family))}>
                                {p.family}
                                {hasWeight ? ` · ${formatKg(Number(p.weightKg))} kg` : ""}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
              <input type="hidden" {...form.register("productId")} />
              {form.formState.errors.productId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.productId.message}
                </p>
              )}
            </div>
              <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t("prod.col.qty")}</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity || ""}
                  onChange={(e) => {
                    const qty = Math.max(0, Math.round(Number(e.target.value) || 0));
                    form.setValue("quantity", qty || 1, { shouldValidate: true });
                    if (!metalCustom) {
                      const nextMetal = catalogMetalKg(
                        qty || 1,
                        Number(selectedProduct?.weightKg) || 0
                      );
                      if (nextMetal > 0) {
                        form.setValue("metalKg", nextMetal, { shouldValidate: true });
                      }
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("prod.calcMetal")} (kg)</Label>
                <Input
                  type="number"
                  min={0.001}
                  step="0.001"
                  value={metalKg || ""}
                  onChange={(e) => {
                    const next = Math.round((Number(e.target.value) || 0) * 1000) / 1000;
                    form.setValue("metalKg", next, { shouldValidate: true });
                    setMetalCustom(true);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("prod.wastePercent")}</Label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  step={0.1}
                  {...form.register("wastePercent", { valueAsNumber: true })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("prod.date")}</Label>
              <Input type="date" {...form.register("productionDate")} />
            </div>
            {selectedProduct && (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                <p className="text-xs">{t("prod.metalKgHint")}</p>
                <p className="mt-1">
                  {t("prod.calcMetal")}: {formatKg(preview.metalKg)} kg
                  {preview.avgPieceKg > 0 ? ` (${formatKg(preview.avgPieceKg)} kg / pc)` : ""} ·{" "}
                  {t("prod.calcWaste")}: {formatKg(preview.wasteKg)} kg
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {t("prod.calcDeduct")}: {formatKg(preview.chargedKg)} kg {materialType}
                  {availableForMaterial != null
                    ? ` · ${t("prod.available")}: ${formatKg(availableForMaterial)} kg`
                    : ""}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("prod.cancel")}
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("prod.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DayGroupRows({
  group,
  deletingId,
  onEdit,
  onDelete,
  t,
}: {
  group: DayTotals;
  deletingId: string | null;
  onEdit: (batch: ProductionBatch) => void;
  onDelete: (batch: ProductionBatch) => void;
  t: (key: MessageKey) => string;
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={3} className="font-medium">
          {group.day === "—" ? "—" : formatDate(group.day)}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {group.batches.length} {t("prod.col.batch")} · {t("prod.historyDayUsed")}:{" "}
            {formatKg(group.usedKg)} kg
          </span>
        </TableCell>
        <TableCell className="font-data text-right text-xs text-sky-700 dark:text-sky-300">
          {group.hubQty}
        </TableCell>
        <TableCell className="font-data text-right text-xs text-yellow-800 dark:text-yellow-300">
          {group.drumQty}
        </TableCell>
        <TableCell className="font-data text-right text-xs font-medium">{group.totalQty}</TableCell>
        <TableCell />
        <TableCell />
      </TableRow>
      {group.batches.map((b) => (
        <TableRow key={b._id} className={familyRowClass(batchFamily(b))}>
          <TableCell className="text-sm">{batchProductName(b)}</TableCell>
          <TableCell className="font-data text-right text-xs">{batchQty(b)}</TableCell>
          <TableCell className="font-data text-right text-xs">{formatKg(batchUsedKg(b))}</TableCell>
          <TableCell className="font-data text-right text-xs text-sky-700/80 dark:text-sky-300/80">
            {group.hubQty}
          </TableCell>
          <TableCell className="font-data text-right text-xs text-yellow-800/80 dark:text-yellow-300/80">
            {group.drumQty}
          </TableCell>
          <TableCell className="font-data text-right text-xs">{group.totalQty}</TableCell>
          <TableCell className="font-data text-xs">{formatDate(b.productionDate)}</TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(b)}>
                {t("prod.edit")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={deletingId === b._id}
                onClick={() => void onDelete(b)}
              >
                {deletingId === b._id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  t("prod.delete")
                )}
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
