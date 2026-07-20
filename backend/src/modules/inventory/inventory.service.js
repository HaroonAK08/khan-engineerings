const StockMovement = require("./movement.model");
const ProductCategory = require("./category.model");
const ProductSize = require("./size.model");
const Warehouse = require("./warehouse.model");
const Product = require("../products/product.model");
const purchaseService = require("../purchases/purchase.service");
const ProductionBatch = require("../production/production.model");
const {
  ACTIVE_STOCK_ITEM_TYPE_IDS,
  materialTypeToItemType,
} = require("../domain/mfg.constants");

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

function roundQty(n) {
  return Math.round(n * 1000) / 1000;
}

async function getDefaultWarehouse() {
  let wh = await Warehouse.findOne({ isDefault: true, isActive: true });
  if (!wh) wh = await Warehouse.findOne({ isActive: true }).sort({ createdAt: 1 });
  if (!wh) {
    wh = await Warehouse.create({
      name: "Main Warehouse",
      code: "MAIN",
      location: "",
      isDefault: true,
      isActive: true,
    });
  }
  return wh;
}

async function recordMovement(data) {
  const quantity = Number(data.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  return StockMovement.create({
    itemType: data.itemType,
    direction: data.direction,
    reason: data.reason,
    quantity: roundQty(quantity),
    unit:
      data.unit ||
      (data.itemType === "finished_good" ? "pcs" : "kg"),
    product: data.product || null,
    warehouse: data.warehouse || null,
    refType: data.refType || "",
    refId: data.refId || null,
    movementDate: data.movementDate ? parseDate(data.movementDate) : new Date(),
    notes: data.notes || "",
  });
}

async function deleteMovementsByRef(refType, refId) {
  await StockMovement.deleteMany({ refType, refId });
}

/** Called when a raw material purchase is created */
async function onPurchaseCreated(purchase) {
  const wh = await getDefaultWarehouse();
  const materialType = purchase.materialType || "scrap";
  const itemType = materialTypeToItemType(materialType);
  await recordMovement({
    itemType,
    direction: "in",
    reason: "purchase",
    quantity: purchase.quantityKg,
    unit: "kg",
    warehouse: wh._id,
    refType: "purchase",
    refId: purchase._id,
    movementDate: purchase.purchaseDate,
    notes: purchase.invoiceNo
      ? `Invoice ${purchase.invoiceNo}`
      : `${materialType} purchase`,
  });
}

async function onPurchaseUpdated(purchase) {
  await deleteMovementsByRef("purchase", purchase._id);
  await onPurchaseCreated(purchase);
}

async function onPurchaseDeleted(purchaseId) {
  await deleteMovementsByRef("purchase", purchaseId);
}

/** Called when a production batch is created (legacy one-shot batches) */
async function onBatchCreated(batch) {
  const wh =
    (batch.product?.defaultWarehouse && { _id: batch.product.defaultWarehouse }) ||
    (await getDefaultWarehouse());

  const productId = batch.product?._id || batch.product;
  const netConsumed = Math.max(0, batch.inputScrapKg - batch.returnedScrapKg);

  if (netConsumed > 0) {
    await recordMovement({
      itemType: "raw_scrap",
      direction: "out",
      reason: "production_consume",
      quantity: netConsumed,
      unit: "kg",
      warehouse: wh._id,
      refType: "production",
      refId: batch._id,
      movementDate: batch.productionDate,
      notes: `Batch ${batch.batchNo} net consume`,
    });
  }

  if (batch.goodUnits > 0) {
    await recordMovement({
      itemType: "finished_good",
      direction: "in",
      reason: "production_output",
      quantity: batch.goodUnits,
      unit: "pcs",
      product: productId,
      warehouse: wh._id,
      refType: "production",
      refId: batch._id,
      movementDate: batch.productionDate,
      notes: `Batch ${batch.batchNo} good units`,
    });
  }
}

/** Phase B: consume furnace inputs when batch starts */
async function onBatchInputsConsumed(batch) {
  const wh = await getDefaultWarehouse();
  for (const inp of batch.inputs || []) {
    if (!inp.quantityKg || inp.quantityKg <= 0) continue;
    const materialType = inp.materialType === "daig" ? "daig" : "scrap";
    await recordMovement({
      itemType: materialTypeToItemType(materialType),
      direction: "out",
      reason: "production_consume",
      quantity: inp.quantityKg,
      unit: "kg",
      warehouse: wh._id,
      refType: "production",
      refId: batch._id,
      movementDate: batch.productionDate,
      notes: `Batch ${batch.batchNo} ${materialType} input`,
    });
  }
}

async function onTurningBreakage() {
  // Breakage no longer returns to a reusable pool.
}

async function onBatchFinished(batch) {
  const wh = await getDefaultWarehouse();
  for (const p of batch.outputProgress || []) {
    const qty = p.finishedQty || p.goodAfterTurning || 0;
    if (qty <= 0) continue;
    const product = await Product.findById(p.product);
    const warehouseId = product?.defaultWarehouse || wh._id;
    await recordMovement({
      itemType: "finished_good",
      direction: "in",
      reason: "production_output",
      quantity: qty,
      unit: "pcs",
      product: p.product,
      warehouse: warehouseId,
      refType: "production",
      refId: batch._id,
      movementDate: batch.productionDate || new Date(),
      notes: `Batch ${batch.batchNo} finished`,
    });
  }
}

async function onBatchDeleted(batchId) {
  await deleteMovementsByRef("production", batchId);
}

async function crudList(Model, { q, active } = {}, nameField = "name") {
  const filter = {};
  if (active === "true" || active === true) filter.isActive = true;
  if (active === "false" || active === false) filter.isActive = false;
  if (q?.trim()) filter[nameField] = new RegExp(q.trim(), "i");
  return Model.find(filter).sort({ name: 1 });
}

async function createCategory(data) {
  const name = data.name?.trim();
  if (!name) throw httpError("Name is required", 400);
  return ProductCategory.create({
    name,
    description: data.description?.trim() || "",
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
  });
}

async function updateCategory(id, data) {
  const row = await ProductCategory.findById(id);
  if (!row) throw httpError("Category not found", 404);
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw httpError("Name is required", 400);
    row.name = name;
  }
  if (data.description !== undefined) row.description = data.description.trim();
  if (data.isActive !== undefined) row.isActive = Boolean(data.isActive);
  await row.save();
  return row;
}

async function removeCategory(id) {
  const inUse = await Product.countDocuments({ category: id });
  if (inUse > 0) throw httpError("Category is used by products. Deactivate instead.", 409);
  const row = await ProductCategory.findById(id);
  if (!row) throw httpError("Category not found", 404);
  await row.deleteOne();
  return { ok: true };
}

async function createSize(data) {
  const name = data.name?.trim();
  if (!name) throw httpError("Name is required", 400);
  return ProductSize.create({
    name,
    code: data.code?.trim() || "",
    description: data.description?.trim() || "",
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
  });
}

async function updateSize(id, data) {
  const row = await ProductSize.findById(id);
  if (!row) throw httpError("Size not found", 404);
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw httpError("Name is required", 400);
    row.name = name;
  }
  if (data.code !== undefined) row.code = data.code.trim();
  if (data.description !== undefined) row.description = data.description.trim();
  if (data.isActive !== undefined) row.isActive = Boolean(data.isActive);
  await row.save();
  return row;
}

async function removeSize(id) {
  const inUse = await Product.countDocuments({ size: id });
  if (inUse > 0) throw httpError("Size is used by products. Deactivate instead.", 409);
  const row = await ProductSize.findById(id);
  if (!row) throw httpError("Size not found", 404);
  await row.deleteOne();
  return { ok: true };
}

async function createWarehouse(data) {
  const name = data.name?.trim();
  if (!name) throw httpError("Name is required", 400);
  if (data.isDefault) {
    await Warehouse.updateMany({}, { $set: { isDefault: false } });
  }
  return Warehouse.create({
    name,
    code: data.code?.trim() || "",
    location: data.location?.trim() || "",
    isDefault: Boolean(data.isDefault),
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
  });
}

async function updateWarehouse(id, data) {
  const row = await Warehouse.findById(id);
  if (!row) throw httpError("Warehouse not found", 404);
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw httpError("Name is required", 400);
    row.name = name;
  }
  if (data.code !== undefined) row.code = data.code.trim();
  if (data.location !== undefined) row.location = data.location.trim();
  if (data.isDefault !== undefined) {
    if (data.isDefault) await Warehouse.updateMany({}, { $set: { isDefault: false } });
    row.isDefault = Boolean(data.isDefault);
  }
  if (data.isActive !== undefined) row.isActive = Boolean(data.isActive);
  await row.save();
  return row;
}

async function removeWarehouse(id) {
  const row = await Warehouse.findById(id);
  if (!row) throw httpError("Warehouse not found", 404);
  if (row.isDefault) throw httpError("Cannot delete the default warehouse", 409);
  const inUse = await Product.countDocuments({ defaultWarehouse: id });
  if (inUse > 0) throw httpError("Warehouse is assigned to products. Deactivate instead.", 409);
  await row.deleteOne();
  return { ok: true };
}

async function getFinishedStock({ warehouse, category, q } = {}) {
  const mongoose = require("mongoose");
  const match = { itemType: "finished_good" };

  if (warehouse) {
    if (!mongoose.isValidObjectId(warehouse)) throw httpError("Invalid warehouse", 400);
    match.warehouse = new mongoose.Types.ObjectId(warehouse);
  }

  const balances = await StockMovement.aggregate([
    { $match: match },
    {
      $group: {
        _id: { product: "$product", warehouse: "$warehouse" },
        qtyIn: {
          $sum: { $cond: [{ $eq: ["$direction", "in"] }, "$quantity", 0] },
        },
        qtyOut: {
          $sum: { $cond: [{ $eq: ["$direction", "out"] }, "$quantity", 0] },
        },
      },
    },
    {
      $project: {
        product: "$_id.product",
        warehouse: "$_id.warehouse",
        quantity: { $subtract: ["$qtyIn", "$qtyOut"] },
      },
    },
    { $match: { quantity: { $ne: 0 } } },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productDoc",
      },
    },
    { $unwind: { path: "$productDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "warehouses",
        localField: "warehouse",
        foreignField: "_id",
        as: "warehouseDoc",
      },
    },
    { $unwind: { path: "$warehouseDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "productcategories",
        localField: "productDoc.category",
        foreignField: "_id",
        as: "categoryDoc",
      },
    },
    { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "productsizes",
        localField: "productDoc.size",
        foreignField: "_id",
        as: "sizeDoc",
      },
    },
    { $unwind: { path: "$sizeDoc", preserveNullAndEmptyArrays: true } },
  ]);

  let rows = balances.map((row) => ({
    productId: row.product,
    name: row.productDoc?.name || "Unknown",
    sku: row.productDoc?.sku || "",
    unitLabel: row.productDoc?.unitLabel || "pcs",
    lowStockThreshold: row.productDoc?.lowStockThreshold || 0,
    category: row.categoryDoc ? { id: row.categoryDoc._id, name: row.categoryDoc.name } : null,
    size: row.sizeDoc
      ? { id: row.sizeDoc._id, name: row.sizeDoc.name, code: row.sizeDoc.code }
      : null,
    warehouseId: row.warehouse,
    warehouseName: row.warehouseDoc?.name || "—",
    quantity: roundQty(row.quantity),
    isLow:
      (row.productDoc?.lowStockThreshold || 0) > 0 &&
      row.quantity <= (row.productDoc?.lowStockThreshold || 0),
  }));

  if (category) {
    rows = rows.filter((r) => String(r.category?.id) === String(category));
  }
  if (q?.trim()) {
    const term = q.trim().toLowerCase();
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(term) || r.sku.toLowerCase().includes(term)
    );
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const totalUnits = rows.reduce((s, r) => s + r.quantity, 0);
  return { items: rows, totalUnits: roundQty(totalUnits), skuCount: rows.length };
}

async function getAlerts() {
  const { items } = await getFinishedStock();
  const alerts = items.filter((i) => i.isLow);
  const raw = await purchaseService.getStock();
  const scrap = raw.byMaterial?.scrap || raw;
  const daig = raw.byMaterial?.daig;
  const scrapLow = (scrap.availableKg ?? scrap.totalKg) <= 0;
  const daigLow = daig ? (daig.availableKg ?? daig.totalKg) <= 0 : false;
  const rawAlerts = [];
  if (scrapLow) {
    rawAlerts.push({
      material: "scrap",
      availableKg: scrap.availableKg ?? scrap.totalKg,
      message: "Raw scrap stock is empty or depleted",
    });
  }
  if (daigLow) {
    rawAlerts.push({
      material: "daig",
      availableKg: daig.availableKg ?? daig.totalKg,
      message: "Raw daig stock is empty or depleted",
    });
  }
  return {
    finished: alerts,
    raw: rawAlerts[0] || null,
    rawMaterials: rawAlerts,
    count: alerts.length + rawAlerts.length,
  };
}

async function listMovements({ itemType, product, warehouse, dateFrom, dateTo, reason } = {}) {
  const filter = {};
  if (itemType) filter.itemType = itemType;
  if (product) filter.product = product;
  if (warehouse) filter.warehouse = warehouse;
  if (reason) filter.reason = reason;
  if (dateFrom || dateTo) {
    filter.movementDate = {};
    if (dateFrom) filter.movementDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      filter.movementDate.$lte = end;
    }
  }

  return StockMovement.find(filter)
    .populate("product", "name sku")
    .populate("warehouse", "name code")
    .sort({ movementDate: -1, createdAt: -1 })
    .limit(500);
}

async function createAdjustment(data) {
  const quantity = Number(data.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw httpError("Quantity must be greater than 0", 400);
  }
  if (!["in", "out"].includes(data.direction)) {
    throw httpError("Direction must be in or out", 400);
  }
  if (!ACTIVE_STOCK_ITEM_TYPE_IDS.includes(data.itemType)) {
    throw httpError("Invalid item type", 400);
  }
  if (data.itemType === "finished_good" && !data.product) {
    throw httpError("Product is required for finished goods", 400);
  }

  let warehouseId = data.warehouse;
  if (!warehouseId) {
    const wh = await getDefaultWarehouse();
    warehouseId = wh._id;
  }

  if (data.itemType === "finished_good" && data.direction === "out") {
    const { items } = await getFinishedStock({ warehouse: String(warehouseId) });
    const row = items.find((i) => String(i.productId) === String(data.product));
    const available = row?.quantity || 0;
    if (quantity > available + 1e-9) {
      throw httpError(`Insufficient finished stock. Available ${available}`, 400);
    }
  }

  if (data.itemType === "raw_scrap" && data.direction === "out") {
    const raw = await purchaseService.getStock({ materialType: "scrap" });
    const available = raw.availableKg ?? raw.totalKg;
    if (quantity > available + 1e-9) {
      throw httpError(`Insufficient scrap stock. Available ${available} kg`, 400);
    }
  }

  if (data.itemType === "raw_daig" && data.direction === "out") {
    const raw = await purchaseService.getStock({ materialType: "daig" });
    const available = raw.availableKg ?? raw.totalKg;
    if (quantity > available + 1e-9) {
      throw httpError(`Insufficient daig stock. Available ${available} kg`, 400);
    }
  }

  return recordMovement({
    itemType: data.itemType,
    direction: data.direction,
    reason: data.reason === "transfer_in" || data.reason === "transfer_out" ? data.reason : "adjustment",
    quantity,
    unit: data.itemType === "finished_good" ? "pcs" : "kg",
    product: data.product || null,
    warehouse: warehouseId,
    movementDate: data.movementDate || new Date(),
    notes: data.notes?.trim() || "Manual adjustment",
  });
}

async function getOverview() {
  const [raw, finished, alerts, movementCount] = await Promise.all([
    purchaseService.getStock(),
    getFinishedStock(),
    getAlerts(),
    StockMovement.countDocuments(),
  ]);

  return {
    raw,
    finished: {
      totalUnits: finished.totalUnits,
      skuCount: finished.skuCount,
    },
    alerts: { count: alerts.count },
    movementCount,
  };
}

async function getInventoryReport({ dateFrom, dateTo } = {}) {
  const now = new Date();
  const monthStart = dateFrom
    ? parseDate(dateFrom, "dateFrom")
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = dateTo
    ? parseDate(dateTo, "dateTo")
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const produced = await ProductionBatch.aggregate([
    {
      $match: {
        productionDate: { $gte: monthStart, $lte: monthEnd },
      },
    },
    {
      $group: {
        _id: "$product",
        batchCount: { $sum: 1 },
        goodUnits: { $sum: "$goodUnits" },
        rejectedUnits: { $sum: "$rejectedUnits" },
        netConsumedKg: { $sum: { $subtract: ["$inputScrapKg", "$returnedScrapKg"] } },
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

  const [raw, finished, alerts] = await Promise.all([
    purchaseService.getStock(),
    getFinishedStock(),
    getAlerts(),
  ]);

  const producedTotals = produced.reduce(
    (acc, row) => {
      acc.goodUnits += row.goodUnits;
      acc.rejectedUnits += row.rejectedUnits;
      acc.batchCount += row.batchCount;
      acc.netConsumedKg += row.netConsumedKg;
      return acc;
    },
    { goodUnits: 0, rejectedUnits: 0, batchCount: 0, netConsumedKg: 0 }
  );

  return {
    period: { from: monthStart, to: monthEnd },
    raw,
    finishedStock: {
      totalUnits: finished.totalUnits,
      skuCount: finished.skuCount,
      items: finished.items,
    },
    producedThisPeriod: {
      totals: {
        ...producedTotals,
        netConsumedKg: roundQty(producedTotals.netConsumedKg),
      },
      byProduct: produced.map((row) => ({
        productId: row._id,
        name: row.product?.name || "Unknown",
        batchCount: row.batchCount,
        goodUnits: row.goodUnits,
        rejectedUnits: row.rejectedUnits,
        netConsumedKg: roundQty(row.netConsumedKg),
      })),
    },
    lowStock: alerts.finished,
  };
}

/** Backfill movements for purchases/batches that predate Phase 5 */
async function syncHistoryFromExisting() {
  const Purchase = require("../purchases/purchase.model");
  const purchases = await Purchase.find();
  let purchaseSynced = 0;
  for (const p of purchases) {
    const exists = await StockMovement.findOne({ refType: "purchase", refId: p._id });
    if (!exists) {
      await onPurchaseCreated(p);
      purchaseSynced += 1;
    }
  }

  const batches = await ProductionBatch.find().populate("product", "defaultWarehouse");
  let batchSynced = 0;
  for (const b of batches) {
    const exists = await StockMovement.findOne({ refType: "production", refId: b._id });
    if (!exists) {
      await onBatchCreated(b);
      batchSynced += 1;
    }
  }

  return { purchaseSynced, batchSynced };
}

module.exports = {
  getDefaultWarehouse,
  recordMovement,
  onPurchaseCreated,
  onPurchaseUpdated,
  onPurchaseDeleted,
  onBatchCreated,
  onBatchInputsConsumed,
  onTurningBreakage,
  onBatchFinished,
  onBatchDeleted,
  crudList,
  createCategory,
  updateCategory,
  removeCategory,
  createSize,
  updateSize,
  removeSize,
  createWarehouse,
  updateWarehouse,
  removeWarehouse,
  getFinishedStock,
  getAlerts,
  listMovements,
  createAdjustment,
  getOverview,
  getInventoryReport,
  syncHistoryFromExisting,
  ProductCategory,
  ProductSize,
  Warehouse,
};
