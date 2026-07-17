"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  getCustomer,
  getCustomerLedger,
  listOrders,
  listPayments,
  type Customer,
  type CustomerLedgerEntry,
  type CustomerPayment,
  type SalesOrder,
} from "@/lib/sales-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function ledgerDelta(e: CustomerLedgerEntry) {
  if (e.type === "invoice") return e.amount;
  if (e.type === "payment") return -e.amount;
  return e.signedAmount ?? 0;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [balance, setBalance] = useState(0);
  const [stats, setStats] = useState({ orderCount: 0, totalSales: 0, totalPaid: 0 });
  const [entries, setEntries] = useState<CustomerLedgerEntry[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, ledger, ords, pays] = await Promise.all([
        getCustomer(id),
        getCustomerLedger(id),
        listOrders({ customer: id }),
        listPayments({ customer: id }),
      ]);
      setCustomer(detail.customer);
      setBalance(detail.balance);
      setStats(detail.stats);
      setEntries(ledger.entries);
      setOrders(ords);
      setPayments(pays);
    } catch (err) {
      toast.error(apiError(err, "Failed to load customer"));
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">Customer not found</p>
        <Link href="/dashboard/customers" className="text-sm text-primary hover:underline">
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
            href="/dashboard/customers"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Customers
          </Link>
          <h1 className="text-nameplate text-xl">{customer.name}</h1>
          <p className="font-data mt-1 text-xs text-muted-foreground">
            {[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact"}
          </p>
        </div>
        <Card className="min-w-[200px] py-0">
          <CardContent className="p-4">
            <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
              Balance owed
            </p>
            <p className="font-data mt-1 text-2xl">{formatMoney(balance)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Orders", value: String(stats.orderCount) },
          { label: "Total sales", value: formatMoney(stats.totalSales) },
          { label: "Total paid", value: formatMoney(stats.totalPaid) },
        ].map((s) => (
          <Card key={s.label} className="py-0">
            <CardContent className="p-4">
              <p className="font-data text-[10px] text-muted-foreground uppercase">{s.label}</p>
              <p className="font-data mt-1 text-lg">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Link
          href={`/dashboard/orders/new?customer=${id}`}
          className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm text-primary-foreground"
        >
          New order
        </Link>
        <Link
          href="/dashboard/orders"
          className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted"
        >
          All orders
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">Customer ledger</CardTitle>
          <CardDescription>Invoices and payments.</CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No ledger entries</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => {
                  const delta = ledgerDelta(e);
                  return (
                    <TableRow key={e._id}>
                      <TableCell className="font-data text-xs">{formatDate(e.entryDate)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-data text-[10px] uppercase">
                          {e.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {e.notes || e.order?.invoiceNo || "—"}
                      </TableCell>
                      <TableCell
                        className={`font-data text-right text-xs ${
                          delta < 0 ? "text-chart-3" : ""
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {formatMoney(delta)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Invoices / orders</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No orders</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Pay</TableHead>
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
                          {o.invoiceNo}
                        </Link>
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatMoney(o.balance)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-data text-[9px] uppercase">
                          {o.paymentStatus}
                        </Badge>
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
                    <TableHead>Invoice</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell className="font-data text-xs">
                        {formatDate(p.paymentDate)}
                      </TableCell>
                      <TableCell className="font-data text-xs">
                        {typeof p.order === "object" ? p.order.invoiceNo : "—"}
                      </TableCell>
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
      </div>
    </div>
  );
}
