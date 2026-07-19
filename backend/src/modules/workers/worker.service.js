const Worker = require("./worker.model");
const BatchExpense = require("../expenses/expense.model");

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function parseDate(value, label = "Date") {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw httpError(`${label} is invalid`, 400);
  return d;
}

const PAY_TYPE_LABEL = {
  weekly: "Weekly",
  monthly: "Monthly",
  per_unit: "Per unit",
};

const PAY_DAY_LABEL = {
  monday: "Monday",
  thursday: "Thursday",
};

function resolvePayType(value) {
  if (value === "weekly" || value === "monthly" || value === "per_unit") return value;
  return null;
}

async function list({ active } = {}) {
  const filter = {};
  if (active === "true") filter.isActive = true;
  if (active === "false") filter.isActive = false;
  return Worker.find(filter).sort({ isActive: -1, name: 1 });
}

async function getOne(id) {
  const worker = await Worker.findById(id);
  if (!worker) throw httpError("Worker not found", 404);
  return worker;
}

function validateWorkerBody(data, { partial = false } = {}) {
  const out = {};

  if (data.name !== undefined || !partial) {
    const name = String(data.name || "").trim();
    if (!name) throw httpError("Name is required", 400);
    out.name = name;
  }

  if (data.payType !== undefined) {
    if (data.payType === null || data.payType === "") {
      out.payType = null;
    } else {
      const payType = resolvePayType(data.payType);
      if (!payType) throw httpError("Pay type must be weekly, monthly, or per unit", 400);
      out.payType = payType;
    }
  }

  if (data.rate !== undefined) {
    if (data.rate === null || data.rate === "") {
      out.rate = null;
    } else {
      const rate = Number(data.rate);
      if (!Number.isFinite(rate) || rate < 0) throw httpError("Rate must be 0 or more", 400);
      out.rate = roundMoney(rate);
    }
  }

  if (data.unitLabel !== undefined) {
    out.unitLabel = String(data.unitLabel || "piece").trim() || "piece";
  }

  if (data.payDays !== undefined) {
    const days = Array.isArray(data.payDays) ? data.payDays : [];
    const valid = days.filter((d) => d === "monday" || d === "thursday");
    out.payDays = valid.length ? valid : ["monday", "thursday"];
  }

  if (data.job !== undefined) out.job = String(data.job || "").trim();
  if (data.notes !== undefined) out.notes = String(data.notes || "").trim();
  if (data.isActive !== undefined) out.isActive = Boolean(data.isActive);

  return out;
}

async function create(data) {
  const fields = validateWorkerBody(data);
  if (!fields.unitLabel) fields.unitLabel = "piece";
  if (!fields.payDays) fields.payDays = ["monday", "thursday"];
  return Worker.create(fields);
}

async function update(id, data) {
  const worker = await getOne(id);
  const fields = validateWorkerBody(data, { partial: true });
  Object.assign(worker, fields);
  await worker.save();
  return worker;
}

async function remove(id) {
  const worker = await getOne(id);
  worker.isActive = false;
  await worker.save();
  return worker;
}

/**
 * Record a salary payment → factory expense (batch null).
 * Pay type + amount are chosen per payment (not locked on the worker).
 * expenseDate is required so every pay is dated in history.
 */
async function pay(id, data) {
  const worker = await getOne(id);
  if (!worker.isActive) throw httpError("Worker is inactive", 400);

  if (!data.expenseDate) throw httpError("Pay date is required", 400);
  const expenseDate = parseDate(data.expenseDate, "Pay date");

  const payType = resolvePayType(data.payType) || resolvePayType(worker.payType);
  if (!payType) {
    throw httpError("Select pay type: weekly, monthly, or per unit", 400);
  }

  let amount;
  let units = null;
  const noteParts = [worker.name, PAY_TYPE_LABEL[payType]];

  if (payType === "per_unit") {
    units = Number(data.units);
    if (!Number.isFinite(units) || units <= 0) {
      throw httpError("Enter how many units were made", 400);
    }
    const unitRate =
      data.unitRate != null
        ? Number(data.unitRate)
        : data.amount != null
          ? Number(data.amount) / units
          : worker.rate;
    amount = data.amount != null ? Number(data.amount) : units * Number(unitRate);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw httpError("Amount must be greater than 0", 400);
    }
    const unitLabel = worker.unitLabel || "piece";
    noteParts.push(`${units} ${unitLabel} × ${roundMoney(amount / units)}`);
  } else {
    amount = data.amount != null ? Number(data.amount) : null;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw httpError("Enter the amount for this pay", 400);
    }
    if (payType === "weekly") {
      const payDay =
        data.payDay === "thursday" ? "thursday" : data.payDay === "monday" ? "monday" : null;
      if (payDay) noteParts.push(PAY_DAY_LABEL[payDay]);
      else noteParts.push("week");
    } else {
      noteParts.push("month");
    }
  }

  if (data.notes?.trim()) noteParts.push(data.notes.trim());

  const expense = await BatchExpense.create({
    batch: null,
    stage: null,
    category: "fixed_salary",
    amount: roundMoney(amount),
    expenseDate,
    notes: noteParts.join(" · "),
    worker: worker._id,
    units,
    payType,
  });

  // Remember last style/amount as a suggestion for next time — not a fixed salary.
  worker.payType = payType;
  if (payType === "per_unit" && units > 0) {
    worker.rate = roundMoney(amount / units);
  } else {
    worker.rate = roundMoney(amount);
  }
  await worker.save();

  return { expense, worker };
}

async function listPayments({ dateFrom, dateTo, workerId } = {}) {
  const match = {
    category: "fixed_salary",
    worker: { $ne: null },
    $or: [{ batch: null }, { batch: { $exists: false } }],
  };
  if (workerId) match.worker = workerId;
  if (dateFrom || dateTo) {
    match.expenseDate = {};
    if (dateFrom) match.expenseDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      match.expenseDate.$lte = end;
    }
  }
  return BatchExpense.find(match)
    .populate("worker", "name payType rate job")
    .sort({ expenseDate: -1, createdAt: -1 });
}

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  pay,
  listPayments,
  PAY_TYPE_LABEL,
  PAY_DAY_LABEL,
};
