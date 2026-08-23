import type { CustomerLedgerEntry } from "@/lib/sales-api";
import { toDateInput } from "@/lib/date-range";

type PendingLedgerEntry = {
  _id: string;
  type: string;
  amount: number;
  signedAmount?: number | null;
  entryDate: string;
  notes?: string;
  builty?: CustomerLedgerEntry["builty"];
  purchase?:
    | string
    | null
    | {
        _id?: string;
        invoiceNo?: string;
        totalAmount?: number;
        freightAmount?: number;
        purchaseDate?: string;
      };
};

export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export type PendingCharge = {
  id: string;
  date: string;
  month: string;
  amount: number;
  paid: number;
  remaining: number;
  kind: "invoice" | "adjustment";
  label: string;
  href?: string;
};

export type MonthPending = {
  month: string;
  sale: number;
  paid: number;
  remaining: number;
  lines: PendingCharge[];
};

export type PeriodPending = {
  previousRemaining: number;
  periodSale: number;
  periodPaid: number;
  periodRemaining: number;
  totalRemaining: number;
  months: MonthPending[];
  leftoverLines: PendingCharge[];
};

function dayKey(value: string) {
  return toDateInput(new Date(value));
}

function monthKey(day: string) {
  return day.slice(0, 7);
}

function chargeAmount(entry: PendingLedgerEntry) {
  if (entry.type === "payment") return 0;
  if (entry.type === "adjustment") {
    const signed = entry.signedAmount ?? 0;
    return signed > 0 ? roundMoney(signed) : 0;
  }
  if (entry.type === "purchase") {
    const purchase = entry.purchase && typeof entry.purchase === "object" ? entry.purchase : null;
    if (purchase) {
      return roundMoney((purchase.totalAmount || 0) + (purchase.freightAmount || 0));
    }
    return roundMoney(entry.amount || 0);
  }
  const builty = entry.builty && typeof entry.builty === "object" ? entry.builty : null;
  return roundMoney(builty?.totalAmount ?? entry.amount ?? 0);
}

function paymentAmount(entry: PendingLedgerEntry) {
  if (entry.type === "payment") return roundMoney(entry.amount || 0);
  if (entry.type === "adjustment") {
    const signed = entry.signedAmount ?? 0;
    return signed < 0 ? roundMoney(Math.abs(signed)) : 0;
  }
  return 0;
}

function chargeLabel(entry: PendingLedgerEntry) {
  if (entry.type === "adjustment") return entry.notes?.trim() || "Previous pending";
  if (entry.type === "purchase") {
    const purchase = entry.purchase && typeof entry.purchase === "object" ? entry.purchase : null;
    return purchase?.invoiceNo || "Purchase";
  }
  const builty = entry.builty && typeof entry.builty === "object" ? entry.builty : null;
  return builty?.builtyNo || "Builty";
}

function chargeHref(entry: PendingLedgerEntry) {
  const builty = entry.builty && typeof entry.builty === "object" ? entry.builty : null;
  return builty?._id ? `/dashboard/builty/${builty._id}` : undefined;
}

function applyPay(charges: PendingCharge[], payment: { date: string; amount: number }) {
  let left = roundMoney(payment.amount);
  if (left <= 0) return;

  const month = monthKey(payment.date);
  const open = charges.filter((c) => c.remaining > 0.001);
  const invoices = open.filter((c) => c.kind !== "adjustment");
  const sameMonth = invoices
    .filter((c) => c.month === month)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const older = invoices
    .filter((c) => c.month < month)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const newer = invoices
    .filter((c) => c.month > month)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const adjustments = open
    .filter((c) => c.kind === "adjustment")
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  for (const c of [...sameMonth, ...older, ...adjustments, ...newer]) {
    if (left <= 0) break;
    const take = Math.min(c.remaining, left);
    c.paid = roundMoney(c.paid + take);
    c.remaining = roundMoney(c.remaining - take);
    left = roundMoney(left - take);
  }
}

export function allocatePartyPending(entries: PendingLedgerEntry[]): PendingCharge[] {
  const charges: PendingCharge[] = [];
  const payments: Array<{ date: string; amount: number; id: string }> = [];

  for (const entry of entries) {
    const date = dayKey(entry.entryDate);
    const debit = chargeAmount(entry);
    const credit = paymentAmount(entry);
    if (debit > 0.001) {
      charges.push({
        id: entry._id,
        date,
        month: monthKey(date),
        amount: debit,
        paid: 0,
        remaining: debit,
        kind: entry.type === "adjustment" ? "adjustment" : "invoice",
        label: chargeLabel(entry),
        href: chargeHref(entry),
      });
    }
    if (credit > 0.001) {
      payments.push({ id: entry._id, date, amount: credit });
    }
  }

  charges.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  payments.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const payment of payments) applyPay(charges, payment);
  return charges;
}

export function computePeriodPending(
  entries: PendingLedgerEntry[],
  dateFrom?: string,
  dateTo?: string
): PeriodPending {
  const allocated = allocatePartyPending(entries);
  const from = dateFrom || "0000-01-01";
  const to = dateTo || "9999-12-31";

  const inRange = (day: string) => day >= from && day <= to;

  const periodSale = roundMoney(
    allocated.filter((c) => inRange(c.date)).reduce((s, c) => s + c.amount, 0)
  );
  const periodRemaining = roundMoney(
    allocated.filter((c) => inRange(c.date)).reduce((s, c) => s + c.remaining, 0)
  );
  const previousRemaining = roundMoney(
    allocated.filter((c) => c.date < from).reduce((s, c) => s + c.remaining, 0)
  );
  const totalRemaining = roundMoney(allocated.reduce((s, c) => s + c.remaining, 0));

  const periodPaid = roundMoney(
    entries.reduce((sum, entry) => {
      const day = dayKey(entry.entryDate);
      if (!inRange(day)) return sum;
      return roundMoney(sum + paymentAmount(entry));
    }, 0)
  );

  const byMonth = new Map<string, MonthPending>();
  for (const line of allocated) {
    const row = byMonth.get(line.month) || {
      month: line.month,
      sale: 0,
      paid: 0,
      remaining: 0,
      lines: [],
    };
    row.sale = roundMoney(row.sale + line.amount);
    row.paid = roundMoney(row.paid + line.paid);
    row.remaining = roundMoney(row.remaining + line.remaining);
    row.lines.push(line);
    byMonth.set(line.month, row);
  }

  const months = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
  const leftoverLines = allocated
    .filter((c) => c.remaining > 0.001)
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  return {
    previousRemaining,
    periodSale,
    periodPaid,
    periodRemaining,
    totalRemaining,
    months,
    leftoverLines,
  };
}

export function prefixPendingParty(snapshot: PeriodPending, partyName: string): PeriodPending {
  const tag = (line: PendingCharge) => ({
    ...line,
    label: `${partyName} · ${line.label}`,
  });
  return {
    ...snapshot,
    leftoverLines: snapshot.leftoverLines.map(tag),
    months: snapshot.months.map((m) => ({
      ...m,
      lines: m.lines.map(tag),
    })),
  };
}

export function mergePeriodPending(snapshots: PeriodPending[]): PeriodPending {
  const months = new Map<string, MonthPending>();
  let previousRemaining = 0;
  let periodSale = 0;
  let periodPaid = 0;
  let periodRemaining = 0;
  let totalRemaining = 0;
  const leftoverLines: PendingCharge[] = [];

  for (const snap of snapshots) {
    previousRemaining = roundMoney(previousRemaining + snap.previousRemaining);
    periodSale = roundMoney(periodSale + snap.periodSale);
    periodPaid = roundMoney(periodPaid + snap.periodPaid);
    periodRemaining = roundMoney(periodRemaining + snap.periodRemaining);
    totalRemaining = roundMoney(totalRemaining + snap.totalRemaining);
    leftoverLines.push(...snap.leftoverLines);
    for (const m of snap.months) {
      const row = months.get(m.month) || {
        month: m.month,
        sale: 0,
        paid: 0,
        remaining: 0,
        lines: [],
      };
      row.sale = roundMoney(row.sale + m.sale);
      row.paid = roundMoney(row.paid + m.paid);
      row.remaining = roundMoney(row.remaining + m.remaining);
      row.lines.push(...m.lines);
      months.set(m.month, row);
    }
  }

  leftoverLines.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return {
    previousRemaining,
    periodSale,
    periodPaid,
    periodRemaining,
    totalRemaining,
    months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)),
    leftoverLines,
  };
}

export function formatMonthLabel(month: string, locale: string) {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString(locale === "ur" ? "ur-PK" : "en-GB", {
    month: "long",
    year: "numeric",
  });
}
