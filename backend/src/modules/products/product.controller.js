const productService = require("./product.service");

async function create(req, res, next) {
  try {
    const product = await productService.create(req.body);
    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const products = await productService.list(req.query);
    res.json({ products });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const product = await productService.getById(req.params.id);
    res.json({ product });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const product = await productService.update(req.params.id, req.body);
    res.json({ product });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await productService.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getOne, update, remove };
