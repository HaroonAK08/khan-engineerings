"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  customerName,
  getBuilty,
  recordBuiltyPayment,
  type Builty,
  type BuiltySummary,
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
import { useI18n } from "@/hooks/use-i18n";
import { todayInput } from "@/lib/date-range";

export default function BuiltyDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const id = String(params.id);
  const [builty, setBuilty] = useState<Builty | null>(null);
  const [summary, setSummary] = useState<BuiltySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(todayInput());
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBuilty(id);
      setBuilty(data.builty);
      setSummary(data.summary);
      setAmount(data.summary.balance);
    } catch (err) {
      toast.error(apiError(err, t("builtyDetail.loadFailed")));
      setBuilty(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function onPayment() {
    if (!(amount > 0)) return;
    setSaving(true);
    try {
      await recordBuiltyPayment(id, { amount, paymentDate, method, notes: notes.trim() });
      toast.success(t("common.paymentRecorded"));
      setNotes("");
      await load();
    } catch (err) {
      toast.error(apiError(err, t("common.paymentFailed")));
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

  if (!builty || !summary) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">{t("builtyDetail.notFound")}</p>
        <Link href="/dashboard/builty" className="text-sm text-primary hover:underline">
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
            href="/dashboard/builty"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t("builty.title")}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-nameplate text-xl">{builty.builtyNo}</h1>
            <Badge variant="secondary" className="font-data text-[10px] uppercase">
              {summary.paymentStatus}
            </Badge>
          </div>
          <p className="font-data mt-1 text-xs text-muted-foreground">
            {formatDate(builty.builtyDate)} · {customerName(builty.customer)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-data text-[10px] text-muted-foreground uppercase">
            {t("builtyDetail.left")}
          </p>
          <p className="font-data text-2xl">{formatMoney(summary.balance)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: t("builtyDetail.totalAmount"), value: formatMoney(summary.totalAmount) },
          { label: t("builtyDetail.paid"), value: formatMoney(summary.amountPaid) },
          { label: t("builtyDetail.left"), value: formatMoney(summary.balance) },
        ].map((s) => (
          <Card key={s.label} className="py-0">
            <CardContent className="p-4">
              <p className="font-data text-[10px] text-muted-foreground uppercase">{s.label}</p>
              <p className="font-data mt-1 text-lg">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("builtyDetail.orders")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.invoice")}</TableHead>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead className="text-right">{t("common.total")}</TableHead>
                <TableHead className="text-right">{t("builty.col.given")}</TableHead>
                <TableHead className="text-right">{t("common.balance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {builty.orders.map((order) => (
                <TableRow key={order._id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/party/orders/${order._id}`}
                      className="font-data text-xs hover:text-primary hover:underline"
                    >
                      {order.invoiceNo}
                    </Link>
                  </TableCell>
                  <TableCell className="font-data text-xs">
                    {formatDate(order.orderDate)}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatMoney(order.totalAmount)}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatMoney(order.amountPaid)}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatMoney(order.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {summary.balance > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">
              {t("builtyDetail.recordPayment")}
            </CardTitle>
            <CardDescription>{t("builtyDetail.recordPaymentDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.amount")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.method")}</Label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="cash">{t("common.cash")}</option>
                  <option value="bank">{t("common.bank")}</option>
                  <option value="cheque">{t("common.cheque")}</option>
                  <option value="other">{t("common.other")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.notes")}</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <Button
              type="button"
              onClick={onPayment}
              disabled={saving || !(amount > 0)}
              className="w-fit gap-2"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t("builtyDetail.savePayment")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("builtyDetail.fullyPaid")}
        </p>
      )}
    </div>
  );
}
