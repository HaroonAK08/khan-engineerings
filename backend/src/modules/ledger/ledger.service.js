const LedgerEntry = require("./ledger.model");
const supplierService = require("../suppliers/supplier.service");

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

async function listBySupplier(supplierId, { dateFrom, dateTo } = {}) {
  await supplierService.getById(supplierId);
  const filter = { supplier: supplierId };
  if (dateFrom || dateTo) {
    filter.entryDate = {};
    if (dateFrom) filter.entryDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      filter.entryDate.$lte = end;
    }
  }
  return LedgerEntry.find(filter)
    .populate("purchase", "quantityKg ratePerKg invoiceNo materialType totalAmount purchaseDate notes")
    .sort({ entryDate: -1, createdAt: -1 });
}

async function getBalance(supplierId) {
  return supplierService.getBalance(supplierId);
}

async function recordPayment(supplierId, { amount, entryDate, notes }) {
  await supplierService.getById(supplierId);
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw httpError("Payment amount must be greater than 0", 400);

  const entry = await LedgerEntry.create({
    supplier: supplierId,
    type: "payment",
    amount: Math.round(n * 100) / 100,
    entryDate: parseDate(entryDate || new Date(), "Entry date"),
    notes: notes?.trim() || "Payment",
  });
  const balance = await getBalance(supplierId);
  return { entry, balance };
}

async function recordAdjustment(supplierId, { amount, entryDate, notes }) {
  await supplierService.getById(supplierId);
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) throw httpError("Adjustment amount must be non-zero", 400);

  const signed = Math.round(n * 100) / 100;
  const entry = await LedgerEntry.create({
    supplier: supplierId,
    type: "adjustment",
    amount: Math.abs(signed),
    signedAmount: signed,
    entryDate: parseDate(entryDate || new Date(), "Entry date"),
    notes: notes?.trim() || "Adjustment",
  });
  const balance = await getBalance(supplierId);
  return { entry, balance };
}

async function updateEntry(supplierId, entryId, data) {
  await supplierService.getById(supplierId);
  const entry = await LedgerEntry.findOne({ _id: entryId, supplier: supplierId });
  if (!entry) throw httpError("Ledger entry not found", 404);
  if (entry.type === "purchase") {
    throw httpError("Edit this purchase from inventory / purchase history", 400);
  }

  if (data.amount !== undefined) {
    const n = Number(data.amount);
    if (entry.type === "payment") {
      if (!Number.isFinite(n) || n <= 0) throw httpError("Payment amount must be greater than 0", 400);
      entry.amount = Math.round(n * 100) / 100;
      entry.signedAmount = null;
    } else {
      if (!Number.isFinite(n) || n === 0) throw httpError("Adjustment amount must be non-zero", 400);
      const signed = Math.round(n * 100) / 100;
      entry.signedAmount = signed;
      entry.amount = Math.abs(signed);
    }
  }
  if (data.entryDate !== undefined) {
    entry.entryDate = parseDate(data.entryDate, "Entry date");
  }
  if (data.notes !== undefined) {
    entry.notes = String(data.notes).trim();
  }

  await entry.save();
  const balance = await getBalance(supplierId);
  return { entry, balance };
}

async function removeEntry(supplierId, entryId) {
  await supplierService.getById(supplierId);
  const entry = await LedgerEntry.findOne({ _id: entryId, supplier: supplierId });
  if (!entry) throw httpError("Ledger entry not found", 404);
  if (entry.type === "purchase") {
    throw httpError("Delete this purchase from inventory / purchase history", 400);
  }
  await entry.deleteOne();
  const balance = await getBalance(supplierId);
  return { balance };
}

module.exports = {
  listBySupplier,
  getBalance,
  recordPayment,
  recordAdjustment,
  updateEntry,
  removeEntry,
};
