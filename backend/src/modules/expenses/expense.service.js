const BatchExpense = require("./expense.model");
const ProductionBatch = require("../production/production.model");
const Purchase = require("../purchases/purchase.model");
const {
  PRODUCTION_STAGES,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_GROUPS,
  STAGE_IDS,
  CATEGORY_IDS,
} = require("./expense.constants");
const {
  MATERIAL_TYPES,
  PRODUCT_FAMILIES,
  STOCK_ITEM_TYPES,
  STOCK_REASONS,
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

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function getMeta() {
  return {
    stages: PRODUCTION_STAGES,
    categories: EXPENSE_CATEGORIES,
    categoryGroups: EXPENSE_CATEGORY_GROUPS,
    materialTypes: MATERIAL_TYPES,
    productFamilies: PRODUCT_FAMILIES,
    stockItemTypes: STOCK_ITEM_TYPES,
    stockReasons: STOCK_REASONS,
  };
}

async function assertBatch(batchId) {
  const batch = await ProductionBatch.findById(batchId);
  if (!batch) throw httpError("Production batch not found", 404);
  return batch;
}

function validateExpenseBody(data, { requireStage = true } = {}) {
  if (requireStage || data.stage) {
    if (!STAGE_IDS.includes(data.stage)) throw httpError("Invalid production stage", 400);
  }
  if (!CATEGORY_IDS.includes(data.category)) throw httpError("Invalid expense category", 400);
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError("Amount must be greater than 0", 400);
  }
  let quantity = null;
  if (data.quantity != null && data.quantity !== "") {
    quantity = Number(data.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw httpError("Quantity must be 0 or greater", 400);
    }
  }
  const quantityUnit =
    typeof data.quantityUnit === "string" && data.quantityUnit.trim()
      ? data.quantityUnit.trim().slice(0, 24)
      : "kg";
  return {
    stage: data.stage || undefined,
    category: data.category,
    amount: roundMoney(amount),
    expenseDate: parseDate(data.expenseDate || new Date(), "Expense date"),
    notes: data.notes?.trim() || "",
    quantity,
    quantityUnit,
  };
}

async function listByBatch(batchId) {
  await assertBatch(batchId);
  return BatchExpense.find({ batch: batchId }).sort({ expenseDate: -1, createdAt: -1 });
}

async function create(batchId, data) {
  await assertBatch(batchId);
  const fields = validateExpenseBody(data);
  return BatchExpense.create({ batch: batchId, ...fields });
}

/** Factory overhead — labour, utilities, paint, etc. not tied to a production batch. */
async function listOverhead({ dateFrom, dateTo, category } = {}) {
  const match = {
    $or: [{ batch: null }, { batch: { $exists: false } }],
  };
  if (category) {
    if (!CATEGORY_IDS.includes(category)) throw httpError("Invalid expense category", 400);
    match.category = category;
  }
  if (dateFrom || dateTo) {
    match.expenseDate = {};
    if (dateFrom) match.expenseDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      match.expenseDate.$lte = end;
    }
  }
  return BatchExpense.find(match)
    .populate("worker", "name nameUr payType rate job")
    .sort({ expenseDate: -1, createdAt: -1 });
}

async function createOverhead(data) {
  const fields = validateExpenseBody(data, { requireStage: false });
  const doc = {
    batch: null,
    category: fields.category,
    amount: fields.amount,
    expenseDate: fields.expenseDate,
    notes: fields.notes,
  };
  if (fields.stage) doc.stage = fields.stage;
  if (fields.quantity != null) {
    doc.quantity = fields.quantity;
    doc.quantityUnit = fields.quantityUnit || "kg";
  } else {
    doc.quantity = null;
    doc.quantityUnit = null;
  }
  return BatchExpense.create(doc);
}

async function update(expenseId, data) {
  const expense = await BatchExpense.findById(expenseId);
  if (!expense) throw httpError("Expense not found", 404);

  const merged = {
    stage: data.stage ?? expense.stage,
    category: data.category ?? expense.category,
    amount: data.amount ?? expense.amount,
    expenseDate: data.expenseDate ?? expense.expenseDate,
    notes: data.notes !== undefined ? data.notes : expense.notes,
    quantity: data.quantity !== undefined ? data.quantity : expense.quantity,
    quantityUnit:
      data.quantityUnit !== undefined ? data.quantityUnit : expense.quantityUnit,
  };
  const requireStage = Boolean(expense.batch);
  const fields = validateExpenseBody(merged, { requireStage });
  Object.assign(expense, fields);
  if (!fields.stage) expense.stage = undefined;
  if (fields.quantity == null) expense.quantity = null;
  expense.quantityUnit = fields.quantityUnit || "kg";
  await expense.save();
  return expense;
}

async function remove(expenseId) {
  const expense = await BatchExpense.findById(expenseId);
  if (!expense) throw httpError("Expense not found", 404);
  await expense.deleteOne();
  return { ok: true };
}

async function estimateMaterialCost(batch) {
  let materialCost = 0;
  let netConsumed = 0;
  let avgRatePerKg = 0;

  if (Array.isArray(batch.inputs) && batch.inputs.length > 0) {
    let weighted = 0;
    for (const inp of batch.inputs) {
      if (inp.materialType !== "scrap" && inp.materialType !== "daig") {
        continue;
      }
      const rateResult = await Purchase.aggregate([
        { $match: { materialType: inp.materialType } },
        {
          $group: {
            _id: null,
            spend: { $sum: { $add: ["$totalAmount", { $ifNull: ["$freightAmount", 0] }] } },
            kg: { $sum: "$quantityKg" },
          },
        },
      ]);
      const kg = rateResult[0]?.kg || 0;
      const avg = kg > 0 ? (rateResult[0].spend || 0) / kg : 0;
      materialCost += (inp.quantityKg || 0) * avg;
      netConsumed += inp.quantityKg || 0;
      weighted += avg * (inp.quantityKg || 0);
    }
    avgRatePerKg = netConsumed > 0 ? weighted / netConsumed : 0;
  } else {
    const rateResult = await Purchase.aggregate([
      { $group: { _id: null, avgRate: { $avg: "$ratePerKg" } } },
    ]);
    avgRatePerKg = rateResult[0]?.avgRate || 0;
    netConsumed = Math.max(0, (batch.inputScrapKg || 0) - (batch.returnedScrapKg || 0));
    materialCost = netConsumed * avgRatePerKg;
  }

  return {
    avgRatePerKg: roundMoney(avgRatePerKg),
    netConsumedKg: Math.round(netConsumed * 1000) / 1000,
    materialCost: roundMoney(materialCost),
  };
}

async function getBatchCosts(batchId) {
  const batch = await assertBatch(batchId);
  const expenses = await BatchExpense.find({ batch: batchId });

  const byStageMap = Object.fromEntries(STAGE_IDS.map((id) => [id, 0]));
  const byCategoryMap = Object.fromEntries(CATEGORY_IDS.map((id) => [id, 0]));
  let operatingCost = 0;

  for (const e of expenses) {
    operatingCost += e.amount;
    byStageMap[e.stage] = (byStageMap[e.stage] || 0) + e.amount;
    byCategoryMap[e.category] = (byCategoryMap[e.category] || 0) + e.amount;
  }

  const material = await estimateMaterialCost(batch);
  const totalCost = roundMoney(operatingCost + material.materialCost);
  const goodUnits =
    (batch.outputProgress || []).reduce((s, p) => s + (p.finishedQty || p.goodAfterTurning || 0), 0) ||
    batch.goodUnits ||
    0;
  const costPerGoodUnit = goodUnits > 0 ? roundMoney(totalCost / goodUnits) : null;
  const operatingPerGoodUnit = goodUnits > 0 ? roundMoney(operatingCost / goodUnits) : null;

  const byStage = PRODUCTION_STAGES.map((s) => ({
    stage: s.id,
    label: s.label,
    amount: roundMoney(byStageMap[s.id] || 0),
  })).sort((a, b) => b.amount - a.amount);

  const byCategory = EXPENSE_CATEGORIES.map((c) => ({
    category: c.id,
    label: c.label,
    amount: roundMoney(byCategoryMap[c.id] || 0),
  })).sort((a, b) => b.amount - a.amount);

  const mostExpensiveStage = byStage.find((s) => s.amount > 0) || null;

  return {
    batchId: batch._id,
    batchNo: batch.batchNo,
    goodUnits,
    expenseCount: expenses.length,
    operatingCost: roundMoney(operatingCost),
    materialCost: material.materialCost,
    avgRatePerKg: material.avgRatePerKg,
    netConsumedKg: material.netConsumedKg,
    totalCost,
    costPerGoodUnit,
    operatingPerGoodUnit,
    byStage,
    byCategory,
    mostExpensiveStage,
    expenses,
  };
}

async function getCostReport({ dateFrom, dateTo, batch } = {}) {
  const mongoose = require("mongoose");
  const match = {};

  if (batch) {
    if (!mongoose.isValidObjectId(batch)) throw httpError("Invalid batch id", 400);
    match.batch = new mongoose.Types.ObjectId(batch);
  }
  if (dateFrom || dateTo) {
    match.expenseDate = {};
    if (dateFrom) match.expenseDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      match.expenseDate.$lte = end;
    }
  }

  const byStage = await BatchExpense.aggregate([
    { $match: match },
    { $group: { _id: "$stage", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  const byCategory = await BatchExpense.aggregate([
    { $match: match },
    { $group: { _id: "$category", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  const byMonth = await BatchExpense.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: "$expenseDate" },
          month: { $month: "$expenseDate" },
        },
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  const byBatch = await BatchExpense.aggregate([
    { $match: { ...match, batch: { $ne: null } } },
    {
      $group: {
        _id: "$batch",
        operatingCost: { $sum: "$amount" },
        expenseCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "productionbatches",
        localField: "_id",
        foreignField: "_id",
        as: "batch",
      },
    },
    { $unwind: { path: "$batch", preserveNullAndEmptyArrays: true } },
    { $sort: { operatingCost: -1 } },
    { $limit: 20 },
  ]);

  const totals = await BatchExpense.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalOperatingCost: { $sum: "$amount" },
        expenseCount: { $sum: 1 },
      },
    },
  ]);

  const stageLabel = Object.fromEntries(PRODUCTION_STAGES.map((s) => [s.id, s.label]));
  const categoryLabel = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.id, c.label]));

  const stages = PRODUCTION_STAGES.map((s) => {
    const row = byStage.find((r) => r._id === s.id);
    return {
      stage: s.id,
      label: s.label,
      amount: roundMoney(row?.amount || 0),
      count: row?.count || 0,
    };
  }).sort((a, b) => b.amount - a.amount);

  const categories = EXPENSE_CATEGORIES.map((c) => {
    const row = byCategory.find((r) => r._id === c.id);
    return {
      category: c.id,
      label: c.label,
      amount: roundMoney(row?.amount || 0),
      count: row?.count || 0,
    };
  }).sort((a, b) => b.amount - a.amount);

  const monthly = byMonth.map((row, index, arr) => {
    const prev = index > 0 ? arr[index - 1].amount : null;
    const change = prev != null ? roundMoney(row.amount - prev) : null;
    const changePct =
      prev != null && prev > 0 ? roundMoney(((row.amount - prev) / prev) * 100) : null;
    return {
      year: row._id.year,
      month: row._id.month,
      label: `${row._id.year}-${String(row._id.month).padStart(2, "0")}`,
      amount: roundMoney(row.amount),
      count: row.count,
      change,
      changePct,
    };
  });

  const totalOperatingCost = roundMoney(totals[0]?.totalOperatingCost || 0);
  const mostExpensiveStage = stages.find((s) => s.amount > 0) || null;
  const risingCategories = [...categories]
    .filter((c) => c.amount > 0)
    .slice(0, 3);

  // Month-over-month: last month vs previous
  const lastTwo = monthly.slice(-2);
  const expenseTrend =
    lastTwo.length === 2
      ? {
          from: lastTwo[0].label,
          to: lastTwo[1].label,
          change: lastTwo[1].change,
          changePct: lastTwo[1].changePct,
          direction:
            (lastTwo[1].change || 0) > 0
              ? "up"
              : (lastTwo[1].change || 0) < 0
                ? "down"
                : "flat",
        }
      : null;

  return {
    totals: {
      totalOperatingCost,
      expenseCount: totals[0]?.expenseCount || 0,
    },
    byStage: stages,
    byCategory: categories,
    byMonth: monthly,
    byBatch: byBatch.map((row) => ({
      batchId: row._id,
      batchNo: row.batch?.batchNo || "Unknown",
      productionDate: row.batch?.productionDate || null,
      goodUnits: row.batch?.goodUnits || 0,
      operatingCost: roundMoney(row.operatingCost),
      expenseCount: row.expenseCount,
      costPerGoodUnit:
        row.batch?.goodUnits > 0
          ? roundMoney(row.operatingCost / row.batch.goodUnits)
          : null,
    })),
    mostExpensiveStage,
    risingCategories,
    expenseTrend,
    meta: { stageLabel, categoryLabel },
  };
}

module.exports = {
  getMeta,
  listByBatch,
  create,
  listOverhead,
  createOverhead,
  update,
  remove,
  getBatchCosts,
  getCostReport,
};
