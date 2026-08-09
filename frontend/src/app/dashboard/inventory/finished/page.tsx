"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { History, Loader2, Pencil, Plus } from "lucide-react";
import { InventorySubnav } from "@/components/layout/inventory-subnav";
import { DateRangeFilter } from "@/components/date-range-filter";
import { ProductSearchSelect } from "@/components/products/product-search-select";
import { apiError } from "@/lib/materials-api";
import { todayInput } from "@/lib/date-range";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import {
  createAdjustment,
  getFinishedStock,
  listWarehouses,
  type CatalogItem,
  type FinishedStockItem,
} from "@/lib/inventory-api";
import { listProducts } from "@/lib/production-api";
import type { Product } from "@/types/production";
import { useI18n } from "@/hooks/use-i18n";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { familyBadgeClass, familyRowClass } from "@/lib/product-family";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type FamilyFilter = "all" | "hub" | "drum";
type StockDialogMode = "add" | "edit" | null;
type DateMode = "range" | "asOf";

const AS_OF_STORAGE_KEY = "ke-finished-as-of";
const MODE_STORAGE_KEY = "ke-finished-date-mode";

function readStoredAsOf() {
  if (typeof window === "undefined") return todayInput();
  try {
    const stored = localStorage.getItem(AS_OF_STORAGE_KEY);
    if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  } catch {
    // ignore
  }
  return todayInput();
}

function readStoredMode(): DateMode {
  if (typeof window === "undefined") return "range";
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    if (stored === "asOf" || stored === "range") return stored;
  } catch {
    // ignore
  }
  return "range";
}

export default function FinishedGoodsPage() {
  const { t } = useI18n();
  const asOfId = useId();
  const { dateTo, hydrated: rangeHydrated } = usePersistedDateRange();
  const [items, setItems] = useState<FinishedStockItem[]>([]);
  const [totalUnits, setTotalUnits] = useState(0);
  const [hubUnits, setHubUnits] = useState(0);
  const [drumUnits, setDrumUnits] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<CatalogItem[]>([]);
  const [q, setQ] = useState("");
  const [familyFilter, setFamilyFilter] = useState<FamilyFilter>("all");
  const [mode, setModeState] = useState<DateMode>("range");
  const [asOf, setAsOfState] = useState(todayInput);
  const [modeHydrated, setModeHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogMode, setDialogMode] = useState<StockDialogMode>(null);
  const [editing, setEditing] = useState<FinishedStockItem | null>(null);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setModeState(readStoredMode());
    setAsOfState(readStoredAsOf());
    setModeHydrated(true);
  }, []);

  const hydrated = rangeHydrated && modeHydrated;
  const stockAsOf = mode === "asOf" ? asOf : dateTo || todayInput();

  function setMode(next: DateMode) {
    setModeState(next);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  function setAsOf(value: string) {
    setAsOfState(value);
    try {
      localStorage.setItem(AS_OF_STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const params: { q?: string; asOf?: string } = { asOf: stockAsOf };
      if (q.trim()) params.q = q.trim();
      const [stock, productList, warehouseList] = await Promise.all([
        getFinishedStock(params),
        listProducts({ active: "true" }),
        listWarehouses(),
      ]);
      setItems(stock.items);
      setTotalUnits(stock.totalUnits);
      setHubUnits(stock.hubUnits ?? 0);
      setDrumUnits(stock.drumUnits ?? 0);
      setProducts(productList);
      setWarehouses(warehouseList);
    } catch (err) {
      toast.error(apiError(err, t("finished.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [hydrated, q, stockAsOf, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  const filteredItems = useMemo(() => {
    if (familyFilter === "all") return items;
    return items.filter((item) => item.family === familyFilter);
  }, [items, familyFilter]);

  const visibleUnits = useMemo(
    () => filteredItems.reduce((sum, item) => sum + item.quantity, 0),
    [filteredItems]
  );

  const stats: Array<{
    key: FamilyFilter;
    label: string;
    value: number;
    accent: string;
    cardClass: string;
  }> = [
    {
      key: "all",
      label: t("finished.stat.total"),
      value: totalUnits,
      accent: "bg-chart-1",
      cardClass: "",
    },
    {
      key: "hub",
      label: t("finished.stat.hub"),
      value: hubUnits,
      accent: "bg-sky-500",
      cardClass: "bg-sky-500/5",
    },
    {
      key: "drum",
      label: t("finished.stat.drum"),
      value: drumUnits,
      accent: "bg-yellow-300",
      cardClass: "bg-yellow-400/10",
    },
  ];

  function selectFilter(next: FamilyFilter) {
    setFamilyFilter((prev) => (prev === next && next !== "all" ? "all" : next));
  }

  function familyLabel(family: FinishedStockItem["family"]) {
    if (family === "hub") return t("finished.stat.hub");
    if (family === "drum") return t("finished.stat.drum");
    return "—";
  }

  function openAdd() {
    setEditing(null);
    setProductId("");
    setWarehouseId("");
    setQuantity("");
    setNotes("");
    setDialogMode("add");
  }

  function openEdit(item: FinishedStockItem) {
    setEditing(item);
    setProductId(item.productId);
    setWarehouseId(item.warehouseId || "");
    setQuantity(String(item.quantity));
    setNotes("");
    setDialogMode("edit");
  }

  function closeDialog(open: boolean) {
    if (!open) {
      setDialogMode(null);
      setEditing(null);
    }
  }

  async function saveStock() {
    if (dialogMode === "add" && !productId) {
      toast.error(t("finished.productRequired"));
      return;
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0 || (dialogMode === "add" && qty <= 0)) {
      toast.error(t("finished.qtyInvalid"));
      return;
    }

    setSaving(true);
    try {
      if (dialogMode === "add") {
        await createAdjustment({
          itemType: "finished_good",
          direction: "in",
          quantity: qty,
          product: productId,
          warehouse: warehouseId || undefined,
          movementDate: todayInput(),
          notes: notes.trim() || "Finished goods stock add (no material deduction)",
        });
        toast.success(t("finished.added"));
      } else if (editing) {
        const current = editing.quantity;
        const delta = qty - current;
        if (Math.abs(delta) < 1e-9) {
          toast.error(t("finished.noChange"));
          setSaving(false);
          return;
        }
        await createAdjustment({
          itemType: "finished_good",
          direction: delta > 0 ? "in" : "out",
          quantity: Math.abs(delta),
          product: editing.productId,
          warehouse: editing.warehouseId || undefined,
          movementDate: todayInput(),
          notes: notes.trim() || "Finished goods stock edit (no material deduction)",
        });
        toast.success(t("finished.updated"));
      }
      setDialogMode(null);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("finished.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <InventorySubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("finished.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("finished.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("finished.summary", { units: visibleUnits, lines: filteredItems.length })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/inventory/movements"
            className={buttonVariants({
              variant: "outline",
              className: "gap-2",
            })}
          >
            <History className="size-4" />
            Finished Goods History
          </Link>
          <Button type="button" className="gap-2" onClick={openAdd}>
            <Plus className="size-4" />
            {t("finished.addStock")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "range" ? "default" : "outline"}
            onClick={() => setMode("range")}
          >
            {t("invReportsHub.modeRange")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "asOf" ? "default" : "outline"}
            onClick={() => setMode("asOf")}
          >
            {t("invReportsHub.modeAsOf")}
          </Button>
        </div>

        {mode === "range" ? (
          <div className="flex flex-wrap items-end gap-2">
            <DateRangeFilter />
            <p className="pb-2 text-xs text-muted-foreground">
              {t("invReportsHub.stockAsOfHint", { date: stockAsOf })}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <Button
              type="button"
              size="sm"
              variant={asOf === todayInput() ? "default" : "outline"}
              onClick={() => setAsOf(todayInput())}
            >
              {t("common.today")}
            </Button>
            <div className="grid gap-1.5">
              <Label htmlFor={asOfId}>{t("invReportsHub.asOf")}</Label>
              <Input
                id={asOfId}
                type="date"
                className="w-auto"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((stat) => {
          const active = familyFilter === stat.key;
          return (
            <button
              key={stat.key}
              type="button"
              onClick={() => selectFilter(stat.key)}
              aria-pressed={active}
              title={t("finished.stat.filterHint")}
              className={cn(
                "text-start transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "rounded-xl ring-2 ring-primary/40"
              )}
            >
              <Card className={cn("relative overflow-hidden py-0", stat.cardClass)}>
                <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
                <CardContent className="p-4">
                  <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="font-data mt-2 text-xl font-medium sm:text-2xl">
                    {Math.round(stat.value)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("invReportsHub.stockAsOfHint", { date: stockAsOf })}
                  </p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <Input
            className="max-w-md"
            placeholder={t("finished.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("finished.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finished.col.product")}</TableHead>
                  <TableHead>{t("finished.col.family")}</TableHead>
                  <TableHead>{t("finished.col.size")}</TableHead>
                  <TableHead className="text-end">{t("finished.col.qty")}</TableHead>
                  <TableHead>{t("finished.col.status")}</TableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow
                    key={`${item.productId}-${item.warehouseId}`}
                    className={familyRowClass(item.family)}
                  >
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="font-data text-[10px] text-muted-foreground">
                        {item.sku || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.family ? (
                        <Badge variant="outline" className={familyBadgeClass(item.family)}>
                          {familyLabel(item.family)}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-data text-xs">
                      {item.size?.code || item.size?.name || "—"}
                    </TableCell>
                    <TableCell className="font-data text-end text-xs">
                      {item.quantity} {item.unitLabel}
                    </TableCell>
                    <TableCell>
                      {item.isLow ? (
                        <Badge variant="destructive" className="font-data text-[10px]">
                          {t("finished.status.low", { threshold: item.lowStockThreshold })}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="font-data text-[10px]">
                          {t("finished.status.ok")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="gap-1.5"
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="size-3.5" />
                        {t("finished.editStock")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogMode != null} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-nameplate text-base">
              {dialogMode === "edit" ? t("finished.editTitle") : t("finished.addTitle")}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "edit" ? t("finished.editDesc") : t("finished.addDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {dialogMode === "add" ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("finished.col.product")}</Label>
                <ProductSearchSelect
                  products={products}
                  value={productId}
                  onChange={setProductId}
                  placeholder={t("finished.selectProduct")}
                  emptyLabel={t("finished.selectProduct")}
                  showWeight
                  showFamily
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label>{t("finished.col.product")}</Label>
                <p className="text-sm font-medium">{editing?.name}</p>
                <p className="font-data text-[11px] text-muted-foreground">
                  {t("finished.currentQty")}: {editing?.quantity ?? 0} {editing?.unitLabel || "pcs"}
                </p>
              </div>
            )}

            {dialogMode === "add" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="finished-warehouse">{t("finished.warehouse")}</Label>
                <select
                  id="finished-warehouse"
                  className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  <option value="">{t("finished.defaultWarehouse")}</option>
                  {warehouses.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="finished-qty">
                {dialogMode === "edit" ? t("finished.newQty") : t("finished.qtyToAdd")}
              </Label>
              <Input
                id="finished-qty"
                type="number"
                min={dialogMode === "edit" ? 0 : 1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="finished-notes">{t("finished.notes")}</Label>
              <Input
                id="finished-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeDialog(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={() => void saveStock()} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
