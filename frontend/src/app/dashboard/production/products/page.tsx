"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { apiError } from "@/lib/materials-api";
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

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().optional(),
  description: z.string().optional(),
  unitLabel: z.string().optional(),
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
      toast.error(apiError(err, "Failed to load products"));
    } finally {
      setLoading(false);
    }
  }, [q]);

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
        toast.success("Product updated");
      } else {
        await createProduct(body);
        toast.success("Product created");
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to save product"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    try {
      await updateProduct(product._id, { isActive: !product.isActive });
      toast.success(product.isActive ? "Product deactivated" : "Product activated");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to update product"));
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
            Production
          </Link>
          <h1 className="text-nameplate text-xl">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Finished goods with category, size, warehouse, and low-stock threshold.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />
          Add product
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <Input
            placeholder="Search name or SKU…"
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
            <p className="py-10 text-center text-sm text-muted-foreground">No products yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Low stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                    <TableCell className="text-sm">{refName(p.category)}</TableCell>
                    <TableCell className="font-data text-xs">{refName(p.size)}</TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {p.lowStockThreshold ?? 0}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={p.isActive ? "secondary" : "outline"}
                        className="font-data text-[10px]"
                      >
                        {p.isActive ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(p)}>
                          {p.isActive ? "Deactivate" : "Activate"}
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
              {editing ? "Edit product" : "Add product"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...form.register("name")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" {...form.register("sku")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  {...form.register("category")}
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Size</Label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  {...form.register("size")}
                >
                  <option value="">None</option>
                  {sizes.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Default warehouse</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("defaultWarehouse")}
              >
                <option value="">System default</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="unitLabel">Unit</Label>
                <Input id="unitLabel" {...form.register("unitLabel")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lowStockThreshold">Low stock at</Label>
                <Input
                  id="lowStockThreshold"
                  type="number"
                  {...form.register("lowStockThreshold", { valueAsNumber: true })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Input id="description" {...form.register("description")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
