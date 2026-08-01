const mongoose = require("mongoose");
const PartyProductPrice = require("./party-product-price.model");
const Customer = require("../customers/customer.model");
const Builty = require("../builty/builty.model");

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function toRow(doc) {
  return {
    customer: String(doc.customer),
    product: String(doc.product),
    pricingMode: doc.pricingMode === "fixed" ? "fixed" : "rate_kg",
    ratePerKg: roundMoney(doc.ratePerKg || 0),
    unitPrice: roundMoney(doc.unitPrice || 0),
    updatedAt: doc.updatedAt || null,
  };
}

async function assertCustomer(customerId) {
  if (!mongoose.isValidObjectId(customerId)) throw httpError("Invalid party", 400);
  const exists = await Customer.exists({ _id: customerId });
  if (!exists) throw httpError("Party not found", 404);
}

async function lastFromBuiltyHistory(customerId, productId) {
  const builty = await Builty.findOne({
    customer: customerId,
    "items.product": productId,
  })
    .sort({ builtyDate: -1, createdAt: -1 })
    .select("items customer")
    .lean();
  if (!builty) return null;
  const line = (builty.items || []).find(
    (item) => String(item.product) === String(productId)
  );
  if (!line) return null;
  return {
    customer: String(customerId),
    product: String(productId),
    pricingMode: line.pricingMode === "fixed" ? "fixed" : "rate_kg",
    ratePerKg: roundMoney(line.ratePerKg || 0),
    unitPrice: roundMoney(line.unitPrice || 0),
    updatedAt: null,
  };
}

async function getOne(customerId, productId) {
  await assertCustomer(customerId);
  if (!mongoose.isValidObjectId(productId)) throw httpError("Invalid product", 400);
  const doc = await PartyProductPrice.findOne({
    customer: customerId,
    product: productId,
  }).lean();
  if (doc) return toRow(doc);
  return lastFromBuiltyHistory(customerId, productId);
}

async function listForCustomer(customerId) {
  await assertCustomer(customerId);
  const rows = await PartyProductPrice.find({ customer: customerId }).lean();
  return rows.map(toRow);
}

async function rememberFromItems(customerId, items) {
  if (!customerId || !Array.isArray(items) || items.length === 0) return;
  for (const line of items) {
    const product = line.product?._id || line.product;
    if (!product) continue;
    const pricingMode = line.pricingMode === "fixed" ? "fixed" : "rate_kg";
    await PartyProductPrice.findOneAndUpdate(
      { customer: customerId, product },
      {
        $set: {
          pricingMode,
          ratePerKg: roundMoney(Number(line.ratePerKg) || 0),
          unitPrice: roundMoney(Number(line.unitPrice) || 0),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

module.exports = {
  getOne,
  listForCustomer,
  rememberFromItems,
};
