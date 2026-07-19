const workerService = require("./worker.service");

async function list(req, res, next) {
  try {
    const workers = await workerService.list(req.query);
    res.json({ workers });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const worker = await workerService.getOne(req.params.id);
    res.json({ worker });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const worker = await workerService.create(req.body);
    res.status(201).json({ worker });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const worker = await workerService.update(req.params.id, req.body);
    res.json({ worker });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const worker = await workerService.remove(req.params.id);
    res.json({ worker });
  } catch (err) {
    next(err);
  }
}

async function pay(req, res, next) {
  try {
    const result = await workerService.pay(req.params.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function listPayments(req, res, next) {
  try {
    const payments = await workerService.listPayments(req.query);
    res.json({ payments });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, remove, pay, listPayments };
