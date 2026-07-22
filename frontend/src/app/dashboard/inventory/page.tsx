"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { InventorySubnav } from "@/components/layout/inventory-subnav";
import { useI18n } from "@/hooks/use-i18n";
import {
  apiError,
  createPurchase,
  deletePurchase,
  formatDate,
  formatKg,
  formatMoney,
  getStock,
  listPurchases,
  listSuppliers,
  supplierName,
} from "@/lib/materials-api";
import type { Purchase, StockSummary, Supplier } from "@/types/materials";
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

const purchaseSchema = z.object({
  supplier: z.string().min(1, "Supplier is required"),
  materialType: z.enum(["scrap", "daig"]),
  quantityKg: z
    .number()
    .positive("Quantity must be greater than 0")
    .refine((n) => Number.isInteger(n), "Quantity must be whole kilograms (no grams)"),
  ratePerKg: z.number().positive("Rate per kg is required"),
  purchaseDate: z.string().min(1, "Date is required"),
  invoiceNo: z.string().optional(),
  notes: z.string().optional(),
});

type PurchaseForm = z.infer<typeof purchaseSchema>;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export default function InventoryPage() {
  const { t } = useI18n();
  const [stock, setStock] = useState<StockSummary | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");

  const form = useForm<PurchaseForm>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      supplier: "",
      materialType: "scrap",
      quantityKg: 0,
      ratePerKg: 0,
      purchaseDate: todayInput(),
      invoiceNo: "",
      notes: "",
    },
  });

  const qty = form.watch("quantityKg");
  const rate = form.watch("ratePerKg");
  const totalAmount = useMemo(() => {
    const qn = Number(qty);
    const r = Number(rate);
    if (!Number.isFinite(qn) || qn <= 0 || !Number.isFinite(r) || r <= 0) return 0;
    return roundMoney(qn * r);
  }, [qty, rate]);

  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => s.isActive),
    [suppliers]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: {
        supplier?: string;
        dateFrom?: string;
        dateTo?: string;
        q?: string;
      } = {};
      if (supplierFilter) params.supplier = supplierFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (q.trim()) params.q = q.trim();

      const [stockData, supplierData, purchaseData] = await Promise.all([
        getStock(),
        listSuppliers(),
        listPurchases(params),
      ]);
      setStock(stockData);
      setSuppliers(supplierData);
      setPurchases(purchaseData);
    } catch (err) {
      toast.error(apiError(err, "Failed to load inventory"));
    } finally {
      setLoading(false);
    }
  }, [supplierFilter, dateFrom, dateTo, q]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function onSubmit(values: PurchaseForm) {
    setSaving(true);
    try {
      const total = roundMoney(values.quantityKg * values.ratePerKg);
      const purchase = await createPurchase({
        supplier: values.supplier,
        materialType: values.materialType,
        quantityKg: values.quantityKg,
        ratePerKg: values.ratePerKg,
        totalAmount: total,
        purchaseDate: values.purchaseDate,
        invoiceNo: values.invoiceNo,
        notes: values.notes,
        freightAmount: 0,
        amountPaid: 0,
      });
      toast.success(
        purchase.invoiceNo
          ? `Purchase saved (${purchase.invoiceNo}) — due on supplier account`
          : "Purchase recorded — amount due on supplier account"
      );
      form.reset({
        supplier: values.supplier,
        materialType: values.materialType,
        quantityKg: 0,
        ratePerKg: 0,
        purchaseDate: todayInput(),
        invoiceNo: "",
        notes: "",
      });
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to record purchase"));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this purchase? Stock and supplier account will update.")) return;
    try {
      await deletePurchase(id);
      toast.success("Purchase deleted");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to delete purchase"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <InventorySubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("purchases.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("purchases.title")}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: t("purchases.availableScrap"),
            value: stock
              ? `${formatKg(stock.byMaterial?.scrap?.availableKg ?? stock.totalKg)} kg`
              : "—",
            hint: stock?.byMaterial?.scrap?.consumedKg
              ? `${formatKg(stock.byMaterial.scrap.purchasedKg ?? 0)} purchased − ${formatKg(stock.byMaterial.scrap.consumedKg)} used`
              : t("purchases.afterConsumption"),
            accent: "bg-chart-1",
          },
          {
            label: t("purchases.availableDaig"),
            value: stock?.byMaterial?.daig
              ? `${formatKg(stock.byMaterial.daig.availableKg ?? stock.byMaterial.daig.totalKg)} kg`
              : "—",
            hint: t("purchases.daigOnHand"),
            accent: "bg-chart-2",
          },
          {
            label: t("purchases.totalSpend"),
            value: stock
              ? formatMoney(
                  (stock.byMaterial?.scrap?.totalSpend ?? stock.totalSpend) +
                    (stock.byMaterial?.daig?.totalSpend ?? 0)
                )
              : "—",
            hint: t("purchases.allRecorded"),
            accent: "bg-chart-3",
          },
          {
            label: t("purchases.count"),
            value: stock
              ? String(
                  (stock.byMaterial?.scrap?.purchaseCount ?? stock.purchaseCount) +
                    (stock.byMaterial?.daig?.purchaseCount ?? 0)
                )
              : "—",
            hint: t("purchases.entriesRecorded"),
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
          <CardTitle className="text-nameplate text-sm">{t("purchases.recordTitle")}</CardTitle>
          <CardDescription>
            Enter kg and either rate or total — the other calculates automatically. This adds
            stock and what you owe the supplier. Pay later from Suppliers (not at purchase time).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier">Supplier</Label>
              <select
                id="supplier"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("supplier")}
              >
                <option value="">Select supplier…</option>
                {activeSuppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {supplierName(s)}
                  </option>
                ))}
              </select>
              {form.formState.errors.supplier && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.supplier.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="materialType">Material</Label>
              <select
                id="materialType"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("materialType")}
              >
                <option value="scrap">Scrap</option>
                <option value="daig">Daig</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quantityKg">Quantity (kg)</Label>
              <Input
                id="quantityKg"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                placeholder="e.g. 100"
                value={Number.isFinite(qty) && qty > 0 ? qty : ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    form.setValue("quantityKg", 0, { shouldValidate: true });
                    return;
                  }
                  const v = Math.round(Number(raw));
                  form.setValue("quantityKg", Number.isFinite(v) ? v : 0, {
                    shouldValidate: true,
                  });
                }}
              />
              {form.formState.errors.quantityKg && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.quantityKg.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ratePerKg">Rate per kg</Label>
              <Input
                id="ratePerKg"
                type="number"
                step="0.01"
                min={0}
                placeholder="e.g. 80"
                value={Number.isFinite(rate) && rate > 0 ? rate : ""}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  form.setValue("ratePerKg", Number.isFinite(v) ? v : 0, {
                    shouldValidate: true,
                  });
                }}
              />
              {form.formState.errors.ratePerKg && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.ratePerKg.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="totalAmount">Total amount</Label>
              <Input
                id="totalAmount"
                readOnly
                tabIndex={-1}
                className="bg-muted/50"
                value={totalAmount > 0 ? totalAmount : ""}
                placeholder="Quantity × rate"
              />
              <p className="text-[11px] text-muted-foreground">
                {qty > 0 && rate > 0
                  ? `${qty} kg × ${formatMoney(rate)} = ${formatMoney(totalAmount)}`
                  : "Fills automatically: quantity × rate per kg"}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="purchaseDate">Purchase date</Label>
              <Input id="purchaseDate" type="date" {...form.register("purchaseDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invoiceNo">Invoice No. (optional)</Label>
              <Input
                id="invoiceNo"
                placeholder="Supplier bill no. — or leave blank"
                {...form.register("invoiceNo")}
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-3">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" {...form.register("notes")} />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-data text-sm text-muted-foreground">
                Amount due to supplier:{" "}
                <span className="text-foreground">{formatMoney(totalAmount)}</span>
                <span className="ml-2 text-xs">(pay later from Suppliers)</span>
              </p>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save purchase
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("purchases.history")}</CardTitle>
          <CardDescription>
            Search inbound scrap / daig. Balance = still owed to supplier.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
            >
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {supplierName(s)}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
            />
            <Input
              placeholder="Invoice / notes…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : purchases.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No purchases found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Qty (kg)</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Payable</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="font-data text-xs">
                      {formatDate(p.purchaseDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-data text-[10px] uppercase">
                        {p.materialType || "scrap"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {typeof p.supplier === "object" && p.supplier?._id ? (
                        <Link
                          href={`/dashboard/suppliers/${p.supplier._id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {supplierName(p.supplier)}
                        </Link>
                      ) : (
                        supplierName(p.supplier)
                      )}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatKg(p.quantityKg)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(p.ratePerKg)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(
                        p.payable ?? p.totalAmount + (p.freightAmount || 0)
                      )}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(p.balance ?? 0)}
                    </TableCell>
                    <TableCell className="font-data text-xs">
                      {p.invoiceNo || "—"}
                      {p.notes ? (
                        <Badge variant="outline" className="ml-2 font-data text-[9px]">
                          NOTE
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onDelete(p._id)}
                        aria-label="Delete purchase"
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
