"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BarChart3, CircleDollarSign, Loader2, Package, Trash2 } from "lucide-react";
import { apiError, formatDate, formatKg, getStock } from "@/lib/materials-api";
import {
  createBatch,
  deleteBatch,
  listBatches,
  listProducts,
  productName,
} from "@/lib/production-api";
import type { StockSummary } from "@/types/materials";
import type { Product, ProductionBatch } from "@/types/production";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const batchSchema = z.object({
  product: z.string().min(1, "Product is required"),
  productionDate: z.string().min(1, "Date is required"),
  inputScrapKg: z.number().positive("Input scrap must be greater than 0"),
  materialLossKg: z.number().min(0, "Loss cannot be negative"),
  returnedScrapKg: z.number().min(0, "Returned scrap cannot be negative"),
  goodUnits: z.number().min(0),
  rejectedUnits: z.number().min(0),
  notes: z.string().optional(),
}).refine((v) => v.goodUnits + v.rejectedUnits > 0, {
  message: "Enter at least one good or rejected unit",
  path: ["goodUnits"],
}).refine((v) => v.returnedScrapKg + v.materialLossKg <= v.inputScrapKg + 1e-9, {
  message: "Loss + returned cannot exceed input scrap",
  path: ["returnedScrapKg"],
});

type BatchForm = z.infer<typeof batchSchema>;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProductionPage() {
  const [stock, setStock] = useState<StockSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productFilter, setProductFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");

  const form = useForm<BatchForm>({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      product: "",
      productionDate: todayInput(),
      inputScrapKg: 0,
      materialLossKg: 0,
      returnedScrapKg: 0,
      goodUnits: 0,
      rejectedUnits: 0,
      notes: "",
    },
  });

  const inputKg = form.watch("inputScrapKg");
  const lossKg = form.watch("materialLossKg");
  const returnedKg = form.watch("returnedScrapKg");
  const netConsumed = useMemo(() => {
    const i = Number(inputKg) || 0;
    const r = Number(returnedKg) || 0;
    return Math.round((i - r) * 1000) / 1000;
  }, [inputKg, returnedKg]);

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { product?: string; dateFrom?: string; dateTo?: string; q?: string } = {};
      if (productFilter) params.product = productFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (q.trim()) params.q = q.trim();

      const [stockData, productData, batchData] = await Promise.all([
        getStock(),
        listProducts(),
        listBatches(params),
      ]);
      setStock(stockData);
      setProducts(productData);
      setBatches(batchData);
    } catch (err) {
      toast.error(apiError(err, "Failed to load production"));
    } finally {
      setLoading(false);
    }
  }, [productFilter, dateFrom, dateTo, q]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function onSubmit(values: BatchForm) {
    setSaving(true);
    try {
      await createBatch(values);
      toast.success("Production batch recorded");
      form.reset({
        product: values.product,
        productionDate: todayInput(),
        inputScrapKg: 0,
        materialLossKg: 0,
        returnedScrapKg: 0,
        goodUnits: 0,
        rejectedUnits: 0,
        notes: "",
      });
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to save batch"));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this batch? Scrap stock will be restored.")) return;
    try {
      await deleteBatch(id);
      toast.success("Batch deleted");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to delete batch"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            Melting · casting · yield
          </p>
          <h1 className="text-nameplate text-xl">Production</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/production/products"
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted"
          >
            <Package className="size-4" />
            Products
          </Link>
          <Link
            href="/dashboard/production/costs"
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted"
          >
            <CircleDollarSign className="size-4" />
            Costs
          </Link>
          <Link
            href="/dashboard/production/reports"
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted"
          >
            <BarChart3 className="size-4" />
            Yield
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Scrap available",
            value: stock ? `${formatKg(stock.totalKg)} kg` : "—",
            hint: "ready for melting",
            accent: "bg-chart-1",
          },
          {
            label: "Consumed (net)",
            value: stock?.consumedKg != null ? `${formatKg(stock.consumedKg)} kg` : "—",
            hint: "input − returned",
            accent: "bg-chart-2",
          },
          {
            label: "Batches",
            value: String(batches.length),
            hint: "in current filter",
            accent: "bg-chart-3",
          },
          {
            label: "Good / Rejected",
            value: `${batches.reduce((s, b) => s + b.goodUnits, 0)} / ${batches.reduce((s, b) => s + b.rejectedUnits, 0)}`,
            hint: "filtered history",
            accent: "bg-chart-4",
          },
        ].map((stat) => (
          <Card key={stat.label} className="relative overflow-hidden py-0">
            <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
            <CardContent className="p-5">
              <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                {stat.label}
              </p>
              <p className="font-data mt-2 text-2xl font-medium">{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">Record production batch</CardTitle>
          <CardDescription>
            Melting run: charge scrap, track loss & returns, log good and rejected pieces.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeProducts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">Create a product before recording batches.</p>
              <Link
                href="/dashboard/production/products"
                className="mt-3 inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm text-primary-foreground"
              >
                Add product
              </Link>
            </div>
          ) : (
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="product">Product</Label>
                <select
                  id="product"
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  {...form.register("product")}
                >
                  <option value="">Select product…</option>
                  {activeProducts.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {form.formState.errors.product && (
                  <p className="text-xs text-destructive">{form.formState.errors.product.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="productionDate">Production date</Label>
                <Input id="productionDate" type="date" {...form.register("productionDate")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inputScrapKg">Input scrap (kg)</Label>
                <Input
                  id="inputScrapKg"
                  type="number"
                  step="0.001"
                  {...form.register("inputScrapKg", { valueAsNumber: true })}
                />
                {form.formState.errors.inputScrapKg && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.inputScrapKg.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="materialLossKg">Material loss (kg)</Label>
                <Input
                  id="materialLossKg"
                  type="number"
                  step="0.001"
                  {...form.register("materialLossKg", { valueAsNumber: true })}
                />
                {form.formState.errors.materialLossKg && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.materialLossKg.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="returnedScrapKg">Returned scrap (kg)</Label>
                <Input
                  id="returnedScrapKg"
                  type="number"
                  step="0.001"
                  {...form.register("returnedScrapKg", { valueAsNumber: true })}
                />
                {form.formState.errors.returnedScrapKg && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.returnedScrapKg.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="goodUnits">Good units</Label>
                <Input
                  id="goodUnits"
                  type="number"
                  step="1"
                  {...form.register("goodUnits", { valueAsNumber: true })}
                />
                {form.formState.errors.goodUnits && (
                  <p className="text-xs text-destructive">{form.formState.errors.goodUnits.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rejectedUnits">Rejected units</Label>
                <Input
                  id="rejectedUnits"
                  type="number"
                  step="1"
                  {...form.register("rejectedUnits", { valueAsNumber: true })}
                />
              </div>
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" {...form.register("notes")} />
              </div>
              <div className="flex flex-wrap items-end gap-3 md:col-span-2 xl:col-span-3">
                <p className="font-data text-sm text-muted-foreground">
                  Net consumed:{" "}
                  <span className="text-foreground">{formatKg(netConsumed)} kg</span>
                  {Number(lossKg) > 0 && (
                    <>
                      {" "}
                      · Loss: <span className="text-foreground">{formatKg(Number(lossKg) || 0)} kg</span>
                    </>
                  )}
                </p>
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  Save batch
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">Batch history</CardTitle>
          <CardDescription>Filter past melting runs.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
            >
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <Input placeholder="Batch no…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : batches.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No batches found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">Loss</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                  <TableHead className="text-right">Good</TableHead>
                  <TableHead className="text-right">Reject</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b._id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/production/${b._id}`}
                        className="font-data text-xs hover:text-primary hover:underline"
                      >
                        {b.batchNo}
                      </Link>
                    </TableCell>
                    <TableCell className="font-data text-xs">
                      {formatDate(b.productionDate)}
                    </TableCell>
                    <TableCell>{productName(b.product)}</TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatKg(b.inputScrapKg)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatKg(b.materialLossKg)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatKg(b.returnedScrapKg)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">{b.goodUnits}</TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {b.rejectedUnits > 0 ? (
                        <Badge variant="outline" className="font-data text-[10px]">
                          {b.rejectedUnits}
                        </Badge>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onDelete(b._id)}
                        aria-label="Delete batch"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
