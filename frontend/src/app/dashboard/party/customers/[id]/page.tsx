"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { apiError, formatDate, formatMoney, withSameDayConfirm } from "@/lib/materials-api";
import {
  createCustomerInstrument,
  getCustomer,
  getCustomerLedger,
  recordCustomerAdjustment,
  recordCustomerPayment,
  type Customer,
  type CustomerInstrument,
  type CustomerLedgerEntry,
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
import { PartyChequePromiseSummary } from "@/components/party/party-cheque-promise-summary";
import { PartyHistoryCalendar } from "@/components/party/party-history-calendar";
import { PartyPendingByMonth } from "@/components/party/party-pending-by-month";
import {
  LedgerKindToggle,
  type LedgerEntryKind,
} from "@/components/party/ledger-kind-toggle";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import { todayInput } from "@/lib/date-range";
import { computePeriodPending, prefixPendingParty } from "@/lib/party-pending";

function formatBaqaya(baqaya: number) {
  const abs = formatMoney(Math.abs(baqaya));
  if (baqaya > 0.001) return abs;
  if (baqaya < -0.001) return `+ ${abs}`;
  return formatMoney(0);
}

function baqayaClass(baqaya: number) {
  if (baqaya > 0.001) return "text-amber-700 dark:text-amber-400";
  if (baqaya < -0.001) return "text-emerald-700 dark:text-emerald-400";
  return undefined;
}

type PartyClaim = {
  _id: string;
  claimNo: string;
  claimDate: string;
  status: string;
  refundAmount?: number;
  builty?: { _id?: string; builtyNo: string };
  items: Array<{ quantity: number; disposition: string; product?: { name: string } }>;
};

export default function CustomerDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const id = String(params.id);
  const { dateFrom, dateTo, setDateFrom, setDateTo } = usePersistedDateRange();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [balance, setBalance] = useState(0);
  const [recordedPreviousPending, setRecordedPreviousPending] = useState(0);
  const [stats, setStats] = useState({
    orderCount: 0,
    totalSales: 0,
    totalPaid: 0,
    totalDue: 0,
  });
  const [entries, setEntries] = useState<CustomerLedgerEntry[]>([]);
  const [instruments, setInstruments] = useState<CustomerInstrument[]>([]);
  const [claims, setClaims] = useState<PartyClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);

  const [showPendingForm, setShowPendingForm] = useState(true);
  const [pendingAmount, setPendingAmount] = useState("");
  const [pendingDate, setPendingDate] = useState(todayInput());
  const [pendingNotes, setPendingNotes] = useState("");
  const [savingPending, setSavingPending] = useState(false);

  const [showPaidForm, setShowPaidForm] = useState(false);
  const [paidKind, setPaidKind] = useState<LedgerEntryKind>("payment");
  const [paidAmount, setPaidAmount] = useState("");
  const [paidDiscount, setPaidDiscount] = useState("");
  const [paidDate, setPaidDate] = useState(todayInput());
  const [paidMethod, setPaidMethod] = useState("cash");
  const [paidChequeDate, setPaidChequeDate] = useState("");
  const [paidNotes, setPaidNotes] = useState("");
  const [savingPaid, setSavingPaid] = useState(false);

  const [showInstrumentForm, setShowInstrumentForm] = useState(false);
  const [instrumentKind, setInstrumentKind] = useState<"cheque" | "promise">("cheque");
  const [instrumentAmount, setInstrumentAmount] = useState("");
  const [instrumentRecorded, setInstrumentRecorded] = useState(todayInput());
  const [instrumentDue, setInstrumentDue] = useState("");
  const [instrumentNotes, setInstrumentNotes] = useState("");
  const [savingInstrument, setSavingInstrument] = useState(false);

  const periodPending = useMemo(
    () =>
      prefixPendingParty(
        computePeriodPending(entries, dateFrom, dateTo),
        customer?.name || "",
        `/dashboard/party/customers/${id}`
      ),
    [entries, dateFrom, dateTo, customer?.name, id]
  );
  const previousPendingShown =
    dateFrom || dateTo ? periodPending.previousRemaining : recordedPreviousPending;

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const seq = ++loadSeq.current;
      if (!opts?.silent) setLoading(true);
      try {
        const [detail, ledger, claimsRes] = await Promise.all([
          getCustomer(id),
          getCustomerLedger(id),
          api.get<{ claims: PartyClaim[] }>("/claims", { params: { customer: id } }),
        ]);
        if (seq !== loadSeq.current) return;
        setCustomer(detail.customer);
        setBalance(detail.balance);
        setRecordedPreviousPending(detail.previousPending || 0);
        setEntries(ledger.entries);
        setInstruments(ledger.instruments || []);
        setClaims(claimsRes.data.claims || []);
        setStats({
          orderCount: detail.stats.orderCount || 0,
          totalSales: detail.stats.totalSales || 0,
          totalPaid: detail.stats.totalPaid || 0,
          totalDue:
            detail.stats.totalDue ??
            (detail.previousPending || 0) + (detail.stats.totalSales || 0),
        });
      } catch (err) {
        if (seq !== loadSeq.current) return;
        toast.error(apiError(err, t("customerDetail.loadFailed")));
        setCustomer(null);
      } finally {
        if (seq === loadSeq.current && !opts?.silent) setLoading(false);
      }
    },
    [id, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#party-history") return;
    const timer = window.setTimeout(() => {
      document.getElementById("party-history")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [loading, id]);

  async function onAddPreviousPending() {
    const amount = Number(pendingAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("customerDetail.enterAmount"));
      return;
    }
    if (!pendingDate) {
      toast.error(t("customerDetail.pickDate"));
      return;
    }
    setSavingPending(true);
    try {
      await recordCustomerAdjustment(id, {
        amount,
        entryDate: pendingDate,
        notes: pendingNotes.trim() || "Previous pending",
      });
      toast.success(t("customerDetail.previousPendingRecorded"));
      setPendingAmount("");
      setPendingNotes("");
      setPendingDate(todayInput());
      setShowPendingForm(false);
      await load({ silent: true });
    } catch (err) {
      toast.error(apiError(err, t("customerDetail.previousPendingFailed")));
    } finally {
      setSavingPending(false);
    }
  }

  async function onAddPayment() {
    const amount = Number(paidAmount) || 0;
    const discount = Number(paidDiscount) || 0;
    if (paidKind === "previous_pending") {
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error(t("customerDetail.enterAmount"));
        return;
      }
    } else if (paidMethod === "cheque") {
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error(t("customerDetail.enterAmount"));
        return;
      }
    } else if (
      (!Number.isFinite(amount) || amount < 0) ||
      (!Number.isFinite(discount) || discount < 0) ||
      (amount <= 0 && discount <= 0)
    ) {
      toast.error(t("customerDetail.enterPaymentOrDiscount"));
      return;
    }
    if (!paidDate) {
      toast.error(t("customerDetail.pickDate"));
      return;
    }
    setSavingPaid(true);
    try {
      if (paidKind === "previous_pending") {
        await recordCustomerAdjustment(id, {
          amount,
          entryDate: paidDate,
          notes: paidNotes.trim() || "Previous pending",
        });
        toast.success(t("customerDetail.previousPendingRecorded"));
      } else if (paidMethod === "cheque") {
        const chequeDate = paidChequeDate || paidDate;
        if (!chequeDate) {
          toast.error(t("customerDetail.pickDate"));
          return;
        }
        await createCustomerInstrument(id, {
          kind: "cheque",
          amount,
          recordedDate: paidDate,
          dueDate: chequeDate,
          notes: paidNotes.trim() || undefined,
        });
        toast.success(t("customerDetail.chequePromiseSaved"));
      } else {
        const body = {
          amount,
          discountAmount: discount > 0 ? discount : undefined,
          paymentDate: paidDate,
          method: paidMethod,
          notes: paidNotes.trim() || undefined,
        };
        const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
          recordCustomerPayment(id, { ...body, confirmDuplicate })
        );
        if (cancelled) return;
        toast.success(
          discount > 0
            ? t("customerDetail.paymentWithDiscountRecorded")
            : t("customerDetail.paymentRecorded")
        );
      }
      setPaidAmount("");
      setPaidDiscount("");
      setPaidNotes("");
      setPaidDate(todayInput());
      setPaidMethod("cash");
      setPaidChequeDate("");
      setPaidKind("payment");
      setShowPaidForm(false);
      await load({ silent: true });
    } catch (err) {
      toast.error(
        apiError(
          err,
          paidKind === "previous_pending"
            ? t("customerDetail.previousPendingFailed")
            : t("customerDetail.paymentFailed")
        )
      );
    } finally {
      setSavingPaid(false);
    }
  }

  async function onAddInstrument() {
    const amount = Number(instrumentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("customerDetail.enterAmount"));
      return;
    }
    if (!instrumentDue) {
      toast.error(t("customerDetail.pickDate"));
      return;
    }
    setSavingInstrument(true);
    try {
      await createCustomerInstrument(id, {
        kind: instrumentKind,
        amount,
        recordedDate: instrumentRecorded || todayInput(),
        dueDate: instrumentDue,
        notes: instrumentNotes.trim() || undefined,
      });
      toast.success(t("customerDetail.chequePromiseSaved"));
      setInstrumentAmount("");
      setInstrumentNotes("");
      setInstrumentDue("");
      setInstrumentRecorded(todayInput());
      setInstrumentKind("cheque");
      setShowInstrumentForm(false);
      await load({ silent: true });
    } catch (err) {
      toast.error(apiError(err, t("customerDetail.chequePromiseFailed")));
    } finally {
      setSavingInstrument(false);
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
          {
            label:
              balance < 0
                ? t("customerDetail.advance")
                : t("customerDetail.paymentPending"),
            value: formatMoney(Math.abs(balance)),
          },
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

      <PartyChequePromiseSummary instruments={instruments} />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-nameplate text-sm">
              {t("customerDetail.previousPending")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("customerDetail.previousPendingDateDesc")}
            </p>
          </div>
          <Button
            type="button"
            variant={showPendingForm ? "outline" : "default"}
            onClick={() => {
              setShowPendingForm((v) => !v);
              setShowPaidForm(false);
            }}
          >
            {showPendingForm ? t("common.cancel") : t("customerDetail.addPreviousPending")}
          </Button>
        </CardHeader>
        <CardContent className={showPendingForm ? "pt-0" : undefined}>
          {showPendingForm ? (
            <div className="mb-4 rounded-lg border bg-muted/20 p-3">
              <p className="mb-3 text-sm font-medium">{t("customerDetail.addPreviousPending")}</p>
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
                    autoFocus
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
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>{t("common.from")}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                onInput={(e) => setDateFrom((e.target as HTMLInputElement).value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("common.to")}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                onInput={(e) => setDateTo((e.target as HTMLInputElement).value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("customerDetail.previousPending")}</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3">
                <span
                  className={`font-data text-base font-semibold ${baqayaClass(previousPendingShown) || ""}`}
                >
                  {formatBaqaya(previousPendingShown)}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 border-t pt-4">
            <PartyPendingByMonth
              key={`${dateFrom}|${dateTo}`}
              snapshot={periodPending}
              dateFrom={dateFrom}
              dateTo={dateTo}
            />
          </div>
        </CardContent>
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
            variant={showPaidForm ? "outline" : "default"}
            className={showPaidForm ? undefined : "bg-primary px-5 text-primary-foreground shadow-sm"}
            onClick={() => {
              setShowPaidForm((v) => {
                const next = !v;
                if (next) {
                  setPaidKind("payment");
                  setPaidAmount(balance > 0 ? String(balance) : "");
                  setPaidDiscount("");
                }
                return next;
              });
            }}
          >
            {showPaidForm ? t("common.cancel") : t("customerDetail.addPayment")}
          </Button>
        </CardHeader>
        {showPaidForm ? (
          <CardContent className="pt-0">
            <div className="mb-3 flex flex-col gap-1.5">
              <Label>{t("customerDetail.entryKind")}</Label>
              <LedgerKindToggle
                value={paidKind}
                onChange={setPaidKind}
                paymentLabel={t("customerDetail.kindPayment")}
                pendingLabel={t("customerDetail.kindPreviousPending")}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label>
                  {paidKind === "payment"
                    ? t("customerDetail.amountReceived")
                    : t("common.amount")}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              {paidKind === "payment" && paidMethod !== "cheque" ? (
                <div className="flex flex-col gap-1.5">
                  <Label>{t("customerDetail.discountGiven")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={paidDiscount}
                    onChange={(e) => setPaidDiscount(e.target.value)}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("customerDetail.discountGivenHint")}
                  </p>
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                />
              </div>
              {paidKind === "payment" ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.method")}</Label>
                <select
                  className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  value={paidMethod}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPaidMethod(next);
                    if (next === "cheque" && !paidChequeDate) {
                      setPaidChequeDate(paidDate);
                    }
                  }}
                >
                  <option value="cash">{t("common.cash")}</option>
                  <option value="cheque">{t("common.cheque")}</option>
                  <option value="online">{t("common.online")}</option>
                </select>
              </div>
              ) : null}
              {paidKind === "payment" && paidMethod === "cheque" ? (
              <div className="flex flex-col gap-1.5">
                <Label>{t("customerDetail.chequeDate")}</Label>
                <Input
                  type="date"
                  value={paidChequeDate}
                  onChange={(e) => setPaidChequeDate(e.target.value)}
                />
              </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.notes")}</Label>
                <Input value={paidNotes} onChange={(e) => setPaidNotes(e.target.value)} />
              </div>
            </div>
            {paidKind === "payment" && paidMethod === "cheque" ? (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                {t("customerDetail.chequePaymentHint")}
              </p>
            ) : null}
            {paidKind === "payment" && paidMethod !== "cheque" ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("customerDetail.settlePreview", {
                  due: formatMoney(balance),
                  received: formatMoney(Math.max(0, Number(paidAmount) || 0)),
                  discount: formatMoney(Math.max(0, Number(paidDiscount) || 0)),
                  left: formatMoney(
                    Math.max(
                      0,
                      balance -
                        Math.max(0, Number(paidAmount) || 0) -
                        Math.max(0, Number(paidDiscount) || 0)
                    )
                  ),
                })}
              </p>
            ) : null}
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
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-nameplate text-sm">
              {t("customerDetail.chequePromise")}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("customerDetail.chequePromiseDesc")}
            </p>
          </div>
          <Button
            type="button"
            variant={showInstrumentForm ? "outline" : "default"}
            onClick={() => setShowInstrumentForm((v) => !v)}
          >
            {showInstrumentForm ? t("common.cancel") : t("customerDetail.addChequePromise")}
          </Button>
        </CardHeader>
        {showInstrumentForm ? (
          <CardContent className="pt-0">
            <div className="mb-3 flex h-9 overflow-hidden rounded-lg border border-input">
              <button
                type="button"
                className={`flex-1 px-3 text-sm ${instrumentKind === "cheque" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                onClick={() => setInstrumentKind("cheque")}
              >
                {t("customerDetail.kindCheque")}
              </button>
              <button
                type="button"
                className={`flex-1 px-3 text-sm ${instrumentKind === "promise" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                onClick={() => setInstrumentKind("promise")}
              >
                {t("customerDetail.kindPromise")}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.amount")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={instrumentAmount}
                  onChange={(e) => setInstrumentAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.date")}</Label>
                <Input
                  type="date"
                  value={instrumentRecorded}
                  onChange={(e) => setInstrumentRecorded(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("customerDetail.dueDate")}</Label>
                <Input
                  type="date"
                  value={instrumentDue}
                  onChange={(e) => setInstrumentDue(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("common.notes")}</Label>
                <Input
                  value={instrumentNotes}
                  onChange={(e) => setInstrumentNotes(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              className="mt-3 gap-2"
              disabled={savingInstrument}
              onClick={() => void onAddInstrument()}
            >
              {savingInstrument ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("common.save")}
            </Button>
          </CardContent>
        ) : null}
      </Card>

      <div className="flex flex-col gap-2">
        <div>
          <h2 className="text-nameplate text-sm">{t("customerDetail.claimsTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("customerDetail.claimsDesc")}
          </p>
        </div>
        {claims.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("customerDetail.claimsEmpty")}
          </p>
        ) : (
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("claims.col.claim")}</TableHead>
                    <TableHead>{t("claims.col.date")}</TableHead>
                    <TableHead>{t("claims.col.invoice")}</TableHead>
                    <TableHead>{t("claims.col.items")}</TableHead>
                    <TableHead className="text-right">{t("claims.col.refund")}</TableHead>
                    <TableHead>{t("claims.col.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.map((c) => (
                    <TableRow key={c._id}>
                      <TableCell className="font-data text-xs">{c.claimNo}</TableCell>
                      <TableCell className="font-data text-xs">
                        {formatDate(c.claimDate)}
                      </TableCell>
                      <TableCell className="font-data text-xs">
                        {c.builty?._id ? (
                          <Link
                            href={`/dashboard/builty/${c.builty._id}`}
                            className="text-primary hover:underline"
                          >
                            {c.builty.builtyNo}
                          </Link>
                        ) : (
                          c.builty?.builtyNo || "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.items
                          .map(
                            (i) =>
                              `${i.quantity} ${i.product?.name || ""} (${i.disposition})`
                          )
                          .join(", ")}
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {c.refundAmount ? formatMoney(c.refundAmount) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase text-[10px]">
                          {c.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <div id="party-history" className="flex flex-col gap-2 scroll-mt-20">
        <div>
          <h2 className="text-nameplate text-sm">{t("customerDetail.ledgerTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("customerDetail.ledgerDesc")}
          </p>
        </div>
        <PartyHistoryCalendar
          customerId={id}
          entries={entries}
          instruments={instruments}
          onChanged={() => load({ silent: true })}
        />
      </div>
    </div>
  );
}
