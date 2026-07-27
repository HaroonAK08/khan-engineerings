"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  apiError,
  formatMoney,
  getLedger,
  getSupplier,
  recordAdjustment,
  recordPayment,
} from "@/lib/materials-api";
import type { LedgerEntry, Supplier } from "@/types/materials";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SupplierHistoryCalendar } from "@/components/suppliers/supplier-history-calendar";
import { useI18n } from "@/hooks/use-i18n";
import { todayInput } from "@/lib/date-range";

type HistoryKind = "purchase" | "payment";

function isInternalNote(notes: string) {
  return /^sup-[a-z0-9-]+$/i.test(notes.trim());
}

export default function SupplierDetailPage() {
  const { t, isUrdu } = useI18n();
  const params = useParams();
  const id = String(params.id);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [balance, setBalance] = useState(0);
  const [stats, setStats] = useState({
    purchaseCount: 0,
    totalPurchases: 0,
    totalPaid: 0,
    totalDue: 0,
  });
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyKind, setHistoryKind] = useState<HistoryKind>("purchase");

  const [showPendingForm, setShowPendingForm] = useState(false);
  const [pendingAmount, setPendingAmount] = useState("");
  const [pendingDate, setPendingDate] = useState(todayInput());
  const [pendingNotes, setPendingNotes] = useState("");
  const [savingPending, setSavingPending] = useState(false);

  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayInput());
  const [payNotes, setPayNotes] = useState("");
  const [savingPay, setSavingPay] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const [detail, ledger] = await Promise.all([getSupplier(id), getLedger(id)]);
        setSupplier(detail.supplier);
        setEntries(ledger.entries);
        setBalance(detail.balance ?? ledger.balance);
        setStats({
          purchaseCount: detail.stats?.purchaseCount || 0,
          totalPurchases: detail.stats?.totalPurchases || 0,
          totalPaid: detail.stats?.totalPaid || 0,
          totalDue:
            detail.stats?.totalDue ??
            (detail.previousPending || 0) + (detail.stats?.totalPurchases || 0),
        });
      } catch (err) {
        toast.error(apiError(err, t("supplierDetail.loadFailed")));
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [id, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function onAddPreviousPending() {
    const amount = Number(pendingAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("supplierDetail.enterAmount"));
      return;
    }
    if (!pendingDate) {
      toast.error(t("supplierDetail.pickDate"));
      return;
    }
    setSavingPending(true);
    try {
      await recordAdjustment(id, {
        amount,
        entryDate: pendingDate,
        notes: pendingNotes.trim() || "Previous pending",
      });
      toast.success(t("supplierDetail.previousPendingRecorded"));
      setPendingAmount("");
      setPendingNotes("");
      setPendingDate(todayInput());
      setShowPendingForm(false);
      await load({ silent: true });
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.previousPendingFailed")));
    } finally {
      setSavingPending(false);
    }
  }

  async function onPay() {
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("supplierDetail.enterAmount"));
      return;
    }
    if (!payDate) {
      toast.error(t("supplierDetail.pickDate"));
      return;
    }
    setSavingPay(true);
    try {
      await recordPayment(id, {
        amount,
        entryDate: payDate,
        notes: payNotes.trim() || undefined,
      });
      toast.success(t("supplierDetail.paymentRecorded"));
      setPayAmount("");
      setPayNotes("");
      setPayDate(todayInput());
      setShowPay(false);
      await load({ silent: true });
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.paymentFailed")));
    } finally {
      setSavingPay(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">{t("supplierDetail.notFound")}</p>
        <Link
          href="/dashboard/suppliers"
          className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted"
        >
          {t("supplierDetail.backToSuppliers")}
        </Link>
      </div>
    );
  }

  const displayName =
    isUrdu && supplier.nameUr?.trim() ? supplier.nameUr.trim() : supplier.name;
  const publicNotes =
    supplier.notes && !isInternalNote(supplier.notes) ? supplier.notes : "";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link
          href="/dashboard/suppliers"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {t("supplierDetail.backToSuppliers")}
        </Link>
        <h1
          className="text-nameplate text-xl"
          dir={isUrdu && supplier.nameUr?.trim() ? "rtl" : undefined}
        >
          {displayName}
        </h1>
        {supplier.phone ? (
          <p className="font-data mt-1 text-sm text-muted-foreground">{supplier.phone}</p>
        ) : null}
        {publicNotes ? (
          <p className="mt-1 text-sm text-muted-foreground">{publicNotes}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: t("supplierDetail.totalDue"), value: formatMoney(stats.totalDue) },
          { label: t("supplierDetail.paid"), value: formatMoney(stats.totalPaid) },
          { label: t("supplierDetail.paymentLeft"), value: formatMoney(balance) },
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
              {t("supplierDetail.previousPending")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("supplierDetail.previousPendingDesc")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setShowPendingForm((v) => !v);
              setShowPay(false);
            }}
          >
            {showPendingForm ? t("common.cancel") : t("supplierDetail.addPreviousPending")}
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
                  min={0}
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
              {t("supplierDetail.recordPayment")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("supplierDetail.recordPaymentDesc")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={balance <= 0 && !showPay}
            onClick={() => {
              setShowPay((v) => !v);
              setShowPendingForm(false);
              if (!showPay) setPayAmount(balance > 0 ? String(balance) : "");
            }}
          >
            {showPay ? t("common.cancel") : t("supplierDetail.addPayment")}
          </Button>
        </CardHeader>
        {showPay ? (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.amount")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.notes")}</Label>
                <Input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
              </div>
            </div>
            <Button
              type="button"
              className="mt-3 gap-2"
              disabled={savingPay}
              onClick={() => void onPay()}
            >
              {savingPay ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("supplierDetail.submitPayment")}
            </Button>
          </CardContent>
        ) : null}
      </Card>

      <div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={historyKind === "purchase" ? "default" : "outline"}
            onClick={() => setHistoryKind("purchase")}
          >
            {t("supplierDetail.purchaseHistory")}
          </Button>
          <Button
            type="button"
            variant={historyKind === "payment" ? "default" : "outline"}
            onClick={() => setHistoryKind("payment")}
          >
            {t("supplierDetail.paymentHistory")}
          </Button>
        </div>

        <SupplierHistoryCalendar
          supplierId={id}
          kind={historyKind}
          entries={entries}
          onChanged={() => load({ silent: true })}
        />
      </div>
    </div>
  );
}
