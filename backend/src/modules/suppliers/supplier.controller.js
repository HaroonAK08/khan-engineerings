const supplierService = require("./supplier.service");

async function create(req, res, next) {
  try {
    const supplier = await supplierService.create(req.body);
    res.status(201).json({ supplier });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const suppliers = await supplierService.list(req.query);
    res.json({ suppliers });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const result = await supplierService.getWithBalance(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const supplier = await supplierService.update(req.params.id, req.body);
    res.json({ supplier });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await supplierService.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getOne, update, remove };
