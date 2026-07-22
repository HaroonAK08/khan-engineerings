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

const paymentSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  entryDate: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});

const adjustmentSchema = z.object({
  amount: z.number().refine((n) => Number.isFinite(n) && n !== 0, "Amount must be non-zero"),
  entryDate: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});

type PaymentForm = z.infer<typeof paymentSchema>;
type AdjustmentForm = z.infer<typeof adjustmentSchema>;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function entryDelta(entry: LedgerEntry) {
  if (entry.type === "purchase") return entry.amount;
  if (entry.type === "payment") return -entry.amount;
  return entry.signedAmount ?? 0;
}

export default function SupplierDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const id = String(params.id);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingAdj, setSavingAdj] = useState(false);

  const paymentForm = useForm<PaymentForm>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: 0, entryDate: todayInput(), notes: "" },
  });

  const adjForm = useForm<AdjustmentForm>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { amount: 0, entryDate: todayInput(), notes: "" },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, ledger] = await Promise.all([getSupplier(id), getLedger(id)]);
      setSupplier(detail.supplier);
      setBalance(detail.balance);
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
      paymentForm.reset({ amount: 0, entryDate: todayInput(), notes: "" });
      await load();
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.paymentFailed")));
    } finally {
      setSavingPayment(false);
    }
  }

  async function onAdjustment(values: AdjustmentForm) {
    setSavingAdj(true);
    try {
      const result = await recordAdjustment(id, values);
      setBalance(result.balance);
      toast.success(t("supplierDetail.adjustmentRecorded"));
      adjForm.reset({ amount: 0, entryDate: todayInput(), notes: "" });
      await load();
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.adjustmentFailed")));
    } finally {
      setSavingAdj(false);
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/suppliers"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Suppliers
          </Link>
          <h1 className="text-nameplate text-xl">{supplier.name}</h1>
          <p className="font-data mt-1 text-xs text-muted-foreground">
            {[supplier.phone, supplier.email].filter(Boolean).join(" · ") ||
              t("supplierDetail.noContact")}
          </p>
          <Badge
            variant={supplier.isActive ? "secondary" : "outline"}
            className="font-data mt-2 text-[10px]"
          >
            {supplier.isActive ? t("sup.status.active") : t("sup.status.inactive")}
          </Badge>
        </div>
        <Card className="w-full sm:w-auto sm:min-w-[200px] py-0">
          <CardContent className="p-4">
            <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
              {t("supplierDetail.balanceOwed")}
            </p>
            <p className="font-data mt-1 text-2xl">{formatMoney(balance)}</p>
          </CardContent>
        </Card>
      </div>

      {(supplier.address || supplier.notes) && (
        <Card>
          <CardContent className="grid gap-2 p-4 text-sm sm:grid-cols-2">
            {supplier.address && (
              <div>
                <p className="font-data text-[10px] text-muted-foreground uppercase">
                  {t("common.address")}
                </p>
                <p>{supplier.address}</p>
              </div>
            )}
            {supplier.notes && (
              <div>
                <p className="font-data text-[10px] text-muted-foreground uppercase">
                  {t("common.notes")}
                </p>
                <p>{supplier.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("supplierDetail.recordPayment")}</CardTitle>
            <CardDescription>{t("supplierDetail.recordPaymentDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={paymentForm.handleSubmit(onPayment)} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-amount">{t("common.amount")}</Label>
                <Input
                  id="pay-amount"
                  type="number"
                  step="0.01"
                  {...paymentForm.register("amount", { valueAsNumber: true })}
                />
                {paymentForm.formState.errors.amount && (
                  <p className="text-xs text-destructive">
                    {paymentForm.formState.errors.amount.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-date">{t("common.date")}</Label>
                <Input id="pay-date" type="date" {...paymentForm.register("entryDate")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-notes">{t("common.notes")}</Label>
                <Input id="pay-notes" {...paymentForm.register("notes")} />
              </div>
              <Button type="submit" disabled={savingPayment} className="w-fit gap-2">
                {savingPayment && <Loader2 className="size-4 animate-spin" />}
                {t("supplierDetail.submitPayment")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("supplierDetail.adjustment")}</CardTitle>
            <CardDescription>{t("supplierDetail.adjustmentDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={adjForm.handleSubmit(onAdjustment)} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adj-amount">{t("supplierDetail.signedAmount")}</Label>
                <Input
                  id="adj-amount"
                  type="number"
                  step="0.01"
                  {...adjForm.register("amount", { valueAsNumber: true })}
                />
                {adjForm.formState.errors.amount && (
                  <p className="text-xs text-destructive">
                    {adjForm.formState.errors.amount.message}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adj-date">{t("common.date")}</Label>
                <Input id="adj-date" type="date" {...adjForm.register("entryDate")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adj-notes">{t("common.notes")}</Label>
                <Input id="adj-notes" {...adjForm.register("notes")} />
              </div>
              <Button type="submit" variant="outline" disabled={savingAdj} className="w-fit gap-2">
                {savingAdj && <Loader2 className="size-4 animate-spin" />}
                {t("supplierDetail.postAdjustment")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("supplierDetail.ledgerTitle")}</CardTitle>
          <CardDescription>{t("supplierDetail.ledgerDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("supplierDetail.noLedger")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.type")}</TableHead>
                  <TableHead>{t("common.notes")}</TableHead>
                  <TableHead className="text-right">{t("common.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => {
                  const delta = entryDelta(e);
                  return (
                    <TableRow key={e._id}>
                      <TableCell className="font-data text-xs">{formatDate(e.entryDate)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-data text-[10px] uppercase">
                          {e.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm">{e.notes || "—"}</TableCell>
                      <TableCell
                        className={`font-data text-right text-xs ${
                          delta < 0 ? "text-chart-3" : "text-foreground"
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
    </div>
  );
}
