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

async function getWasteSettings(req, res, next) {
  try {
    const settings = await settingsService.getWasteSettings();
    res.json({ settings });
  } catch (err) {
    next(err);
  }
}

async function getTaxSplit(req, res, next) {
  try {
    const result = await settingsService.getTaxSplit();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function setTaxSplit(req, res, next) {
  try {
    const result = await settingsService.setTaxSplit({
      mode: req.body.mode,
      hubPercent: req.body.hubPercent,
      drumPercent: req.body.drumPercent,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getElectricitySplit(req, res, next) {
  try {
    const result = await settingsService.getElectricitySplit();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function setElectricitySplit(req, res, next) {
  try {
    const result = await settingsService.setElectricitySplit({
      mode: req.body.mode,
      hubPercent: req.body.hubPercent,
      drumPercent: req.body.drumPercent,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function setWastePercent(req, res, next) {
  try {
    const result = await settingsService.setWastePercent({
      family: req.body.family,
      percent: req.body.percent,
      effectiveFrom: req.body.effectiveFrom,
    });
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
  getWasteSettings,
  setWastePercent,
  getTaxSplit,
  setTaxSplit,
  getElectricitySplit,
  setElectricitySplit,
};
