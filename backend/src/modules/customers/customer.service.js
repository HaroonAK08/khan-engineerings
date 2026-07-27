const Customer = require("./customer.model");
const CustomerLedgerEntry = require("./customer-ledger.model");
const CustomerPayment = require("./customer-payment.model");
const Builty = require("../builty/builty.model");

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function create(data) {
  const name = data.name?.trim();
  if (!name) throw httpError("Name is required", 400);
  return Customer.create({
    name,
    phone: data.phone?.trim() || "",
    email: data.email?.trim().toLowerCase() || "",
    city: data.city?.trim() || "",
    address: data.address?.trim() || "",
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
      { email: new RegExp(term, "i") },
    ];
  }
  return Customer.find(filter).sort({ name: 1 });
}

async function getById(id) {
  const customer = await Customer.findById(id);
  if (!customer) throw httpError("Customer not found", 404);
  return customer;
}

async function getBalance(customerId) {
  const entries = await CustomerLedgerEntry.find({ customer: customerId });
  let balance = 0;
  for (const e of entries) {
    if (e.type === "invoice") balance += e.amount;
    else if (e.type === "payment") balance -= e.amount;
    else if (e.type === "adjustment") balance += e.signedAmount ?? 0;
  }
  return Math.round(balance * 100) / 100;
}

async function getWithBalance(id) {
  const customer = await getById(id);
  const balance = await getBalance(id);
  const [builtyStats, previousPendingAgg, paidAgg] = await Promise.all([
    Builty.aggregate([
      { $match: { customer: customer._id } },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          totalSales: { $sum: "$totalAmount" },
        },
      },
    ]),
    CustomerLedgerEntry.aggregate([
      {
        $match: {
          customer: customer._id,
          type: "adjustment",
          signedAmount: { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: "$signedAmount" } } },
    ]),
    CustomerLedgerEntry.aggregate([
      { $match: { customer: customer._id, type: "payment" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);
  const previousPending = roundMoney(previousPendingAgg[0]?.total || 0);
  const totalPaid = roundMoney(paidAgg[0]?.total || 0);
  const totalSales = roundMoney(builtyStats[0]?.totalSales || 0);
  return {
    customer,
    balance,
    previousPending,
    stats: {
      orderCount: builtyStats[0]?.orderCount || 0,
      totalSales,
      totalPaid,
      totalDue: roundMoney(previousPending + totalSales),
    },
  };
}

async function listLedger(customerId) {
  await getById(customerId);
  const entries = await CustomerLedgerEntry.find({ customer: customerId })
    .populate("builty", "builtyNo billNo")
    .populate("payment", "amount method")
    .sort({ entryDate: -1, createdAt: -1 });
  const balance = await getBalance(customerId);
  return { entries, balance };
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function parseDate(value, label = "Date") {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw httpError(`${label} is invalid`, 400);
  return d;
}

async function recordAdjustment(customerId, { amount, entryDate, notes }) {
  await getById(customerId);
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) {
    throw httpError("Adjustment amount must be non-zero", 400);
  }

  const signed = roundMoney(n);
  const entry = await CustomerLedgerEntry.create({
    customer: customerId,
    type: "adjustment",
    amount: Math.abs(signed),
    signedAmount: signed,
    builty: null,
    entryDate: parseDate(entryDate || new Date(), "Entry date"),
    notes: notes?.trim() || "Previous pending",
  });

  return getWithBalance(customerId).then(async (detail) => {
    const builtyService = require("../builty/builty.service");
    await builtyService.syncCustomerBuiltyPaymentStatuses(customerId);
    return {
      entry,
      balance: detail.balance,
      previousPending: detail.previousPending,
      stats: detail.stats,
    };
  });
}

async function recordPayment(customerId, { amount, paymentDate, method, notes, reference }) {
  await getById(customerId);
  const n = roundMoney(Number(amount));
  if (!Number.isFinite(n) || n <= 0) {
    throw httpError("Payment amount must be greater than 0", 400);
  }

  const allowed = new Set(["cash", "cheque", "online", "bank", "other"]);
  const payMethod = allowed.has(method) ? method : "cash";
  const date = parseDate(paymentDate || new Date(), "Payment date");

  const payment = await CustomerPayment.create({
    customer: customerId,
    builty: null,
    amount: n,
    paymentDate: date,
    method: payMethod,
    reference: reference?.trim() || "",
    notes: notes?.trim() || "Party payment",
  });

  await CustomerLedgerEntry.create({
    customer: customerId,
    type: "payment",
    amount: n,
    builty: null,
    payment: payment._id,
    entryDate: date,
    notes: payment.notes || `Payment ${payment._id}`,
  });

  const builtyService = require("../builty/builty.service");
  await builtyService.syncCustomerBuiltyPaymentStatuses(customerId);

  const detail = await getWithBalance(customerId);
  return {
    payment,
    balance: detail.balance,
    previousPending: detail.previousPending,
    stats: detail.stats,
  };
}

async function update(id, data) {
  const customer = await getById(id);
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw httpError("Name is required", 400);
    customer.name = name;
  }
  if (data.phone !== undefined) customer.phone = data.phone.trim();
  if (data.email !== undefined) customer.email = data.email.trim().toLowerCase();
  if (data.city !== undefined) customer.city = data.city.trim();
  if (data.address !== undefined) customer.address = data.address.trim();
  if (data.notes !== undefined) customer.notes = data.notes.trim();
  if (data.isActive !== undefined) customer.isActive = Boolean(data.isActive);
  await customer.save();
  return customer;
}

async function remove(id) {
  const customer = await getById(id);
  const builtyCount = await Builty.countDocuments({ customer: id });
  if (builtyCount > 0) {
    throw httpError("Cannot delete party with builties. Deactivate instead.", 409);
  }
  await CustomerLedgerEntry.deleteMany({ customer: id });
  await customer.deleteOne();
  return { ok: true };
}

module.exports = {
  create,
  list,
  getById,
  getWithBalance,
  getBalance,
  listLedger,
  recordAdjustment,
  recordPayment,
  update,
  remove,
};
