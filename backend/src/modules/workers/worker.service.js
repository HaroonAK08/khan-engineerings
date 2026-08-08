const Worker = require("./worker.model");
const BatchExpense = require("../expenses/expense.model");
const { EXPENSE_SCOPES } = require("./worker.model");

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

function resolvePayType(value) {
  if (value === "weekly" || value === "monthly" || value === "per_unit") return value;
  return null;
}

function resolveScope(value) {
  if (value === "hub" || value === "drum" || value === "common") return value;
  return null;
}

async function list({ active, scope } = {}) {
  const filter = {};
  if (active === "true") filter.isActive = true;
  if (active === "false") filter.isActive = false;
  if (scope && EXPENSE_SCOPES.includes(scope)) filter.scope = scope;
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

  if (data.nameUr !== undefined) {
    out.nameUr = String(data.nameUr || "").trim();
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

  if (data.scope !== undefined) {
    const scope = resolveScope(data.scope);
    if (!scope) throw httpError("Scope must be hub, drum, or common", 400);
    out.scope = scope;
  } else if (!partial) {
    out.scope = "common";
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
  if (!fields.scope) fields.scope = "common";
  return Worker.create(fields);
}

async function update(id, data) {
  const worker = await getOne(id);
  const fields = validateWorkerBody(data, { partial: true });
  const prevScope = resolveScope(worker.scope) || "common";
  Object.assign(worker, fields);
  await worker.save();
  const nextScope = resolveScope(worker.scope) || "common";
  if (nextScope !== prevScope || data.scope !== undefined) {
    await BatchExpense.updateMany(
      { worker: worker._id, category: "fixed_salary" },
      { $set: { scope: nextScope } }
    );
  }
  return worker;
}

async function remove(id) {
  const worker = await getOne(id);
  worker.isActive = false;
  await worker.save();
  return worker;
}

async function pay(id, data) {
  const worker = await getOne(id);
  if (!worker.isActive) throw httpError("Worker is inactive", 400);

  if (!data.expenseDate) throw httpError("Pay date is required", 400);
  const expenseDate = parseDate(data.expenseDate, "Pay date");

  const amount = data.amount != null ? Number(data.amount) : null;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError("Enter the amount for this pay", 400);
  }

  const note = data.notes?.trim() || "";
  const notes = note ? `${worker.name} · ${note}` : worker.name;
  const scope = resolveScope(worker.scope) || "common";

  const expense = await BatchExpense.create({
    batch: null,
    stage: null,
    category: "fixed_salary",
    amount: roundMoney(amount),
    expenseDate,
    notes,
    worker: worker._id,
    scope,
    units: null,
    payType: null,
  });

  return { expense, worker };
}

async function listPayments({ dateFrom, dateTo, workerId, scope } = {}) {
  const match = {
    category: "fixed_salary",
    worker: { $ne: null },
    $or: [{ batch: null }, { batch: { $exists: false } }],
  };
  if (workerId) match.worker = workerId;
  if (scope && EXPENSE_SCOPES.includes(scope)) {
    if (scope === "common") {
      match.$and = [
        {
          $or: [{ scope: "common" }, { scope: null }, { scope: { $exists: false } }],
        },
      ];
    } else {
      match.scope = scope;
    }
  }
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
    .populate("worker", "name nameUr payType rate job scope")
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
};
