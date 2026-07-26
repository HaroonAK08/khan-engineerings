const builtyService = require("./builty.service");

async function list(req, res, next) {
  try {
    const builties = await builtyService.listBuilties(req.query);
    res.json({ builties });
  } catch (err) {
    next(err);
  }
}

async function report(req, res, next) {
  try {
    const report = await builtyService.getSalesReport(req.query);
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

async function payments(req, res, next) {
  try {
    const payments = await builtyService.listPayments(req.query);
    res.json({ payments });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const result = await builtyService.getBuilty(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const result = await builtyService.createBuilty(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const result = await builtyService.updateBuilty(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function pay(req, res, next) {
  try {
    const result = await builtyService.recordBuiltyPayment(req.params.id, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await builtyService.removeBuilty(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, report, payments, getOne, create, update, pay, remove };
