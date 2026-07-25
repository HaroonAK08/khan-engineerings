const LedgerEntry = require("./ledger.model");
const Purchase = require("../purchases/purchase.model");
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

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

const PURCHASE_POPULATE =
  "quantityKg ratePerKg invoiceNo materialType totalAmount freightAmount amountPaid balance purchaseDate notes";

async function syncPurchasePaid(purchaseId) {
  if (!purchaseId) return null;
  const purchase = await Purchase.findById(purchaseId);
  if (!purchase) return null;

  const payments = await LedgerEntry.find({ purchase: purchaseId, type: "payment" });
  const paid = roundMoney(payments.reduce((sum, p) => sum + p.amount, 0));
  const payable = roundMoney(purchase.totalAmount + (purchase.freightAmount || 0));
  purchase.amountPaid = paid;
  purchase.balance = roundMoney(Math.max(0, payable - paid));
  await purchase.save();
  return purchase;
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

  let purchase = null;
  if (purchaseId) {
    purchase = await Purchase.findById(purchaseId);
    if (!purchase) throw httpError("Purchase not found", 404);
    if (String(purchase.supplier) !== String(supplierId)) {
      throw httpError("Purchase does not belong to this supplier", 400);
    }
    const payable = roundMoney(purchase.totalAmount + (purchase.freightAmount || 0));
    const remaining = roundMoney(Math.max(0, payable - (purchase.amountPaid || 0)));
    if (n > remaining + 0.001) {
      throw httpError(`Payment cannot exceed remaining balance (${remaining})`, 400);
    }
  }

  const entry = await LedgerEntry.create({
    supplier: supplierId,
    type: "payment",
    amount: n,
    purchase: purchase ? purchase._id : null,
    entryDate: parseDate(entryDate || new Date(), "Entry date"),
    notes: notes?.trim() || (purchase ? "Payment on purchase" : "Payment"),
  });

  if (purchase) {
    await syncPurchasePaid(purchase._id);
  }

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

  const linkedPurchaseId = entry.purchase ? String(entry.purchase) : null;

  if (data.amount !== undefined) {
    const n = Number(data.amount);
    if (entry.type === "payment") {
      if (!Number.isFinite(n) || n <= 0) throw httpError("Payment amount must be greater than 0", 400);
      if (linkedPurchaseId) {
        const purchase = await Purchase.findById(linkedPurchaseId);
        if (purchase) {
          const payable = roundMoney(purchase.totalAmount + (purchase.freightAmount || 0));
          const otherPaid = await LedgerEntry.aggregate([
            {
              $match: {
                purchase: purchase._id,
                type: "payment",
                _id: { $ne: entry._id },
              },
            },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ]);
          const already = otherPaid[0]?.total || 0;
          const remaining = roundMoney(Math.max(0, payable - already));
          if (n > remaining + 0.001) {
            throw httpError(`Payment cannot exceed remaining balance (${remaining})`, 400);
          }
        }
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
  if (linkedPurchaseId) {
    await syncPurchasePaid(linkedPurchaseId);
  }

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
  const linkedPurchaseId = entry.purchase ? String(entry.purchase) : null;
  await entry.deleteOne();
  if (linkedPurchaseId) {
    await syncPurchasePaid(linkedPurchaseId);
  }
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
};
