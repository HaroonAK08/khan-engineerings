const productionService = require("./production.service");

async function create(req, res, next) {
  try {
    const batch = await productionService.create(req.body);
    res.status(201).json({ batch });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const batches = await productionService.list(req.query);
    res.json({ batches });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const batch = await productionService.getById(req.params.id);
    res.json({ batch });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const batch = await productionService.update(req.params.id, req.body);
    res.json({ batch });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await productionService.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function report(req, res, next) {
  try {
    const report = await productionService.getReport(req.query);
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getOne, update, remove, report };
