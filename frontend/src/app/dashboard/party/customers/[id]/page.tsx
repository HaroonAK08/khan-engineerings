"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  builtyNo,
  getCustomer,
  listOrders,
  type Customer,
  type SalesOrder,
} from "@/lib/sales-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";

export default function CustomerDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [balance, setBalance] = useState(0);
  const [stats, setStats] = useState({ orderCount: 0, totalSales: 0, totalPaid: 0 });
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, ords] = await Promise.all([
        getCustomer(id),
        listOrders({ customer: id }),
      ]);
      setCustomer(detail.customer);
      setBalance(detail.balance);
      setStats(detail.stats);
      setOrders(ords);
    } catch (err) {
      toast.error(apiError(err, t("customerDetail.loadFailed")));
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

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
        <p className="text-sm text-muted-foreground">{t("customerDetail.notFound")}</p>
        <Link href="/dashboard/party" className="text-sm text-primary hover:underline">
          {t("common.back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/party"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t("cus.title")}
          </Link>
          <h1 className="text-nameplate text-xl">{customer.name}</h1>
          <p className="font-data mt-1 text-xs text-muted-foreground">
            {[customer.phone].filter(Boolean).join(" · ") ||
              t("customerDetail.noContact")}
          </p>
        </div>
        <Link
          href={`/dashboard/party/orders/new?customer=${id}`}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-base text-primary-foreground"
        >
          <Plus className="size-4" />
          {t("customerDetail.newOrder")}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: t("customerDetail.paymentPending"), value: formatMoney(balance) },
          { label: t("customerDetail.totalPayment"), value: formatMoney(stats.totalSales) },
          { label: t("customerDetail.paid"), value: formatMoney(stats.totalPaid) },
        ].map((s) => (
          <Card key={s.label} className="py-0">
            <CardContent className="p-4">
              <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                {s.label}
              </p>
              <p className="font-data mt-1 text-xl">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-nameplate text-sm">
            {t("customerDetail.orderHistory")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("customerDetail.noOrders")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("orders.col.date")}</TableHead>
                  <TableHead className="text-right">{t("orders.col.total")}</TableHead>
                  <TableHead className="text-right">{t("customerDetail.paid")}</TableHead>
                  <TableHead className="text-right">{t("orders.col.balance")}</TableHead>
                  <TableHead>{t("orders.col.payment")}</TableHead>
                  <TableHead>{t("orderDetail.builty")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow
                    key={o._id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/party/orders/${o._id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/dashboard/party/orders/${o._id}`);
                      }
                    }}
                  >
                    <TableCell className="font-data text-sm">{formatDate(o.orderDate)}</TableCell>
                    <TableCell className="font-data text-right text-sm">
                      {formatMoney(o.totalAmount)}
                    </TableCell>
                    <TableCell className="font-data text-right text-sm">
                      {formatMoney(o.amountPaid)}
                    </TableCell>
                    <TableCell className="font-data text-right text-sm">
                      {formatMoney(o.balance)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-data uppercase">
                        {o.paymentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-data text-sm">
                      {builtyNo(o.builty) || "—"}
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
