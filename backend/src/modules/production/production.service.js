const ProductionBatch = require("./production.model");
const Product = require("../products/product.model");
const Purchase = require("../purchases/purchase.model");
const {
  PRODUCT_FAMILY_IDS,
  INPUT_MATERIAL_TYPE_IDS,
  stagesForFamily,
} = require("../domain/mfg.constants");
const {
  dayRange,
  wantsConfirmDuplicate,
  sameDayDuplicateError,
} = require("../../utils/sameDay");

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

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function localDatePrefix(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `PB-${y}${m}${d}`;
}

function formatBatchNo(prefix, seq) {
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}

async function maxSeqForPrefix(prefix) {
  const existing = await ProductionBatch.find({
    batchNo: new RegExp(`^${prefix}-\\d+$`),
  })
    .select("batchNo")
    .lean();

  let maxSeq = 0;
  for (const row of existing) {
    const match = /-(\d+)$/.exec(row.batchNo || "");
    if (match) maxSeq = Math.max(maxSeq, Number(match[1]));
  }
  return maxSeq;
}

async function nextBatchNo(minSeq = 0) {
  const prefix = localDatePrefix();
  const maxSeq = await maxSeqForPrefix(prefix);
  const seq = Math.max(maxSeq, minSeq) + 1;
  return { batchNo: formatBatchNo(prefix, seq), seq, prefix };
}

function isDuplicateBatchNoError(err) {
  if (!err) return false;
  const nested = err.cause || {};
  const code = err.code ?? nested.code;
  if (code !== 11000 && code !== 11001) return false;
  if (err.keyPattern?.batchNo || err.keyValue?.batchNo) return true;
  if (nested.keyPattern?.batchNo || nested.keyValue?.batchNo) return true;
  const msg = String(err.message || nested.message || "");
  return /batchNo/i.test(msg) || /duplicate key/i.test(msg);
}

async function createBatchWithBatchNo(factory, customBatchNo) {
  if (customBatchNo) {
    try {
      return await factory(customBatchNo);
    } catch (err) {
      if (!isDuplicateBatchNoError(err)) throw err;
    }
  }

  let floor = 0;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const { batchNo, seq } = await nextBatchNo(floor);
    try {
      return await factory(batchNo);
    } catch (err) {
      if (!isDuplicateBatchNoError(err)) throw err;
      floor = seq;
    }
  }

  const fallback = `${localDatePrefix()}-${Date.now()}`;
  return factory(fallback);
}

function buildStages(family) {
  const ids = stagesForFamily(family);
  return ids.map((stage) => ({
    stage,
    status: family === "drum" && stage === "polishing" ? "skipped" : "pending",
    completedAt: null,
    goodUnits: null,
    brokenUnits: null,
    brokenKg: null,
    notes: "",
  }));
}

async function sumNetConsumedForMaterial(materialType, excludeBatchId = null) {
  const match = { status: { $ne: "cancelled" } };
  if (excludeBatchId) match._id = { $ne: excludeBatchId };

  const batches = await ProductionBatch.find(match)
    .select("inputs inputScrapKg returnedScrapKg")
    .lean();

  let total = 0;
  for (const b of batches) {
    if (Array.isArray(b.inputs) && b.inputs.length > 0) {
      for (const inp of b.inputs) {
        if (inp.materialType === materialType && (inp.quantityKg || 0) > 0) {
          total += inp.quantityKg || 0;
        }
      }
    } else if (materialType === "scrap" && b.inputScrapKg != null) {
      total += Math.max(0, (b.inputScrapKg || 0) - (b.returnedScrapKg || 0));
    }
  }
  return roundKg(total);
}

async function sumNetConsumedKg(excludeBatchId = null) {
  return sumNetConsumedForMaterial("scrap", excludeBatchId);
}

async function getAvailableMaterialKg(materialType, excludeBatchId = null) {
  if (materialType !== "scrap" && materialType !== "daig") {
    throw httpError("Material must be scrap or daig", 400);
  }

  const purchased = await Purchase.aggregate([
    { $match: { materialType } },
    { $group: { _id: null, totalKg: { $sum: "$quantityKg" } } },
  ]);
  const purchasedKg = purchased[0]?.totalKg || 0;
  const consumed = await sumNetConsumedForMaterial(materialType, excludeBatchId);
  return roundKg(purchasedKg - consumed);
}

async function getAvailableStockKg(excludeBatchId = null) {
  return getAvailableMaterialKg("scrap", excludeBatchId);
}

function findStage(batch, stageId) {
  return (batch.stages || []).find((s) => s.stage === stageId);
}

function markStageComplete(batch, stageId, extra = {}) {
  const row = findStage(batch, stageId);
  if (!row) throw httpError(`Stage ${stageId} not found on batch`, 400);
  row.status = "completed";
  row.completedAt = new Date();
  Object.assign(row, extra);
}

function nextPendingStage(batch) {
  const order = stagesForFamily(batch.family);
  const idx = order.indexOf(batch.currentStage);
  for (let i = idx + 1; i < order.length; i += 1) {
    const id = order[i];
    const row = findStage(batch, id);
    if (!row) continue;
    if (row.status === "skipped") continue;
    return id;
  }
  return "finished";
}

async function populateBatch(id) {
  return ProductionBatch.findById(id)
    .populate("outputs.product", "name sku family weightKg unitLabel sellingPrice standardCost defaultWarehouse")
    .populate("outputProgress.product", "name sku family weightKg")
    .populate("product", "name sku unitLabel");
}

/**
 * Simple produce: add finished pcs, deduct scrap/daig by weight + waste %.
 * No stages, no Hand. Persists a completed ProductionBatch for history/reports.
 */
async function produce(data) {
  const productId = data.productId || data.product;
  if (!productId) throw httpError("Product is required", 400);

  const product = await Product.findById(productId);
  if (!product) throw httpError("Product not found", 404);
  if (product.isActive === false) throw httpError("Product is inactive", 400);

  const weightKg = Number(product.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw httpError(
      `Set weight (kg) on product "${product.name}" first — material use is calculated from piece weight.`,
      400
    );
  }

  const quantity = Math.round(assertNonNeg(data.quantity, "Quantity"));
  if (quantity <= 0) throw httpError("Quantity must be greater than 0", 400);

  let wastePercent = data.wastePercent;
  if (wastePercent === undefined || wastePercent === null || wastePercent === "") {
    wastePercent = 6;
  }
  wastePercent = Number(wastePercent);
  if (!Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent >= 100) {
    throw httpError("Waste % must be between 0 and 99", 400);
  }

  const family = product.family;
  if (!PRODUCT_FAMILY_IDS.includes(family)) {
    throw httpError("Product family must be hub or drum", 400);
  }

  let materialType = data.materialType || (family === "drum" ? "daig" : "scrap");
  if (!INPUT_MATERIAL_TYPE_IDS.includes(materialType)) {
    throw httpError("Invalid material type", 400);
  }

  const metalKg = roundKg(quantity * weightKg);
  const wasteKg = roundKg(metalKg * (wastePercent / 100));
  const chargedKg = roundKg(metalKg + wasteKg);

  const available = await getAvailableMaterialKg(materialType);

  const productionDate = parseDate(data.productionDate || new Date(), "Production date");

  if (!wantsConfirmDuplicate(data)) {
    const { start, end } = dayRange(productionDate);
    const existing = await ProductionBatch.findOne({
      status: { $ne: "cancelled" },
      productionDate: { $gte: start, $lte: end },
      $or: [{ product: product._id }, { "outputs.product": product._id }],
    })
      .select("_id batchNo")
      .lean();
    if (existing) {
      const err = sameDayDuplicateError(
        `Trying to create a duplicate production entry on the same day for "${product.name}". Do you want to continue?`
      );
      err.existingId = existing._id;
      throw err;
    }
  }

  const now = new Date();
  const stages = buildStages(family).map((s) => ({
    ...s,
    status: s.status === "skipped" ? "skipped" : "completed",
    completedAt: s.status === "skipped" ? null : now,
  }));

  const batch = await createBatchWithBatchNo(
    (batchNo) =>
      ProductionBatch.create({
        batchNo,
        family,
        isRework: Boolean(data.isRework),
        productionDate,
        status: "completed",
        currentStage: "finished",
        inputs: [{ materialType, quantityKg: chargedKg }],
        outputs: [{ product: product._id, quantity, family }],
        furnaceWasteKg: wasteKg,
        handKg: 0,
        stages,
        outputProgress: [
          {
            product: product._id,
            furnaceQty: quantity,
            goodAfterTurning: quantity,
            brokenAfterTurning: 0,
            finishedQty: quantity,
          },
        ],
        notes: data.notes?.trim() || "",
        product: product._id,
        goodUnits: quantity,
        rejectedUnits: 0,
      }),
    data.batchNo?.trim()
  );

  const inventoryService = require("../inventory/inventory.service");
  await inventoryService.onBatchInputsConsumed(batch);
  await inventoryService.onBatchFinished(batch);

  try {
    await updateProductStandardCosts(batch);
  } catch (e) {
    console.error("standardCost update failed:", e.message);
  }

  const populated = await populateBatch(batch._id);
  const obj = populated.toObject ? populated.toObject({ virtuals: true }) : populated;
  obj.produceCalc = {
    metalKg,
    wastePercent,
    wasteKg,
    chargedKg,
    materialType,
    availableAfter: roundKg(available - chargedKg),
  };
  return obj;
}

async function create(data) {
  // Legacy start-batch path kept for API compat; prefer produce()
  const family = data.family;
  if (!PRODUCT_FAMILY_IDS.includes(family)) {
    throw httpError("Family must be hub or drum", 400);
  }

  let materialType = data.materialType || (family === "drum" ? "daig" : "scrap");
  if (!INPUT_MATERIAL_TYPE_IDS.includes(materialType)) {
    throw httpError("Invalid material type", 400);
  }

  const batch = await createBatchWithBatchNo(
    (batchNo) =>
      ProductionBatch.create({
        batchNo,
        family,
        isRework: Boolean(data.isRework),
        productionDate: parseDate(data.productionDate || new Date(), "Production date"),
        status: "in_progress",
        currentStage: "furnace",
        inputs: [{ materialType, quantityKg: 0 }],
        outputs: [],
        furnaceWasteKg: 0,
        handKg: 0,
        stages: buildStages(family),
        outputProgress: [],
        notes: data.notes?.trim() || "",
      }),
    data.batchNo?.trim()
  );

  return populateBatch(batch._id);
}

async function list({ product, dateFrom, dateTo, q, status, currentStage, family } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (currentStage) filter.currentStage = currentStage;
  if (family) filter.family = family;
  if (product) {
    filter.$or = [{ "outputs.product": product }, { product }];
  }
  if (dateFrom || dateTo) {
    filter.productionDate = {};
    if (dateFrom) filter.productionDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      filter.productionDate.$lte = end;
    }
  }
  if (q?.trim()) filter.batchNo = new RegExp(q.trim(), "i");

  return ProductionBatch.find(filter)
    .populate("outputs.product", "name sku family")
    .populate("product", "name sku")
    .sort({ productionDate: -1, createdAt: -1 });
}

async function getById(id) {
  const batch = await populateBatch(id);
  if (!batch) throw httpError("Production batch not found", 404);
  return batch;
}

async function recordFurnace(id, data) {
  // Legacy stage API: Hand removed. Prefer produce().
  const batch = await ProductionBatch.findById(id);
  if (!batch) throw httpError("Production batch not found", 404);
  if (batch.status !== "in_progress") throw httpError("Batch is not in progress", 400);
  if (batch.currentStage !== "furnace") throw httpError("Batch is not at furnace stage", 400);
  if (!Array.isArray(data.outputs) || data.outputs.length === 0) {
    throw httpError("At least one furnace output product is required", 400);
  }

  const outputs = [];
  const outputProgress = [];
  let metalInPiecesKg = 0;

  for (const line of data.outputs) {
    if (!line.product) throw httpError("Output product is required", 400);
    const product = await Product.findById(line.product);
    if (!product) throw httpError("Product not found", 404);
    if (product.family !== batch.family) {
      throw httpError(
        `Product ${product.name} is ${product.family}; batch is ${batch.family}. Cannot mix hub and drum.`,
        400
      );
    }
    const weightKg = Number(product.weightKg);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      throw httpError(
        `Set weight (kg) on product "${product.name}" first — waste is calculated from piece weights.`,
        400
      );
    }
    const quantity = Math.round(assertNonNeg(line.quantity, "Output quantity"));
    if (quantity <= 0) throw httpError("Output quantity must be greater than 0", 400);

    metalInPiecesKg += quantity * weightKg;
    outputs.push({ product: product._id, quantity, family: product.family });
    outputProgress.push({
      product: product._id,
      furnaceQty: quantity,
      goodAfterTurning: quantity,
      brokenAfterTurning: 0,
      finishedQty: 0,
    });
  }

  metalInPiecesKg = roundKg(metalInPiecesKg);

  let wastePercent = data.wastePercent;
  if (wastePercent === undefined || wastePercent === null || wastePercent === "") {
    wastePercent = 6;
  }
  wastePercent = Number(wastePercent);
  if (!Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent >= 100) {
    throw httpError("Waste % must be between 0 and 99", 400);
  }

  const furnaceWasteKg = roundKg(metalInPiecesKg * (wastePercent / 100));
  let finalCharged = roundKg(metalInPiecesKg + furnaceWasteKg);
  let finalWaste = furnaceWasteKg;
  if (data.chargedKg != null && data.chargedKg !== "" && Number(data.chargedKg) > 0) {
    finalCharged = roundKg(assertNonNeg(data.chargedKg, "Charged kg"));
    finalWaste = roundKg(Math.max(0, finalCharged - metalInPiecesKg));
  }

  const materialType =
    (batch.inputs && batch.inputs[0] && batch.inputs[0].materialType) ||
    (batch.family === "drum" ? "daig" : "scrap");

  batch.outputs = outputs;
  batch.outputProgress = outputProgress;
  batch.handKg = 0;
  batch.furnaceWasteKg = finalWaste;
  batch.inputs = [{ materialType, quantityKg: Math.round(finalCharged) || finalCharged }];
  if (data.notes !== undefined) batch.notes = data.notes.trim();

  markStageComplete(batch, "furnace");
  batch.currentStage = "turning";
  await batch.save();

  const inventoryService = require("../inventory/inventory.service");
  await inventoryService.onBatchInputsConsumed(batch);

  const populated = await populateBatch(batch._id);
  const obj = populated.toObject ? populated.toObject({ virtuals: true }) : populated;
  obj.furnaceCalc = {
    metalInPiecesKg,
    handKg: 0,
    wastePercent,
    chargedKg: finalCharged,
    furnaceWasteKg: finalWaste,
  };
  return obj;
}

async function recordTurning(id, data) {
  const batch = await ProductionBatch.findById(id);
  if (!batch) throw httpError("Production batch not found", 404);
  if (batch.status !== "in_progress") throw httpError("Batch is not in progress", 400);
  if (batch.currentStage !== "turning") throw httpError("Batch is not at turning stage", 400);

  const lines = Array.isArray(data.lines) ? data.lines : [];
  if (lines.length === 0) throw httpError("Turning lines are required", 400);

  let totalBrokenKg = 0;
  let totalGood = 0;
  let totalBroken = 0;

  for (const line of lines) {
    const progress = (batch.outputProgress || []).find(
      (p) => String(p.product) === String(line.product)
    );
    if (!progress) throw httpError("Turning line product not in batch outputs", 400);

    const goodUnits = Math.round(assertNonNeg(line.goodUnits ?? 0, "Good units"));
    const brokenUnits = Math.round(assertNonNeg(line.brokenUnits ?? 0, "Broken units"));
    let brokenKg = assertNonNeg(line.brokenKg ?? 0, "Broken kg");
    if (brokenUnits > 0 && brokenKg <= 0) {
      throw httpError("Enter broken weight (kg) when there are broken units", 400);
    }
    if (goodUnits + brokenUnits > progress.furnaceQty + 1e-9) {
      throw httpError("Good + broken cannot exceed furnace output quantity", 400);
    }

    progress.goodAfterTurning = goodUnits;
    progress.brokenAfterTurning = brokenUnits;
    totalBrokenKg += brokenKg;
    totalGood += goodUnits;
    totalBroken += brokenUnits;
  }

  markStageComplete(batch, "turning", {
    goodUnits: totalGood,
    brokenUnits: totalBroken,
    brokenKg: roundKg(totalBrokenKg),
    notes: data.notes?.trim() || "",
  });
  batch.currentStage = "drilling";
  await batch.save();

  if (totalBrokenKg > 0) {
    const inventoryService = require("../inventory/inventory.service");
    await inventoryService.onTurningBreakage(batch, roundKg(totalBrokenKg));
  }

  return populateBatch(batch._id);
}

async function advanceStage(id) {
  const batch = await ProductionBatch.findById(id);
  if (!batch) throw httpError("Production batch not found", 404);
  if (batch.status !== "in_progress") throw httpError("Batch is not in progress", 400);

  const stage = batch.currentStage;
  if (!["drilling", "painting", "polishing"].includes(stage)) {
    throw httpError(`Use dedicated action for stage ${stage}`, 400);
  }

  markStageComplete(batch, stage);
  const next = nextPendingStage(batch);
  batch.currentStage = next;
  await batch.save();

  if (next === "finished") {
    return finishBatch(id);
  }
  return populateBatch(batch._id);
}

async function updateProductStandardCosts(batch) {
  const BatchExpense = require("../expenses/expense.model");
  const expenses = await BatchExpense.find({ batch: batch._id });
  const operatingCost = expenses.reduce((s, e) => s + e.amount, 0);

  let materialCost = 0;
  for (const inp of batch.inputs || []) {
    if (inp.materialType !== "scrap" && inp.materialType !== "daig") continue;
    const rateRow = await Purchase.aggregate([
      { $match: { materialType: inp.materialType } },
      {
        $group: {
          _id: null,
          spend: { $sum: { $add: ["$totalAmount", { $ifNull: ["$freightAmount", 0] }] } },
          kg: { $sum: "$quantityKg" },
        },
      },
    ]);
    const kg = rateRow[0]?.kg || 0;
    const avg = kg > 0 ? (rateRow[0].spend || 0) / kg : 0;
    materialCost += (inp.quantityKg || 0) * avg;
  }
  const totalCost = materialCost + operatingCost;

  const lines = [];
  for (const p of batch.outputProgress || []) {
    if ((p.finishedQty || 0) <= 0) continue;
    const product = await Product.findById(p.product);
    if (!product) continue;
    const weight = (product.weightKg || 0) * p.finishedQty;
    lines.push({ product, finishedQty: p.finishedQty, weight });
  }
  const weightSum = lines.reduce((s, l) => s + l.weight, 0);
  const pieceSum = lines.reduce((s, l) => s + l.finishedQty, 0);

  for (const line of lines) {
    const share =
      weightSum > 0 ? line.weight / weightSum : pieceSum > 0 ? line.finishedQty / pieceSum : 0;
    const costShare = totalCost * share;
    const unitCost = line.finishedQty > 0 ? costShare / line.finishedQty : 0;
    const prevQty = Number(line.product._standardCostQty) || 0;
    // Weighted moving average using finished pieces as weights stored loosely via recalculation:
    // newAvg = (oldCost * oldImpliedQty + unitCost * finishedQty) / (oldImpliedQty + finishedQty)
    // Without stored qty history, blend 50/50 if standardCost exists else set unitCost.
    const old = Number(line.product.standardCost) || 0;
    const newAvg =
      old > 0
        ? roundMoney((old * line.finishedQty + unitCost * line.finishedQty) / (line.finishedQty * 2))
        : roundMoney(unitCost);
    // Better: weight by finishedQty vs previous equal weight assumption
    line.product.standardCost =
      old > 0 ? roundMoney((old + unitCost) / 2) : roundMoney(unitCost);
    // Prefer proper WMA with finished qty only for this batch contribution stored:
    line.product.standardCost = roundMoney(
      old > 0
        ? (old * Math.max(line.finishedQty, 1) + unitCost * line.finishedQty) /
            (Math.max(line.finishedQty, 1) + line.finishedQty)
        : unitCost
    );
    await line.product.save();
  }
}

async function finishBatch(id) {
  const batch = await ProductionBatch.findById(id);
  if (!batch) throw httpError("Production batch not found", 404);
  if (batch.status === "completed") return populateBatch(id);
  if (batch.status !== "in_progress") throw httpError("Batch is not in progress", 400);

  // Allow finish from finished pending or when advancing lands here
  if (!["finished", "painting", "polishing", "drilling"].includes(batch.currentStage)) {
    // if already at finished stage pending
  }

  for (const p of batch.outputProgress || []) {
    if (!p.finishedQty) p.finishedQty = p.goodAfterTurning || 0;
  }

  const finishedStage = findStage(batch, "finished");
  if (finishedStage && finishedStage.status !== "completed") {
    finishedStage.status = "completed";
    finishedStage.completedAt = new Date();
  }

  batch.currentStage = "finished";
  batch.status = "completed";
  await batch.save();

  const inventoryService = require("../inventory/inventory.service");
  await inventoryService.onBatchFinished(batch);

  try {
    await updateProductStandardCosts(batch);
  } catch (e) {
    console.error("standardCost update failed:", e.message);
  }

  return populateBatch(batch._id);
}

async function cancelBatch(id) {
  const batch = await ProductionBatch.findById(id);
  if (!batch) throw httpError("Production batch not found", 404);
  if (batch.status !== "in_progress") throw httpError("Only in-progress batches can be cancelled", 400);
  if (batch.currentStage === "finished" || batch.status === "completed") {
    throw httpError("Cannot cancel a finished batch", 400);
  }

  const inventoryService = require("../inventory/inventory.service");
  await inventoryService.onBatchDeleted(batch._id);
  // Re-credit is handled by deleting production movements; also reverse reusable posts by deleting all production ref movements
  batch.status = "cancelled";
  await batch.save();
  return populateBatch(batch._id);
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

async function updateProduce(id, data) {
  const batch = await ProductionBatch.findById(id);
  if (!batch) throw httpError("Production batch not found", 404);
  if (batch.status !== "completed") {
    throw httpError("Only completed produce runs can be updated this way", 400);
  }

  const productId =
    data.productId || data.product || batch.outputs?.[0]?.product || batch.product;
  if (!productId) throw httpError("Product is required", 400);

  const product = await Product.findById(productId);
  if (!product) throw httpError("Product not found", 404);
  if (product.isActive === false) throw httpError("Product is inactive", 400);

  const weightKg = Number(product.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    throw httpError(
      `Set weight (kg) on product "${product.name}" first — material use is calculated from piece weight.`,
      400
    );
  }

  const quantity = Math.round(
    assertNonNeg(
      data.quantity !== undefined ? data.quantity : batch.outputs?.[0]?.quantity || batch.goodUnits,
      "Quantity"
    )
  );
  if (quantity <= 0) throw httpError("Quantity must be greater than 0", 400);

  let wastePercent = data.wastePercent;
  if (wastePercent === undefined || wastePercent === null || wastePercent === "") {
    const prevCharged = Number(batch.inputs?.[0]?.quantityKg) || 0;
    const prevWaste = Number(batch.furnaceWasteKg) || 0;
    const prevMetal = roundKg(Math.max(0, prevCharged - prevWaste));
    wastePercent = prevMetal > 0 ? roundKg((prevWaste / prevMetal) * 100) : 6;
  }
  wastePercent = Number(wastePercent);
  if (!Number.isFinite(wastePercent) || wastePercent < 0 || wastePercent >= 100) {
    throw httpError("Waste % must be between 0 and 99", 400);
  }

  const family = product.family;
  if (!PRODUCT_FAMILY_IDS.includes(family)) {
    throw httpError("Product family must be hub or drum", 400);
  }

  let materialType =
    data.materialType ||
    batch.inputs?.[0]?.materialType ||
    (family === "drum" ? "daig" : "scrap");
  if (!INPUT_MATERIAL_TYPE_IDS.includes(materialType)) {
    throw httpError("Invalid material type", 400);
  }

  const metalKg = roundKg(quantity * weightKg);
  const wasteKg = roundKg(metalKg * (wastePercent / 100));
  const chargedKg = roundKg(metalKg + wasteKg);

  const available = await getAvailableMaterialKg(materialType, batch._id);

  const productionDate = parseDate(
    data.productionDate || batch.productionDate || new Date(),
    "Production date"
  );

  const inventoryService = require("../inventory/inventory.service");
  await inventoryService.onBatchDeleted(batch._id);

  batch.family = family;
  batch.productionDate = productionDate;
  batch.inputs = [{ materialType, quantityKg: chargedKg }];
  batch.outputs = [{ product: product._id, quantity, family }];
  batch.furnaceWasteKg = wasteKg;
  batch.outputProgress = [
    {
      product: product._id,
      furnaceQty: quantity,
      goodAfterTurning: quantity,
      brokenAfterTurning: 0,
      finishedQty: quantity,
    },
  ];
  batch.product = product._id;
  batch.goodUnits = quantity;
  batch.rejectedUnits = 0;
  if (data.notes !== undefined) batch.notes = String(data.notes || "").trim();
  await batch.save();

  await inventoryService.onBatchInputsConsumed(batch);
  await inventoryService.onBatchFinished(batch);

  try {
    await updateProductStandardCosts(batch);
  } catch (e) {
    console.error("standardCost update failed:", e.message);
  }

  const populated = await populateBatch(batch._id);
  const obj = populated.toObject ? populated.toObject({ virtuals: true }) : populated;
  obj.produceCalc = {
    metalKg,
    wastePercent,
    wasteKg,
    chargedKg,
    materialType,
    availableAfter: roundKg(available - chargedKg),
  };
  return obj;
}

async function update(id, data) {
  const batch = await ProductionBatch.findById(id);
  if (!batch) throw httpError("Production batch not found", 404);

  const isProduceEdit =
    batch.status === "completed" &&
    (data.quantity !== undefined ||
      data.productId !== undefined ||
      data.product !== undefined ||
      data.wastePercent !== undefined ||
      data.materialType !== undefined);

  if (isProduceEdit) {
    return updateProduce(id, data);
  }

  if (batch.status !== "in_progress") throw httpError("Only in-progress batches can be edited", 400);
  if (data.notes !== undefined) batch.notes = data.notes.trim();
  if (data.productionDate !== undefined) {
    batch.productionDate = parseDate(data.productionDate, "Production date");
  }
  await batch.save();
  return populateBatch(batch._id);
}

async function getReport({ dateFrom, dateTo, family } = {}) {
  const match = { status: { $ne: "cancelled" } };
  if (family) match.family = family;
  if (dateFrom || dateTo) {
    match.productionDate = {};
    if (dateFrom) match.productionDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      match.productionDate.$lte = end;
    }
  }

  const batches = await ProductionBatch.find(match)
    .populate("outputs.product", "name sku family")
    .populate("outputProgress.product", "name sku family")
    .populate("product", "name sku family")
    .lean();

  let batchCount = 0;
  let totalInputKg = 0;
  let scrapKg = 0;
  let daigKg = 0;
  let wasteKg = 0;
  let goodUnits = 0;
  let brokenUnits = 0;
  let finishedUnits = 0;
  const byFamily = { hub: 0, drum: 0 };
  const byProductMap = new Map();

  for (const b of batches) {
    batchCount += 1;
    byFamily[b.family] = (byFamily[b.family] || 0) + 1;
    if (Array.isArray(b.inputs) && b.inputs.length) {
      for (const inp of b.inputs) {
        const qty = inp.quantityKg || 0;
        totalInputKg += qty;
        if (inp.materialType === "daig") daigKg += qty;
        else scrapKg += qty;
      }
    } else {
      const legacyKg = b.inputScrapKg || 0;
      totalInputKg += legacyKg;
      scrapKg += legacyKg;
    }
    wasteKg += b.furnaceWasteKg || b.materialLossKg || 0;

    let batchFinished = 0;
    for (const p of b.outputProgress || []) {
      goodUnits += p.goodAfterTurning || 0;
      brokenUnits += p.brokenAfterTurning || 0;
      const fin = p.finishedQty || p.goodAfterTurning || 0;
      finishedUnits += fin;
      batchFinished += fin;
      const pid = String(p.product?._id || p.product || "");
      if (pid) {
        const name =
          (typeof p.product === "object" && p.product?.name) ||
          "Product";
        const productFamily =
          (typeof p.product === "object" && p.product?.family) ||
          b.family ||
          "hub";
        const row = byProductMap.get(pid) || {
          productId: pid,
          name,
          family: productFamily,
          batchCount: 0,
          goodUnits: 0,
          rejectedUnits: 0,
          netConsumedKg: 0,
          scrapKg: 0,
          daigKg: 0,
        };
        row.batchCount += 1;
        row.goodUnits += fin;
        row.rejectedUnits += p.brokenAfterTurning || 0;
        byProductMap.set(pid, row);
      }
    }
    if (!b.outputProgress?.length) {
      goodUnits += b.goodUnits || 0;
      brokenUnits += b.rejectedUnits || 0;
      finishedUnits += b.goodUnits || 0;
      batchFinished += b.goodUnits || 0;

      const outputLines = Array.isArray(b.outputs) ? b.outputs : [];
      if (outputLines.length) {
        for (const out of outputLines) {
          const pid = String(out.product?._id || out.product || "");
          if (!pid) continue;
          const name =
            (typeof out.product === "object" && out.product?.name) || "Product";
          const productFamily =
            out.family ||
            (typeof out.product === "object" && out.product?.family) ||
            b.family ||
            "hub";
          const row = byProductMap.get(pid) || {
            productId: pid,
            name,
            family: productFamily,
            batchCount: 0,
            goodUnits: 0,
            rejectedUnits: 0,
            netConsumedKg: 0,
            scrapKg: 0,
            daigKg: 0,
          };
          row.batchCount += 1;
          row.goodUnits += out.quantity || 0;
          byProductMap.set(pid, row);
        }
      } else {
        const legacyPid = String(b.product?._id || b.product || "");
        if (legacyPid && batchFinished > 0) {
          const name =
            (typeof b.product === "object" && b.product?.name) || "Product";
          const productFamily =
            (typeof b.product === "object" && b.product?.family) ||
            b.family ||
            "hub";
          const row = byProductMap.get(legacyPid) || {
            productId: legacyPid,
            name,
            family: productFamily,
            batchCount: 0,
            goodUnits: 0,
            rejectedUnits: 0,
            netConsumedKg: 0,
            scrapKg: 0,
            daigKg: 0,
          };
          row.batchCount += 1;
          row.goodUnits += b.goodUnits || 0;
          row.rejectedUnits += b.rejectedUnits || 0;
          byProductMap.set(legacyPid, row);
        }
      }
    }

    // Spread batch material across output products for report
    let batchScrapKg = 0;
    let batchDaigKg = 0;
    if (Array.isArray(b.inputs) && b.inputs.length) {
      for (const inp of b.inputs) {
        const qty = inp.quantityKg || 0;
        if (inp.materialType === "daig") batchDaigKg += qty;
        else batchScrapKg += qty;
      }
    } else {
      batchScrapKg = b.inputScrapKg || 0;
    }
    const inputKg = batchScrapKg + batchDaigKg;
    if (batchFinished > 0 && byProductMap.size) {
      for (const out of b.outputs || []) {
        const pid = String(out.product?._id || out.product || "");
        const row = byProductMap.get(pid);
        if (row) {
          const share = (out.quantity || 0) / batchFinished;
          row.netConsumedKg = roundKg(row.netConsumedKg + inputKg * share);
          row.scrapKg = roundKg(row.scrapKg + batchScrapKg * share);
          row.daigKg = roundKg(row.daigKg + batchDaigKg * share);
        }
      }
    }
  }

  const netConsumedKg = roundKg(totalInputKg);
  const rejectRate =
    goodUnits + brokenUnits > 0
      ? Math.round((brokenUnits / (goodUnits + brokenUnits)) * 1000) / 10
      : 0;
  const lossRate =
    totalInputKg > 0 ? Math.round((wasteKg / totalInputKg) * 1000) / 10 : 0;

  return {
    totals: {
      batchCount,
      totalInputKg: roundKg(totalInputKg),
      inputScrapKg: roundKg(scrapKg),
      scrapKg: roundKg(scrapKg),
      daigKg: roundKg(daigKg),
      handKg: 0,
      returnedScrapKg: 0,
      wasteKg: roundKg(wasteKg),
      materialLossKg: roundKg(wasteKg),
      netConsumedKg,
      goodUnits: finishedUnits || goodUnits,
      brokenUnits,
      rejectedUnits: brokenUnits,
      finishedUnits,
      rejectRate,
      lossRate,
      byFamily,
      byMaterial: {
        scrap: roundKg(scrapKg),
        daig: roundKg(daigKg),
      },
    },
    byProduct: Array.from(byProductMap.values()).sort((a, b) => {
      const fam = String(a.family || "hub").localeCompare(String(b.family || "hub"));
      if (fam !== 0) return fam;
      return a.name.localeCompare(b.name);
    }),
  };
}

async function getProductReport(productId, { dateFrom, dateTo } = {}) {
  if (!productId) throw httpError("Product is required", 400);
  const product = await Product.findById(productId).lean();
  if (!product) throw httpError("Product not found", 404);

  const filter = {
    status: { $ne: "cancelled" },
    $or: [{ "outputs.product": productId }, { product: productId }],
  };
  if (dateFrom || dateTo) {
    filter.productionDate = {};
    if (dateFrom) filter.productionDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      filter.productionDate.$lte = end;
    }
  }

  const batches = await ProductionBatch.find(filter)
    .populate("outputs.product", "name sku family weightKg")
    .populate("product", "name sku")
    .sort({ productionDate: 1, createdAt: 1 })
    .lean();

  const runs = [];
  const byDateMap = new Map();
  let totalPieces = 0;
  let totalUsedKg = 0;
  let totalWasteKg = 0;

  for (const batch of batches) {
    let qty = 0;
    let batchOutputQty = 0;
    for (const out of batch.outputs || []) {
      const outQty = out.quantity || 0;
      batchOutputQty += outQty;
      const pid = String(out.product?._id || out.product || "");
      if (pid === String(productId)) qty += outQty;
    }
    if (qty <= 0 && String(batch.product?._id || batch.product || "") === String(productId)) {
      qty = batch.goodUnits || 0;
      batchOutputQty = Math.max(batchOutputQty, qty);
    }
    if (qty <= 0) continue;

    const batchUsedKg =
      Array.isArray(batch.inputs) && batch.inputs.length
        ? batch.inputs.reduce((s, i) => s + (i.quantityKg || 0), 0)
        : batch.inputScrapKg || 0;
    const batchWasteKg = Number(batch.furnaceWasteKg || batch.materialLossKg) || 0;
    const share = batchOutputQty > 0 ? qty / batchOutputQty : 1;
    const usedKg = roundKg(batchUsedKg * share);
    const wasteKg = roundKg(batchWasteKg * share);
    const metalKg = Math.max(0, usedKg - wasteKg);
    const wastePercent =
      metalKg > 0 ? Math.round((wasteKg / metalKg) * 1000) / 10 : 0;
    const dateKey = new Date(batch.productionDate).toISOString().slice(0, 10);

    const run = {
      id: String(batch._id),
      batchNo: batch.batchNo,
      productionDate: batch.productionDate,
      date: dateKey,
      quantity: qty,
      usedKg,
      wasteKg,
      wastePercent,
      materialType: batch.inputs?.[0]?.materialType || "scrap",
      status: batch.status,
    };
    runs.push(run);

    totalPieces += qty;
    totalUsedKg += usedKg;
    totalWasteKg += wasteKg;

    const day = byDateMap.get(dateKey) || {
      date: dateKey,
      runs: 0,
      quantity: 0,
      usedKg: 0,
      wasteKg: 0,
    };
    day.runs += 1;
    day.quantity += qty;
    day.usedKg = roundKg(day.usedKg + usedKg);
    day.wasteKg = roundKg(day.wasteKg + wasteKg);
    byDateMap.set(dateKey, day);
  }

  const byDate = Array.from(byDateMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    product: {
      id: String(product._id),
      name: product.name,
      sku: product.sku || "",
      family: product.family,
      weightKg: product.weightKg ?? null,
    },
    period: { from: dateFrom || null, to: dateTo || null },
    totals: {
      runCount: runs.length,
      pieces: totalPieces,
      usedKg: roundKg(totalUsedKg),
      wasteKg: roundKg(totalWasteKg),
      wastePercent:
        totalUsedKg - totalWasteKg > 0
          ? Math.round((totalWasteKg / (totalUsedKg - totalWasteKg)) * 1000) / 10
          : 0,
    },
    byDate,
    runs,
  };
}

module.exports = {
  produce,
  create,
  list,
  getById,
  update,
  updateProduce,
  remove,
  recordFurnace,
  recordTurning,
  advanceStage,
  finishBatch,
  cancelBatch,
  getReport,
  getProductReport,
  getAvailableStockKg,
  getAvailableMaterialKg,
  sumNetConsumedKg,
  sumNetConsumedForMaterial,
};
