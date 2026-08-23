function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthKey(day) {
  return String(day || "").slice(0, 7);
}

function byDateThenId(a, b) {
  return a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id));
}

/**
 * Each payment first covers this calendar month's invoices, then older invoices,
 * then previous-pending adjustments, then any newer invoices (leftover credit).
 */
function allocateThisMonthFirst(chargesInput, paymentsInput) {
  const charges = (chargesInput || []).map((c) => {
    const date = dayKey(c.date);
    const amount = roundMoney(c.amount);
    return {
      ...c,
      id: String(c.id),
      date,
      month: monthKey(date),
      kind: c.kind === "adjustment" ? "adjustment" : "invoice",
      amount,
      paid: 0,
      remaining: amount,
    };
  });

  const payments = (paymentsInput || [])
    .map((p) => ({
      id: String(p.id || p.date || ""),
      date: dayKey(p.date),
      amount: roundMoney(p.amount),
    }))
    .filter((p) => p.amount > 0.001 && p.date)
    .sort(byDateThenId);

  charges.sort(byDateThenId);

  for (const payment of payments) {
    let left = payment.amount;
    if (left <= 0) continue;
    const month = monthKey(payment.date);
    const open = charges.filter((c) => c.remaining > 0.001);
    const invoices = open.filter((c) => c.kind !== "adjustment");
    const sameMonth = invoices.filter((c) => c.month === month).sort(byDateThenId);
    const older = invoices.filter((c) => c.month < month).sort(byDateThenId);
    const newer = invoices.filter((c) => c.month > month).sort(byDateThenId);
    const adjustments = open.filter((c) => c.kind === "adjustment").sort(byDateThenId);

    for (const c of [...sameMonth, ...older, ...adjustments, ...newer]) {
      if (left <= 0) break;
      const take = Math.min(c.remaining, left);
      c.paid = roundMoney(c.paid + take);
      c.remaining = roundMoney(c.remaining - take);
      left = roundMoney(left - take);
    }
  }

  return charges;
}

function paidById(allocated) {
  const map = new Map();
  for (const c of allocated) map.set(c.id, roundMoney(c.paid || 0));
  return map;
}

module.exports = {
  roundMoney,
  dayKey,
  monthKey,
  allocateThisMonthFirst,
  paidById,
};
