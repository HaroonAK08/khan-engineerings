"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  getCustomer,
  listBuilties,
  paymentStatusLabel,
  recordCustomerAdjustment,
  recordCustomerPayment,
  type BuiltyRow,
  type Customer,
} from "@/lib/sales-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function CustomerDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [balance, setBalance] = useState(0);
  const [stats, setStats] = useState({
    orderCount: 0,
    totalSales: 0,
    totalPaid: 0,
    totalDue: 0,
  });
  const [builties, setBuilties] = useState<BuiltyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showPendingForm, setShowPendingForm] = useState(false);
  const [pendingAmount, setPendingAmount] = useState("");
  const [pendingDate, setPendingDate] = useState(todayInput());
  const [pendingNotes, setPendingNotes] = useState("");
  const [savingPending, setSavingPending] = useState(false);

  const [showPaidForm, setShowPaidForm] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [paidDate, setPaidDate] = useState(todayInput());
  const [paidMethod, setPaidMethod] = useState("cash");
  const [paidNotes, setPaidNotes] = useState("");
  const [savingPaid, setSavingPaid] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, rows] = await Promise.all([
        getCustomer(id),
        listBuilties({ customer: id }),
      ]);
      setCustomer(detail.customer);
      setBalance(detail.balance);
      setStats({
        orderCount: detail.stats.orderCount || 0,
        totalSales: detail.stats.totalSales || 0,
        totalPaid: detail.stats.totalPaid || 0,
        totalDue:
          detail.stats.totalDue ??
          (detail.previousPending || 0) + (detail.stats.totalSales || 0),
      });
      setBuilties(rows);
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

  async function onAddPreviousPending() {
    const amount = Number(pendingAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error(t("common.amount"));
      return;
    }
    if (!pendingDate) {
      toast.error(t("common.date"));
      return;
    }
    setSavingPending(true);
    try {
      await recordCustomerAdjustment(id, {
        amount,
        entryDate: pendingDate,
        notes: pendingNotes.trim() || undefined,
      });
      toast.success(t("customerDetail.previousPendingRecorded"));
      setPendingAmount("");
      setPendingNotes("");
      setPendingDate(todayInput());
      setShowPendingForm(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("customerDetail.previousPendingFailed")));
    } finally {
      setSavingPending(false);
    }
  }

  async function onAddPayment() {
    const amount = Number(paidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("common.amount"));
      return;
    }
    if (!paidDate) {
      toast.error(t("common.date"));
      return;
    }
    setSavingPaid(true);
    try {
      await recordCustomerPayment(id, {
        amount,
        paymentDate: paidDate,
        method: paidMethod,
        notes: paidNotes.trim() || undefined,
      });
      toast.success(t("customerDetail.paymentRecorded"));
      setPaidAmount("");
      setPaidNotes("");
      setPaidDate(todayInput());
      setPaidMethod("cash");
      setShowPaidForm(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("customerDetail.paymentFailed")));
    } finally {
      setSavingPaid(false);
    }
  }

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
            {t("party.title")}
          </Link>
          <h1 className="text-nameplate text-xl">{customer.name}</h1>
          <p className="font-data mt-1 text-xs text-muted-foreground">
            {[customer.phone].filter(Boolean).join(" · ") || t("customerDetail.noContact")}
          </p>
        </div>
        <Link
          href={`/dashboard/builty/new?customer=${id}`}
          className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-lg bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm"
        >
          <Plus className="size-5" />
          {t("builtyNew.title")}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: t("customerDetail.totalDue"), value: formatMoney(stats.totalDue) },
          { label: t("customerDetail.paid"), value: formatMoney(stats.totalPaid) },
          { label: t("customerDetail.paymentPending"), value: formatMoney(balance) },
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
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-nameplate text-sm">
              {t("customerDetail.previousPending")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("customerDetail.previousPendingDesc")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setShowPendingForm((v) => !v);
              setShowPaidForm(false);
            }}
          >
            {showPendingForm ? t("common.cancel") : t("customerDetail.addPreviousPending")}
          </Button>
        </CardHeader>
        {showPendingForm ? (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.amount")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={pendingAmount}
                  onChange={(e) => setPendingAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={pendingDate}
                  onChange={(e) => setPendingDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.notes")}</Label>
                <Input
                  value={pendingNotes}
                  onChange={(e) => setPendingNotes(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              className="mt-3 gap-2"
              disabled={savingPending}
              onClick={() => void onAddPreviousPending()}
            >
              {savingPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("common.save")}
            </Button>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-nameplate text-sm">
              {t("customerDetail.recordPayment")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("customerDetail.recordPaymentDesc")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setShowPaidForm((v) => !v);
              setShowPendingForm(false);
            }}
          >
            {showPaidForm ? t("common.cancel") : t("customerDetail.addPayment")}
          </Button>
        </CardHeader>
        {showPaidForm ? (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.amount")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.method")}</Label>
                <select
                  className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  value={paidMethod}
                  onChange={(e) => setPaidMethod(e.target.value)}
                >
                  <option value="cash">{t("common.cash")}</option>
                  <option value="cheque">{t("common.cheque")}</option>
                  <option value="online">{t("common.online")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.notes")}</Label>
                <Input value={paidNotes} onChange={(e) => setPaidNotes(e.target.value)} />
              </div>
            </div>
            <Button
              type="button"
              className="mt-3 gap-2"
              disabled={savingPaid}
              onClick={() => void onAddPayment()}
            >
              {savingPaid ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("common.save")}
            </Button>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-nameplate text-sm">{t("customerDetail.builtyHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {builties.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("customerDetail.noBuilties")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("orders.col.date")}</TableHead>
                  <TableHead>{t("builty.col.no")}</TableHead>
                  <TableHead className="text-right">{t("orders.col.total")}</TableHead>
                  <TableHead>{t("orders.col.payment")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {builties.map((b) => (
                  <TableRow
                    key={b._id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/builty/${b._id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/dashboard/builty/${b._id}`);
                      }
                    }}
                  >
                    <TableCell className="font-data text-sm">{formatDate(b.builtyDate)}</TableCell>
                    <TableCell className="font-data text-sm">{b.builtyNo}</TableCell>
                    <TableCell className="font-data text-right text-sm">
                      {formatMoney(b.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-data">
                        {paymentStatusLabel(b.paymentStatus, t)}
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
