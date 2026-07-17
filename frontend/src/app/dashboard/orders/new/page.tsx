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

type Line = { product: string; quantity: number; unitPrice: number };

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewOrderPage() {
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
      toast.error(apiError(err, "Failed to load form data"));
    } finally {
      setLoading(false);
    }
  }, []);

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
      toast.error("Select a customer");
      return;
    }
    const items = lines.filter((l) => l.product && l.quantity > 0);
    if (items.length === 0) {
      toast.error("Add at least one line item");
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
      toast.success("Order created");
      router.push(`/dashboard/orders/${order._id}`);
    } catch (err) {
      toast.error(apiError(err, "Failed to create order"));
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
          Orders
        </Link>
        <h1 className="text-nameplate text-xl">New sales order</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Order details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Customer</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                required
              >
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Order date</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Line items</CardTitle>
            <CardDescription>Products sold on this invoice.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm sm:col-span-5 dark:bg-input/30"
                  value={line.product}
                  onChange={(e) => updateLine(index, { product: e.target.value })}
                >
                  <option value="">Product…</option>
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
                  placeholder="Qty"
                />
                <Input
                  type="number"
                  step="0.01"
                  className="sm:col-span-3"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })}
                  placeholder="Unit price"
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
              Add line
            </Button>
            <p className="font-data text-right text-sm">
              Total: <span className="text-lg">{formatMoney(total)}</span>
            </p>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving} className="w-fit gap-2">
          {saving && <Loader2 className="size-4 animate-spin" />}
          Create order & invoice
        </Button>
      </form>
    </div>
  );
}
