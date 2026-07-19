const Claim = require("./claim.model");
const SalesOrder = require("../orders/order.model");
const Product = require("../products/product.model");

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

async function nextClaimNo() {
  const prefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = await Claim.countDocuments({ claimNo: new RegExp(`^CLAIM-${prefix}`) });
  return `CLAIM-${prefix}-${String(count + 1).padStart(3, "0")}`;
}

async function list({ customer, status, q } = {}) {
  const filter = {};
  if (customer) filter.customer = customer;
  if (status) filter.status = status;
  if (q?.trim()) filter.claimNo = new RegExp(q.trim(), "i");
  return Claim.find(filter)
    .populate("customer", "name city phone")
    .populate("order", "orderNo invoiceNo")
    .populate("items.product", "name sku family weightKg")
    .sort({ claimDate: -1, createdAt: -1 });
}

async function getById(id) {
  const claim = await Claim.findById(id)
    .populate("customer", "name city phone")
    .populate("order", "orderNo invoiceNo items")
    .populate("items.product", "name sku family weightKg")
    .populate("reworkBatch", "batchNo status");
  if (!claim) throw httpError("Claim not found", 404);
  return claim;
}

async function create(data) {
  if (!data.order) throw httpError("Order / invoice is required", 400);
  const order = await SalesOrder.findById(data.order);
  if (!order) throw httpError("Order not found", 404);
  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw httpError("At least one claim item is required", 400);
  }

  const items = [];
  for (const raw of data.items) {
    if (!raw.product) throw httpError("Product is required", 400);
    const product = await Product.findById(raw.product);
    if (!product) throw httpError("Product not found", 404);
    const quantity = Math.round(Number(raw.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw httpError("Claim quantity must be greater than 0", 400);
    }
    const disposition = raw.disposition;
    if (!["reusable", "rework", "scrap_loss", "replacement"].includes(disposition)) {
      throw httpError("Invalid disposition", 400);
    }
    let weightKg = raw.weightKg != null ? Number(raw.weightKg) : null;
    if (disposition === "reusable" && (weightKg == null || weightKg <= 0)) {
      weightKg = (product.weightKg || 0) * quantity;
    }
    items.push({
      product: product._id,
      quantity,
      reason: raw.reason?.trim() || "",
      disposition,
      weightKg,
    });
  }

  const claim = await Claim.create({
    claimNo: data.claimNo?.trim() || (await nextClaimNo()),
    order: order._id,
    customer: order.customer,
    claimDate: parseDate(data.claimDate || new Date(), "Claim date"),
    items,
    notes: data.notes?.trim() || "",
    status: "open",
  });

  const inventoryService = require("../inventory/inventory.service");
  const wh = await inventoryService.getDefaultWarehouse();
  for (const item of items) {
    if (item.disposition === "reusable" && item.weightKg > 0) {
      await inventoryService.recordMovement({
        itemType: "reusable",
        direction: "in",
        reason: "claim_return",
        quantity: item.weightKg,
        unit: "kg",
        product: item.product,
        warehouse: wh._id,
        refType: "claim",
        refId: claim._id,
        movementDate: claim.claimDate,
        notes: `Claim ${claim.claimNo}`,
      });
    }
  }

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
  if (data.replacementOrder !== undefined) claim.replacementOrder = data.replacementOrder || null;
  await claim.save();
  return getById(claim._id);
}

module.exports = { list, getById, create, update };
