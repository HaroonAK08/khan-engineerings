const ProductionBatch = require("./production.model");
const productService = require("../products/product.service");
const Purchase = require("../purchases/purchase.model");

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

function assertNonNeg(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw httpError(`${label} must be 0 or greater`, 400);
  return n;
}

function roundKg(n) {
  return Math.round(n * 1000) / 1000;
}

async function sumPurchasedKg() {
  const result = await Purchase.aggregate([
    { $group: { _id: null, totalKg: { $sum: "$quantityKg" } } },
  ]);
  return result[0]?.totalKg || 0;
}

async function sumNetConsumedKg(excludeBatchId = null) {
  const match = excludeBatchId ? { _id: { $ne: excludeBatchId } } : {};
  const result = await ProductionBatch.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        consumed: {
          $sum: { $subtract: ["$inputScrapKg", "$returnedScrapKg"] },
        },
      },
    },
  ]);
  return result[0]?.consumed || 0;
}

async function getAvailableStockKg(excludeBatchId = null) {
  const purchased = await sumPurchasedKg();
  const consumed = await sumNetConsumedKg(excludeBatchId);
  return roundKg(purchased - consumed);
}

function validateMassBalance({ inputScrapKg, materialLossKg, returnedScrapKg }) {
  if (returnedScrapKg + materialLossKg > inputScrapKg + 1e-9) {
    throw httpError(
      "Returned scrap + material loss cannot exceed input scrap",
      400
    );
  }
}

async function nextBatchNo() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const prefix = `PB-${start.toISOString().slice(0, 10).replace(/-/g, "")}`;
  const count = await ProductionBatch.countDocuments({
    batchNo: new RegExp(`^${prefix}`),
  });
  return `${prefix}-${String(count + 1).padStart(3, "0")}`;
}

function normalizeBatchFields(data) {
  const inputScrapKg = assertNonNeg(data.inputScrapKg, "Input scrap");
  if (inputScrapKg <= 0) throw httpError("Input scrap must be greater than 0", 400);

  const materialLossKg = assertNonNeg(data.materialLossKg ?? 0, "Material loss");
  const returnedScrapKg = assertNonNeg(data.returnedScrapKg ?? 0, "Returned scrap");
  const goodUnits = assertNonNeg(data.goodUnits ?? 0, "Good units");
  const rejectedUnits = assertNonNeg(data.rejectedUnits ?? 0, "Rejected units");

  if (goodUnits + rejectedUnits <= 0) {
    throw httpError("Enter at least one good or rejected unit", 400);
  }

  validateMassBalance({ inputScrapKg, materialLossKg, returnedScrapKg });

  return {
    inputScrapKg: roundKg(inputScrapKg),
    materialLossKg: roundKg(materialLossKg),
    returnedScrapKg: roundKg(returnedScrapKg),
    goodUnits: Math.round(goodUnits),
    rejectedUnits: Math.round(rejectedUnits),
    netConsumedKg: roundKg(inputScrapKg - returnedScrapKg),
  };
}

async function create(data) {
  if (!data.product) throw httpError("Product is required", 400);
  await productService.getById(data.product);

  const fields = normalizeBatchFields(data);
  const available = await getAvailableStockKg();
  if (fields.netConsumedKg > available + 1e-9) {
    throw httpError(
      `Insufficient scrap stock. Available ${available} kg, need ${fields.netConsumedKg} kg`,
      400
    );
  }

  const batchNo = data.batchNo?.trim() || (await nextBatchNo());
  const existing = await ProductionBatch.findOne({ batchNo });
  if (existing) throw httpError("Batch number already exists", 409);

  const batch = await ProductionBatch.create({
    batchNo,
    product: data.product,
    productionDate: parseDate(data.productionDate || new Date(), "Production date"),
    inputScrapKg: fields.inputScrapKg,
    materialLossKg: fields.materialLossKg,
    returnedScrapKg: fields.returnedScrapKg,
    goodUnits: fields.goodUnits,
    rejectedUnits: fields.rejectedUnits,
    notes: data.notes?.trim() || "",
    status: "completed",
  });

  const populated = await ProductionBatch.findById(batch._id).populate(
    "product",
    "name sku unitLabel defaultWarehouse"
  );
  try {
    const inventoryService = require("../inventory/inventory.service");
    await inventoryService.onBatchCreated(populated);
  } catch (e) {
    console.error("Inventory movement (batch) failed:", e.message);
  }
  return populated;
}

async function list({ product, dateFrom, dateTo, q } = {}) {
  const filter = {};
  if (product) filter.product = product;
  if (dateFrom || dateTo) {
    filter.productionDate = {};
    if (dateFrom) filter.productionDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      filter.productionDate.$lte = end;
    }
  }
  if (q?.trim()) {
    filter.batchNo = new RegExp(q.trim(), "i");
  }

  return ProductionBatch.find(filter)
    .populate("product", "name sku unitLabel")
    .sort({ productionDate: -1, createdAt: -1 });
}

async function getById(id) {
  const batch = await ProductionBatch.findById(id).populate("product", "name sku unitLabel description");
  if (!batch) throw httpError("Production batch not found", 404);
  return batch;
}

async function update(id, data) {
  const batch = await ProductionBatch.findById(id);
  if (!batch) throw httpError("Production batch not found", 404);

  if (data.product) {
    await productService.getById(data.product);
    batch.product = data.product;
  }

  const fields = normalizeBatchFields({
    inputScrapKg: data.inputScrapKg ?? batch.inputScrapKg,
    materialLossKg: data.materialLossKg ?? batch.materialLossKg,
    returnedScrapKg: data.returnedScrapKg ?? batch.returnedScrapKg,
    goodUnits: data.goodUnits ?? batch.goodUnits,
    rejectedUnits: data.rejectedUnits ?? batch.rejectedUnits,
  });

  const available = await getAvailableStockKg(batch._id);
  if (fields.netConsumedKg > available + 1e-9) {
    throw httpError(
      `Insufficient scrap stock. Available ${available} kg, need ${fields.netConsumedKg} kg`,
      400
    );
  }

  if (data.productionDate !== undefined) {
    batch.productionDate = parseDate(data.productionDate, "Production date");
  }
  if (data.notes !== undefined) batch.notes = data.notes.trim();
  if (data.batchNo !== undefined) {
    const batchNo = data.batchNo.trim();
    if (!batchNo) throw httpError("Batch number is required", 400);
    const clash = await ProductionBatch.findOne({ batchNo, _id: { $ne: id } });
    if (clash) throw httpError("Batch number already exists", 409);
    batch.batchNo = batchNo;
  }

  batch.inputScrapKg = fields.inputScrapKg;
  batch.materialLossKg = fields.materialLossKg;
  batch.returnedScrapKg = fields.returnedScrapKg;
  batch.goodUnits = fields.goodUnits;
  batch.rejectedUnits = fields.rejectedUnits;

  await batch.save();
  return ProductionBatch.findById(batch._id).populate("product", "name sku unitLabel");
}

async function remove(id) {
  const batch = await ProductionBatch.findById(id);
  if (!batch) throw httpError("Production batch not found", 404);
  const BatchExpense = require("../expenses/expense.model");
  await BatchExpense.deleteMany({ batch: id });
  try {
    const inventoryService = require("../inventory/inventory.service");
    await inventoryService.onBatchDeleted(id);
  } catch (e) {
    console.error("Inventory movement cleanup (batch) failed:", e.message);
  }
  await batch.deleteOne();
  return { ok: true };
}

async function getReport({ dateFrom, dateTo, product } = {}) {
  const mongoose = require("mongoose");
  const match = {};
  if (product) {
    if (!mongoose.isValidObjectId(product)) throw httpError("Invalid product id", 400);
    match.product = new mongoose.Types.ObjectId(product);
  }
  if (dateFrom || dateTo) {
    match.productionDate = {};
    if (dateFrom) match.productionDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      match.productionDate.$lte = end;
    }
  }

  const summary = await ProductionBatch.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        batchCount: { $sum: 1 },
        inputScrapKg: { $sum: "$inputScrapKg" },
        materialLossKg: { $sum: "$materialLossKg" },
        returnedScrapKg: { $sum: "$returnedScrapKg" },
        netConsumedKg: { $sum: { $subtract: ["$inputScrapKg", "$returnedScrapKg"] } },
        goodUnits: { $sum: "$goodUnits" },
        rejectedUnits: { $sum: "$rejectedUnits" },
      },
    },
  ]);

  const byProduct = await ProductionBatch.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$product",
        batchCount: { $sum: 1 },
        inputScrapKg: { $sum: "$inputScrapKg" },
        materialLossKg: { $sum: "$materialLossKg" },
        returnedScrapKg: { $sum: "$returnedScrapKg" },
        netConsumedKg: { $sum: { $subtract: ["$inputScrapKg", "$returnedScrapKg"] } },
        goodUnits: { $sum: "$goodUnits" },
        rejectedUnits: { $sum: "$rejectedUnits" },
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
    { $sort: { goodUnits: -1 } },
  ]);

  const totals = summary[0] || {
    batchCount: 0,
    inputScrapKg: 0,
    materialLossKg: 0,
    returnedScrapKg: 0,
    netConsumedKg: 0,
    goodUnits: 0,
    rejectedUnits: 0,
  };

  const totalUnits = (totals.goodUnits || 0) + (totals.rejectedUnits || 0);
  const rejectRate =
    totalUnits > 0 ? Math.round(((totals.rejectedUnits || 0) / totalUnits) * 10000) / 100 : 0;
  const lossRate =
    (totals.inputScrapKg || 0) > 0
      ? Math.round(((totals.materialLossKg || 0) / totals.inputScrapKg) * 10000) / 100
      : 0;

  return {
    totals: {
      batchCount: totals.batchCount || 0,
      inputScrapKg: roundKg(totals.inputScrapKg || 0),
      materialLossKg: roundKg(totals.materialLossKg || 0),
      returnedScrapKg: roundKg(totals.returnedScrapKg || 0),
      netConsumedKg: roundKg(totals.netConsumedKg || 0),
      goodUnits: totals.goodUnits || 0,
      rejectedUnits: totals.rejectedUnits || 0,
      totalUnits,
      rejectRate,
      lossRate,
    },
    byProduct: byProduct.map((row) => ({
      productId: row._id,
      name: row.product?.name || "Unknown",
      sku: row.product?.sku || "",
      batchCount: row.batchCount,
      inputScrapKg: roundKg(row.inputScrapKg),
      materialLossKg: roundKg(row.materialLossKg),
      returnedScrapKg: roundKg(row.returnedScrapKg),
      netConsumedKg: roundKg(row.netConsumedKg),
      goodUnits: row.goodUnits,
      rejectedUnits: row.rejectedUnits,
    })),
  };
}

module.exports = {
  create,
  list,
  getById,
  update,
  remove,
  getReport,
  getAvailableStockKg,
  sumNetConsumedKg,
};
