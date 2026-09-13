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

async function assertUniqueSiblingName(name, parentId, excludeId) {
  const filter = {
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    parent: parentId || null,
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await AssetCategory.findOne(filter);
  if (existing) {
    throw httpError(
      parentId
        ? "A subcategory with this name already exists here"
        : "A category with this name already exists",
      409
    );
  }
}

async function listCategories() {
  const categories = await AssetCategory.find()
    .populate("parent", "name")
    .sort({ sortOrder: 1, name: 1 })
    .lean();
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

  const rows = categories.map((c) => {
    const row = byId.get(String(c._id));
    const parentId = c.parent?._id ? String(c.parent._id) : c.parent ? String(c.parent) : null;
    return {
      ...c,
      parent: parentId,
      parentName: c.parent?.name || null,
      itemCount: row?.itemCount || 0,
      totalValue: roundMoney(row?.totalValue || 0),
      childCount: 0,
    };
  });

  const childrenByParent = new Map();
  for (const c of rows) {
    if (!c.parent) continue;
    if (!childrenByParent.has(c.parent)) childrenByParent.set(c.parent, []);
    childrenByParent.get(c.parent).push(c);
  }
  for (const c of rows) {
    c.childCount = (childrenByParent.get(String(c._id)) || []).length;
  }

  // Roll up subcategory totals into parents for display.
  for (const c of rows) {
    if (!c.parent) continue;
    const parent = rows.find((p) => String(p._id) === c.parent);
    if (!parent) continue;
    parent.itemCount += c.itemCount;
    parent.totalValue = roundMoney(parent.totalValue + c.totalValue);
  }

  return rows;
}

async function createCategory(data) {
  const name = String(data.name || "").trim();
  if (!name) throw httpError("Category name is required", 400);

  let parentId = null;
  if (data.parent) {
    const parent = await AssetCategory.findById(data.parent);
    if (!parent) throw httpError("Parent category not found", 404);
    if (parent.parent) {
      throw httpError("Subcategories can only be added under a top-level category", 400);
    }
    parentId = parent._id;
  }

  await assertUniqueSiblingName(name, parentId, null);

  return AssetCategory.create({
    name,
    parent: parentId,
    notes: String(data.notes || "").trim(),
    sortOrder: Number(data.sortOrder) || 0,
  });
}

async function updateCategory(id, data) {
  const category = await AssetCategory.findById(id);
  if (!category) throw httpError("Category not found", 404);

  let nextParent = category.parent || null;
  if (data.parent !== undefined) {
    if (!data.parent) {
      nextParent = null;
    } else {
      if (String(data.parent) === String(category._id)) {
        throw httpError("Category cannot be its own parent", 400);
      }
      const parent = await AssetCategory.findById(data.parent);
      if (!parent) throw httpError("Parent category not found", 404);
      if (parent.parent) {
        throw httpError("Subcategories can only be added under a top-level category", 400);
      }
      // Don't nest a category that already has children under another parent as a subcategory
      // of a different tree level incorrectly — moving a parent with children under another
      // top-level would create 3 levels. Block that.
      const childCount = await AssetCategory.countDocuments({ parent: category._id });
      if (childCount > 0) {
        throw httpError("Move or remove subcategories before nesting this category", 400);
      }
      nextParent = parent._id;
    }
  }

  if (data.name !== undefined) {
    const name = String(data.name || "").trim();
    if (!name) throw httpError("Category name is required", 400);
    await assertUniqueSiblingName(name, nextParent, category._id);
    category.name = name;
  } else if (data.parent !== undefined) {
    await assertUniqueSiblingName(category.name, nextParent, category._id);
  }

  if (data.parent !== undefined) category.parent = nextParent;
  if (data.notes !== undefined) category.notes = String(data.notes || "").trim();
  if (data.sortOrder !== undefined) category.sortOrder = Number(data.sortOrder) || 0;
  await category.save();
  return category;
}

async function removeCategory(id) {
  const category = await AssetCategory.findById(id);
  if (!category) throw httpError("Category not found", 404);
  const childCount = await AssetCategory.countDocuments({ parent: id });
  if (childCount > 0) {
    throw httpError("Remove subcategories first", 400);
  }
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
    .populate("category", "name parent")
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
  return AssetItem.findById(item._id).populate("category", "name parent");
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
  return AssetItem.findById(item._id).populate("category", "name parent");
}

async function removeItem(id) {
  const item = await AssetItem.findById(id);
  if (!item) throw httpError("Asset item not found", 404);
  await item.deleteOne();
  return { ok: true };
}

async function getSummary() {
  const categories = await listCategories();
  // Grand total from top-level only (already includes rolled-up children).
  const top = categories.filter((c) => !c.parent);
  const grandTotal = roundMoney(top.reduce((s, c) => s + (c.totalValue || 0), 0));
  const itemCount = top.reduce((s, c) => s + (c.itemCount || 0), 0);
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
