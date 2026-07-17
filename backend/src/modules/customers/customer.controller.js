const customerService = require("./customer.service");

async function create(req, res, next) {
  try {
    const customer = await customerService.create(req.body);
    res.status(201).json({ customer });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const customers = await customerService.list(req.query);
    res.json({ customers });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const result = await customerService.getWithBalance(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const customer = await customerService.update(req.params.id, req.body);
    res.json({ customer });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await customerService.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getOne, update, remove };
