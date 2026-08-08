const AppSetting = require("./settings.model");

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
};
