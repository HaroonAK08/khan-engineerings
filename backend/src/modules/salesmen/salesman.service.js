const Salesman = require("./salesman.model");
const BatchExpense = require("../expenses/expense.model");

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

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function create(data) {
  const name = data.name?.trim();
  if (!name) throw httpError("Name is required", 400);
  return Salesman.create({
    name,
    phone: data.phone?.trim() || "",
    notes: data.notes?.trim() || "",
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
  });
}

async function list({ q, active } = {}) {
  const filter = {};
  if (active === "true" || active === true) filter.isActive = true;
  if (active === "false" || active === false) filter.isActive = false;
  if (q?.trim()) {
    const term = q.trim();
    filter.$or = [
      { name: new RegExp(term, "i") },
      { phone: new RegExp(term, "i") },
    ];
  }
  const salesmen = await Salesman.find(filter).sort({ name: 1 }).lean();
  if (salesmen.length === 0) return [];

  const ids = salesmen.map((s) => s._id);
  const paidAgg = await BatchExpense.aggregate([
    {
      $match: {
        category: "salesman_commission",
        salesman: { $in: ids },
        $or: [{ batch: null }, { batch: { $exists: false } }],
      },
    },
    { $group: { _id: "$salesman", totalPaid: { $sum: "$amount" } } },
  ]);
  const paidMap = new Map(
    paidAgg.map((r) => [String(r._id), roundMoney(r.totalPaid)])
  );

  return salesmen.map((s) => ({
    ...s,
    totalPaid: paidMap.get(String(s._id)) || 0,
  }));
}

async function getById(id) {
  const salesman = await Salesman.findById(id);
  if (!salesman) throw httpError("Salesman not found", 404);
  return salesman;
}

async function update(id, data) {
  const salesman = await getById(id);
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw httpError("Name is required", 400);
    salesman.name = name;
  }
  if (data.phone !== undefined) salesman.phone = data.phone.trim();
  if (data.notes !== undefined) salesman.notes = data.notes.trim();
  if (data.isActive !== undefined) salesman.isActive = Boolean(data.isActive);
  await salesman.save();
  return salesman;
}

async function remove(id) {
  const salesman = await getById(id);
  await salesman.deleteOne();
  return { ok: true };
}

/**
 * Record a payment to a salesman → factory expense (batch null).
 */
async function pay(id, data) {
  const salesman = await getById(id);
  if (!salesman.isActive) throw httpError("Salesman is inactive", 400);

  if (!data.expenseDate) throw httpError("Pay date is required", 400);
  const expenseDate = parseDate(data.expenseDate, "Pay date");

  const amount = data.amount != null ? Number(data.amount) : null;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError("Enter the amount for this pay", 400);
  }

  const note = data.notes?.trim() || "";
  const notes = note ? `${salesman.name} · ${note}` : salesman.name;

  const expense = await BatchExpense.create({
    batch: null,
    stage: null,
    category: "salesman_commission",
    amount: roundMoney(amount),
    expenseDate,
    notes,
    salesman: salesman._id,
    scope: "common",
  });

  return { expense, salesman };
}

async function listPayments({ dateFrom, dateTo, salesmanId } = {}) {
  const match = {
    category: "salesman_commission",
    salesman: { $ne: null },
    $or: [{ batch: null }, { batch: { $exists: false } }],
  };
  if (salesmanId) match.salesman = salesmanId;
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
    .populate("salesman", "name phone")
    .sort({ expenseDate: -1, createdAt: -1 });
}

module.exports = { create, list, getById, update, remove, pay, listPayments };
