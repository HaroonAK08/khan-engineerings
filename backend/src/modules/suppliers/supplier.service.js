const Supplier = require("./supplier.model");
const LedgerEntry = require("../ledger/ledger.model");

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function create(data) {
  const name = data.name?.trim();
  if (!name) throw httpError("Name is required", 400);

  const supplier = await Supplier.create({
    name,
    nameUr: data.nameUr?.trim() || "",
    phone: data.phone?.trim() || "",
    email: data.email?.trim().toLowerCase() || "",
    address: data.address?.trim() || "",
    notes: data.notes?.trim() || "",
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
  });
  return supplier;
}

async function list({ q, active } = {}) {
  const filter = {};
  if (active === "true" || active === true) filter.isActive = true;
  if (active === "false" || active === false) filter.isActive = false;
  if (q?.trim()) {
    const term = q.trim();
    filter.$or = [
      { name: new RegExp(term, "i") },
      { nameUr: new RegExp(term, "i") },
      { phone: new RegExp(term, "i") },
      { email: new RegExp(term, "i") },
    ];
  }
  return Supplier.find(filter).sort({ name: 1 });
}

async function getById(id) {
  const supplier = await Supplier.findById(id);
  if (!supplier) throw httpError("Supplier not found", 404);
  return supplier;
}

async function getBalance(supplierId) {
  const entries = await LedgerEntry.find({ supplier: supplierId });
  let balance = 0;
  for (const e of entries) {
    if (e.type === "purchase") balance += e.amount;
    else if (e.type === "payment") balance -= e.amount;
    else if (e.type === "adjustment") balance += e.signedAmount ?? 0;
  }
  return Math.round(balance * 100) / 100;
}

async function getWithBalance(id) {
  const supplier = await getById(id);
  const balance = await getBalance(id);
  return { supplier, balance };
}

async function update(id, data) {
  const supplier = await getById(id);
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw httpError("Name is required", 400);
    supplier.name = name;
  }
  if (data.nameUr !== undefined) supplier.nameUr = data.nameUr.trim();
  if (data.phone !== undefined) supplier.phone = data.phone.trim();
  if (data.email !== undefined) supplier.email = data.email.trim().toLowerCase();
  if (data.address !== undefined) supplier.address = data.address.trim();
  if (data.notes !== undefined) supplier.notes = data.notes.trim();
  if (data.isActive !== undefined) supplier.isActive = Boolean(data.isActive);
  await supplier.save();
  return supplier;
}

async function remove(id) {
  const supplier = await getById(id);
  const purchaseCount = await require("../purchases/purchase.model").countDocuments({
    supplier: id,
  });
  if (purchaseCount > 0) {
    throw httpError("Cannot delete supplier with purchases. Deactivate instead.", 409);
  }
  await LedgerEntry.deleteMany({ supplier: id });
  await supplier.deleteOne();
  return { ok: true };
}

module.exports = { create, list, getById, getWithBalance, getBalance, update, remove };
