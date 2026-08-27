"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { apiError, formatDate, formatMoney, withSameDayConfirm } from "@/lib/materials-api";
import {
  deleteBuilty,
  deleteCustomerInstrument,
  deleteCustomerLedgerEntry,
  receiveCustomerInstrument,
  updateCustomerInstrument,
  updateCustomerLedgerEntry,
  type CustomerInstrument,
  type CustomerLedgerEntry,
} from "@/lib/sales-api";
import { toDateInput, todayInput } from "@/lib/date-range";
import {
  instrumentIsDue,
  ledgerPaymentId,
  summarizeInstruments,
} from "@/lib/party-instruments";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";

type Props = {
  customerId: string;
  entries: CustomerLedgerEntry[];
  instruments: CustomerInstrument[];
  onChanged: () => void | Promise<void>;
};

type KhataRow = {
  entry: CustomerLedgerEntry;
  debit: number;
  credit: number;
  baqaya: number;
};

function isInternalNote(notes: string) {
  return /^Payment [a-f0-9]{24}$/i.test(notes.trim());
}

function builtyOf(e: CustomerLedgerEntry) {
  return e.builty && typeof e.builty === "object" ? e.builty : null;
}

function builtyIdOf(e: CustomerLedgerEntry) {
  if (!e.builty) return "";
  if (typeof e.builty === "string") return e.builty;
  return e.builty._id;
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function dayKey(d: Date) {
  return toDateInput(d);
}

function entryTime(e: CustomerLedgerEntry) {
  return new Date(e.entryDate).getTime();
}

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

/** Classic khata: oldest → newest, baqaya after each line. */
function buildKhataRows(entries: CustomerLedgerEntry[]): KhataRow[] {
  const ordered = entries
    .filter((e) => !(e.type === "adjustment" && (e.signedAmount ?? 0) <= 0))
    .slice()
    .sort((a, b) => entryTime(a) - entryTime(b) || a._id.localeCompare(b._id));

  const rows: KhataRow[] = [];
  let baqaya = 0;
  for (const e of ordered) {
    let debit = 0;
    let credit = 0;
    if (e.type === "payment") {
      credit = roundMoney(e.amount || 0);
      baqaya = roundMoney(baqaya - credit);
    } else if (e.type === "adjustment") {
      debit = roundMoney(e.signedAmount ?? e.amount ?? 0);
      baqaya = roundMoney(baqaya + debit);
    } else {
      const b = builtyOf(e);
      debit = roundMoney(b?.totalAmount ?? e.amount ?? 0);
      baqaya = roundMoney(baqaya + debit);
    }
    rows.push({ entry: e, debit, credit, baqaya });
  }
  return rows;
}

export function PartyHistoryCalendar({
  customerId,
  entries,
  instruments = [],
  onChanged,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const {
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    setThisMonth,
    setToday,
    clearRange,
    isThisMonth,
    isToday,
    isAll,
  } = usePersistedDateRange();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerLedgerEntry | null>(null);
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiving, setReceiving] = useState<CustomerInstrument | null>(null);
  const [receiveDate, setReceiveDate] = useState(todayInput());
  const [receiveMethod, setReceiveMethod] = useState("cash");
  const [receiveBusy, setReceiveBusy] = useState(false);
  const [editInstOpen, setEditInstOpen] = useState(false);
  const [editingInst, setEditingInst] = useState<CustomerInstrument | null>(null);
  const [instAmount, setInstAmount] = useState("");
  const [instRecorded, setInstRecorded] = useState("");
  const [instDue, setInstDue] = useState("");
  const [instNote, setInstNote] = useState("");
  const [instKind, setInstKind] = useState<"cheque" | "promise">("cheque");
  const [instBusy, setInstBusy] = useState(false);

  const allRows = useMemo(() => buildKhataRows(entries), [entries]);

  const filteredRows = useMemo(() => {
    let list = allRows;
    if (dateFrom) {
      list = list.filter((r) => dayKey(new Date(r.entry.entryDate)) >= dateFrom);
    }
    if (dateTo) {
      list = list.filter((r) => dayKey(new Date(r.entry.entryDate)) <= dateTo);
    }
    return list
      .slice()
      .sort(
        (a, b) =>
          entryTime(a.entry) - entryTime(b.entry) ||
          a.entry._id.localeCompare(b.entry._id)
      );
  }, [allRows, dateFrom, dateTo]);

  /** Carry-forward بقایا from before dateFrom (khata opening). */
  const openingBalance = useMemo(() => {
    if (!dateFrom) return 0;
    const prior = allRows.filter(
      (r) => dayKey(new Date(r.entry.entryDate)) < dateFrom
    );
    return prior.length ? prior[prior.length - 1].baqaya : 0;
  }, [allRows, dateFrom]);

  const totals = useMemo(() => {
    const totalDebit = roundMoney(filteredRows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = roundMoney(filteredRows.reduce((s, r) => s + r.credit, 0));
    let closing: number;
    if (dateFrom) {
      closing = openingBalance;
      for (const r of filteredRows) {
        closing = roundMoney(closing + r.debit - r.credit);
      }
    } else {
      closing = filteredRows.length
        ? filteredRows[filteredRows.length - 1].baqaya
        : 0;
    }
    return { totalDebit, totalCredit, closing };
  }, [filteredRows, dateFrom, openingBalance]);

  const displayRows = useMemo(() => {
    if (!dateFrom) return filteredRows;
    let b = openingBalance;
    return filteredRows.map((r) => {
      b = roundMoney(b + r.debit - r.credit);
      return { ...r, baqaya: b };
    });
  }, [filteredRows, dateFrom, openingBalance]);

  const pendingInstruments = useMemo(
    () => instruments.filter((i) => i.status === "pending"),
    [instruments]
  );
  const instrumentSummary = useMemo(
    () => summarizeInstruments(instruments),
    [instruments]
  );
  const receivedByPayment = useMemo(() => {
    const map = new Map<string, CustomerInstrument>();
    for (const i of instruments) {
      if (i.status !== "received" || !i.payment) continue;
      map.set(String(i.payment), i);
    }
    return map;
  }, [instruments]);
  const mixedRows = useMemo(() => {
    const ledgerItems = displayRows.map((row) => ({
      key: row.entry._id,
      sort: entryTime(row.entry),
      kind: "ledger" as const,
      row,
    }));
    const instItems = pendingInstruments.map((instrument) => ({
      key: instrument._id,
      sort: new Date(instrument.recordedDate).getTime() || 0,
      kind: "instrument" as const,
      instrument,
    }));
    return [...ledgerItems, ...instItems].sort(
      (a, b) => a.sort - b.sort || a.key.localeCompare(b.key)
    );
  }, [displayRows, pendingInstruments]);

  const hasDateFilter = Boolean(dateFrom || dateTo);
  const showOpeningRow =
    Boolean(dateFrom) &&
    (displayRows.length > 0 || Math.abs(openingBalance) > 0.001);

  function rowDetail(e: CustomerLedgerEntry) {
    if (e.type === "payment") {
      return e.notes && !isInternalNote(e.notes)
        ? e.notes
        : t("customerDetail.khataPayment");
    }
    if (e.type === "adjustment") {
      return e.notes && !isInternalNote(e.notes)
        ? e.notes
        : t("customerDetail.previousPending");
    }
    const b = builtyOf(e);
    if (!b) return t("customerDetail.builtyHistory");
    const no = b.builtyNo || "—";
    return b.billNo ? `${no} · ${b.billNo}` : no;
  }

  function openEdit(e: CustomerLedgerEntry) {
    if (e.type === "invoice") {
      const bid = builtyIdOf(e);
      if (bid) router.push(`/dashboard/builty/${bid}/edit`);
      else toast.error(t("customerDetail.builtyMissing"));
      return;
    }
    setEditing(e);
    setFormDate(dayKey(new Date(e.entryDate)));
    setFormAmount(
      String(e.type === "adjustment" ? (e.signedAmount ?? e.amount) : e.amount)
    );
    setFormNote(e.notes && !isInternalNote(e.notes) ? e.notes : "");
    setDialogOpen(true);
  }

  async function saveEdit() {
    if (!editing) return;
    if (!formDate) {
      toast.error(t("customerDetail.pickDate"));
      return;
    }
    const amount = Number(formAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("customerDetail.enterAmount"));
      return;
    }

    setSaving(true);
    try {
      await updateCustomerLedgerEntry(customerId, editing._id, {
        amount,
        entryDate: formDate,
        notes:
          formNote.trim() ||
          (editing.type === "adjustment" ? "Previous pending" : "Party payment"),
      });
      toast.success(t("customerDetail.entryUpdated"));
      setDialogOpen(false);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, t("customerDetail.entrySaveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry() {
    if (!editing) return;
    const confirmMsg =
      editing.type === "payment"
        ? t("customerDetail.confirmDeletePayment")
        : t("customerDetail.confirmDeletePreviousPending");
    if (!confirm(confirmMsg)) return;
    setDeleting(true);
    try {
      await deleteCustomerLedgerEntry(customerId, editing._id);
      toast.success(t("customerDetail.entryDeleted"));
      setDialogOpen(false);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, t("customerDetail.entryDeleteFailed")));
    } finally {
      setDeleting(false);
    }
  }

  async function deleteDirect(e: CustomerLedgerEntry) {
    if (e.type === "invoice") {
      const bid = builtyIdOf(e);
      if (!bid) {
        toast.error(t("customerDetail.builtyMissing"));
        return;
      }
      if (!confirm(t("customerDetail.confirmDeleteBuilty"))) return;
      try {
        await deleteBuilty(bid);
        toast.success(t("customerDetail.entryDeleted"));
        await onChanged();
      } catch (err) {
        toast.error(apiError(err, t("customerDetail.entryDeleteFailed")));
      }
      return;
    }

    const confirmMsg =
      e.type === "payment"
        ? t("customerDetail.confirmDeletePayment")
        : t("customerDetail.confirmDeletePreviousPending");
    if (!confirm(confirmMsg)) return;
    try {
      await deleteCustomerLedgerEntry(customerId, e._id);
      toast.success(t("customerDetail.entryDeleted"));
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, t("customerDetail.entryDeleteFailed")));
    }
  }

  function openReceive(instrument: CustomerInstrument) {
    setReceiving(instrument);
    setReceiveDate(todayInput());
    setReceiveMethod(instrument.kind === "cheque" ? "cheque" : "cash");
    setReceiveOpen(true);
  }

  function openEditInstrument(instrument: CustomerInstrument) {
    setEditingInst(instrument);
    setInstKind(instrument.kind);
    setInstAmount(String(instrument.amount));
    setInstRecorded(dayKey(new Date(instrument.recordedDate)));
    setInstDue(dayKey(new Date(instrument.dueDate)));
    setInstNote(instrument.notes || "");
    setEditInstOpen(true);
  }

  async function saveInstrument() {
    if (!editingInst) return;
    const amount = Number(instAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("customerDetail.enterAmount"));
      return;
    }
    if (!instDue) {
      toast.error(t("customerDetail.pickDate"));
      return;
    }
    setInstBusy(true);
    try {
      await updateCustomerInstrument(customerId, editingInst._id, {
        kind: instKind,
        amount,
        recordedDate: instRecorded || instDue,
        dueDate: instDue,
        notes: instNote.trim() || undefined,
      });
      toast.success(t("customerDetail.entryUpdated"));
      setEditInstOpen(false);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, t("customerDetail.chequePromiseFailed")));
    } finally {
      setInstBusy(false);
    }
  }

  async function receiveNow() {
    if (!receiving) return;
    if (!receiveDate) {
      toast.error(t("customerDetail.pickDate"));
      return;
    }
    setReceiveBusy(true);
    try {
      const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
        receiveCustomerInstrument(customerId, receiving._id, {
          receivedDate: receiveDate,
          method: receiveMethod,
          confirmDuplicate,
        })
      );
      if (cancelled) return;
      toast.success(t("customerDetail.receivedOk"));
      setReceiveOpen(false);
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, t("customerDetail.receiveFailed")));
    } finally {
      setReceiveBusy(false);
    }
  }

  async function deleteInstrument(instrument: CustomerInstrument) {
    if (!confirm(t("customerDetail.confirmDeleteChequePromise"))) return;
    try {
      await deleteCustomerInstrument(customerId, instrument._id);
      toast.success(t("customerDetail.entryDeleted"));
      await onChanged();
    } catch (err) {
      toast.error(apiError(err, t("customerDetail.entryDeleteFailed")));
    }
  }

  function paymentMethodOf(e: CustomerLedgerEntry) {
    if (!e.payment || typeof e.payment === "string") return "";
    return e.payment.method || "";
  }

  function chequeCell(
    instrument: CustomerInstrument | null | undefined,
    paymentMethod?: string
  ) {
    if (!instrument && paymentMethod !== "cheque") {
      return <span className="text-muted-foreground">—</span>;
    }
    if (!instrument) {
      return (
        <p className="text-xs font-medium">{t("customerDetail.kindCheque")}</p>
      );
    }
    const due = instrument.status === "pending" && instrumentIsDue(instrument.dueDate);
    return (
      <div className={due ? "animate-cheque-due rounded-md px-1.5 py-0.5" : undefined}>
        <p className="text-xs font-medium">
          {instrument.kind === "cheque"
            ? t("customerDetail.kindCheque")
            : t("customerDetail.kindPromise")}
        </p>
        <p className="font-data text-xs">{formatDate(instrument.dueDate)}</p>
        {instrument.status === "pending" ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            {due ? t("customerDetail.chequePromiseDue") : t("customerDetail.unfulfilled")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={isAll ? "default" : "outline"}
              onClick={clearRange}
            >
              {t("sal.filterAll")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isToday ? "default" : "outline"}
              onClick={setToday}
            >
              {t("sal.filterToday")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isThisMonth ? "default" : "outline"}
              onClick={setThisMonth}
            >
              {t("sal.filterThisMonth")}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-1.5">
              <Label>{t("common.from")}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("common.to")}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("customerDetail.khataBaqaya")}</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3">
                <span
                  className={`font-data text-base font-semibold ${baqayaClass(totals.closing) || ""}`}
                >
                  {formatBaqaya(totals.closing)}
                </span>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("customerDetail.chequePromisePending")}</Label>
              <div
                className={`flex h-9 items-center rounded-md border px-3 ${
                  instrumentSummary.dueCount > 0
                    ? "animate-cheque-due border-amber-400/70"
                    : "bg-muted/30"
                }`}
              >
                <span className="font-data text-base font-semibold text-amber-700 dark:text-amber-400">
                  {formatMoney(instrumentSummary.pendingTotal)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {displayRows.length === 0 && !showOpeningRow && pendingInstruments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14">
            <p className="text-sm text-muted-foreground">
              {hasDateFilter
                ? t("sal.ledgerEmptyFiltered")
                : t("customerDetail.noLedger")}
            </p>
            {hasDateFilter ? (
              <Button type="button" variant="outline" onClick={clearRange}>
                {t("sal.filterAll")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <Table className="table-fixed" containerClassName="overflow-x-hidden">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[7.5rem]">{t("common.date")}</TableHead>
                  <TableHead className="w-[9.5rem]">{t("customerDetail.chequePromiseCol")}</TableHead>
                  <TableHead>{t("exp.colDetail")}</TableHead>
                  <TableHead className="w-[8rem] text-end">
                    {t("customerDetail.khataDebit")}
                  </TableHead>
                  <TableHead className="w-[8rem] text-end">
                    {t("customerDetail.khataCredit")}
                  </TableHead>
                  <TableHead className="w-[8rem] text-end">
                    {t("customerDetail.khataBaqaya")}
                  </TableHead>
                  <TableHead className="w-[7.5rem] text-end">{t("exp.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {showOpeningRow ? (
                  <TableRow className="bg-muted/40 hover:bg-muted/50">
                    <TableCell className="font-data whitespace-nowrap text-muted-foreground">
                      —
                    </TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="text-sm text-muted-foreground">
                        {t("statements.opening")}
                      </span>
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">—</TableCell>
                    <TableCell className="text-end text-muted-foreground">—</TableCell>
                    <TableCell
                      className={`font-data text-end whitespace-nowrap font-medium ${baqayaClass(openingBalance) || ""}`}
                    >
                      {formatBaqaya(openingBalance)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ) : null}
                {mixedRows.map((item) => {
                  if (item.kind === "instrument") {
                    const instrument = item.instrument;
                    const due = instrumentIsDue(instrument.dueDate);
                    return (
                      <TableRow
                        key={instrument._id}
                        className={due ? "animate-cheque-due" : "bg-sky-50 dark:bg-sky-950/30"}
                      >
                        <TableCell className="font-data whitespace-nowrap">
                          {formatDate(instrument.recordedDate)}
                        </TableCell>
                        <TableCell className="whitespace-normal">{chequeCell(instrument)}</TableCell>
                        <TableCell className="whitespace-normal">
                          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                            {instrument.kind === "cheque"
                              ? t("customerDetail.kindCheque")
                              : t("customerDetail.kindPromise")}
                            {" · "}
                            {formatMoney(instrument.amount)}
                          </span>
                          {instrument.notes ? (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {instrument.notes}
                            </span>
                          ) : (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {t("customerDetail.chequePromisePendingHint")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-end text-muted-foreground">—</TableCell>
                        <TableCell className="text-end text-muted-foreground">—</TableCell>
                        <TableCell className="text-end text-muted-foreground">—</TableCell>
                        <TableCell className="text-end">
                          <div className="inline-flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              title={t("customerDetail.receiveNow")}
                              aria-label={t("customerDetail.receiveNow")}
                              onClick={() => openReceive(instrument)}
                            >
                              <Check className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              title={t("common.edit")}
                              aria-label={t("common.edit")}
                              onClick={() => openEditInstrument(instrument)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="destructive"
                              title={t("common.delete")}
                              aria-label={t("common.delete")}
                              onClick={() => void deleteInstrument(instrument)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const row = item.row;
                  const e = row.entry;
                  const isPayment = e.type === "payment";
                  const isInvoice = e.type === "invoice";
                  const isCleared = Math.abs(row.baqaya) <= 0.001;
                  const invoiceBuiltyId = isInvoice ? builtyIdOf(e) : "";
                  const linkedInstrument = receivedByPayment.get(ledgerPaymentId(e));
                  const openBuilty = () => {
                    if (!invoiceBuiltyId) {
                      toast.error(t("customerDetail.builtyMissing"));
                      return;
                    }
                    router.push(`/dashboard/builty/${invoiceBuiltyId}`);
                  };
                  return (
                    <TableRow
                      key={e._id}
                      tabIndex={isInvoice ? 0 : undefined}
                      className={[
                        isInvoice ? "cursor-pointer" : "",
                        isPayment
                          ? "bg-emerald-100 hover:bg-emerald-100/90 dark:bg-emerald-900/50 dark:hover:bg-emerald-900/60"
                          : isCleared
                            ? "bg-muted/40 hover:bg-muted/50"
                            : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={isInvoice ? openBuilty : undefined}
                      onKeyDown={
                        isInvoice
                          ? (ev) => {
                              if (ev.key === "Enter" || ev.key === " ") {
                                ev.preventDefault();
                                openBuilty();
                              }
                            }
                          : undefined
                      }
                    >
                      <TableCell className="font-data whitespace-nowrap">
                        {formatDate(e.entryDate)}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {chequeCell(linkedInstrument, isPayment ? paymentMethodOf(e) : "")}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <span
                          className={`text-sm ${isPayment ? "font-medium text-emerald-800 dark:text-emerald-300" : ""}`}
                        >
                          {rowDetail(e)}
                        </span>
                      </TableCell>
                      <TableCell className="font-data text-end whitespace-nowrap">
                        {row.debit > 0 ? formatMoney(row.debit) : "—"}
                      </TableCell>
                      <TableCell
                        className={`font-data text-end whitespace-nowrap ${
                          row.credit > 0
                            ? "font-semibold text-emerald-700 dark:text-emerald-400"
                            : ""
                        }`}
                      >
                        {row.credit > 0 ? formatMoney(row.credit) : "—"}
                      </TableCell>
                      <TableCell
                        className={`font-data text-end whitespace-nowrap font-medium ${baqayaClass(row.baqaya) || ""}`}
                      >
                        {formatBaqaya(row.baqaya)}
                      </TableCell>
                      <TableCell
                        className="text-end"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            title={t("common.edit")}
                            aria-label={t("common.edit")}
                            onClick={() => openEdit(e)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="destructive"
                            title={t("common.delete")}
                            aria-label={t("common.delete")}
                            onClick={() => void deleteDirect(e)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-semibold">
                    {t("customerDetail.totals")}
                  </TableCell>
                  <TableCell className="font-data text-end text-base font-semibold whitespace-nowrap">
                    {formatMoney(totals.totalDebit)}
                  </TableCell>
                  <TableCell className="font-data text-end text-base font-semibold whitespace-nowrap">
                    {formatMoney(totals.totalCredit)}
                  </TableCell>
                  <TableCell
                    className={`font-data text-end text-base font-semibold whitespace-nowrap ${baqayaClass(totals.closing) || ""}`}
                  >
                    {formatBaqaya(totals.closing)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {editing?.type === "payment"
                ? t("customerDetail.editPayment")
                : t("customerDetail.editPreviousPending")}
            </DialogTitle>
            <DialogDescription>
              {editing ? rowDetail(editing) : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("exp.amount")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="h-11 text-base"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("common.date")}</Label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("exp.noteOptional")}</Label>
              <Input
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || saving}
              onClick={() => void removeEntry()}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("common.delete")}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                {t("sal.cancel")}
              </Button>
              <Button
                type="button"
                disabled={saving || deleting}
                onClick={() => void saveEdit()}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("common.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={receiveOpen}
        onOpenChange={(open) => {
          setReceiveOpen(open);
          if (!open) setReceiving(null);
        }}
      >
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("customerDetail.receiveTitle")}</DialogTitle>
            <DialogDescription>
              {receiving
                ? `${receiving.kind === "cheque" ? t("customerDetail.kindCheque") : t("customerDetail.kindPromise")} · ${formatMoney(receiving.amount)} · ${formatDate(receiving.dueDate)}`
                : t("customerDetail.receiveDesc")}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("customerDetail.receiveDesc")}</p>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("common.date")}</Label>
              <Input
                type="date"
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("common.method")}</Label>
              <select
                className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                value={receiveMethod}
                onChange={(e) => setReceiveMethod(e.target.value)}
              >
                <option value="cash">{t("common.cash")}</option>
                <option value="cheque">{t("common.cheque")}</option>
                <option value="online">{t("common.online")}</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReceiveOpen(false)}>
              {t("sal.cancel")}
            </Button>
            <Button type="button" disabled={receiveBusy} onClick={() => void receiveNow()}>
              {receiveBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("customerDetail.receiveNow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editInstOpen}
        onOpenChange={(open) => {
          setEditInstOpen(open);
          if (!open) setEditingInst(null);
        }}
      >
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("customerDetail.editChequePromise")}</DialogTitle>
            <DialogDescription>{t("customerDetail.chequePromiseDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex h-9 overflow-hidden rounded-lg border border-input">
              <button
                type="button"
                className={`flex-1 px-3 text-sm ${instKind === "cheque" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                onClick={() => setInstKind("cheque")}
              >
                {t("customerDetail.kindCheque")}
              </button>
              <button
                type="button"
                className={`flex-1 px-3 text-sm ${instKind === "promise" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                onClick={() => setInstKind("promise")}
              >
                {t("customerDetail.kindPromise")}
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("exp.amount")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={instAmount}
                onChange={(e) => setInstAmount(e.target.value)}
                className="h-11 text-base"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("common.date")}</Label>
              <Input
                type="date"
                value={instRecorded}
                onChange={(e) => setInstRecorded(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("customerDetail.dueDate")}</Label>
              <Input
                type="date"
                value={instDue}
                onChange={(e) => setInstDue(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("exp.noteOptional")}</Label>
              <Input
                value={instNote}
                onChange={(e) => setInstNote(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditInstOpen(false)}>
              {t("sal.cancel")}
            </Button>
            <Button type="button" disabled={instBusy} onClick={() => void saveInstrument()}>
              {instBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
