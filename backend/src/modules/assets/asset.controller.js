const assetService = require("./asset.service");

async function listCategories(req, res, next) {
  try {
    const categories = await assetService.listCategories();
    res.json({ categories });
  } catch (err) {
    next(err);
  }
}

async function createCategory(req, res, next) {
  try {
    const category = await assetService.createCategory(req.body);
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const category = await assetService.updateCategory(req.params.id, req.body);
    res.json({ category });
  } catch (err) {
    next(err);
  }
}

async function removeCategory(req, res, next) {
  try {
    await assetService.removeCategory(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function listItems(req, res, next) {
  try {
    const items = await assetService.listItems(req.query);
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

async function createItem(req, res, next) {
  try {
    const item = await assetService.createItem(req.body);
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const item = await assetService.updateItem(req.params.id, req.body);
    res.json({ item });
  } catch (err) {
    next(err);
  }
}

async function removeItem(req, res, next) {
  try {
    await assetService.removeItem(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function summary(req, res, next) {
  try {
    const data = await assetService.getSummary();
    res.json(data);
  } catch (err) {
    next(err);
  }
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
  summary,
};
