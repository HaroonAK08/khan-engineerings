const financeService = require("./finance.service");

async function overview(req, res, next) {
  try {
    const overview = await financeService.getOverview(req.query);
    res.json({ overview });
  } catch (err) {
    next(err);
  }
}

async function monthly(req, res, next) {
  try {
    const monthly = await financeService.getMonthly(req.query);
    res.json(monthly);
  } catch (err) {
    next(err);
  }
}

async function customerRevenue(req, res, next) {
  try {
    const report = await financeService.getCustomerRevenue(req.query);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function supplierExpenses(req, res, next) {
  try {
    const report = await financeService.getSupplierExpenses(req.query);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function productProfit(req, res, next) {
  try {
    const report = await financeService.getProductProfitability(req.query);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function manufacturing(req, res, next) {
  try {
    const report = await financeService.getManufacturingAnalysis(req.query);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function expenses(req, res, next) {
  try {
    const report = await financeService.getExpenseBreakdown(req.query);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function listEntries(req, res, next) {
  try {
    const entries = await financeService.listEntries(req.query);
    res.json({ entries });
  } catch (err) {
    next(err);
  }
}

async function createEntry(req, res, next) {
  try {
    const entry = await financeService.createEntry(req.body);
    res.status(201).json({ entry });
  } catch (err) {
    next(err);
  }
}

async function removeEntry(req, res, next) {
  try {
    await financeService.removeEntry(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  overview,
  monthly,
  customerRevenue,
  supplierExpenses,
  productProfit,
  manufacturing,
  expenses,
  listEntries,
  createEntry,
  removeEntry,
};
