const settingsService = require("./settings.service");

async function listPayrollPeriods(req, res, next) {
  try {
    const periods = await settingsService.listPayrollPeriods();
    res.json({ periods });
  } catch (err) {
    next(err);
  }
}

async function getPayrollPeriod(req, res, next) {
  try {
    const period = await settingsService.getPayrollPeriod(req.params.month);
    res.json({ period: period || null });
  } catch (err) {
    next(err);
  }
}

async function upsertPayrollPeriod(req, res, next) {
  try {
    const period = await settingsService.upsertPayrollPeriod({
      month: req.params.month || req.body.month,
      paymentFrom: req.body.paymentFrom,
      paymentTo: req.body.paymentTo,
    });
    res.json({ period });
  } catch (err) {
    next(err);
  }
}

async function deletePayrollPeriod(req, res, next) {
  try {
    const result = await settingsService.deletePayrollPeriod(req.params.month);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPayrollPeriods,
  getPayrollPeriod,
  upsertPayrollPeriod,
  deletePayrollPeriod,
};
