"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { apiError, formatMoney } from "@/lib/materials-api";
import { listProducts } from "@/lib/production-api";
import { createOrder, listCustomers, type Customer } from "@/lib/sales-api";
import type { Product } from "@/types/production";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";

type Line = { product: string; quantity: number; unitPrice: number };

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewOrderPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customer, setCustomer] = useState("");
  const [orderDate, setOrderDate] = useState(todayInput());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product: "", quantity: 1, unitPrice: 0 }]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        listCustomers({ active: "true" }),
        listProducts({ active: "true" }),
      ]);
      setCustomers(c);
      setProducts(p);
      if (typeof window !== "undefined") {
        const preset = new URLSearchParams(window.location.search).get("customer");
        if (preset) setCustomer(preset);
      }
    } catch (err) {
      toast.error(apiError(err, t("orderNew.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(
    () =>
      Math.round(
        lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0) * 100
      ) / 100,
    [lines]
  );

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) {
      toast.error(t("orderNew.selectCustomerErr"));
      return;
    }
    const items = lines.filter((l) => l.product && l.quantity > 0);
    if (items.length === 0) {
      toast.error(t("orderNew.addLineErr"));
      return;
    }
    setSaving(true);
    try {
      const order = await createOrder({
        customer,
        orderDate,
        dueDate: dueDate || undefined,
        notes,
        items,
      });
      toast.success(t("orderNew.created"));
      router.push(`/dashboard/orders/${order._id}`);
    } catch (err) {
      toast.error(apiError(err, t("orderNew.createFailed")));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/dashboard/orders"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {t("orders.title")}
        </Link>
        <h1 className="text-nameplate text-xl">{t("orderNew.title")}</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("orderNew.orderDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>{t("common.customer")}</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                required
              >
                <option value="">{t("orderNew.selectCustomer")}</option>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("orderNew.orderDate")}</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("orderNew.dueDate")}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>{t("common.notes")}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("orderNew.lineItems")}</CardTitle>
            <CardDescription>{t("orderNew.lineItemsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm sm:col-span-5 dark:bg-input/30"
                  value={line.product}
                  onChange={(e) => updateLine(index, { product: e.target.value })}
                >
                  <option value="">{t("orderNew.productPh")}</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  step="1"
                  className="sm:col-span-2"
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                  placeholder={t("orderNew.qtyPh")}
                />
                <Input
                  type="number"
                  step="0.01"
                  className="sm:col-span-3"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })}
                  placeholder={t("orderNew.unitPricePh")}
                />
                <div className="flex items-center justify-between gap-2 sm:col-span-2">
                  <span className="font-data text-xs">{formatMoney(line.quantity * line.unitPrice)}</span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                    disabled={lines.length === 1}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-fit gap-2"
              onClick={() => setLines((prev) => [...prev, { product: "", quantity: 1, unitPrice: 0 }])}
            >
              <Plus className="size-4" />
              {t("orderNew.addLine")}
            </Button>
            <p className="font-data text-right text-sm">
              {t("orderNew.total")} <span className="text-lg">{formatMoney(total)}</span>
            </p>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving} className="w-fit gap-2">
          {saving && <Loader2 className="size-4 animate-spin" />}
          {t("orderNew.createBtn")}
        </Button>
      </form>
    </div>
  );
}
