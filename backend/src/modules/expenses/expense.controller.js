const expenseService = require("./expense.service");

async function meta(req, res, next) {
  try {
    res.json(expenseService.getMeta());
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const expenses = await expenseService.listByBatch(req.params.id);
    res.json({ expenses });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const expense = await expenseService.create(req.params.id, req.body);
    res.status(201).json({ expense });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const expense = await expenseService.update(req.params.expenseId, req.body);
    res.json({ expense });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await expenseService.remove(req.params.expenseId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function costs(req, res, next) {
  try {
    const costs = await expenseService.getBatchCosts(req.params.id);
    res.json({ costs });
  } catch (err) {
    next(err);
  }
}

async function costReport(req, res, next) {
  try {
    const report = await expenseService.getCostReport(req.query);
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

module.exports = { meta, list, create, update, remove, costs, costReport };
