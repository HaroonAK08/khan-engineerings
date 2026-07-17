"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import { customerName, listOrders, type SalesOrder } from "@/lib/sales-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function OrdersPage() {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { q?: string; paymentStatus?: string } = {};
      if (q.trim()) params.q = q.trim();
      if (paymentStatus) params.paymentStatus = paymentStatus;
      setOrders(await listOrders(params));
    } catch (err) {
      toast.error(apiError(err, "Failed to load orders"));
    } finally {
      setLoading(false);
    }
  }, [q, paymentStatus]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            Sales orders · invoices
          </p>
          <h1 className="text-nameplate text-xl">Orders</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/orders/reports"
            className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted"
          >
            Reports
          </Link>
          <Link
            href="/dashboard/orders/new"
            className="inline-flex h-8 items-center gap-2 rounded-lg bg-primary px-3 text-sm text-primary-foreground"
          >
            <Plus className="size-4" />
            New order
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              placeholder="Search order / invoice no…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
            >
              <option value="">All payment statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : orders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No orders yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order / Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Dispatch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o._id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/orders/${o._id}`}
                        className="font-data text-xs hover:text-primary hover:underline"
                      >
                        {o.orderNo}
                      </Link>
                      <div className="font-data text-[10px] text-muted-foreground">
                        {o.invoiceNo}
                      </div>
                    </TableCell>
                    <TableCell>{customerName(o.customer)}</TableCell>
                    <TableCell className="font-data text-xs">{formatDate(o.orderDate)}</TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(o.totalAmount)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(o.balance)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-data text-[9px] uppercase">
                        {o.paymentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-data text-[9px] uppercase">
                        {o.dispatchStatus}
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
