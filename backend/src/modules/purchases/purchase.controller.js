const purchaseService = require("./purchase.service");

async function create(req, res, next) {
  try {
    const purchase = await purchaseService.create(req.body);
    res.status(201).json({ purchase });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const purchases = await purchaseService.list(req.query);
    res.json({ purchases });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const purchase = await purchaseService.getById(req.params.id);
    res.json({ purchase });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const purchase = await purchaseService.update(req.params.id, req.body);
    res.json({ purchase });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await purchaseService.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function stock(req, res, next) {
  try {
    const stock = await purchaseService.getStock();
    res.json({ stock });
  } catch (err) {
    next(err);
  }
}

async function report(req, res, next) {
  try {
    const report = await purchaseService.getReport(req.query);
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getOne, update, remove, stock, report };
