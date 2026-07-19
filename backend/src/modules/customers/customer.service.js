const Customer = require("./customer.model");
const CustomerLedgerEntry = require("../orders/customer-ledger.model");
const SalesOrder = require("../orders/order.model");

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
  const orderStats = await SalesOrder.aggregate([
    { $match: { customer: customer._id, status: { $ne: "cancelled" } } },
    {
      $group: {
        _id: null,
        orderCount: { $sum: 1 },
        totalSales: { $sum: "$totalAmount" },
        totalPaid: { $sum: "$amountPaid" },
      },
    },
  ]);
  return {
    customer,
    balance,
    stats: orderStats[0] || { orderCount: 0, totalSales: 0, totalPaid: 0 },
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
  const orderCount = await SalesOrder.countDocuments({ customer: id });
  if (orderCount > 0) {
    throw httpError("Cannot delete customer with orders. Deactivate instead.", 409);
  }
  await CustomerLedgerEntry.deleteMany({ customer: id });
  await customer.deleteOne();
  return { ok: true };
}

module.exports = { create, list, getById, getWithBalance, getBalance, update, remove };
