"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { InventorySubnav } from "@/components/layout/inventory-subnav";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, formatDate } from "@/lib/materials-api";
import { listProducts } from "@/lib/production-api";
import {
  createAdjustment,
  listMovements,
  listWarehouses,
  type CatalogItem,
  type StockMovement,
} from "@/lib/inventory-api";
import type { Product } from "@/types/production";
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

const adjustSchema = z.object({
  itemType: z.enum(["raw_scrap", "raw_daig", "reusable", "finished_good"]),
  direction: z.enum(["in", "out"]),
  quantity: z.number().positive("Quantity must be greater than 0"),
  product: z.string().optional(),
  warehouse: z.string().optional(),
  movementDate: z.string().min(1),
  notes: z.string().optional(),
});

type AdjustForm = z.infer<typeof adjustSchema>;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function MovementsPage() {
  const { t } = useI18n();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<CatalogItem[]>([]);
  const [itemType, setItemType] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      itemType: "finished_good",
      direction: "out",
      quantity: 0,
      product: "",
      warehouse: "",
      movementDate: todayInput(),
      notes: "",
    },
  });

  const watchType = form.watch("itemType");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { itemType?: string } = {};
      if (itemType) params.itemType = itemType;
      const [m, p, w] = await Promise.all([
        listMovements(params),
        listProducts({ active: "true" }),
        listWarehouses(),
      ]);
      setMovements(m);
      setProducts(p);
      setWarehouses(w);
    } catch (err) {
      toast.error(apiError(err, "Failed to load movements"));
    } finally {
      setLoading(false);
    }
  }, [itemType]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit(values: AdjustForm) {
    if (values.itemType === "finished_good" && !values.product) {
      toast.error("Select a product");
      return;
    }
    setSaving(true);
    try {
      await createAdjustment({
        ...values,
        product: values.product || undefined,
        warehouse: values.warehouse || undefined,
      });
      toast.success("Adjustment recorded");
      form.reset({
        itemType: values.itemType,
        direction: "out",
        quantity: 0,
        product: values.product,
        warehouse: values.warehouse,
        movementDate: todayInput(),
        notes: "",
      });
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to save adjustment"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <InventorySubnav />
      <div>
        <h1 className="text-nameplate text-xl">{t("movements.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("movements.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("movements.manualTitle")}</CardTitle>
          <CardDescription>{t("movements.manualDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label>Item type</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("itemType")}
              >
                <option value="finished_good">Finished good</option>
                <option value="raw_scrap">Scrap</option>
                <option value="raw_daig">Daig</option>
                <option value="reusable">Reusable</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Direction</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("direction")}
              >
                <option value="in">In</option>
                <option value="out">Out</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Quantity</Label>
              <Input
                type="number"
                step="0.001"
                {...form.register("quantity", { valueAsNumber: true })}
              />
            </div>
            {watchType === "finished_good" && (
              <div className="flex flex-col gap-1.5">
                <Label>Product</Label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  {...form.register("product")}
                >
                  <option value="">Select…</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>Warehouse</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("warehouse")}
              >
                <option value="">Default</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Date</Label>
              <Input type="date" {...form.register("movementDate")} />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label>Notes</Label>
              <Input {...form.register("notes")} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                Post adjustment
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <select
            className="h-8 w-full max-w-xs rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
          >
            <option value="">All item types</option>
            <option value="raw_scrap">Scrap</option>
            <option value="raw_daig">Daig</option>
            <option value="reusable">Reusable</option>
            <option value="finished_good">Finished goods</option>
          </select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : movements.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No movements yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m._id}>
                    <TableCell className="font-data text-xs">
                      {formatDate(m.movementDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-data text-[10px] uppercase">
                        {m.itemType.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-data text-xs">{m.reason}</TableCell>
                    <TableCell className="text-sm">
                      {m.product?.name ||
                        (m.itemType === "raw_scrap"
                          ? "Scrap"
                          : m.itemType === "raw_daig"
                            ? "Daig"
                            : m.itemType === "reusable"
                              ? "Reusable"
                              : "—")}
                    </TableCell>
                    <TableCell className="text-sm">{m.warehouse?.name || "—"}</TableCell>
                    <TableCell
                      className={`font-data text-right text-xs ${
                        m.direction === "out" ? "text-destructive" : "text-chart-3"
                      }`}
                    >
                      {m.direction === "out" ? "−" : "+"}
                      {m.quantity} {m.unit}
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
