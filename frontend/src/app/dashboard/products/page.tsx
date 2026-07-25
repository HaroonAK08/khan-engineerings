"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { apiError, formatMoney } from "@/lib/materials-api";
import { getFinishedStock } from "@/lib/inventory-api";
import { createProduct, listProducts, updateProduct } from "@/lib/production-api";
import type { Product } from "@/types/production";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { useI18n } from "@/hooks/use-i18n";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().optional(),
  description: z.string().optional(),
  unitLabel: z.string().optional(),
  family: z.enum(["hub", "drum"]),
  weightKg: z.number().min(0.001, "Weight (kg) is required"),
  pricePerKg: z.number().min(0).optional(),
  category: z.string().optional(),
  size: z.string().optional(),
  lowStockThreshold: z.number().min(0),
  isActive: z.boolean(),
});

type ProductForm = z.infer<typeof productSchema>;

function refId(value: Product["category"]) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id;
}

function refName(value: Product["category"] | Product["size"]) {
  if (!value) return "—";
  if (typeof value === "string") return value;
  return value.name;
}

export default function ProductsPage() {
  const { t } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [familyFilter, setFamilyFilter] = useState<"all" | "hub" | "drum">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      sku: "",
      description: "",
      unitLabel: "pcs",
      family: "hub",
      weightKg: 0,
      pricePerKg: 0,
      category: "",
      size: "",
      lowStockThreshold: 0,
      isActive: true,
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { q?: string; family?: string } = {};
      if (q.trim()) params.q = q.trim();
      if (familyFilter !== "all") params.family = familyFilter;
      const [p, stock] = await Promise.all([
        listProducts(Object.keys(params).length ? params : undefined),
        getFinishedStock(),
      ]);
      setProducts(p);
      const quantities = new Map<string, number>();
      for (const item of stock.items || []) {
        quantities.set(
          item.productId,
          (quantities.get(item.productId) || 0) + (item.quantity || 0)
        );
      }
      setStockByProduct(quantities);
    } catch (err) {
      toast.error(apiError(err, t("productsPage.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [q, familyFilter, t]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function openCreate() {
    setEditing(null);
    form.reset({
      name: "",
      sku: "",
      description: "",
      unitLabel: "pcs",
      family: "hub",
      weightKg: 0,
      pricePerKg: 0,
      category: "",
      size: "",
      lowStockThreshold: 0,
      isActive: true,
    });
    setDialogOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    form.reset({
      name: product.name,
      sku: product.sku || "",
      description: product.description || "",
      unitLabel: product.unitLabel || "pcs",
      family: product.family || "hub",
      weightKg: product.weightKg ?? 0,
      pricePerKg: product.pricePerKg ?? 0,
      category: refId(product.category),
      size: refId(product.size),
      lowStockThreshold: product.lowStockThreshold ?? 0,
      isActive: product.isActive,
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: ProductForm) {
    setSaving(true);
    try {
      const body = {
        ...values,
        category: values.category || null,
        size: values.size || null,
      };
      if (editing) {
        await updateProduct(editing._id, body);
        toast.success(t("productsPage.updated"));
      } else {
        await createProduct(body);
        toast.success(t("productsPage.created"));
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("productsPage.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    try {
      await updateProduct(product._id, { isActive: !product.isActive });
      toast.success(product.isActive ? t("productsPage.deactivated") : t("productsPage.activated"));
      await load();
    } catch (err) {
      toast.error(apiError(err, t("productsPage.updateFailed")));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("nav.products")}</h1>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />
          {t("productsPage.addProduct")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">
                {t("prod.family")}:{" "}
                <span className="text-muted-foreground">
                  {familyFilter === "all"
                    ? t("prod.filter.all")
                    : familyFilter === "hub"
                      ? t("prod.hub")
                      : t("prod.drum")}
                </span>
              </p>
              <div
                className="grid grid-cols-3 gap-2"
                role="group"
                aria-label={t("prod.family")}
              >
                {(
                  [
                    { value: "all", label: t("prod.filter.all") },
                    { value: "hub", label: t("prod.hub") },
                    { value: "drum", label: t("prod.drum") },
                  ] as const
                ).map((opt) => {
                  const active = familyFilter === opt.value;
                  return (
                    <Button
                      key={opt.value}
                      type="button"
                      size="lg"
                      variant={active ? "default" : "outline"}
                      className={`h-12 text-base font-semibold uppercase tracking-wide ${
                        active ? "shadow-sm" : "bg-background"
                      }`}
                      onClick={() => setFamilyFilter(opt.value)}
                      aria-pressed={active}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            </div>
            <Input
              placeholder={t("productsPage.searchPh")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : products.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("productsPage.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("prod.family")}</TableHead>
                  <TableHead className="text-right">{t("productsPage.makeCost")}</TableHead>
                  <TableHead className="text-right">{t("prod.col.onHand")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      {p.sku ? (
                        <div className="font-data text-[10px] text-muted-foreground">{p.sku}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-data text-[10px] uppercase">
                        {p.family || "hub"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(Number(p.standardCost) || 0)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs font-semibold">
                      {stockByProduct.get(p._id) || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                          {t("sup.edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={p.isActive ? "text-destructive hover:text-destructive" : undefined}
                          onClick={() => toggleActive(p)}
                        >
                          {p.isActive ? t("productsPage.delete") : t("sup.activate")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-nameplate text-base">
              {editing ? t("productsPage.dialogEdit") : t("productsPage.addProduct")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">{t("common.name")}</Label>
              <Input id="name" {...form.register("name")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="family">{t("prod.family")}</Label>
              <select
                id="family"
                className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30"
                {...form.register("family")}
              >
                <option value="hub">{t("prod.hub")}</option>
                <option value="drum">{t("prod.drum")}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="weightKg">{t("productsPage.weightKg")}</Label>
              <Input
                id="weightKg"
                type="number"
                step="0.001"
                {...form.register("weightKg", { valueAsNumber: true })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
