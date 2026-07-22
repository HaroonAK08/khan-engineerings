const Product = require("./product.model");
const { PRODUCT_FAMILY_IDS } = require("../domain/mfg.constants");

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const POPULATE = [
  { path: "category", select: "name" },
  { path: "size", select: "name code" },
  { path: "defaultWarehouse", select: "name code" },
];

function optionalId(value) {
  if (value === null || value === "" || value === undefined) return null;
  return value;
}

function optionalNonNeg(value, label) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw httpError(`${label} must be 0 or greater`, 400);
  return n;
}

function requirePositive(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw httpError(`${label} is required and must be greater than 0`, 400);
  }
  return n;
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

async function create(data) {
  const name = data.name?.trim();
  if (!name) throw httpError("Name is required", 400);

  const family = data.family || "hub";
  if (!PRODUCT_FAMILY_IDS.includes(family)) {
    throw httpError("Family must be hub or drum", 400);
  }

  const weightKg = requirePositive(data.weightKg, "Weight (kg)");
  const pricePerKg = optionalNonNeg(data.pricePerKg, "Rate per kg") ?? 0;

  const product = await Product.create({
    name,
    sku: data.sku?.trim() || "",
    description: data.description?.trim() || "",
    unitLabel: data.unitLabel?.trim() || "pcs",
    family,
    weightKg,
    standardCost: optionalNonNeg(data.standardCost, "Standard cost") ?? 0,
    pricePerKg,
    sellingPrice: roundMoney(weightKg * pricePerKg),
    category: optionalId(data.category),
    size: optionalId(data.size),
    defaultWarehouse: optionalId(data.defaultWarehouse),
    lowStockThreshold:
      data.lowStockThreshold !== undefined ? Math.max(0, Number(data.lowStockThreshold) || 0) : 0,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
  });
  return Product.findById(product._id).populate(POPULATE);
}

async function list({ q, active, category, size, family } = {}) {
  const filter = {};
  if (active === "true" || active === true) filter.isActive = true;
  if (active === "false" || active === false) filter.isActive = false;
  if (category) filter.category = category;
  if (size) filter.size = size;
  if (family && PRODUCT_FAMILY_IDS.includes(family)) filter.family = family;
  if (q?.trim()) {
    const term = q.trim();
    filter.$or = [{ name: new RegExp(term, "i") }, { sku: new RegExp(term, "i") }];
  }
  return Product.find(filter).populate(POPULATE).sort({ name: 1 });
}

async function getById(id) {
  const product = await Product.findById(id).populate(POPULATE);
  if (!product) throw httpError("Product not found", 404);
  return product;
}

async function update(id, data) {
  const product = await Product.findById(id);
  if (!product) throw httpError("Product not found", 404);

  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw httpError("Name is required", 400);
    product.name = name;
  }
  if (data.sku !== undefined) product.sku = data.sku.trim();
  if (data.description !== undefined) product.description = data.description.trim();
  if (data.unitLabel !== undefined) product.unitLabel = data.unitLabel.trim() || "pcs";
  if (data.family !== undefined) {
    if (!PRODUCT_FAMILY_IDS.includes(data.family)) {
      throw httpError("Family must be hub or drum", 400);
    }
    product.family = data.family;
  }
  if (data.weightKg !== undefined) {
    product.weightKg = requirePositive(data.weightKg, "Weight (kg)");
  }
  if (data.standardCost !== undefined) {
    product.standardCost = optionalNonNeg(data.standardCost, "Standard cost") ?? 0;
  }
  if (data.pricePerKg !== undefined) {
    product.pricePerKg = optionalNonNeg(data.pricePerKg, "Rate per kg") ?? 0;
  }
  if (data.weightKg !== undefined || data.pricePerKg !== undefined) {
    product.sellingPrice = roundMoney((product.weightKg || 0) * (product.pricePerKg || 0));
  }
  if (data.category !== undefined) product.category = optionalId(data.category);
  if (data.size !== undefined) product.size = optionalId(data.size);
  if (data.defaultWarehouse !== undefined) {
    product.defaultWarehouse = optionalId(data.defaultWarehouse);
  }
  if (data.lowStockThreshold !== undefined) {
    product.lowStockThreshold = Math.max(0, Number(data.lowStockThreshold) || 0);
  }
  if (data.isActive !== undefined) product.isActive = Boolean(data.isActive);
  await product.save();
  return Product.findById(product._id).populate(POPULATE);
}

async function remove(id) {
  const product = await getById(id);
  const ProductionBatch = require("../production/production.model");
  const count = await ProductionBatch.countDocuments({ product: id });
  if (count > 0) {
    throw httpError("Cannot delete product used in production batches. Deactivate instead.", 409);
  }
  await product.deleteOne();
  return { ok: true };
}

module.exports = { create, list, getById, update, remove };
