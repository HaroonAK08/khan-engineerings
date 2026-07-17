const ledgerService = require("./ledger.service");

async function list(req, res, next) {
  try {
    const entries = await ledgerService.listBySupplier(req.params.supplierId, req.query);
    const balance = await ledgerService.getBalance(req.params.supplierId);
    res.json({ entries, balance });
  } catch (err) {
    next(err);
  }
}

async function payment(req, res, next) {
  try {
    const result = await ledgerService.recordPayment(req.params.supplierId, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function adjustment(req, res, next) {
  try {
    const result = await ledgerService.recordAdjustment(req.params.supplierId, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, payment, adjustment };
