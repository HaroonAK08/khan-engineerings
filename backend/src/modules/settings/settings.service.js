const AppSetting = require("./settings.model");
const { startOfLocalDay, parseEffectiveFrom } = require("../../utils/product-weight");

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseDate(value, label = "Date") {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw httpError(`${label} is invalid`, 400);
  return d;
}

function isMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(String(value || "").trim());
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function monthKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function endOfDay(d) {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

async function getAppSettings() {
  let doc = await AppSetting.findOne({ key: "app" });
  if (!doc) {
    doc = await AppSetting.create({ key: "app", payrollPeriods: [] });
  }
  return doc;
}

async function listPayrollPeriods() {
  const doc = await getAppSettings();
  return [...(doc.payrollPeriods || [])].sort((a, b) => b.month.localeCompare(a.month));
}

async function getPayrollPeriod(month) {
  if (!isMonthKey(month)) return null;
  const doc = await getAppSettings();
  return (doc.payrollPeriods || []).find((p) => p.month === month) || null;
}

/**
 * When report from/to fall in one calendar month and a payroll window is saved,
 * salaries use that window; otherwise use the report dates.
 */
async function resolveSalaryBounds(from, to) {
  const month = monthKeyFromDate(from);
  if (month !== monthKeyFromDate(to)) {
    return { from, to, month: null, custom: false, period: null };
  }
  const period = await getPayrollPeriod(month);
  if (!period?.paymentFrom || !period?.paymentTo) {
    return { from, to, month, custom: false, period: null };
  }
  const salaryFrom = parseDate(period.paymentFrom, "paymentFrom");
  const salaryTo = endOfDay(parseDate(period.paymentTo, "paymentTo"));
  return {
    from: salaryFrom,
    to: salaryTo,
    month,
    custom: true,
    period: {
      month: period.month,
      paymentFrom: period.paymentFrom,
      paymentTo: period.paymentTo,
    },
  };
}

/**
 * Mongo $match for BatchExpense: non-salary on calendar range, salaries on payroll window.
 */
function expenseMatchWithSalaryWindow(from, to, salaryFrom, salaryTo) {
  const same =
    from.getTime() === salaryFrom.getTime() && to.getTime() === salaryTo.getTime();
  if (same) {
    return { expenseDate: { $gte: from, $lte: to } };
  }
  return {
    $or: [
      {
        category: { $ne: "fixed_salary" },
        expenseDate: { $gte: from, $lte: to },
      },
      {
        category: "fixed_salary",
        expenseDate: { $gte: salaryFrom, $lte: salaryTo },
      },
    ],
  };
}

async function upsertPayrollPeriod({ month, paymentFrom, paymentTo }) {
  const m = String(month || "").trim();
  const fromStr = String(paymentFrom || "").trim();
  const toStr = String(paymentTo || "").trim();
  if (!isMonthKey(m)) throw httpError("Month must be YYYY-MM", 400);
  if (!isDateKey(fromStr)) throw httpError("paymentFrom must be YYYY-MM-DD", 400);
  if (!isDateKey(toStr)) throw httpError("paymentTo must be YYYY-MM-DD", 400);
  const from = parseDate(fromStr, "paymentFrom");
  const to = parseDate(toStr, "paymentTo");
  if (to < from) throw httpError("paymentTo must be on or after paymentFrom", 400);

  const doc = await getAppSettings();
  const periods = [...(doc.payrollPeriods || [])];
  const idx = periods.findIndex((p) => p.month === m);
  const entry = { month: m, paymentFrom: fromStr, paymentTo: toStr };
  if (idx >= 0) periods[idx] = entry;
  else periods.push(entry);
  doc.payrollPeriods = periods;
  await doc.save();
  return entry;
}

function defaultWastePercent() {
  return 6;
}

function wasteSnapshot(doc) {
  return {
    hubPercent: Number(doc.wasteHubPercent) || defaultWastePercent(),
    drumPercent: Number(doc.wasteDrumPercent) || defaultWastePercent(),
    hubEffectiveFrom: doc.wasteHubFrom || null,
    drumEffectiveFrom: doc.wasteDrumFrom || null,
    history: (doc.wasteHistory || []).map((row) => ({
      family: row.family,
      percent: Number(row.percent),
      previousPercent: row.previousPercent == null ? null : Number(row.previousPercent),
      effectiveFrom: row.effectiveFrom,
      changedAt: row.changedAt,
    })),
  };
}

function resolveWastePercent(settings, family, asOfDate) {
  const fallback =
    family === "drum"
      ? Number(settings.drumPercent) || defaultWastePercent()
      : Number(settings.hubPercent) || defaultWastePercent();
  const history = (settings.history || [])
    .filter((row) => row.family === family)
    .sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom));
  if (!asOfDate || history.length === 0) return fallback;
  const t = startOfLocalDay(asOfDate)?.getTime();
  if (t == null) return fallback;
  const first = history[0];
  const firstAt = startOfLocalDay(first.effectiveFrom)?.getTime() || 0;
  if (t < firstAt) {
    const prev = Number(first.previousPercent);
    return Number.isFinite(prev) ? prev : defaultWastePercent();
  }
  let percent = fallback;
  for (const row of history) {
    const at = startOfLocalDay(row.effectiveFrom)?.getTime();
    if (at != null && t >= at) percent = Number(row.percent);
  }
  return Number.isFinite(percent) ? percent : defaultWastePercent();
}

async function getWasteSettings() {
  const doc = await getAppSettings();
  return wasteSnapshot(doc);
}

async function getWastePercentFor(family, asOfDate) {
  if (family !== "hub" && family !== "drum") {
    throw httpError("Family must be hub or drum", 400);
  }
  const settings = await getWasteSettings();
  return resolveWastePercent(settings, family, asOfDate || new Date());
}

async function setWastePercent({ family, percent, effectiveFrom }) {
  if (family !== "hub" && family !== "drum") {
    throw httpError("Family must be hub or drum", 400);
  }
  const next = Number(percent);
  if (!Number.isFinite(next) || next < 0 || next >= 100) {
    throw httpError("Waste % must be between 0 and 99", 400);
  }
  const from = parseEffectiveFrom(effectiveFrom, "Waste from date");
  const doc = await getAppSettings();
  const previous =
    family === "drum" ? Number(doc.wasteDrumPercent) || defaultWastePercent() : Number(doc.wasteHubPercent) || defaultWastePercent();

  if (family === "drum") {
    doc.wasteDrumPercent = next;
    doc.wasteDrumFrom = from;
  } else {
    doc.wasteHubPercent = next;
    doc.wasteHubFrom = from;
  }
  doc.wasteHistory = [
    ...(doc.wasteHistory || []),
    {
      family,
      percent: next,
      previousPercent: previous,
      effectiveFrom: from,
      changedAt: new Date(),
    },
  ].slice(-80);
  await doc.save();

  const productionService = require("../production/production.service");
  const applied = await productionService.applyFamilyWasteFromDate(family, next, from);
  return { settings: wasteSnapshot(doc), applied };
}

async function deletePayrollPeriod(month) {
  const m = String(month || "").trim();
  if (!isMonthKey(m)) throw httpError("Month must be YYYY-MM", 400);
  const doc = await getAppSettings();
  doc.payrollPeriods = (doc.payrollPeriods || []).filter((p) => p.month !== m);
  await doc.save();
  return { deleted: true, month: m };
}

module.exports = {
  listPayrollPeriods,
  getPayrollPeriod,
  resolveSalaryBounds,
  expenseMatchWithSalaryWindow,
  upsertPayrollPeriod,
  deletePayrollPeriod,
  monthKeyFromDate,
  getWasteSettings,
  getWastePercentFor,
  resolveWastePercent,
  setWastePercent,
};
