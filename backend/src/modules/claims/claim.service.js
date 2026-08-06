const Claim = require("./claim.model");
const Builty = require("../builty/builty.model");
const Product = require("../products/product.model");
const CustomerLedgerEntry = require("../customers/customer-ledger.model");
const inventoryService = require("../inventory/inventory.service");
const builtyService = require("../builty/builty.service");
const { materialTypeToItemType } = require("../domain/mfg.constants");

const DISPOSITIONS = ["returned", "rework", "scrap_loss", "replacement"];

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

async function nextClaimNo() {
  const prefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await Claim.countDocuments({ claimNo: new RegExp(`^CLAIM-${prefix}`) });
  return `CLAIM-${prefix}-${String(count + 1).padStart(3, "0")}`;
}

async function list({ customer, status, q, builty } = {}) {
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
          `Set weight (kg) for "${product.name}" to return it as raw material`,
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
        notes: `Claim ${claim.claimNo} rework → ${materialType} ${kg} kg`,
      });
    }
  }
}

async function applyBuiltyClaimedQuantities(builty, items) {
  for (const item of items) {
    const line = (builty.items || []).find(
      (l) => productIdOf(l.product) === String(item.product)
    );
    if (!line) {
      throw httpError("Claim product must be on the selected builty", 400);
    }
    const already = Number(line.claimedQuantity) || 0;
    const remaining = Number(line.quantity) - already;
    if (item.quantity > remaining + 1e-9) {
      throw httpError(
        `Claim qty exceeds remaining on builty (${remaining} left for this product)`,
        400
      );
    }
    line.claimedQuantity = already + item.quantity;
  }
  await builty.save();
}

async function applyRefund(claim, builty, refundAmount) {
  const amount = roundMoney(Number(refundAmount) || 0);
  if (amount <= 0) return null;

  const currentTotal = roundMoney(builty.totalAmount || 0);
  const applied = roundMoney(Math.min(amount, currentTotal));
  if (applied <= 0) return null;

  const newTotal = roundMoney(currentTotal - applied);
  builty.totalAmount = newTotal;
  await builty.save();

  await CustomerLedgerEntry.updateMany(
    { builty: builty._id, type: "invoice" },
    {
      $set: {
        amount: newTotal,
        notes: `Builty ${builty.builtyNo} (claim ${claim.claimNo} −${applied})`,
      },
    }
  );

  await builtyService.syncCustomerBuiltyPaymentStatuses(claim.customer);
  return { applied, newTotal };
}

async function create(data) {
  const builtyId = data.builty || data.order;
  if (!builtyId) throw httpError("Builty is required", 400);
  const builty = await Builty.findById(builtyId);
  if (!builty) throw httpError("Builty not found", 404);

  if (data.customer && String(data.customer) !== String(builty.customer)) {
    throw httpError("Selected party does not match the builty", 400);
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw httpError("At least one claim item is required", 400);
  }

  const items = [];
  let refundTotal = 0;

  for (const raw of data.items) {
    if (!raw.product) throw httpError("Product is required", 400);
    const product = await Product.findById(raw.product);
    if (!product) throw httpError("Product not found", 404);

    const onBuilty = (builty.items || []).some(
      (l) => productIdOf(l.product) === String(product._id)
    );
    if (!onBuilty) {
      throw httpError(`"${product.name}" is not on the selected builty`, 400);
    }

    const quantity = Math.round(Number(raw.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw httpError("Claim quantity must be greater than 0", 400);
    }

    const disposition = raw.disposition || "returned";
    if (!DISPOSITIONS.includes(disposition)) {
      throw httpError("Invalid disposition", 400);
    }

    const weightKg =
      raw.weightKg != null && raw.weightKg !== ""
        ? Number(raw.weightKg)
        : Number(product.weightKg) || null;
    if (weightKg != null && (!Number.isFinite(weightKg) || weightKg < 0)) {
      throw httpError("Weight kg is invalid", 400);
    }

    let unitPrice = null;
    if (raw.unitPrice != null && raw.unitPrice !== "") {
      unitPrice = roundMoney(Number(raw.unitPrice));
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw httpError("Unit price is invalid", 400);
      }
    } else {
      unitPrice = suggestedUnitPrice(product, weightKg);
    }

    let refundAmount = 0;
    if (raw.refundAmount != null && raw.refundAmount !== "") {
      refundAmount = roundMoney(Number(raw.refundAmount));
      if (!Number.isFinite(refundAmount) || refundAmount < 0) {
        throw httpError("Refund amount is invalid", 400);
      }
    }
    refundTotal += refundAmount;

    items.push({
      product: product._id,
      quantity,
      reason: raw.reason?.trim() || "",
      disposition,
      weightKg,
      unitPrice,
      refundAmount,
    });
  }

  if (data.refundAmount != null && data.refundAmount !== "") {
    const headerRefund = roundMoney(Number(data.refundAmount));
    if (!Number.isFinite(headerRefund) || headerRefund < 0) {
      throw httpError("Refund amount is invalid", 400);
    }
    if (refundTotal <= 0 && headerRefund > 0) {
      refundTotal = headerRefund;
    }
  }

  const claimDate = parseDate(data.claimDate || new Date(), "Claim date");
  const claimNo = data.claimNo?.trim() || (await nextClaimNo());

  const claim = await Claim.create({
    claimNo,
    builty: builty._id,
    customer: builty.customer,
    claimDate,
    items,
    refundAmount: roundMoney(refundTotal),
    notes: data.notes?.trim() || "",
    status: "open",
  });

  await applyBuiltyClaimedQuantities(builty, items);

  const warehouse =
    builty.warehouse || (await inventoryService.getDefaultWarehouse())._id;
  await applyStockEffects(claim, items, warehouse);
  await applyRefund(claim, builty, refundTotal);

  return getById(claim._id);
}

async function update(id, data) {
  const claim = await Claim.findById(id);
  if (!claim) throw httpError("Claim not found", 404);
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

module.exports = { list, getById, create, update };
