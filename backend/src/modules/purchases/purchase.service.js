const Purchase = require("./purchase.model");
const LedgerEntry = require("../ledger/ledger.model");
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

function assertPositiveNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw httpError(`${label} must be greater than 0`, 400);
  return n;
}

async function create(data) {
  if (!data.supplier) throw httpError("Supplier is required", 400);
  await supplierService.getById(data.supplier);

  const quantityKg = assertPositiveNumber(data.quantityKg, "Quantity");
  const ratePerKg = assertPositiveNumber(data.ratePerKg, "Rate");
  const totalAmount = Math.round(quantityKg * ratePerKg * 100) / 100;
  const purchaseDate = parseDate(data.purchaseDate || new Date(), "Purchase date");

  const purchase = await Purchase.create({
    supplier: data.supplier,
    quantityKg,
    ratePerKg,
    totalAmount,
    purchaseDate,
    invoiceNo: data.invoiceNo?.trim() || "",
    notes: data.notes?.trim() || "",
  });

  await LedgerEntry.create({
    supplier: data.supplier,
    type: "purchase",
    amount: totalAmount,
    purchase: purchase._id,
    entryDate: purchaseDate,
    notes: data.invoiceNo?.trim()
      ? `Purchase ${data.invoiceNo.trim()}`
      : `Purchase ${quantityKg} kg @ ${ratePerKg}/kg`,
  });

  const populated = await Purchase.findById(purchase._id).populate("supplier", "name phone isActive");
  try {
    const inventoryService = require("../inventory/inventory.service");
    await inventoryService.onPurchaseCreated(populated);
  } catch (e) {
    console.error("Inventory movement (purchase) failed:", e.message);
  }
  return populated;
}

async function list({ supplier, dateFrom, dateTo, q } = {}) {
  const filter = {};
  if (supplier) filter.supplier = supplier;
  if (dateFrom || dateTo) {
    filter.purchaseDate = {};
    if (dateFrom) filter.purchaseDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      filter.purchaseDate.$lte = end;
    }
  }
  if (q?.trim()) {
    const term = q.trim();
    filter.$or = [
      { invoiceNo: new RegExp(term, "i") },
      { notes: new RegExp(term, "i") },
    ];
  }

  return Purchase.find(filter)
    .populate("supplier", "name phone isActive")
    .sort({ purchaseDate: -1, createdAt: -1 });
}

async function getById(id) {
  const purchase = await Purchase.findById(id).populate("supplier", "name phone isActive");
  if (!purchase) throw httpError("Purchase not found", 404);
  return purchase;
}

async function update(id, data) {
  const purchase = await Purchase.findById(id);
  if (!purchase) throw httpError("Purchase not found", 404);

  if (data.supplier) {
    await supplierService.getById(data.supplier);
    purchase.supplier = data.supplier;
  }
  if (data.quantityKg !== undefined) {
    purchase.quantityKg = assertPositiveNumber(data.quantityKg, "Quantity");
  }
  if (data.ratePerKg !== undefined) {
    purchase.ratePerKg = assertPositiveNumber(data.ratePerKg, "Rate");
  }
  purchase.totalAmount = Math.round(purchase.quantityKg * purchase.ratePerKg * 100) / 100;

  if (data.purchaseDate !== undefined) {
    purchase.purchaseDate = parseDate(data.purchaseDate, "Purchase date");
  }
  if (data.invoiceNo !== undefined) purchase.invoiceNo = data.invoiceNo.trim();
  if (data.notes !== undefined) purchase.notes = data.notes.trim();

  await purchase.save();

  const ledger = await LedgerEntry.findOne({ purchase: purchase._id, type: "purchase" });
  if (ledger) {
    ledger.supplier = purchase.supplier;
    ledger.amount = purchase.totalAmount;
    ledger.entryDate = purchase.purchaseDate;
    ledger.notes = purchase.invoiceNo
      ? `Purchase ${purchase.invoiceNo}`
      : `Purchase ${purchase.quantityKg} kg @ ${purchase.ratePerKg}/kg`;
    await ledger.save();
  }

  return Purchase.findById(purchase._id).populate("supplier", "name phone isActive");
}

async function remove(id) {
  const purchase = await Purchase.findById(id);
  if (!purchase) throw httpError("Purchase not found", 404);
  await LedgerEntry.deleteMany({ purchase: purchase._id });
  try {
    const inventoryService = require("../inventory/inventory.service");
    await inventoryService.onPurchaseDeleted(purchase._id);
  } catch (e) {
    console.error("Inventory movement cleanup (purchase) failed:", e.message);
  }
  await purchase.deleteOne();
  return { ok: true };
}

async function getStock() {
  const productionService = require("../production/production.service");
  const result = await Purchase.aggregate([
    {
      $group: {
        _id: null,
        totalKg: { $sum: "$quantityKg" },
        totalSpend: { $sum: "$totalAmount" },
        purchaseCount: { $sum: 1 },
        avgRate: { $avg: "$ratePerKg" },
      },
    },
  ]);
  const row = result[0] || { totalKg: 0, totalSpend: 0, purchaseCount: 0, avgRate: 0 };
  const purchasedKg = Math.round((row.totalKg || 0) * 1000) / 1000;
  const consumedKg = Math.round((await productionService.sumNetConsumedKg()) * 1000) / 1000;
  const availableKg = Math.round((purchasedKg - consumedKg) * 1000) / 1000;

  return {
    material: "scrap",
    unit: "kg",
    purchasedKg,
    consumedKg,
    totalKg: availableKg,
    availableKg,
    totalSpend: Math.round((row.totalSpend || 0) * 100) / 100,
    purchaseCount: row.purchaseCount || 0,
    avgRate: Math.round((row.avgRate || 0) * 100) / 100,
  };
}

async function getReport({ dateFrom, dateTo, supplier } = {}) {
  const mongoose = require("mongoose");
  const match = {};

  if (supplier) {
    if (!mongoose.isValidObjectId(supplier)) throw httpError("Invalid supplier id", 400);
    match.supplier = new mongoose.Types.ObjectId(supplier);
  }
  if (dateFrom || dateTo) {
    match.purchaseDate = {};
    if (dateFrom) match.purchaseDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      match.purchaseDate.$lte = end;
    }
  }

  const bySupplier = await Purchase.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$supplier",
        totalKg: { $sum: "$quantityKg" },
        totalSpend: { $sum: "$totalAmount" },
        purchaseCount: { $sum: 1 },
        avgRate: { $avg: "$ratePerKg" },
        minRate: { $min: "$ratePerKg" },
        maxRate: { $max: "$ratePerKg" },
      },
    },
    {
      $lookup: {
        from: "suppliers",
        localField: "_id",
        foreignField: "_id",
        as: "supplier",
      },
    },
    { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } },
    { $sort: { avgRate: 1 } },
  ]);

  const summary = await Purchase.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalKg: { $sum: "$quantityKg" },
        totalSpend: { $sum: "$totalAmount" },
        purchaseCount: { $sum: 1 },
        avgRate: { $avg: "$ratePerKg" },
      },
    },
  ]);

  const suppliers = bySupplier.map((row) => ({
    supplierId: row._id,
    name: row.supplier?.name || "Unknown",
    totalKg: Math.round(row.totalKg * 1000) / 1000,
    totalSpend: Math.round(row.totalSpend * 100) / 100,
    purchaseCount: row.purchaseCount,
    avgRate: Math.round(row.avgRate * 100) / 100,
    minRate: Math.round(row.minRate * 100) / 100,
    maxRate: Math.round(row.maxRate * 100) / 100,
  }));

  const totals = summary[0] || { totalKg: 0, totalSpend: 0, purchaseCount: 0, avgRate: 0 };
  const bestRateSupplier = suppliers.length > 0 ? suppliers[0] : null;

  return {
    totals: {
      totalKg: Math.round((totals.totalKg || 0) * 1000) / 1000,
      totalSpend: Math.round((totals.totalSpend || 0) * 100) / 100,
      purchaseCount: totals.purchaseCount || 0,
      avgRate: Math.round((totals.avgRate || 0) * 100) / 100,
    },
    bySupplier: suppliers,
    bestRateSupplier,
  };
}

module.exports = { create, list, getById, update, remove, getStock, getReport };
