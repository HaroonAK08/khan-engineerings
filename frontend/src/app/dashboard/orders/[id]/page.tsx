"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import { listWarehouses, type CatalogItem } from "@/lib/inventory-api";
import {
  cancelOrder,
  createDispatch,
  customerName,
  getOrder,
  listDispatches,
  listPayments,
  productName,
  recordOrderPayment,
  type CustomerPayment,
  type Dispatch,
  type SalesOrder,
} from "@/lib/sales-api";
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

const paymentSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  paymentDate: z.string().min(1),
  method: z.string(),
  notes: z.string().optional(),
});

type PaymentForm = z.infer<typeof paymentSchema>;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [warehouses, setWarehouses] = useState<CatalogItem[]>([]);
  const [dispatchQty, setDispatchQty] = useState<Record<string, number>>({});
  const [warehouse, setWarehouse] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingPay, setSavingPay] = useState(false);
  const [savingDispatch, setSavingDispatch] = useState(false);

  const payForm = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: 0, paymentDate: todayInput(), method: "cash", notes: "" },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, pays, dsps, wh] = await Promise.all([
        getOrder(id),
        listPayments({ order: id }),
        listDispatches({ order: id }),
        listWarehouses(),
      ]);
      setOrder(o);
      setPayments(pays);
      setDispatches(dsps);
      setWarehouses(wh);
      const qty: Record<string, number> = {};
      for (const item of o.items) {
        const key = item._id || (typeof item.product === "object" ? item.product._id : item.product);
        const remaining = item.quantity - (item.dispatchedQty || 0);
        qty[String(key)] = remaining > 0 ? remaining : 0;
      }
      setDispatchQty(qty);
      if (o.balance > 0) {
        payForm.reset({
          amount: o.balance,
          paymentDate: todayInput(),
          method: "cash",
          notes: "",
        });
      }
    } catch (err) {
      toast.error(apiError(err, "Failed to load order"));
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id, payForm]);

  useEffect(() => {
    load();
  }, [load]);

  async function onPayment(values: PaymentForm) {
    setSavingPay(true);
    try {
      await recordOrderPayment(id, values);
      toast.success("Payment recorded");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to record payment"));
    } finally {
      setSavingPay(false);
    }
  }

  async function onDispatch() {
    if (!order) return;
    const items = order.items
      .map((item) => {
        const key = String(
          item._id || (typeof item.product === "object" ? item.product._id : item.product)
        );
        const qty = Number(dispatchQty[key] || 0);
        return {
          itemId: item._id,
          product: typeof item.product === "object" ? item.product._id : item.product,
          quantity: qty,
        };
      })
      .filter((i) => i.quantity > 0);

    if (items.length === 0) {
      toast.error("Enter dispatch quantities");
      return;
    }

    setSavingDispatch(true);
    try {
      await createDispatch(id, {
        items,
        warehouse: warehouse || undefined,
        dispatchDate: todayInput(),
      });
      toast.success("Dispatch recorded — stock updated");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to dispatch"));
    } finally {
      setSavingDispatch(false);
    }
  }

  async function onCancel() {
    if (!confirm("Cancel this order? Only allowed with no payments/dispatches.")) return;
    try {
      await cancelOrder(id);
      toast.success("Order cancelled");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to cancel"));
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">Order not found</p>
        <Link href="/dashboard/orders" className="text-sm text-primary hover:underline">
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/orders"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Orders
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-nameplate text-xl">{order.invoiceNo}</h1>
            <Badge variant="secondary" className="font-data text-[10px] uppercase">
              {order.paymentStatus}
            </Badge>
            <Badge variant="outline" className="font-data text-[10px] uppercase">
              {order.dispatchStatus}
            </Badge>
          </div>
          <p className="font-data mt-1 text-xs text-muted-foreground">
            {order.orderNo} · {formatDate(order.orderDate)} · {customerName(order.customer)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-data text-[10px] text-muted-foreground uppercase">Balance</p>
          <p className="font-data text-2xl">{formatMoney(order.balance)}</p>
          <p className="font-data text-xs text-muted-foreground">
            Paid {formatMoney(order.amountPaid)} / {formatMoney(order.totalAmount)}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">Invoice lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Dispatched</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item, i) => (
                <TableRow key={item._id || i}>
                  <TableCell>{productName(item.product)}</TableCell>
                  <TableCell className="font-data text-right text-xs">{item.quantity}</TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {item.dispatchedQty || 0}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatMoney(item.unitPrice)}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatMoney(item.lineTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {order.balance > 0 && order.status !== "cancelled" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Record payment</CardTitle>
              <CardDescription>Partial payments allowed.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={payForm.handleSubmit(onPayment)}
                className="flex flex-col gap-3"
              >
                <div className="flex flex-col gap-1.5">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    {...payForm.register("amount", { valueAsNumber: true })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Date</Label>
                  <Input type="date" {...payForm.register("paymentDate")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Method</Label>
                  <select
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                    {...payForm.register("method")}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Notes</Label>
                  <Input {...payForm.register("notes")} />
                </div>
                <Button type="submit" disabled={savingPay} className="w-fit gap-2">
                  {savingPay && <Loader2 className="size-4 animate-spin" />}
                  Save payment
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {order.dispatchStatus !== "dispatched" && order.status !== "cancelled" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Dispatch</CardTitle>
              <CardDescription>Ship goods and reduce finished stock.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Warehouse</Label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                >
                  <option value="">Default</option>
                  {warehouses.map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              {order.items.map((item) => {
                const key = String(
                  item._id ||
                    (typeof item.product === "object" ? item.product._id : item.product)
                );
                const remaining = item.quantity - (item.dispatchedQty || 0);
                if (remaining <= 0) return null;
                return (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="text-sm">
                      {productName(item.product)}{" "}
                      <span className="font-data text-xs text-muted-foreground">
                        (left {remaining})
                      </span>
                    </span>
                    <Input
                      type="number"
                      className="w-24"
                      value={dispatchQty[key] ?? 0}
                      onChange={(e) =>
                        setDispatchQty((prev) => ({
                          ...prev,
                          [key]: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                );
              })}
              <Button
                type="button"
                onClick={onDispatch}
                disabled={savingDispatch}
                className="w-fit gap-2"
              >
                {savingDispatch && <Loader2 className="size-4 animate-spin" />}
                Record dispatch
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Payment history</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No payments</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell className="font-data text-xs">
                        {formatDate(p.paymentDate)}
                      </TableCell>
                      <TableCell className="text-sm uppercase">{p.method}</TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatMoney(p.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Dispatch records</CardTitle>
          </CardHeader>
          <CardContent>
            {dispatches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No dispatches</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispatches.map((d) => (
                    <TableRow key={d._id}>
                      <TableCell className="font-data text-xs">{d.dispatchNo}</TableCell>
                      <TableCell className="font-data text-xs">
                        {formatDate(d.dispatchDate)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {d.items
                          .map(
                            (i) =>
                              `${typeof i.product === "object" ? i.product.name : "Item"}×${i.quantity}`
                          )
                          .join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {order.status !== "cancelled" &&
        order.amountPaid === 0 &&
        order.dispatchStatus === "pending" && (
          <Button variant="destructive" className="w-fit" onClick={onCancel}>
            Cancel order
          </Button>
        )}
    </div>
  );
}
