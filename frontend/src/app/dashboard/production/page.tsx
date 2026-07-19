"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Package } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, formatDate, formatKg, getStock } from "@/lib/materials-api";
import { createBatch, listBatches, listProducts } from "@/lib/production-api";
import type { StockSummary } from "@/types/materials";
import type { Product, ProductionBatch } from "@/types/production";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const startSchema = z.object({
  family: z.enum(["hub", "drum"]),
  materialType: z.enum(["scrap", "daig", "reusable"]),
  productionDate: z.string().min(1),
  notes: z.string().optional(),
});

type StartForm = z.infer<typeof startSchema>;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProductionPage() {
  const { t } = useI18n();
  const [stock, setStock] = useState<StockSummary | null>(null);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("in_progress");

  const form = useForm<StartForm>({
    resolver: zodResolver(startSchema),
    defaultValues: {
      family: "hub",
      materialType: "scrap",
      productionDate: todayInput(),
      notes: "",
    },
  });

  const family = form.watch("family");

  useEffect(() => {
    form.setValue("materialType", family === "drum" ? "daig" : "scrap");
  }, [family, form]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { status?: string } = {};
      if (statusFilter) params.status = statusFilter;
      const [stockData, batchData, productData] = await Promise.all([
        getStock(),
        listBatches(params),
        listProducts({ active: "true" }),
      ]);
      setStock(stockData);
      setBatches(batchData);
      setProducts(productData);
    } catch (err) {
      toast.error(apiError(err, "Failed to load production"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const t = setTimeout(load, 150);
    return () => clearTimeout(t);
  }, [load]);

  const wipCount = useMemo(
    () => batches.filter((b) => b.status === "in_progress").length,
    [batches]
  );

  async function onSubmit(values: StartForm) {
    setSaving(true);
    try {
      const batch = await createBatch({
        family: values.family,
        materialType: values.materialType,
        productionDate: values.productionDate,
        notes: values.notes,
      });
      toast.success(`Batch ${batch.batchNo} started — open it and record units from furnace`);
      form.reset({
        family: values.family,
        materialType: values.family === "drum" ? "daig" : "scrap",
        productionDate: todayInput(),
        notes: "",
      });
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to start batch"));
    } finally {
      setSaving(false);
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
        </div>
        <Link
          href="/dashboard/production/products"
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted"
        >
          <Package className="size-4" />
          {t("prod.products")}
        </Link>
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
                ? `${formatKg(stock.byMaterial?.scrap?.availableKg ?? stock.totalKg)} kg`
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
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("prod.startBatch")}</CardTitle>
          <CardDescription>{t("prod.startDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label>{t("prod.family")}</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("family")}
              >
                <option value="hub">{t("prod.hub")}</option>
                <option value="drum">{t("prod.drum")}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("prod.chargeMaterial")}</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("materialType")}
              >
                <option value="scrap">{t("prod.scrap")}</option>
                <option value="daig">{t("prod.daig")}</option>
                <option value="reusable">{t("prod.reusable")}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("prod.date")}</Label>
              <Input type="date" {...form.register("productionDate")} />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-3">
              <Label>{t("prod.notes")}</Label>
              <Input {...form.register("notes")} />
            </div>
            <div>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("prod.startBatchBtn")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-nameplate text-sm">{t("prod.batches")}</CardTitle>
            <CardDescription>
              {statusFilter === "in_progress"
                ? t("prod.inProgressCount", { count: wipCount })
                : t("prod.filteredList")}
            </CardDescription>
          </div>
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="in_progress">{t("prod.filter.inProgress")}</option>
            <option value="completed">{t("prod.filter.completed")}</option>
            <option value="cancelled">{t("prod.filter.cancelled")}</option>
            <option value="">{t("prod.filter.all")}</option>
          </select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : batches.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("prod.noBatches")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("prod.col.batch")}</TableHead>
                  <TableHead>{t("prod.col.family")}</TableHead>
                  <TableHead>{t("prod.col.stage")}</TableHead>
                  <TableHead>{t("prod.col.status")}</TableHead>
                  <TableHead>{t("prod.col.date")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b._id}>
                    <TableCell className="font-data text-xs">{b.batchNo}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-data text-[10px] uppercase">
                        {b.family}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{b.currentStage}</TableCell>
                    <TableCell>
                      <Badge
                        variant={b.status === "in_progress" ? "secondary" : "outline"}
                        className="font-data text-[10px] uppercase"
                      >
                        {b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-data text-xs">
                      {formatDate(b.productionDate)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/dashboard/production/${b._id}`}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "sm" }),
                          "inline-flex"
                        )}
                      >
                        {t("prod.open")}
                      </Link>
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
