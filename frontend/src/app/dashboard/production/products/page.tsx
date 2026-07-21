"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { apiError, formatMoney } from "@/lib/materials-api";
import { listCategories, listSizes, listWarehouses, type CatalogItem } from "@/lib/inventory-api";
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
  weightKg: z.number().min(0).optional().nullable(),
  sellingPrice: z.number().min(0).optional(),
  category: z.string().optional(),
  size: z.string().optional(),
  defaultWarehouse: z.string().optional(),
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
  const [categories, setCategories] = useState<CatalogItem[]>([]);
  const [sizes, setSizes] = useState<CatalogItem[]>([]);
  const [warehouses, setWarehouses] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
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
      weightKg: undefined,
      sellingPrice: 0,
      category: "",
      size: "",
      defaultWarehouse: "",
      lowStockThreshold: 0,
      isActive: true,
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, s, w] = await Promise.all([
        listProducts(q.trim() ? { q: q.trim() } : undefined),
        listCategories(),
        listSizes(),
        listWarehouses(),
      ]);
      setProducts(p);
      setCategories(c);
      setSizes(s);
      setWarehouses(w);
    } catch (err) {
      toast.error(apiError(err, t("productsPage.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [q, t]);

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
      weightKg: undefined,
      sellingPrice: 0,
      category: "",
      size: "",
      defaultWarehouse: "",
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
      weightKg: product.weightKg ?? undefined,
      sellingPrice: product.sellingPrice ?? 0,
      category: refId(product.category),
      size: refId(product.size),
      defaultWarehouse: refId(product.defaultWarehouse),
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
        defaultWarehouse: values.defaultWarehouse || null,
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
          <Link
            href="/dashboard/production"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t("prod.title")}
          </Link>
          <h1 className="text-nameplate text-xl">{t("financeSubnav.products")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("productsPage.subtitle")}</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />
          {t("productsPage.addProduct")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <Input
            placeholder={t("productsPage.searchPh")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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
                  <TableHead>{t("common.category")}</TableHead>
                  <TableHead>{t("finished.col.size")}</TableHead>
                  <TableHead className="text-right">{t("productsPage.makeCost")}</TableHead>
                  <TableHead className="text-right">{t("productsPage.sellingPrice")}</TableHead>
                  <TableHead className="text-right">{t("productsPage.colLowStock")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="font-data text-[10px] text-muted-foreground">
                        {p.sku || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-data text-[10px] uppercase">
                        {p.family || "hub"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{refName(p.category)}</TableCell>
                    <TableCell className="font-data text-xs">{refName(p.size)}</TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(Number(p.standardCost) || 0)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(Number(p.sellingPrice) || 0)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {p.lowStockThreshold ?? 0}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={p.isActive ? "secondary" : "outline"}
                        className="font-data text-[10px]"
                      >
                        {p.isActive ? t("sup.status.active") : t("sup.status.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                          {t("sup.edit")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(p)}>
                          {p.isActive ? t("sup.deactivate") : t("sup.activate")}
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
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sku">{t("productsPage.sku")}</Label>
                <Input id="sku" {...form.register("sku")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="family">{t("prod.family")}</Label>
                <select
                  id="family"
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  {...form.register("family")}
                >
                  <option value="hub">{t("prod.hub")}</option>
                  <option value="drum">{t("prod.drum")}</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="weightKg">{t("productsPage.weightKg")}</Label>
                <Input
                  id="weightKg"
                  type="number"
                  step="0.001"
                  {...form.register("weightKg", { valueAsNumber: true })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sellingPrice">{t("productsPage.sellingPrice")}</Label>
                <Input
                  id="sellingPrice"
                  type="number"
                  step="0.01"
                  {...form.register("sellingPrice", { valueAsNumber: true })}
                />
              </div>
            </div>
            {editing && (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{t("productsPage.makeCost")}</p>
                <p className="font-data text-sm">{formatMoney(Number(editing.standardCost) || 0)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t("productsPage.makeCostHint")}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.category")}</Label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  {...form.register("category")}
                >
                  <option value="">{t("productsPage.none")}</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("finished.col.size")}</Label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  {...form.register("size")}
                >
                  <option value="">{t("productsPage.none")}</option>
                  {sizes.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("productsPage.defaultWarehouse")}</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("defaultWarehouse")}
              >
                <option value="">{t("productsPage.systemDefault")}</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="unitLabel">{t("other.unit")}</Label>
                <Input id="unitLabel" {...form.register("unitLabel")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lowStockThreshold">{t("productsPage.lowStockAt")}</Label>
                <Input
                  id="lowStockThreshold"
                  type="number"
                  {...form.register("lowStockThreshold", { valueAsNumber: true })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">{t("productsPage.description")}</Label>
              <Input id="description" {...form.register("description")} />
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
