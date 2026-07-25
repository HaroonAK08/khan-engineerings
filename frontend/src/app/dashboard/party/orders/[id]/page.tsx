"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  cancelOrder,
  customerName,
  getOrder,
  listPayments,
  productName,
  salesmanName,
  type CustomerPayment,
  type SalesOrder,
} from "@/lib/sales-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export default function OrderDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, pays] = await Promise.all([getOrder(id), listPayments({ order: id })]);
      setOrder(o);
      setPayments(pays);
    } catch (err) {
      toast.error(apiError(err, t("orderDetail.loadFailed")));
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function onCancel() {
    if (!confirm(t("orderDetail.confirmCancel"))) return;
    try {
      await cancelOrder(id);
      toast.success(t("orderDetail.cancelled"));
      router.push("/dashboard/party?tab=orders");
    } catch (err) {
      toast.error(apiError(err, t("orderDetail.cancelFailed")));
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
        <p className="text-sm text-muted-foreground">{t("orderDetail.notFound")}</p>
        <Link href="/dashboard/party?tab=orders" className="text-sm text-primary hover:underline">
          {t("common.back")}
        </Link>
      </div>
    );
  }

  const builtyRef = order.builty && typeof order.builty === "object" ? order.builty : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/party?tab=orders"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t("orders.title")}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-nameplate text-xl">{order.invoiceNo}</h1>
            <Badge variant="secondary" className="font-data text-[10px] uppercase">
              {order.paymentStatus}
            </Badge>
          </div>
          <p className="font-data mt-1 text-xs text-muted-foreground">
            {order.orderNo} · {formatDate(order.orderDate)} · {customerName(order.customer)}
          </p>
          {salesmanName(order) && (
            <p className="font-data mt-1 text-xs text-muted-foreground">
              {t("orderDetail.salesman")}: {salesmanName(order)}
              {(order.commissionAmount || 0) > 0 && (
                <>
                  {" · "}
                  {t("orderDetail.commission")}: {formatMoney(order.commissionAmount || 0)}
                  {order.commissionType === "percent" && order.commissionValue != null
                    ? ` (${t("orderDetail.commissionOf", { value: String(order.commissionValue) })})`
                    : ""}
                </>
              )}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-data text-[10px] text-muted-foreground uppercase">
            {t("common.balance")}
          </p>
          <p className="font-data text-2xl">{formatMoney(order.balance)}</p>
          <p className="font-data text-xs text-muted-foreground">
            {t("orderDetail.paid", {
              paid: formatMoney(order.amountPaid),
              total: formatMoney(order.totalAmount),
            })}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("orderDetail.invoiceLines")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.product")}</TableHead>
                <TableHead className="text-right">{t("common.qty")}</TableHead>
                <TableHead className="text-right">{t("orderDetail.ratePerKg")}</TableHead>
                <TableHead className="text-right">{t("orderDetail.price")}</TableHead>
                <TableHead className="text-right">{t("common.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item, i) => (
                <TableRow key={item._id || i}>
                  <TableCell>{productName(item.product)}</TableCell>
                  <TableCell className="font-data text-right text-xs">{item.quantity}</TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatMoney(item.ratePerKg)}
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

      {order.status !== "cancelled" && builtyRef ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("orderDetail.builty")}:{" "}
          <Link
            href={`/dashboard/builty/${builtyRef._id}`}
            className="font-data text-foreground hover:text-primary hover:underline"
          >
            {builtyRef.builtyNo}
          </Link>
        </p>
      ) : null}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">
              {t("customerDetail.paymentHistory")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("orderDetail.noPayments")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("common.method")}</TableHead>
                    <TableHead className="text-right">{t("common.amount")}</TableHead>
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
      </div>

      {order.status !== "cancelled" && order.amountPaid === 0 && !builtyRef && (
        <Button variant="destructive" className="w-fit gap-2" onClick={onCancel}>
          <Trash2 className="size-4" />
          {t("orderDetail.cancelOrder")}
        </Button>
      )}
    </div>
  );
}
