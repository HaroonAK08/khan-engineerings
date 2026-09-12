const { AssetCategory, AssetItem } = require("./asset.model");

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function listCategories() {
  const categories = await AssetCategory.find().sort({ sortOrder: 1, name: 1 }).lean();
  const totals = await AssetItem.aggregate([
    {
      $group: {
        _id: "$category",
        itemCount: { $sum: 1 },
        totalValue: {
          $sum: {
            $multiply: [{ $ifNull: ["$price", 0] }, { $ifNull: ["$quantity", 1] }],
          },
        },
      },
    },
  ]);
  const byId = new Map(totals.map((t) => [String(t._id), t]));
  return categories.map((c) => {
    const row = byId.get(String(c._id));
    return {
      ...c,
      itemCount: row?.itemCount || 0,
      totalValue: roundMoney(row?.totalValue || 0),
    };
  });
}

async function createCategory(data) {
  const name = String(data.name || "").trim();
  if (!name) throw httpError("Category name is required", 400);
  const existing = await AssetCategory.findOne({
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
  });
  if (existing) throw httpError("A category with this name already exists", 409);
  return AssetCategory.create({
    name,
    notes: String(data.notes || "").trim(),
    sortOrder: Number(data.sortOrder) || 0,
  });
}

async function updateCategory(id, data) {
  const category = await AssetCategory.findById(id);
  if (!category) throw httpError("Category not found", 404);
  if (data.name !== undefined) {
    const name = String(data.name || "").trim();
    if (!name) throw httpError("Category name is required", 400);
    const existing = await AssetCategory.findOne({
      _id: { $ne: category._id },
      name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    });
    if (existing) throw httpError("A category with this name already exists", 409);
    category.name = name;
  }
  if (data.notes !== undefined) category.notes = String(data.notes || "").trim();
  if (data.sortOrder !== undefined) category.sortOrder = Number(data.sortOrder) || 0;
  await category.save();
  return category;
}

async function removeCategory(id) {
  const category = await AssetCategory.findById(id);
  if (!category) throw httpError("Category not found", 404);
  const count = await AssetItem.countDocuments({ category: id });
  if (count > 0) {
    throw httpError("Remove or move items in this category first", 400);
  }
  await category.deleteOne();
  return { ok: true };
}

async function listItems({ category } = {}) {
  const filter = {};
  if (category) filter.category = category;
  return AssetItem.find(filter)
    .populate("category", "name")
    .sort({ sortOrder: 1, name: 1 });
}

async function createItem(data) {
  const name = String(data.name || "").trim();
  if (!name) throw httpError("Item name is required", 400);
  if (!data.category) throw httpError("Category is required", 400);
  const category = await AssetCategory.findById(data.category);
  if (!category) throw httpError("Category not found", 404);

  const price = roundMoney(data.price);
  if (price < 0) throw httpError("Price must be 0 or more", 400);
  let quantity = Number(data.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;

  let purchaseDate = null;
  if (data.purchaseDate) {
    purchaseDate = new Date(data.purchaseDate);
    if (Number.isNaN(purchaseDate.getTime())) throw httpError("Purchase date is invalid", 400);
  }

  const item = await AssetItem.create({
    category: category._id,
    name,
    price,
    quantity,
    details: String(data.details || "").trim(),
    purchaseDate,
    sortOrder: Number(data.sortOrder) || 0,
  });
  return AssetItem.findById(item._id).populate("category", "name");
}

async function updateItem(id, data) {
  const item = await AssetItem.findById(id);
  if (!item) throw httpError("Asset item not found", 404);

  if (data.category !== undefined) {
    const category = await AssetCategory.findById(data.category);
    if (!category) throw httpError("Category not found", 404);
    item.category = category._id;
  }
  if (data.name !== undefined) {
    const name = String(data.name || "").trim();
    if (!name) throw httpError("Item name is required", 400);
    item.name = name;
  }
  if (data.price !== undefined) {
    const price = roundMoney(data.price);
    if (price < 0) throw httpError("Price must be 0 or more", 400);
    item.price = price;
  }
  if (data.quantity !== undefined) {
    const quantity = Number(data.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw httpError("Quantity must be greater than 0", 400);
    }
    item.quantity = quantity;
  }
  if (data.details !== undefined) item.details = String(data.details || "").trim();
  if (data.purchaseDate !== undefined) {
    if (!data.purchaseDate) {
      item.purchaseDate = null;
    } else {
      const d = new Date(data.purchaseDate);
      if (Number.isNaN(d.getTime())) throw httpError("Purchase date is invalid", 400);
      item.purchaseDate = d;
    }
  }
  if (data.sortOrder !== undefined) item.sortOrder = Number(data.sortOrder) || 0;
  await item.save();
  return AssetItem.findById(item._id).populate("category", "name");
}

async function removeItem(id) {
  const item = await AssetItem.findById(id);
  if (!item) throw httpError("Asset item not found", 404);
  await item.deleteOne();
  return { ok: true };
}

async function getSummary() {
  const categories = await listCategories();
  const grandTotal = roundMoney(categories.reduce((s, c) => s + (c.totalValue || 0), 0));
  const itemCount = categories.reduce((s, c) => s + (c.itemCount || 0), 0);
  return { categories, grandTotal, itemCount };
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  removeCategory,
  listItems,
  createItem,
  updateItem,
  removeItem,
  getSummary,
};
