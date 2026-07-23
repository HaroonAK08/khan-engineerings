"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Package, Plus, Search } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, formatDate, formatKg, getStock } from "@/lib/materials-api";
import { getFinishedStock, type FinishedStockItem } from "@/lib/inventory-api";
import { listBatches, listProducts, produce } from "@/lib/production-api";
import type { StockSummary } from "@/types/materials";
import type { Product, ProductionBatch } from "@/types/production";
import { Badge } from "@/components/ui/badge";
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

const produceSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  wastePercent: z.number().min(0).max(99),
  materialType: z.enum(["scrap", "daig"]),
  productionDate: z.string().min(1),
  notes: z.string().optional(),
});

type ProduceForm = z.infer<typeof produceSchema>;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function qtyByProduct(items: FinishedStockItem[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.productId, (map.get(item.productId) || 0) + (item.quantity || 0));
  }
  return map;
}

export default function ProductionPage() {
  const { t } = useI18n();
  const [stock, setStock] = useState<StockSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Map<string, number>>(new Map());
  const [recent, setRecent] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [familyFilter, setFamilyFilter] = useState<"all" | "hub" | "drum">("all");
  const [stockSearch, setStockSearch] = useState("");
  const [produceFamily, setProduceFamily] = useState<"all" | "hub" | "drum">("all");
  const [productSearch, setProductSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const form = useForm<ProduceForm>({
    resolver: zodResolver(produceSchema),
    defaultValues: {
      productId: "",
      quantity: 1,
      wastePercent: 6,
      materialType: "scrap",
      productionDate: todayInput(),
      notes: "",
    },
  });

  const productId = form.watch("productId");
  const quantity = form.watch("quantity");
  const wastePercent = form.watch("wastePercent");
  const materialType = form.watch("materialType");

  const selectedProduct = useMemo(
    () => products.find((p) => p._id === productId) || null,
    [products, productId]
  );

  const preview = useMemo(() => {
    const weight = Number(selectedProduct?.weightKg) || 0;
    const qty = Number(quantity) || 0;
    const waste = Number(wastePercent);
    const metalKg = Math.round(qty * weight * 1000) / 1000;
    const wasteKg =
      Number.isFinite(waste) && waste >= 0
        ? Math.round(metalKg * (waste / 100) * 1000) / 1000
        : 0;
    return {
      metalKg,
      wasteKg,
      chargedKg: Math.round((metalKg + wasteKg) * 1000) / 1000,
    };
  }, [selectedProduct, quantity, wastePercent]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stockData, productData, finished, batches] = await Promise.all([
        getStock(),
        listProducts({ active: "true" }),
        getFinishedStock(),
        listBatches({ status: "completed" }),
      ]);
      setStock(stockData);
      setProducts(productData);
      setStockByProduct(qtyByProduct(finished.items || []));
      setRecent(batches.slice(0, 20));
    } catch (err) {
      toast.error(apiError(err, "Failed to load production"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 150);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedProduct) return;
    form.setValue(
      "materialType",
      selectedProduct.family === "drum" ? "daig" : "scrap"
    );
  }, [selectedProduct, form]);

  useEffect(() => {
    if (produceFamily === "hub") {
      form.setValue("materialType", "scrap");
    } else if (produceFamily === "drum") {
      form.setValue("materialType", "daig");
    }
  }, [produceFamily, form]);

  function openProduce(product?: Product) {
    form.reset({
      productId: product?._id || "",
      quantity: 1,
      wastePercent: 6,
      materialType: product?.family === "drum" ? "daig" : "scrap",
      productionDate: todayInput(),
      notes: "",
    });
    setProduceFamily(product?.family === "hub" || product?.family === "drum" ? product.family : "all");
    setProductSearch("");
    setPickerOpen(!product);
    setDialogOpen(true);
  }

  async function onSubmit(values: ProduceForm) {
    setSaving(true);
    try {
      const batch = await produce({
        productId: values.productId,
        quantity: values.quantity,
        wastePercent: values.wastePercent,
        materialType: values.materialType,
        productionDate: values.productionDate,
        notes: values.notes,
      });
      const calc = (batch as ProductionBatch & {
        produceCalc?: { chargedKg: number; materialType: string };
      }).produceCalc;
      toast.success(
        calc
          ? `Produced ${values.quantity} pcs · ${formatKg(calc.chargedKg)} kg ${calc.materialType} used`
          : `Produced ${values.quantity} pcs`
      );
      setDialogOpen(false);
      setPickerOpen(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to produce"));
    } finally {
      setSaving(false);
    }
  }

  const filteredProducts = useMemo(() => {
    let list = products;
    if (familyFilter !== "all") {
      list = list.filter((p) => p.family === familyFilter);
    }
    const q = stockSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.family.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, familyFilter, stockSearch]);

  const produceProducts = useMemo(() => {
    let list = products;
    if (produceFamily !== "all") {
      list = list.filter((p) => p.family === produceFamily);
    }
    const q = productSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.family.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, produceFamily, productSearch]);

  useEffect(() => {
    if (!productId || !selectedProduct) return;
    if (produceFamily === "all") return;
    if (selectedProduct.family !== produceFamily) {
      form.setValue("productId", "");
    }
  }, [produceFamily, productId, selectedProduct, form]);

  const availableForMaterial =
    materialType === "daig"
      ? stock?.byMaterial?.daig?.availableKg ?? 0
      : materialType === "scrap"
        ? stock?.byMaterial?.scrap?.availableKg ?? stock?.availableKg ?? stock?.totalKg ?? 0
        : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("prod.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("prod.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("prod.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/production/products"
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted"
          >
            <Package className="size-4" />
            {t("prod.products")}
          </Link>
          <Button type="button" className="gap-2" onClick={() => openProduce()}>
            <Plus className="size-4" />
            {t("prod.produceBtn")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="relative overflow-hidden py-0">
          <span className="absolute inset-x-0 top-0 h-1 bg-chart-1" aria-hidden />
          <CardContent className="p-5">
            <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
              {t("prod.scrapAvailable")}
            </p>
            <p className="font-data mt-2 text-2xl font-medium">
              {stock
                ? `${formatKg(stock.byMaterial?.scrap?.availableKg ?? stock.availableKg ?? stock.totalKg)} kg`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden py-0">
          <span className="absolute inset-x-0 top-0 h-1 bg-chart-2" aria-hidden />
          <CardContent className="p-5">
            <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
              {t("prod.daigAvailable")}
            </p>
            <p className="font-data mt-2 text-2xl font-medium">
              {stock?.byMaterial?.daig
                ? `${formatKg(stock.byMaterial.daig.availableKg ?? 0)} kg`
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden py-0">
          <span className="absolute inset-x-0 top-0 h-1 bg-chart-3" aria-hidden />
          <CardContent className="p-5">
            <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
              {t("prod.productsStat")}
            </p>
            <p className="font-data mt-2 text-2xl font-medium">{products.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-nameplate text-sm">{t("prod.stockTitle")}</CardTitle>
            <CardDescription>{t("prod.stockDesc")}</CardDescription>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-full pl-8 sm:w-48"
                placeholder={t("prod.searchProduct")}
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
              />
            </div>
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value as "all" | "hub" | "drum")}
            >
              <option value="all">{t("prod.filter.all")}</option>
              <option value="hub">{t("prod.hub")}</option>
              <option value="drum">{t("prod.drum")}</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("prod.noProducts")}{" "}
              <Link href="/dashboard/production/products" className="underline">
                {t("prod.products")}
              </Link>
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("prod.col.product")}</TableHead>
                  <TableHead>{t("prod.col.family")}</TableHead>
                  <TableHead className="text-right">{t("prod.col.weight")}</TableHead>
                  <TableHead className="text-right">{t("prod.col.onHand")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((p) => {
                  const onHand = stockByProduct.get(p._id) || 0;
                  const hasWeight = Number(p.weightKg) > 0;
                  return (
                    <TableRow key={p._id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-data text-[10px] uppercase">
                          {p.family}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {hasWeight ? `${formatKg(Number(p.weightKg))} kg` : "—"}
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">{onHand}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!hasWeight}
                          onClick={() => openProduce(p)}
                        >
                          {t("prod.produceBtn")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("prod.recentTitle")}</CardTitle>
          <CardDescription>{t("prod.recentDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("prod.noRecent")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("prod.col.batch")}</TableHead>
                  <TableHead>{t("prod.col.product")}</TableHead>
                  <TableHead className="text-right">{t("prod.col.qty")}</TableHead>
                  <TableHead className="text-right">{t("prod.col.usedKg")}</TableHead>
                  <TableHead>{t("prod.col.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((b) => {
                  const out = b.outputs?.[0];
                  const name =
                    out && typeof out.product === "object" ? out.product.name : "—";
                  const qty = out?.quantity ?? b.goodUnits ?? 0;
                  const used = b.inputs?.reduce((s, i) => s + (i.quantityKg || 0), 0) || 0;
                  return (
                    <TableRow key={b._id}>
                      <TableCell className="font-data text-xs">{b.batchNo}</TableCell>
                      <TableCell className="text-sm">{name}</TableCell>
                      <TableCell className="font-data text-right text-xs">{qty}</TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatKg(used)}
                      </TableCell>
                      <TableCell className="font-data text-xs">
                        {formatDate(b.productionDate)}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("prod.produceTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("prod.col.product")}</Label>
              <div className="flex gap-1">
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
                    variant={produceFamily === value ? "default" : "outline"}
                    onClick={() => setProduceFamily(value)}
                  >
                    {t(labelKey)}
                  </Button>
                ))}
              </div>
              <div className="overflow-hidden rounded-lg border border-input">
                <button
                  type="button"
                  className="flex h-9 w-full items-center justify-between px-2.5 text-left text-sm hover:bg-muted/50"
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
                    <div className="relative border-b border-border p-2">
                      <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-8 pl-8"
                        placeholder={t("prod.searchProduct")}
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {produceProducts.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-muted-foreground">
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
                              className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 ${
                                active ? "bg-muted" : ""
                              }`}
                              onClick={() => {
                                form.setValue("productId", p._id, { shouldValidate: true });
                                setPickerOpen(false);
                                setProductSearch("");
                              }}
                            >
                              <span className="font-medium">{p.name}</span>
                              <span className="font-data text-[10px] text-muted-foreground uppercase">
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
                  {...form.register("quantity", { valueAsNumber: true })}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t("prod.chargeMaterial")}</Label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  {...form.register("materialType")}
                >
                  <option value="scrap">{t("prod.scrap")}</option>
                  <option value="daig">{t("prod.daig")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("prod.date")}</Label>
                <Input type="date" {...form.register("productionDate")} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("prod.notes")}</Label>
              <Input {...form.register("notes")} />
            </div>
            {selectedProduct && (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <p>
                  {t("prod.calcMetal")}: {formatKg(preview.metalKg)} kg · {t("prod.calcWaste")}:{" "}
                  {formatKg(preview.wasteKg)} kg
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
                {t("prod.produceBtn")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
