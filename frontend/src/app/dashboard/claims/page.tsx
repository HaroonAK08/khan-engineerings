"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { api } from "@/lib/api";
import { apiError, formatDate } from "@/lib/materials-api";
import { listProducts } from "@/lib/production-api";
import type { Product } from "@/types/production";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductSearchSelect } from "@/components/products/product-search-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OrderOption = { _id: string; orderNo: string; invoiceNo: string; customer?: { name: string } };
type Claim = {
  _id: string;
  claimNo: string;
  claimDate: string;
  status: string;
  customer?: { name: string };
  order?: { invoiceNo: string };
  items: Array<{ quantity: number; disposition: string; product?: { name: string } }>;
};

const schema = z.object({
  order: z.string().min(1, "Select invoice"),
  product: z.string().min(1),
  quantity: z.number().int().positive(),
  disposition: z.enum(["rework", "scrap_loss", "replacement"]),
  weightKg: z.number().min(0).optional(),
  reason: z.string().optional(),
  claimDate: z.string().min(1),
});

type Form = z.infer<typeof schema>;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function ClaimsPage() {
  const { t } = useI18n();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      order: "",
      product: "",
      quantity: 1,
      disposition: "rework",
      weightKg: undefined,
      reason: "",
      claimDate: todayInput(),
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [claimsRes, ordersRes, productData] = await Promise.all([
        api.get<{ claims: Claim[] }>("/claims"),
        api.get<{ orders: OrderOption[] }>("/orders"),
        listProducts({ active: "true" }),
      ]);
      setClaims(claimsRes.data.claims);
      setOrders(ordersRes.data.orders);
      setProducts(productData);
    } catch (err) {
      toast.error(apiError(err, "Failed to load claims"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit(values: Form) {
    setSaving(true);
    try {
      await api.post("/claims", {
        order: values.order,
        claimDate: values.claimDate,
        items: [
          {
            product: values.product,
            quantity: values.quantity,
            disposition: values.disposition,
            weightKg: values.weightKg,
            reason: values.reason,
          },
        ],
      });
      toast.success("Claim recorded");
      form.reset({
        order: values.order,
        product: "",
        quantity: 1,
        disposition: "rework",
        weightKg: undefined,
        reason: "",
        claimDate: todayInput(),
      });
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to save claim"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          {t("claims.eyebrow")}
        </p>
        <h1 className="text-nameplate text-xl">{t("claims.title")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("claims.record")}</CardTitle>
          <CardDescription>{t("claims.recordDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label>{t("claims.invoice")}</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("order")}
              >
                <option value="">{t("claims.select")}</option>
                {orders.map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.invoiceNo} · {o.customer?.name || ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("claims.product")}</Label>
              <ProductSearchSelect
                products={products}
                value={form.watch("product")}
                onChange={(id) => form.setValue("product", id, { shouldValidate: true })}
                placeholder={t("claims.select")}
                emptyLabel={t("claims.select")}
                showWeight
                showFamily
              />
              {form.formState.errors.product && (
                <p className="text-xs text-destructive">{form.formState.errors.product.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("claims.quantity")}</Label>
              <Input type="number" min={1} step={1} {...form.register("quantity", { valueAsNumber: true })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("claims.disposition")}</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("disposition")}
              >
                <option value="rework">{t("claims.disp.rework")}</option>
                <option value="scrap_loss">{t("claims.disp.scrap")}</option>
                <option value="replacement">{t("claims.disp.replacement")}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("claims.weight")}</Label>
              <Input type="number" min={0} step={1} {...form.register("weightKg", { valueAsNumber: true })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("claims.date")}</Label>
              <Input type="date" {...form.register("claimDate")} />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-3">
              <Label>{t("claims.reason")}</Label>
              <Input {...form.register("reason")} />
            </div>
            <div>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("claims.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("claims.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : claims.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("claims.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("claims.col.claim")}</TableHead>
                  <TableHead>{t("claims.col.date")}</TableHead>
                  <TableHead>{t("claims.col.customer")}</TableHead>
                  <TableHead>{t("claims.col.invoice")}</TableHead>
                  <TableHead>{t("claims.col.items")}</TableHead>
                  <TableHead>{t("claims.col.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell className="font-data text-xs">{c.claimNo}</TableCell>
                    <TableCell className="font-data text-xs">{formatDate(c.claimDate)}</TableCell>
                    <TableCell>{c.customer?.name || "—"}</TableCell>
                    <TableCell className="font-data text-xs">{c.order?.invoiceNo || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {c.items
                        .map(
                          (i) =>
                            `${i.quantity} ${i.product?.name || ""} (${i.disposition})`
                        )
                        .join(", ")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {c.status}
                      </Badge>
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
