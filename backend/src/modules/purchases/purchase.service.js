const Purchase = require("./purchase.model");
const LedgerEntry = require("../ledger/ledger.model");
const supplierService = require("../suppliers/supplier.service");
const { MATERIAL_TYPE_IDS } = require("../domain/mfg.constants");

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

function assertNonNegative(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw httpError(`${label} must be 0 or greater`, 400);
  return Math.round(n * 100) / 100;
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

/** Auto invoice when supplier bill number not provided: PUR-YYYYMMDD-001 */
async function nextPurchaseInvoiceNo(purchaseDate) {
  const d = purchaseDate instanceof Date ? purchaseDate : new Date(purchaseDate || Date.now());
  const prefix = d.toISOString().slice(0, 10).replace(/-/g, "");
  const count = await Purchase.countDocuments({
    invoiceNo: new RegExp(`^PUR-${prefix}`),
  });
  return `PUR-${prefix}-${String(count + 1).padStart(3, "0")}`;
}

function computeAmounts({ quantityKg, ratePerKg, totalAmount, freightAmount = 0, amountPaid = 0 }) {
  let materialTotal;
  let rate;

  if (totalAmount !== undefined && totalAmount !== null && totalAmount !== "") {
    materialTotal = assertPositiveNumber(totalAmount, "Total amount");
    rate = Math.round((materialTotal / quantityKg) * 10000) / 10000;
  } else {
    rate = assertPositiveNumber(ratePerKg, "Rate");
    materialTotal = roundMoney(quantityKg * rate);
  }

  const freight = assertNonNegative(freightAmount ?? 0, "Freight");
  const paid = assertNonNegative(amountPaid ?? 0, "Amount paid");
  const payable = roundMoney(materialTotal + freight);
  if (paid > payable) throw httpError("Amount paid cannot exceed payable", 400);
  const balance = roundMoney(payable - paid);
  return {
    totalAmount: materialTotal,
    ratePerKg: rate,
    freightAmount: freight,
    amountPaid: paid,
    balance,
    payable,
  };
}

async function create(data) {
  if (!data.supplier) throw httpError("Supplier is required", 400);
  await supplierService.getById(data.supplier);

  const materialType = data.materialType || "scrap";
  if (!MATERIAL_TYPE_IDS.includes(materialType)) {
    throw httpError("Material type must be scrap or daig", 400);
  }

  const quantityKg = assertPositiveNumber(data.quantityKg, "Quantity");
  if (!Number.isInteger(quantityKg)) {
    throw httpError("Quantity must be whole kilograms (no grams)", 400);
  }
  const hasTotal = data.totalAmount !== undefined && data.totalAmount !== null && data.totalAmount !== "";
  if (!hasTotal && (data.ratePerKg === undefined || data.ratePerKg === null || data.ratePerKg === "")) {
    throw httpError("Provide rate per kg or total amount", 400);
  }
  const { totalAmount, ratePerKg, freightAmount, amountPaid, balance, payable } = computeAmounts({
    quantityKg,
    ratePerKg: data.ratePerKg,
    totalAmount: hasTotal ? data.totalAmount : undefined,
    freightAmount: data.freightAmount ?? 0,
    amountPaid: data.amountPaid ?? 0,
  });
  const purchaseDate = parseDate(data.purchaseDate || new Date(), "Purchase date");
  const invoiceNo = data.invoiceNo?.trim() || (await nextPurchaseInvoiceNo(purchaseDate));

  const purchase = await Purchase.create({
    supplier: data.supplier,
    materialType,
    quantityKg,
    ratePerKg,
    totalAmount,
    freightAmount,
    amountPaid,
    balance,
    vehicleNo: data.vehicleNo?.trim() || "",
    purchaseDate,
    invoiceNo,
    notes: data.notes?.trim() || "",
  });

  await LedgerEntry.create({
    supplier: data.supplier,
    type: "purchase",
    amount: payable,
    purchase: purchase._id,
    entryDate: purchaseDate,
    notes: `Purchase ${invoiceNo} (${materialType})`,
  });

  if (amountPaid > 0) {
    await LedgerEntry.create({
      supplier: data.supplier,
      type: "payment",
      amount: amountPaid,
      purchase: purchase._id,
      entryDate: purchaseDate,
      notes: `Payment on purchase ${invoiceNo}`,
    });
  }

  const populated = await Purchase.findById(purchase._id).populate("supplier", "name phone isActive");
  try {
    const inventoryService = require("../inventory/inventory.service");
    await inventoryService.onPurchaseCreated(populated);
  } catch (e) {
    console.error("Inventory movement (purchase) failed:", e.message);
  }
  return populated;
}

async function list({ supplier, dateFrom, dateTo, q, materialType } = {}) {
  const filter = {};
  if (supplier) filter.supplier = supplier;
  if (materialType && MATERIAL_TYPE_IDS.includes(materialType)) {
    filter.materialType = materialType;
  }
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
      { vehicleNo: new RegExp(term, "i") },
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
  if (data.materialType !== undefined) {
    if (!MATERIAL_TYPE_IDS.includes(data.materialType)) {
      throw httpError("Material type must be scrap or daig", 400);
    }
    purchase.materialType = data.materialType;
  }
  if (data.quantityKg !== undefined) {
    purchase.quantityKg = assertPositiveNumber(data.quantityKg, "Quantity");
    if (!Number.isInteger(purchase.quantityKg)) {
      throw httpError("Quantity must be whole kilograms (no grams)", 400);
    }
  }

  const hasTotal = data.totalAmount !== undefined && data.totalAmount !== null && data.totalAmount !== "";
  const amounts = computeAmounts({
    quantityKg: purchase.quantityKg,
    ratePerKg: data.ratePerKg !== undefined ? data.ratePerKg : purchase.ratePerKg,
    totalAmount: hasTotal ? data.totalAmount : undefined,
    freightAmount: data.freightAmount !== undefined ? data.freightAmount : purchase.freightAmount,
    amountPaid: data.amountPaid !== undefined ? data.amountPaid : purchase.amountPaid,
  });
  purchase.ratePerKg = amounts.ratePerKg;
  purchase.totalAmount = amounts.totalAmount;
  purchase.freightAmount = amounts.freightAmount;
  purchase.amountPaid = amounts.amountPaid;
  purchase.balance = amounts.balance;

  if (data.purchaseDate !== undefined) {
    purchase.purchaseDate = parseDate(data.purchaseDate, "Purchase date");
  }
  if (data.invoiceNo !== undefined) purchase.invoiceNo = data.invoiceNo.trim();
  if (data.notes !== undefined) purchase.notes = data.notes.trim();
  if (data.vehicleNo !== undefined) purchase.vehicleNo = data.vehicleNo.trim();

  await purchase.save();

  const ledger = await LedgerEntry.findOne({ purchase: purchase._id, type: "purchase" });
  if (ledger) {
    ledger.supplier = purchase.supplier;
    ledger.amount = amounts.payable;
    ledger.entryDate = purchase.purchaseDate;
    ledger.notes = purchase.invoiceNo
      ? `Purchase ${purchase.invoiceNo} (${purchase.materialType})`
      : `Purchase ${purchase.quantityKg} kg ${purchase.materialType} @ ${purchase.ratePerKg}/kg` +
        (purchase.freightAmount > 0 ? ` + freight ${purchase.freightAmount}` : "");
    await ledger.save();
  }

  // Sync initial payment ledger tied to this purchase (if any)
  const paymentLedger = await LedgerEntry.findOne({ purchase: purchase._id, type: "payment" });
  if (purchase.amountPaid > 0) {
    if (paymentLedger) {
      paymentLedger.amount = purchase.amountPaid;
      paymentLedger.supplier = purchase.supplier;
      paymentLedger.entryDate = purchase.purchaseDate;
      await paymentLedger.save();
    } else {
      await LedgerEntry.create({
        supplier: purchase.supplier,
        type: "payment",
        amount: purchase.amountPaid,
        purchase: purchase._id,
        entryDate: purchase.purchaseDate,
        notes: "Payment on purchase",
      });
    }
  } else if (paymentLedger) {
    await paymentLedger.deleteOne();
  }

  try {
    const inventoryService = require("../inventory/inventory.service");
    await inventoryService.onPurchaseUpdated(purchase);
  } catch (e) {
    console.error("Inventory movement (purchase update) failed:", e.message);
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

async function aggregateStockForMaterial(materialType) {
  const productionService = require("../production/production.service");
  const result = await Purchase.aggregate([
    { $match: { materialType } },
    {
      $group: {
        _id: null,
        totalKg: { $sum: "$quantityKg" },
        totalSpend: { $sum: { $add: ["$totalAmount", { $ifNull: ["$freightAmount", 0] }] } },
        purchaseCount: { $sum: 1 },
        avgRate: { $avg: "$ratePerKg" },
      },
    },
  ]);
  const row = result[0] || { totalKg: 0, totalSpend: 0, purchaseCount: 0, avgRate: 0 };
  const purchasedKg = Math.round((row.totalKg || 0) * 1000) / 1000;

  // Phase A+: production consumes per material type via new/legacy batches.
  let consumedKg = 0;
  if (materialType === "scrap" || materialType === "daig") {
    consumedKg = Math.round(
      (await productionService.sumNetConsumedForMaterial(materialType)) * 1000
    ) / 1000;
  }

  const availableKg = Math.round((purchasedKg - consumedKg) * 1000) / 1000;

  return {
    material: materialType,
    materialType,
    unit: "kg",
    purchasedKg,
    consumedKg,
    totalKg: availableKg,
    availableKg,
    totalSpend: roundMoney(row.totalSpend || 0),
    purchaseCount: row.purchaseCount || 0,
    avgRate: roundMoney(row.avgRate || 0),
  };
}

async function getStock({ materialType } = {}) {
  if (materialType && MATERIAL_TYPE_IDS.includes(materialType)) {
    return aggregateStockForMaterial(materialType);
  }

  const [scrap, daig] = await Promise.all([
    aggregateStockForMaterial("scrap"),
    aggregateStockForMaterial("daig"),
  ]);

  // Backward-compatible default shape = scrap (existing UI)
  return {
    ...scrap,
    byMaterial: { scrap, daig },
  };
}

async function getReport({ dateFrom, dateTo, supplier, materialType } = {}) {
  const mongoose = require("mongoose");
  const match = {};

  if (supplier) {
    if (!mongoose.isValidObjectId(supplier)) throw httpError("Invalid supplier id", 400);
    match.supplier = new mongoose.Types.ObjectId(supplier);
  }
  if (materialType && MATERIAL_TYPE_IDS.includes(materialType)) {
    match.materialType = materialType;
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
        _id: { supplier: "$supplier", materialType: "$materialType" },
        totalKg: { $sum: "$quantityKg" },
        totalSpend: { $sum: { $add: ["$totalAmount", { $ifNull: ["$freightAmount", 0] }] } },
        purchaseCount: { $sum: 1 },
        avgRate: { $avg: "$ratePerKg" },
        minRate: { $min: "$ratePerKg" },
        maxRate: { $max: "$ratePerKg" },
      },
    },
    {
      $lookup: {
        from: "suppliers",
        localField: "_id.supplier",
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
        totalSpend: { $sum: { $add: ["$totalAmount", { $ifNull: ["$freightAmount", 0] }] } },
        purchaseCount: { $sum: 1 },
        avgRate: { $avg: "$ratePerKg" },
      },
    },
  ]);

  const byMaterialType = await Purchase.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$materialType",
        totalKg: { $sum: "$quantityKg" },
        totalSpend: { $sum: { $add: ["$totalAmount", { $ifNull: ["$freightAmount", 0] }] } },
        purchaseCount: { $sum: 1 },
        avgRate: { $avg: "$ratePerKg" },
      },
    },
  ]);

  const suppliers = bySupplier.map((row) => ({
    supplierId: row._id.supplier,
    materialType: row._id.materialType || "scrap",
    name: row.supplier?.name || "Unknown",
    totalKg: Math.round(row.totalKg * 1000) / 1000,
    totalSpend: roundMoney(row.totalSpend),
    purchaseCount: row.purchaseCount,
    avgRate: roundMoney(row.avgRate),
    minRate: roundMoney(row.minRate),
    maxRate: roundMoney(row.maxRate),
  }));

  const totals = summary[0] || { totalKg: 0, totalSpend: 0, purchaseCount: 0, avgRate: 0 };
  const bestRateSupplier = suppliers.length > 0 ? suppliers[0] : null;

  return {
    totals: {
      totalKg: Math.round((totals.totalKg || 0) * 1000) / 1000,
      totalSpend: roundMoney(totals.totalSpend || 0),
      purchaseCount: totals.purchaseCount || 0,
      avgRate: roundMoney(totals.avgRate || 0),
    },
    bySupplier: suppliers,
    byMaterialType: byMaterialType.map((row) => ({
      materialType: row._id || "scrap",
      totalKg: Math.round(row.totalKg * 1000) / 1000,
      totalSpend: roundMoney(row.totalSpend),
      purchaseCount: row.purchaseCount,
      avgRate: roundMoney(row.avgRate),
    })),
    bestRateSupplier,
  };
}

module.exports = { create, list, getById, update, remove, getStock, getReport };
