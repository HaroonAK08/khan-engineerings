const salesmanService = require("./salesman.service");

async function create(req, res, next) {
  try {
    const salesman = await salesmanService.create(req.body);
    res.status(201).json({ salesman });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const salesmen = await salesmanService.list(req.query);
    res.json({ salesmen });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const salesman = await salesmanService.getById(req.params.id);
    res.json({ salesman });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const salesman = await salesmanService.update(req.params.id, req.body);
    res.json({ salesman });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await salesmanService.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getOne, update, remove };
