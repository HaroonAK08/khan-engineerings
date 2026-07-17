const reportsService = require("./reports.service");

async function search(req, res, next) {
  try {
    const result = await reportsService.globalSearch(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function customerStatement(req, res, next) {
  try {
    const statement = await reportsService.customerStatement(req.params.id, req.query);
    res.json({ statement });
  } catch (err) {
    next(err);
  }
}

async function supplierStatement(req, res, next) {
  try {
    const statement = await reportsService.supplierStatement(req.params.id, req.query);
    res.json({ statement });
  } catch (err) {
    next(err);
  }
}

function exportHandler(kind) {
  return async (req, res, next) => {
    try {
      const format = String(req.query.format || "xlsx").toLowerCase() === "pdf" ? "pdf" : "xlsx";
      const q = req.query;
      if (kind === "sales") return await reportsService.exportSales(q, format, res);
      if (kind === "purchases") return await reportsService.exportPurchases(q, format, res);
      if (kind === "production") return await reportsService.exportProduction(q, format, res);
      if (kind === "expenses") return await reportsService.exportExpenses(q, format, res);
      if (kind === "inventory") return await reportsService.exportInventory(q, format, res);
      if (kind === "finance") return await reportsService.exportFinance(q, format, res);
      const err = new Error("Unknown export kind");
      err.statusCode = 404;
      throw err;
    } catch (err) {
      next(err);
    }
  };
}

async function exportCustomerStatement(req, res, next) {
  try {
    const format = String(req.query.format || "xlsx").toLowerCase() === "pdf" ? "pdf" : "xlsx";
    await reportsService.exportStatement("customer", req.params.id, req.query, format, res);
  } catch (err) {
    next(err);
  }
}

async function exportSupplierStatement(req, res, next) {
  try {
    const format = String(req.query.format || "xlsx").toLowerCase() === "pdf" ? "pdf" : "xlsx";
    await reportsService.exportStatement("supplier", req.params.id, req.query, format, res);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  search,
  customerStatement,
  supplierStatement,
  exportSales: exportHandler("sales"),
  exportPurchases: exportHandler("purchases"),
  exportProduction: exportHandler("production"),
  exportExpenses: exportHandler("expenses"),
  exportInventory: exportHandler("inventory"),
  exportFinance: exportHandler("finance"),
  exportCustomerStatement,
  exportSupplierStatement,
};
