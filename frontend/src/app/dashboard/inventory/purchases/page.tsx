"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BarChart3, Loader2, Trash2 } from "lucide-react";
import { InventorySubnav } from "@/components/layout/inventory-subnav";
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
  quantityKg: z.number().positive("Quantity must be greater than 0"),
  ratePerKg: z.number().positive("Rate must be greater than 0"),
  purchaseDate: z.string().min(1, "Date is required"),
  invoiceNo: z.string().optional(),
  notes: z.string().optional(),
});

type PurchaseForm = z.infer<typeof purchaseSchema>;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function InventoryPage() {
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
      quantityKg: 0,
      ratePerKg: 0,
      purchaseDate: todayInput(),
      invoiceNo: "",
      notes: "",
    },
  });

  const qty = form.watch("quantityKg");
  const rate = form.watch("ratePerKg");
  const estimatedTotal = useMemo(() => {
    const qn = Number(qty);
    const rn = Number(rate);
    if (!Number.isFinite(qn) || !Number.isFinite(rn) || qn <= 0 || rn <= 0) return 0;
    return Math.round(qn * rn * 100) / 100;
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
      await createPurchase(values);
      toast.success("Purchase recorded");
      form.reset({
        supplier: values.supplier,
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
    if (!confirm("Delete this purchase? Stock and ledger will update.")) return;
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
            Scrap · kilograms
          </p>
          <h1 className="text-nameplate text-xl">Raw material purchases</h1>
        </div>
        <Link
          href="/dashboard/inventory/reports"
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-muted"
        >
          <BarChart3 className="size-4" />
          Reports
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Available scrap",
            value: stock ? `${formatKg(stock.totalKg)} kg` : "—",
            hint: stock?.consumedKg
              ? `${formatKg(stock.purchasedKg ?? 0)} purchased − ${formatKg(stock.consumedKg)} used`
              : "after production consumption",
            accent: "bg-chart-1",
          },
          {
            label: "Total spend",
            value: stock ? formatMoney(stock.totalSpend) : "—",
            hint: "all purchases",
            accent: "bg-chart-2",
          },
          {
            label: "Purchases",
            value: stock ? String(stock.purchaseCount) : "—",
            hint: "entries recorded",
            accent: "bg-chart-3",
          },
          {
            label: "Avg rate",
            value: stock ? `${formatMoney(stock.avgRate)} / kg` : "—",
            hint: "weighted by entries",
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
          <CardTitle className="text-nameplate text-sm">Record scrap purchase</CardTitle>
          <CardDescription>
            Every kilogram entering the factory. Posts to supplier ledger automatically.
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
                    {s.name}
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
              <Label htmlFor="quantityKg">Quantity (kg)</Label>
              <Input
                id="quantityKg"
                type="number"
                step="0.001"
                {...form.register("quantityKg", { valueAsNumber: true })}
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
                {...form.register("ratePerKg", { valueAsNumber: true })}
              />
              {form.formState.errors.ratePerKg && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.ratePerKg.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="purchaseDate">Purchase date</Label>
              <Input id="purchaseDate" type="date" {...form.register("purchaseDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invoiceNo">Invoice No.</Label>
              <Input id="invoiceNo" {...form.register("invoiceNo")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" {...form.register("notes")} />
            </div>
            <div className="flex items-end gap-3 md:col-span-2 xl:col-span-3">
              <p className="font-data text-sm text-muted-foreground">
                Total: <span className="text-foreground">{formatMoney(estimatedTotal)}</span>
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
          <CardTitle className="text-nameplate text-sm">Purchase history</CardTitle>
          <CardDescription>Search and filter inbound scrap entries.</CardDescription>
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
                  {s.name}
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
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Qty (kg)</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Total</TableHead>
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
                      {formatMoney(p.totalAmount)}
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
