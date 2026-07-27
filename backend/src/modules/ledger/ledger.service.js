const LedgerEntry = require("./ledger.model");
const Purchase = require("../purchases/purchase.model");
const supplierService = require("../suppliers/supplier.service");
const mongoose = require("mongoose");

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
  return Math.round(n * 100) / 100;
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (typeof id === "object" && id._id) return toObjectId(id._id);
  return new mongoose.Types.ObjectId(String(id));
}

const PURCHASE_POPULATE =
  "quantityKg ratePerKg invoiceNo materialType totalAmount freightAmount amountPaid balance purchaseDate notes";

async function syncPurchasePaid(purchaseId) {
  if (!purchaseId) return null;
  const purchase = await Purchase.findById(purchaseId);
  if (!purchase) return null;
  await syncSupplierPurchaseBalances(purchase.supplier);
  return Purchase.findById(purchaseId);
}

/** Pay supplier total: payments settle previous pending first, then oldest purchases. */
async function syncSupplierPurchaseBalances(supplierId) {
  const oid = toObjectId(supplierId);
  if (!oid) return;

  const [payments, previousPendingAgg, purchases] = await Promise.all([
    LedgerEntry.find({ supplier: oid, type: "payment" }),
    LedgerEntry.aggregate([
      {
        $match: {
          supplier: oid,
          type: "adjustment",
          signedAmount: { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: "$signedAmount" } } },
    ]),
    Purchase.find({ supplier: oid }).sort({ purchaseDate: 1, createdAt: 1 }),
  ]);

  let remaining = roundMoney(payments.reduce((sum, p) => sum + (p.amount || 0), 0));
  const previousPending = roundMoney(previousPendingAgg[0]?.total || 0);
  remaining = roundMoney(Math.max(0, remaining - previousPending));

  for (const purchase of purchases) {
    const payable = roundMoney(
      (purchase.totalAmount || 0) + (purchase.freightAmount || 0)
    );
    const amountPaid = roundMoney(Math.min(remaining, payable));
    const balance = roundMoney(Math.max(0, payable - amountPaid));
    remaining = roundMoney(Math.max(0, remaining - amountPaid));

    if (
      roundMoney(purchase.amountPaid || 0) !== amountPaid ||
      roundMoney(purchase.balance || 0) !== balance
    ) {
      purchase.amountPaid = amountPaid;
      purchase.balance = balance;
      await purchase.save();
    }
  }
}

async function listBySupplier(supplierId, { dateFrom, dateTo } = {}) {
  await supplierService.getById(supplierId);
  await syncSupplierPurchaseBalances(supplierId);
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
    .populate("purchase", PURCHASE_POPULATE)
    .sort({ entryDate: -1, createdAt: -1 });
}

async function getBalance(supplierId) {
  return supplierService.getBalance(supplierId);
}

async function recordPayment(supplierId, { amount, entryDate, notes, purchaseId }) {
  await supplierService.getById(supplierId);
  const n = roundMoney(Number(amount));
  if (!Number.isFinite(n) || n <= 0) throw httpError("Payment amount must be greater than 0", 400);

  const owed = await getBalance(supplierId);
  if (n > owed + 0.001) {
    throw httpError(`Payment cannot exceed what you owe (${owed})`, 400);
  }

  let purchase = null;
  if (purchaseId) {
    purchase = await Purchase.findById(purchaseId);
    if (!purchase) throw httpError("Purchase not found", 404);
    if (String(purchase.supplier) !== String(supplierId)) {
      throw httpError("Purchase does not belong to this supplier", 400);
    }
  }

  const entry = await LedgerEntry.create({
    supplier: supplierId,
    type: "payment",
    amount: n,
    purchase: purchase ? purchase._id : null,
    entryDate: parseDate(entryDate || new Date(), "Entry date"),
    notes: notes?.trim() || (purchase ? "Payment on purchase" : "Supplier payment"),
  });

  await syncSupplierPurchaseBalances(supplierId);

  const populated = await LedgerEntry.findById(entry._id).populate("purchase", PURCHASE_POPULATE);
  const balance = await getBalance(supplierId);
  return { entry: populated, balance };
}

async function recordAdjustment(supplierId, { amount, entryDate, notes }) {
  await supplierService.getById(supplierId);
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) throw httpError("Adjustment amount must be non-zero", 400);

  const signed = roundMoney(n);
  const entry = await LedgerEntry.create({
    supplier: supplierId,
    type: "adjustment",
    amount: Math.abs(signed),
    signedAmount: signed,
    entryDate: parseDate(entryDate || new Date(), "Entry date"),
    notes: notes?.trim() || (signed > 0 ? "Previous pending" : "Adjustment"),
  });
  await syncSupplierPurchaseBalances(supplierId);
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
      const owed = await getBalance(supplierId);
      const maxAllowed = roundMoney(owed + (entry.amount || 0));
      if (n > maxAllowed + 0.001) {
        throw httpError(`Payment cannot exceed what you owe (${maxAllowed})`, 400);
      }
      entry.amount = roundMoney(n);
      entry.signedAmount = null;
    } else {
      if (!Number.isFinite(n) || n === 0) throw httpError("Adjustment amount must be non-zero", 400);
      const signed = roundMoney(n);
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
  await syncSupplierPurchaseBalances(supplierId);

  const populated = await LedgerEntry.findById(entry._id).populate("purchase", PURCHASE_POPULATE);
  const balance = await getBalance(supplierId);
  return { entry: populated, balance };
}

async function removeEntry(supplierId, entryId) {
  await supplierService.getById(supplierId);
  const entry = await LedgerEntry.findOne({ _id: entryId, supplier: supplierId });
  if (!entry) throw httpError("Ledger entry not found", 404);
  if (entry.type === "purchase") {
    throw httpError("Delete this purchase from inventory / purchase history", 400);
  }
  await entry.deleteOne();
  await syncSupplierPurchaseBalances(supplierId);
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
  syncPurchasePaid,
  syncSupplierPurchaseBalances,
};
