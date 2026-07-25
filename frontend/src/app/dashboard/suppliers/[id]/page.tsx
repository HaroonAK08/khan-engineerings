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
  formatMoney,
  getLedger,
  getSupplier,
  recordAdjustment,
} from "@/lib/materials-api";
import type { LedgerEntry, Supplier } from "@/types/materials";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SupplierHistoryCalendar } from "@/components/suppliers/supplier-history-calendar";
import { useI18n } from "@/hooks/use-i18n";
import { todayInput } from "@/lib/date-range";

const fixSchema = z.object({
  amount: z.number().refine((n) => Number.isFinite(n) && n !== 0, "Enter amount"),
  entryDate: z.string().min(1, "Pick a date"),
  notes: z.string().optional(),
});

type FixForm = z.infer<typeof fixSchema>;
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
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingFix, setSavingFix] = useState(false);
  const [showFix, setShowFix] = useState(false);
  const [historyKind, setHistoryKind] = useState<HistoryKind>("purchase");

  const fixForm = useForm<FixForm>({
    resolver: zodResolver(fixSchema),
    defaultValues: { amount: undefined as unknown as number, entryDate: todayInput(), notes: "" },
  });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [detail, ledger] = await Promise.all([getSupplier(id), getLedger(id)]);
      setSupplier(detail.supplier);
      setEntries(ledger.entries);
      setBalance(ledger.balance);
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.loadFailed")));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFix(values: FixForm) {
    setSavingFix(true);
    try {
      const result = await recordAdjustment(id, values);
      setBalance(result.balance);
      toast.success(t("supplierDetail.adjustmentRecorded"));
      fixForm.reset({ amount: undefined as unknown as number, entryDate: todayInput(), notes: "" });
      setShowFix(false);
      await load({ silent: true });
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.adjustmentFailed")));
    } finally {
      setSavingFix(false);
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
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
