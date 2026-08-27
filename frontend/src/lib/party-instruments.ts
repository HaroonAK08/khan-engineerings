import { calendarDay, todayInput } from "@/lib/date-range";
import type { CustomerInstrument, CustomerLedgerEntry } from "@/lib/sales-api";

export function roundInstrumentMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function instrumentIsDue(dueDate: string, today = todayInput()) {
  const day = calendarDay(dueDate);
  return Boolean(day && day <= today);
}

export function instrumentIsOverdue(dueDate: string, today = todayInput()) {
  const day = calendarDay(dueDate);
  return Boolean(day && day < today);
}

export function ledgerPaymentId(entry: CustomerLedgerEntry) {
  if (!entry.payment) return "";
  return typeof entry.payment === "string" ? entry.payment : entry.payment._id;
}

export function summarizeInstruments(items: CustomerInstrument[]) {
  const pending = items.filter((i) => i.status === "pending");
  const cheque = pending.filter((i) => i.kind === "cheque");
  const promise = pending.filter((i) => i.kind === "promise");
  const due = pending.filter((i) => instrumentIsDue(i.dueDate));
  const sum = (list: CustomerInstrument[]) =>
    roundInstrumentMoney(list.reduce((s, i) => s + (i.amount || 0), 0));
  return {
    pending,
    due,
    chequeTotal: sum(cheque),
    promiseTotal: sum(promise),
    pendingTotal: sum(pending),
    dueTotal: sum(due),
    dueCount: due.length,
  };
}
