"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { History, Loader2, Plus, Search } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, formatDate, formatKg, getStock } from "@/lib/materials-api";
import { getFinishedStock, type FinishedStockItem } from "@/lib/inventory-api";
import { listProducts } from "@/lib/production-api";
import { getWasteSettings, setWastePercent, type WasteSettings } from "@/lib/settings-api";
import { todayInput } from "@/lib/date-range";
import { familyBadgeClass, familyRowClass } from "@/lib/product-family";
import type { StockSummary } from "@/types/materials";
import type { Product } from "@/types/production";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const productionSearchInputClass =
  "h-13 rounded-xl border-primary/50 bg-primary/10 pl-12 pr-4 text-base font-medium text-foreground shadow-sm transition-colors placeholder:font-medium placeholder:text-foreground/70 focus-visible:border-primary focus-visible:ring-primary/40";

function qtyByProduct(items: FinishedStockItem[]) {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.productId, (map.get(item.productId) || 0) + (item.quantity || 0));
  }
  return map;
}

function compareProductsByName(a: Product, b: Product) {
  return a.name.trim().localeCompare(b.name.trim(), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export default function ProductionPage() {
  const { t } = useI18n();
  const [stock, setStock] = useState<StockSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [familyFilter, setFamilyFilter] = useState<"all" | "hub" | "drum">("all");
  const [stockSearch, setStockSearch] = useState("");
  const [wasteSettings, setWasteSettings] = useState<WasteSettings | null>(null);
  const [hubWaste, setHubWaste] = useState("6");
  const [drumWaste, setDrumWaste] = useState("6");
  const [hubFrom, setHubFrom] = useState(todayInput());
  const [drumFrom, setDrumFrom] = useState(todayInput());
  const [savingWaste, setSavingWaste] = useState<"hub" | "drum" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stockData, productData, finished, waste] = await Promise.all([
        getStock(),
        listProducts({ active: "true" }),
        getFinishedStock(),
        getWasteSettings().catch(() => null),
      ]);
      setStock(stockData);
      setProducts(productData);
      setStockByProduct(qtyByProduct(finished.items || []));
      if (waste) {
        setWasteSettings(waste);
        setHubWaste(String(waste.hubPercent ?? 6));
        setDrumWaste(String(waste.drumPercent ?? 6));
      }
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
    return [...list].sort(compareProductsByName);
  }, [products, familyFilter, stockSearch]);

  const hubOnHand = useMemo(() => {
    let total = 0;
    for (const product of products) {
      if (product.family === "hub") total += stockByProduct.get(product._id) || 0;
    }
    return total;
  }, [products, stockByProduct]);

  const drumOnHand = useMemo(() => {
    let total = 0;
    for (const product of products) {
      if (product.family === "drum") total += stockByProduct.get(product._id) || 0;
    }
    return total;
  }, [products, stockByProduct]);

  async function applyWaste(family: "hub" | "drum") {
    const percent = Number(family === "hub" ? hubWaste : drumWaste);
    const from = family === "hub" ? hubFrom : drumFrom;
    if (!Number.isFinite(percent) || percent < 0 || percent >= 100) {
      toast.error(t("prod.wastePercent"));
      return;
    }
    if (!from) {
      toast.error(t("prod.wasteNeedDate"));
      return;
    }
    setSavingWaste(family);
    try {
      const result = await setWastePercent({ family, percent, effectiveFrom: from });
      setWasteSettings(result.settings);
      toast.success(
        `${t("prod.wasteApplied")}${result.applied?.updated ? ` · ${result.applied.updated}` : ""}`
      );
    } catch (err) {
      toast.error(apiError(err, t("prod.wasteApplyFailed")));
    } finally {
      setSavingWaste(null);
    }
  }

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
            href="/dashboard/production/history"
            className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
          >
            <History className="size-4" />
            {t("prod.historyBtn")}
          </Link>
          <Link
            href="/dashboard/production/new"
            className={cn(buttonVariants({ variant: "default" }), "gap-2")}
          >
            <Plus className="size-4" />
            {t("prod.produceBtn")}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <Link
          href="/dashboard/inventory/finished"
          className="block rounded-xl outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Card className="relative overflow-hidden py-0">
            <span className="absolute inset-x-0 top-0 h-1 bg-chart-4" aria-hidden />
            <CardContent className="p-5">
              <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                {t("prod.availableFamilies")}
              </p>
              <div className="mt-2 space-y-1">
                <p className="flex items-center justify-between gap-3 rounded-md bg-sky-500/10 px-2 py-1">
                  <span className="text-sm text-sky-800 dark:text-sky-300">{t("prod.hubAvailable")}</span>
                  <span className="font-data text-xl font-medium text-sky-800 dark:text-sky-300">
                    {hubOnHand}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3 rounded-md bg-yellow-400/15 px-2 py-1">
                  <span className="text-sm text-yellow-900 dark:text-yellow-300">
                    {t("prod.drumAvailable")}
                  </span>
                  <span className="font-data text-xl font-medium text-yellow-900 dark:text-yellow-300">
                    {drumOnHand}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("prod.wasteSettings")}</CardTitle>
          <CardDescription>{t("prod.wasteSettingsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {(["hub", "drum"] as const).map((family) => {
            const percent = family === "hub" ? hubWaste : drumWaste;
            const from = family === "hub" ? hubFrom : drumFrom;
            const setPercent = family === "hub" ? setHubWaste : setDrumWaste;
            const setFrom = family === "hub" ? setHubFrom : setDrumFrom;
            const current =
              family === "hub" ? wasteSettings?.hubPercent : wasteSettings?.drumPercent;
            const since =
              family === "hub" ? wasteSettings?.hubEffectiveFrom : wasteSettings?.drumEffectiveFrom;
            return (
              <div
                key={family}
                className={cn(
                  "flex flex-col gap-3 rounded-lg border p-3",
                  family === "hub" ? "bg-sky-500/5" : "bg-yellow-400/10"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{family === "hub" ? t("prod.hub") : t("prod.drum")}</p>
                  <p className="font-data text-xs text-muted-foreground">
                    {t("prod.wasteCurrent", { percent: current ?? 6 })}
                    {since ? ` · ${t("prod.wasteSince", { date: formatDate(String(since)) })}` : ""}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>{t("prod.wastePercent")}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={99}
                      step="0.1"
                      value={percent}
                      onChange={(e) => setPercent(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{t("prod.wasteFrom")}</Label>
                    <Input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  disabled={savingWaste !== null}
                  onClick={() => void applyWaste(family)}
                >
                  {savingWaste === family ? <Loader2 className="size-4 animate-spin" /> : null}
                  {t("prod.wasteApply")}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-nameplate text-sm">{t("prod.stockTitle")}</CardTitle>
            <CardDescription>{t("prod.stockDesc")}</CardDescription>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-primary" />
              <Input
                className={cn(productionSearchInputClass, "w-full sm:w-80 lg:w-96")}
                placeholder={t("prod.searchProduct")}
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
              />
            </div>
            <select
              className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30"
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
              <Link href="/dashboard/products" className="underline">
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
                    <TableRow key={p._id} className={familyRowClass(p.family)}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={familyBadgeClass(p.family)}>
                          {p.family}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {hasWeight ? `${formatKg(Number(p.weightKg))} kg` : "—"}
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">{onHand}</TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/dashboard/production/new?product=${encodeURIComponent(p._id)}`}
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                            !hasWeight && "pointer-events-none opacity-50"
                          )}
                          aria-disabled={!hasWeight}
                        >
                          {t("prod.produceBtn")}
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
