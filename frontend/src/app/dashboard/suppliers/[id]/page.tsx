"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  apiError,
  formatDate,
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
import { useI18n } from "@/hooks/use-i18n";

const paymentSchema = z.object({
  amount: z.number().positive("Enter amount"),
  entryDate: z.string().min(1, "Pick a date"),
  notes: z.string().optional(),
});

const fixSchema = z.object({
  amount: z.number().refine((n) => Number.isFinite(n) && n !== 0, "Enter amount"),
  entryDate: z.string().min(1, "Pick a date"),
  notes: z.string().optional(),
});

type PaymentForm = z.infer<typeof paymentSchema>;
type FixForm = z.infer<typeof fixSchema>;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function entryDelta(entry: LedgerEntry) {
  if (entry.type === "purchase") return entry.amount;
  if (entry.type === "payment") return -entry.amount;
  return entry.signedAmount ?? 0;
}

function isInternalNote(notes: string) {
  return /^sup-[a-z0-9-]+$/i.test(notes.trim());
}

export default function SupplierDetailPage() {
  const { t, isUrdu } = useI18n();
  const params = useParams();
  const id = String(params.id);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingFix, setSavingFix] = useState(false);
  const [showFix, setShowFix] = useState(false);

  const paymentForm = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: undefined as unknown as number, entryDate: todayInput(), notes: "" },
  });

  const fixForm = useForm<FixForm>({
    resolver: zodResolver(fixSchema),
    defaultValues: { amount: undefined as unknown as number, entryDate: todayInput(), notes: "" },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, ledger] = await Promise.all([getSupplier(id), getLedger(id)]);
      setSupplier(detail.supplier);
      setEntries(ledger.entries);
      setBalance(ledger.balance);
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function onPayment(values: PaymentForm) {
    setSavingPayment(true);
    try {
      const result = await recordPayment(id, values);
      setBalance(result.balance);
      toast.success(t("supplierDetail.paymentRecorded"));
      paymentForm.reset({ amount: undefined as unknown as number, entryDate: todayInput(), notes: "" });
      await load();
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.paymentFailed")));
    } finally {
      setSavingPayment(false);
    }
  }

  async function onFix(values: FixForm) {
    setSavingFix(true);
    try {
      const result = await recordAdjustment(id, values);
      setBalance(result.balance);
      toast.success(t("supplierDetail.adjustmentRecorded"));
      fixForm.reset({ amount: undefined as unknown as number, entryDate: todayInput(), notes: "" });
      setShowFix(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.adjustmentFailed")));
    } finally {
      setSavingFix(false);
    }
  }

  function typeLabel(type: LedgerEntry["type"]) {
    if (type === "purchase") return t("supplierDetail.typePurchase");
    if (type === "payment") return t("supplierDetail.typePayment");
    return t("supplierDetail.typeFix");
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
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

      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <p className="text-sm text-muted-foreground">{t("supplierDetail.balanceOwed")}</p>
        <p className="font-data mt-1 text-3xl tracking-tight">{formatMoney(balance)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("supplierDetail.balanceHint")}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-nameplate text-base">
            {t("supplierDetail.recordPayment")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={paymentForm.handleSubmit(onPayment)}
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="pay-amount">{t("common.amount")}</Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0"
                {...paymentForm.register("amount", { valueAsNumber: true })}
              />
              {paymentForm.formState.errors.amount && (
                <p className="text-xs text-destructive">
                  {paymentForm.formState.errors.amount.message}
                </p>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="pay-date">{t("common.date")}</Label>
              <Input id="pay-date" type="date" {...paymentForm.register("entryDate")} />
            </div>
            <Button type="submit" disabled={savingPayment} className="gap-2 sm:min-w-[120px]">
              {savingPayment && <Loader2 className="size-4 animate-spin" />}
              {t("supplierDetail.submitPayment")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-nameplate text-base">{t("supplierDetail.ledgerTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("supplierDetail.ledgerDesc")}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowFix((v) => !v)}>
            {showFix ? t("sup.cancel") : t("supplierDetail.fixBalance")}
          </Button>
        </div>

        {showFix && (
          <Card className="mb-4">
            <CardContent className="pt-4">
              <p className="mb-3 text-sm text-muted-foreground">{t("supplierDetail.adjustmentDesc")}</p>
              <form
                onSubmit={fixForm.handleSubmit(onFix)}
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="fix-amount">{t("common.amount")}</Label>
                  <Input
                    id="fix-amount"
                    type="number"
                    step="0.01"
                    placeholder={t("supplierDetail.fixAmountPh")}
                    {...fixForm.register("amount", { valueAsNumber: true })}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor="fix-date">{t("common.date")}</Label>
                  <Input id="fix-date" type="date" {...fixForm.register("entryDate")} />
                </div>
                <Button type="submit" variant="outline" disabled={savingFix} className="gap-2">
                  {savingFix && <Loader2 className="size-4 animate-spin" />}
                  {t("supplierDetail.postAdjustment")}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {entries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            {t("supplierDetail.noLedger")}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {entries.map((e) => {
              const delta = entryDelta(e);
              return (
                <li key={e._id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{typeLabel(e.type)}</p>
                    <p className="font-data text-xs text-muted-foreground">
                      {formatDate(e.entryDate)}
                      {e.notes && !isInternalNote(e.notes) ? ` · ${e.notes}` : ""}
                    </p>
                  </div>
                  <span
                    className={`font-data shrink-0 text-sm ${
                      delta < 0 ? "text-chart-3" : "text-foreground"
                    }`}
                  >
                    {delta > 0 ? "+" : ""}
                    {formatMoney(delta)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
