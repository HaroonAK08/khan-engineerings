/**
 * Single source of truth for what a finished piece costs to make.
 *
 * Cost is split into two parts:
 *   rawMaterialCost - the metal: weightKg x average purchase rate
 *   otherCost       - everything else: labour, electricity, finishing, overhead
 *   standardCost    - the sum of the two
 *
 * `otherCost` cannot be read from batch-linked expenses: in practice every
 * expense is entered as factory overhead with `batch: null`, so that sum is
 * always zero and standardCost collapses to metal only. Expenses are, however,
 * scoped hub / drum / common, which is what Finance already uses to derive a
 * per-kg overhead rate. Reuse that rate here so every consumer agrees.
 */
const Purchase = require("../purchases/purchase.model");

const CACHE_TTL_MS = 60_000;
const ROLLING_MONTHS = 12;

let rateCache = null;

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function materialTypeOf(product) {
  return product?.materialType || (product?.family === "drum" ? "daig" : "scrap");
}

async function avgMaterialRates() {
  const rows = await Purchase.aggregate([
    { $match: { materialType: { $in: ["scrap", "daig"] } } },
    {
      $group: {
        _id: "$materialType",
        spend: { $sum: { $add: ["$totalAmount", { $ifNull: ["$freightAmount", 0] }] } },
        kg: { $sum: "$quantityKg" },
      },
    },
  ]);
  const rates = {};
  for (const row of rows) {
    rates[row._id] = row.kg > 0 ? (row.spend || 0) / row.kg : 0;
  }
  return rates;
}

/**
 * Non-material cost per finished kg, by product family, over a rolling window.
 * A single month can be empty for a family, so always span several months.
 */
async function overheadPerKgByFamily() {
  const rates = {};
  try {
    const financeService = require("../finance/finance.service");
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth() - (ROLLING_MONTHS - 1), 1);
    const margin = await financeService.getProductionMargin({
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to.toISOString().slice(0, 10),
    });
    for (const [family, totals] of Object.entries(margin.byFamily || {})) {
      const perKg = Number(totals?.overheadPerKg);
      if (Number.isFinite(perKg) && perKg > 0) rates[family] = perKg;
    }
  } catch (err) {
    console.error("overheadPerKgByFamily failed:", err.message);
  }
  return rates;
}

/** Both rate tables, cached briefly so a bulk recalc does one lookup. */
async function getCostRates({ force = false } = {}) {
  if (!force && rateCache && Date.now() - rateCache.at < CACHE_TTL_MS) {
    return rateCache.rates;
  }
  const [material, overhead] = await Promise.all([
    avgMaterialRates(),
    overheadPerKgByFamily(),
  ]);
  const rates = { material, overhead };
  rateCache = { at: Date.now(), rates };
  return rates;
}

function clearCostRateCache() {
  rateCache = null;
}

/**
 * Cost breakdown for one product. Returns null when the product has no weight,
 * since every figure here is derived per kg.
 *
 * Falls back to the stored value when a family has no overhead rate yet, so a
 * product is never silently zeroed.
 */
function costForProduct(product, rates) {
  const weightKg = Number(product?.weightKg) || 0;
  if (!(weightKg > 0)) return null;

  const materialRate = Number(rates?.material?.[materialTypeOf(product)]) || 0;
  const rawMaterialCost = weightKg * materialRate;

  const overheadPerKg = Number(rates?.overhead?.[product?.family]) || 0;
  let otherCost = weightKg * overheadPerKg;
  if (!(otherCost > 0)) {
    // No rate for this family yet - keep whatever non-material cost we had.
    const storedOther = Number(product?.otherCost) || 0;
    const storedTotal = Number(product?.standardCost) || 0;
    otherCost = storedOther > 0 ? storedOther : Math.max(0, storedTotal - rawMaterialCost);
  }

  return {
    rawMaterialCost: roundMoney(rawMaterialCost),
    otherCost: roundMoney(otherCost),
    standardCost: roundMoney(rawMaterialCost + otherCost),
    materialRate: roundMoney(materialRate),
    overheadPerKg: roundMoney(overheadPerKg),
  };
}

/** Recompute and persist the cost fields. Returns the breakdown, or null. */
async function applyProductCost(product, rates) {
  const resolved = rates || (await getCostRates());
  const cost = costForProduct(product, resolved);
  if (!cost) return null;

  const unchanged =
    Math.abs((Number(product.standardCost) || 0) - cost.standardCost) <= 0.009 &&
    Math.abs((Number(product.rawMaterialCost) || 0) - cost.rawMaterialCost) <= 0.009 &&
    Math.abs((Number(product.otherCost) || 0) - cost.otherCost) <= 0.009;
  if (unchanged) return { ...cost, changed: false };

  product.rawMaterialCost = cost.rawMaterialCost;
  product.otherCost = cost.otherCost;
  product.standardCost = cost.standardCost;
  product.costUpdatedAt = new Date();
  await product.save();
  return { ...cost, changed: true };
}

module.exports = {
  getCostRates,
  clearCostRateCache,
  costForProduct,
  applyProductCost,
  materialTypeOf,
};
