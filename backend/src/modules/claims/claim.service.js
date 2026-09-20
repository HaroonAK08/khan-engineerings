const Claim = require("./claim.model");
const Builty = require("../builty/builty.model");
const Product = require("../products/product.model");
const Purchase = require("../purchases/purchase.model");
const FinanceEntry = require("../finance/finance.model");
const CustomerLedgerEntry = require("../customers/customer-ledger.model");
const Customer = require("../customers/customer.model");
const inventoryService = require("../inventory/inventory.service");
const builtyService = require("../builty/builty.service");
const { materialTypeToItemType } = require("../domain/mfg.constants");
const { applyDiscount } = require("../../utils/builty-discount");

const DISPOSITIONS = ["returned", "rework"];

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

function roundKg(n) {
  return Math.round(n * 1000) / 1000;
}

function productIdOf(ref) {
  if (!ref) return "";
  if (typeof ref === "object" && ref._id) return String(ref._id);
  return String(ref);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function claimCreditNotes(claimNo, amount) {
  return `Claim ${claimNo} party credit −${roundMoney(amount)}`;
}

async function nextClaimNo() {
  const prefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await Claim.countDocuments({ claimNo: new RegExp(`^CLAIM-${prefix}`) });
  return `CLAIM-${prefix}-${String(count + 1).padStart(3, "0")}`;
}

let repairedLegacyCuts = false;

async function restoreBuiltyTotalsFromItems() {
  const builties = await Builty.find();
  for (const builty of builties) {
    const subtotal = (builty.items || []).reduce(
      (sum, line) => sum + (Number(line.lineTotal) || 0),
      0
    );
    const expected = applyDiscount(subtotal, builty.discountAmount).totalAmount;
    if (Math.abs(roundMoney(builty.totalAmount || 0) - expected) <= 0.009) continue;
    builty.totalAmount = expected;
    await builty.save();
    await CustomerLedgerEntry.updateMany(
      { builty: builty._id, type: "invoice" },
      { $set: { amount: expected, notes: `Builty ${builty.builtyNo}` } }
    );
  }
}

async function ensureClaimPartyCredits() {
  const claims = await Claim.find({
    status: { $ne: "cancelled" },
    refundAmount: { $gt: 0 },
  });
  const touched = new Set();
  for (const claim of claims) {
    let entry = null;
    if (claim.ledgerEntry) {
      entry = await CustomerLedgerEntry.findById(claim.ledgerEntry);
    }
    if (!entry) {
      entry = await CustomerLedgerEntry.findOne({
        customer: claim.customer,
        type: "adjustment",
        notes: new RegExp(`Claim ${escapeRegex(claim.claimNo)}`),
      });
    }
    if (!entry) {
      entry = await CustomerLedgerEntry.create({
        customer: claim.customer,
        type: "adjustment",
        amount: roundMoney(claim.refundAmount),
        signedAmount: -roundMoney(claim.refundAmount),
        builty: null,
        entryDate: claim.claimDate,
        notes: claimCreditNotes(claim.claimNo, claim.refundAmount),
      });
    }
    if (String(claim.ledgerEntry || "") !== String(entry._id)) {
      claim.ledgerEntry = entry._id;
      await claim.save();
    }
    if (claim.customer) touched.add(String(claim.customer));
  }
  for (const customerId of touched) {
    await builtyService.syncCustomerBuiltyPaymentStatuses(customerId);
  }
}

async function repairLegacyBuiltyBoundClaims() {
  if (repairedLegacyCuts) return;
  repairedLegacyCuts = true;
  try {
    await restoreBuiltyTotalsFromItems();
    await ensureClaimPartyCredits();
  } catch (err) {
    repairedLegacyCuts = false;
    throw err;
  }
}

async function list({ customer, status, q, builty } = {}) {
  await repairLegacyBuiltyBoundClaims();
  const filter = {};
  if (customer) filter.customer = customer;
  if (status) filter.status = status;
  if (builty) filter.builty = builty;
  if (q?.trim()) filter.claimNo = new RegExp(q.trim(), "i");
  return Claim.find(filter)
    .populate("customer", "name city phone")
    .populate("builty", "builtyNo billNo")
    .populate("items.product", "name sku family weightKg")
    .sort({ claimDate: -1, createdAt: -1 });
}

async function getById(id) {
  const claim = await Claim.findById(id)
    .populate("customer", "name city phone")
    .populate("builty", "builtyNo billNo items")
    .populate("items.product", "name sku family weightKg")
    .populate("reworkBatch", "batchNo status");
  if (!claim) throw httpError("Claim not found", 404);
  return claim;
}

function suggestedUnitPrice(product, weightKg) {
  const w = Number(weightKg) > 0 ? Number(weightKg) : Number(product.weightKg) || 0;
  const rate = Number(product.pricePerKg) || 0;
  if (w > 0 && rate > 0) return roundMoney(w * rate);
  const selling = Number(product.sellingPrice) || 0;
  return selling > 0 ? roundMoney(selling) : 0;
}

function soldUnitPrice(soldLine, product, weightKg) {
  if (Number(soldLine?.unitPrice) > 0) return roundMoney(Number(soldLine.unitPrice));
  const qty = Number(soldLine?.quantity) || 0;
  const lineTotal = Number(soldLine?.lineTotal) || 0;
  if (qty > 0 && lineTotal > 0) return roundMoney(lineTotal / qty);
  return suggestedUnitPrice(product, weightKg);
}

async function avgMaterialRate(materialType) {
  const rateRow = await Purchase.aggregate([
    { $match: { materialType } },
    {
      $group: {
        _id: null,
        spend: { $sum: { $add: ["$totalAmount", { $ifNull: ["$freightAmount", 0] }] } },
        kg: { $sum: "$quantityKg" },
      },
    },
  ]);
  const kg = rateRow[0]?.kg || 0;
  if (kg <= 0) return 0;
  return (rateRow[0].spend || 0) / kg;
}

async function partyProductSales(customerId) {
  const builties = await Builty.find({ customer: customerId })
    .sort({ builtyDate: 1, createdAt: 1 })
    .lean();
  const map = new Map();
  for (const builty of builties) {
    for (const line of builty.items || []) {
      const pid = productIdOf(line.product);
      if (!pid) continue;
      const row = map.get(pid) || { qty: 0, lastLine: null };
      row.qty += Number(line.quantity) || 0;
      row.lastLine = line;
      map.set(pid, row);
    }
  }
  return map;
}

async function partyClaimedQty(customerId, excludeClaimId) {
  const filter = { customer: customerId, status: { $ne: "cancelled" } };
  if (excludeClaimId) filter._id = { $ne: excludeClaimId };
  const claims = await Claim.find(filter).lean();
  const map = new Map();
  for (const claim of claims) {
    for (const item of claim.items || []) {
      const pid = productIdOf(item.product);
      if (!pid) continue;
      map.set(pid, (map.get(pid) || 0) + (Number(item.quantity) || 0));
    }
  }
  return map;
}

async function partyContext(customerId, { excludeClaimId } = {}) {
  if (!customerId) throw httpError("Party is required", 400);
  const customer = await Customer.findById(customerId).select("name phone").lean();
  if (!customer) throw httpError("Party not found", 404);

  const [soldMap, claimedMap] = await Promise.all([
    partyProductSales(customerId),
    partyClaimedQty(customerId, excludeClaimId),
  ]);
  const productIds = [...new Set([...soldMap.keys(), ...claimedMap.keys()])];
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } }).lean()
    : [];
  const productById = new Map(products.map((p) => [String(p._id), p]));

  const productsOut = [];
  for (const pid of productIds) {
    const sold = soldMap.get(pid);
    const claimed = claimedMap.get(pid) || 0;
    const remaining = roundKg(Math.max(0, (sold?.qty || 0) - claimed));
    const product = productById.get(pid);
    const lastLine = sold?.lastLine || null;
    const weightKg =
      Number(lastLine?.weightKg) > 0
        ? Number(lastLine.weightKg)
        : Number(product?.weightKg) || 0;
    productsOut.push({
      productId: pid,
      name: product?.name || "Unknown",
      family: product?.family || "hub",
      soldQty: sold?.qty || 0,
      claimedQty: claimed,
      remainingQty: remaining,
      weightKg,
      unitPrice: soldUnitPrice(lastLine, product || {}, weightKg),
      ratePerKg: Number(lastLine?.ratePerKg) || Number(product?.pricePerKg) || 0,
      pricingMode: lastLine?.pricingMode || "rate_kg",
    });
  }
  productsOut.sort((a, b) => a.name.localeCompare(b.name));

  const customerService = require("../customers/customer.service");
  const balance = await customerService.getBalance(customerId);
  const claimCreditAgg = await Claim.aggregate([
    { $match: { customer: customer._id, status: { $ne: "cancelled" } } },
    { $group: { _id: null, total: { $sum: "$refundAmount" } } },
  ]);

  return {
    customer: { id: String(customer._id), name: customer.name, phone: customer.phone || "" },
    balance: roundMoney(balance),
    creditHeld: roundMoney(Math.max(0, -balance)),
    partyDue: roundMoney(Math.max(0, balance)),
    claimCredit: roundMoney(claimCreditAgg[0]?.total || 0),
    products: productsOut,
  };
}

async function applyStockEffects(claim, items, warehouseId) {
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product) continue;

    if (item.disposition === "returned") {
      await inventoryService.recordMovement({
        itemType: "finished_good",
        direction: "in",
        reason: "claim_return",
        quantity: item.quantity,
        unit: "pcs",
        product: product._id,
        warehouse: warehouseId,
        refType: "claim",
        refId: claim._id,
        movementDate: claim.claimDate,
        notes: `Claim ${claim.claimNo} returned to finished goods`,
      });
      continue;
    }

    if (item.disposition === "rework") {
      const perUnit =
        item.weightKg != null && Number(item.weightKg) > 0
          ? Number(item.weightKg)
          : Number(product.weightKg) || 0;
      const kg = roundKg(perUnit * item.quantity);
      if (kg <= 0) {
        throw httpError(
          `Set weight (kg) for "${product.name}" — scrap is reused, not lost`,
          400
        );
      }
      const materialType = product.family === "drum" ? "daig" : "scrap";
      await inventoryService.recordMovement({
        itemType: materialTypeToItemType(materialType),
        direction: "in",
        reason: "claim_return",
        quantity: kg,
        unit: "kg",
        product: product._id,
        warehouse: warehouseId,
        refType: "claim",
        refId: claim._id,
        movementDate: claim.claimDate,
        notes: `Claim ${claim.claimNo} rework → ${materialType} ${kg} kg (metal reused)`,
      });
    }
  }
}

function unstampBuiltyClaimedQuantities(builty, items) {
  if (!builty) return false;
  let changed = false;
  for (const item of items || []) {
    const line = (builty.items || []).find(
      (l) => productIdOf(l.product) === String(item.product)
    );
    if (!line) continue;
    const already = Number(line.claimedQuantity) || 0;
    const next = Math.max(0, roundMoney(already - (Number(item.quantity) || 0)));
    if (next !== already) {
      line.claimedQuantity = next;
      changed = true;
    }
  }
  return changed;
}

async function applyPartyCredit(claim, refundAmount) {
  const amount = roundMoney(Number(refundAmount) || 0);
  if (amount <= 0) return 0;
  const entry = await CustomerLedgerEntry.create({
    customer: claim.customer,
    type: "adjustment",
    amount,
    signedAmount: -amount,
    builty: null,
    entryDate: claim.claimDate,
    notes: claimCreditNotes(claim.claimNo, amount),
  });
  claim.ledgerEntry = entry._id;
  await builtyService.syncCustomerBuiltyPaymentStatuses(claim.customer);
  return amount;
}

async function reverseClaimEffects(claim) {
  if (claim.ledgerEntry) {
    await CustomerLedgerEntry.deleteOne({ _id: claim.ledgerEntry });
    claim.ledgerEntry = null;
  } else if (claim.claimNo) {
    await CustomerLedgerEntry.deleteMany({
      customer: claim.customer,
      type: "adjustment",
      notes: new RegExp(`Claim ${escapeRegex(claim.claimNo)}`),
    });
  }

  if (claim.builty && roundMoney(claim.refundAmount || 0) > 0) {
    const invoices = await CustomerLedgerEntry.find({
      builty: claim.builty,
      type: "invoice",
    });
    const cut = invoices.find((e) => (e.notes || "").includes(claim.claimNo));
    if (cut) {
      const builty = await Builty.findById(claim.builty);
      if (builty) {
        builty.totalAmount = roundMoney((builty.totalAmount || 0) + (claim.refundAmount || 0));
        unstampBuiltyClaimedQuantities(builty, claim.items);
        await builty.save();
        cut.amount = builty.totalAmount;
        cut.notes = `Builty ${builty.builtyNo}`;
        await cut.save();
      }
    } else {
      const builty = await Builty.findById(claim.builty);
      if (builty && unstampBuiltyClaimedQuantities(builty, claim.items)) {
        await builty.save();
      }
    }
  }

  if (claim.customer) {
    await builtyService.syncCustomerBuiltyPaymentStatuses(claim.customer);
  }

  await inventoryService.deleteMovementsByRef("claim", claim._id);
  await FinanceEntry.deleteMany({
    category: "claim_rework",
    reference: claim.claimNo,
  });
}

async function buildClaimItems(customerId, data, { builty = null, excludeClaimId = null } = {}) {
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw httpError("At least one claim item is required", 400);
  }

  const soldMap = await partyProductSales(customerId);

  const items = [];
  let refundTotal = 0;

  for (const raw of data.items) {
    if (!raw.product) throw httpError("Product is required", 400);
    const product = await Product.findById(raw.product);
    if (!product) throw httpError("Product not found", 404);
    const pid = String(product._id);

    const sold = soldMap.get(pid);

    const quantity = Math.round(Number(raw.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw httpError("Claim quantity must be greater than 0", 400);
    }

    const disposition = raw.disposition || "returned";
    if (!DISPOSITIONS.includes(disposition)) {
      throw httpError("Choose Returned or Rework only", 400);
    }

    const soldLine =
      (builty?.items || []).find((l) => productIdOf(l.product) === pid) || sold?.lastLine || null;
    const weightKg =
      raw.weightKg != null && raw.weightKg !== ""
        ? Number(raw.weightKg)
        : Number(soldLine?.weightKg) > 0
          ? Number(soldLine.weightKg)
          : Number(product.weightKg) || null;
    if (weightKg != null && (!Number.isFinite(weightKg) || weightKg < 0)) {
      throw httpError("Weight kg is invalid", 400);
    }
    if (disposition === "rework" && !(Number(weightKg) > 0)) {
      throw httpError(
        `Weight (kg) is required for rework on "${product.name}" so scrap can be reused`,
        400
      );
    }

    let unitPrice = null;
    if (raw.unitPrice != null && raw.unitPrice !== "") {
      unitPrice = roundMoney(Number(raw.unitPrice));
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw httpError("Unit price is invalid", 400);
      }
    } else {
      unitPrice = soldUnitPrice(soldLine, product, weightKg);
    }

    let refundAmount = 0;
    if (raw.refundAmount != null && raw.refundAmount !== "") {
      refundAmount = roundMoney(Number(raw.refundAmount));
      if (!Number.isFinite(refundAmount) || refundAmount < 0) {
        throw httpError("Refund amount is invalid", 400);
      }
    } else {
      refundAmount = roundMoney(quantity * (Number(unitPrice) || 0));
    }
    refundTotal = roundMoney(refundTotal + refundAmount);

    items.push({
      product: product._id,
      quantity,
      reason: raw.reason?.trim() || "",
      disposition,
      weightKg,
      unitPrice,
      refundAmount,
      mfgLossAmount: 0,
    });
  }

  if (data.refundAmount != null && data.refundAmount !== "") {
    const headerRefund = roundMoney(Number(data.refundAmount));
    if (!Number.isFinite(headerRefund) || headerRefund < 0) {
      throw httpError("Refund amount is invalid", 400);
    }
    if (headerRefund > 0) {
      refundTotal = headerRefund;
    }
  }

  const mfgLossTotal = await computeReworkManufacturingLoss(items);
  return { items, refundTotal, mfgLossTotal };
}

async function computeReworkManufacturingLoss(items) {
  let totalLoss = 0;

  for (const item of items) {
    if (item.disposition !== "rework") {
      item.mfgLossAmount = 0;
      continue;
    }
    const product = await Product.findById(item.product);
    if (!product) {
      item.mfgLossAmount = 0;
      continue;
    }

    const qty = Number(item.quantity) || 0;
    const perUnitKg =
      item.weightKg != null && Number(item.weightKg) > 0
        ? Number(item.weightKg)
        : Number(product.weightKg) || 0;
    const totalKg = roundKg(perUnitKg * qty);
    const materialType = product.family === "drum" ? "daig" : "scrap";
    const rate = await avgMaterialRate(materialType);
    const materialValue = roundMoney(totalKg * rate);
    const fullMfgCost = roundMoney(qty * (Number(product.standardCost) || 0));
    const loss = roundMoney(Math.max(0, fullMfgCost - materialValue));
    item.mfgLossAmount = loss;
    totalLoss = roundMoney(totalLoss + loss);
  }

  return totalLoss;
}

async function postReworkManufacturingLoss(claim, totalLoss) {
  const amount = roundMoney(Number(totalLoss) || 0);
  if (amount <= 0.001) return;
  await FinanceEntry.create({
    type: "expense",
    category: "claim_rework",
    amount,
    entryDate: claim.claimDate,
    reference: claim.claimNo,
    notes: `Rework mfg loss (metal recovered, manufacturing expense lost) · Claim ${claim.claimNo}`,
  });
}

async function resolveCustomerAndBuilty(data, fallback = {}) {
  const builtyId = data.builty || data.order || fallback.builty || null;
  let builty = null;
  if (builtyId) {
    builty = await Builty.findById(builtyId);
    if (!builty) throw httpError("Builty not found", 404);
  }

  const customerId = data.customer || builty?.customer || fallback.customer;
  if (!customerId) throw httpError("Party is required", 400);
  const customer = await Customer.findById(customerId).select("_id");
  if (!customer) throw httpError("Party not found", 404);

  if (builty && String(builty.customer) !== String(customer._id)) {
    throw httpError("Selected builty does not belong to this party", 400);
  }

  return { customerId: customer._id, builty };
}

async function create(data) {
  await repairLegacyBuiltyBoundClaims();
  const { customerId, builty } = await resolveCustomerAndBuilty(data);
  const { items, refundTotal, mfgLossTotal } = await buildClaimItems(customerId, data, { builty });
  const claimDate = parseDate(data.claimDate || new Date(), "Claim date");
  const claimNo = data.claimNo?.trim() || (await nextClaimNo());

  const claim = await Claim.create({
    claimNo,
    builty: builty?._id || null,
    customer: customerId,
    claimDate,
    items,
    refundAmount: 0,
    mfgLossAmount: roundMoney(mfgLossTotal),
    notes: data.notes?.trim() || "",
    status: "open",
  });

  const warehouse =
    builty?.warehouse || (await inventoryService.getDefaultWarehouse())._id;
  await applyStockEffects(claim, items, warehouse);
  const applied = await applyPartyCredit(claim, refundTotal);
  claim.refundAmount = roundMoney(applied);
  await claim.save();
  await postReworkManufacturingLoss(claim, mfgLossTotal);

  return getById(claim._id);
}

async function update(id, data) {
  await repairLegacyBuiltyBoundClaims();
  const claim = await Claim.findById(id);
  if (!claim) throw httpError("Claim not found", 404);

  const hasFullEdit =
    data.items !== undefined ||
    data.builty !== undefined ||
    data.order !== undefined ||
    data.customer !== undefined ||
    data.claimDate !== undefined ||
    data.refundAmount !== undefined;

  if (!hasFullEdit) {
    if (data.status) {
      if (!["open", "resolved", "cancelled"].includes(data.status)) {
        throw httpError("Invalid status", 400);
      }
      claim.status = data.status;
    }
    if (data.notes !== undefined) claim.notes = data.notes.trim();
    if (data.reworkBatch !== undefined) claim.reworkBatch = data.reworkBatch || null;
    if (data.replacementBuilty !== undefined) {
      claim.replacementBuilty = data.replacementBuilty || null;
    }
    await claim.save();
    return getById(claim._id);
  }

  await reverseClaimEffects(claim);

  const { customerId, builty } = await resolveCustomerAndBuilty(data, {
    customer: claim.customer,
    builty: claim.builty,
  });

  const payload = {
    items:
      data.items !== undefined
        ? data.items
        : claim.items.map((i) => ({
            product: i.product,
            quantity: i.quantity,
            weightKg: i.weightKg,
            unitPrice: i.unitPrice,
            refundAmount: i.refundAmount,
            disposition: i.disposition,
            reason: i.reason,
          })),
    refundAmount: data.refundAmount,
    claimDate: data.claimDate || claim.claimDate,
    notes: data.notes !== undefined ? data.notes : claim.notes,
  };

  const { items, refundTotal, mfgLossTotal } = await buildClaimItems(customerId, payload, {
    builty,
    excludeClaimId: claim._id,
  });

  claim.builty = builty?._id || null;
  claim.customer = customerId;
  claim.claimDate = parseDate(payload.claimDate, "Claim date");
  claim.items = items;
  claim.mfgLossAmount = roundMoney(mfgLossTotal);
  claim.notes = payload.notes?.trim?.() || String(payload.notes || "");
  if (data.status && ["open", "resolved", "cancelled"].includes(data.status)) {
    claim.status = data.status;
  }
  claim.refundAmount = 0;
  claim.ledgerEntry = null;
  await claim.save();

  const warehouse =
    builty?.warehouse || (await inventoryService.getDefaultWarehouse())._id;
  await applyStockEffects(claim, items, warehouse);
  const applied = await applyPartyCredit(claim, refundTotal);
  claim.refundAmount = roundMoney(applied);
  await claim.save();
  await postReworkManufacturingLoss(claim, mfgLossTotal);

  return getById(claim._id);
}

async function remove(id) {
  const claim = await Claim.findById(id);
  if (!claim) throw httpError("Claim not found", 404);
  await reverseClaimEffects(claim);
  await claim.deleteOne();
  return { ok: true };
}

async function summarizePeriod(from, to) {
  const filter = { status: { $ne: "cancelled" } };
  if (from || to) {
    filter.claimDate = {};
    if (from) filter.claimDate.$gte = from;
    if (to) filter.claimDate.$lte = to;
  }
  const claims = await Claim.find(filter)
    .populate("items.product", "family")
    .lean();

  const byProduct = {};
  let totalRefund = 0;
  let hubRefund = 0;
  let drumRefund = 0;
  let hubUnits = 0;
  let drumUnits = 0;

  for (const claim of claims) {
    const header = roundMoney(claim.refundAmount || 0);
    totalRefund = roundMoney(totalRefund + header);
    const lineSum = roundMoney(
      (claim.items || []).reduce((s, i) => s + (Number(i.refundAmount) || 0), 0)
    );
    for (const item of claim.items || []) {
      const pid = productIdOf(item.product);
      if (!pid) continue;
      const family =
        item.product && typeof item.product === "object" && item.product.family === "drum"
          ? "drum"
          : "hub";
      const qty = Number(item.quantity) || 0;
      let refund = Number(item.refundAmount) || 0;
      if (header > 0 && lineSum > 0 && Math.abs(header - lineSum) > 0.009) {
        refund = roundMoney((refund / lineSum) * header);
      }
      const row = byProduct[pid] || { refund: 0, units: 0, family };
      row.refund = roundMoney(row.refund + refund);
      row.units += qty;
      row.family = family;
      byProduct[pid] = row;
      if (family === "drum") {
        drumRefund = roundMoney(drumRefund + refund);
        drumUnits += qty;
      } else {
        hubRefund = roundMoney(hubRefund + refund);
        hubUnits += qty;
      }
    }
  }

  return {
    totalRefund: roundMoney(totalRefund),
    hubRefund: roundMoney(hubRefund),
    drumRefund: roundMoney(drumRefund),
    hubUnits,
    drumUnits,
    byProduct,
    count: claims.length,
  };
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  partyContext,
  summarizePeriod,
  avgMaterialRate,
  repairLegacyBuiltyBoundClaims,
};
