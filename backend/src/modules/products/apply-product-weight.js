const Builty = require("../builty/builty.model");
const Claim = require("../claims/claim.model");
const ProductionBatch = require("../production/production.model");
const { startOfLocalDay, roundKg } = require("../../utils/product-weight");

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function productIdOf(value) {
  if (!value) return "";
  if (typeof value === "object") return String(value._id || value);
  return String(value);
}

function isRateKg(line) {
  return line.pricingMode === "rate_kg" || Number(line.ratePerKg) > 0;
}

async function applyProductWeightFromDate(productId, weightKg, fromDate) {
  const from = startOfLocalDay(fromDate);
  if (!from) return { builties: 0, batches: 0, claims: 0 };
  const nextWeight = roundKg(weightKg);
  const pid = String(productId);

  const builties = await Builty.find({
    builtyDate: { $gte: from },
    "items.product": productId,
  });
  const customerIds = new Set();
  let builtyCount = 0;
  for (const builty of builties) {
    let changed = false;
    for (const line of builty.items || []) {
      if (productIdOf(line.product) !== pid) continue;
      line.weightKg = nextWeight;
      if (isRateKg(line)) {
        line.unitPrice = roundMoney(nextWeight * (Number(line.ratePerKg) || 0));
        line.lineTotal = roundMoney((Number(line.quantity) || 0) * (line.unitPrice || 0));
      }
      changed = true;
    }
    if (!changed) continue;
    builty.totalAmount = roundMoney(
      (builty.items || []).reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0)
    );
    await builty.save();
    customerIds.add(String(builty.customer));
    builtyCount += 1;
  }
  if (customerIds.size) {
    const builtyService = require("../builty/builty.service");
    for (const customerId of customerIds) {
      await builtyService.syncCustomerBuiltyPaymentStatuses(customerId);
    }
  }

  const claims = await Claim.find({
    claimDate: { $gte: from },
    "items.product": productId,
  }).populate("builty");
  let claimCount = 0;
  for (const claim of claims) {
    let changed = false;
    for (const item of claim.items || []) {
      if (productIdOf(item.product) !== pid) continue;
      item.weightKg = nextWeight;
      const sold = (claim.builty?.items || []).find((line) => productIdOf(line.product) === pid);
      if (sold && isRateKg(sold)) {
        item.unitPrice = roundMoney(nextWeight * (Number(sold.ratePerKg) || 0));
      }
      changed = true;
    }
    if (!changed) continue;
    await claim.save();
    claimCount += 1;
  }

  const batches = await ProductionBatch.find({
    status: { $ne: "cancelled" },
    productionDate: { $gte: from },
    $or: [{ product: productId }, { "outputs.product": productId }],
  });
  const productionService = require("../production/production.service");
  let batchCount = 0;
  for (const batch of batches) {
    let touched = false;
    for (const out of batch.outputs || []) {
      if (productIdOf(out.product) !== pid) continue;
      out.weightKg = nextWeight;
      touched = true;
    }
    if (!touched && productIdOf(batch.product) === pid && batch.outputs?.[0]) {
      batch.outputs[0].weightKg = nextWeight;
      touched = true;
    }
    if (!touched) continue;
    await batch.save();
    if (batch.status === "completed") {
      await productionService.updateProduce(batch._id, {});
    }
    batchCount += 1;
  }

  return { builties: builtyCount, batches: batchCount, claims: claimCount };
}

module.exports = { applyProductWeightFromDate };
