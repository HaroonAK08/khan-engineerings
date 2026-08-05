const reportsService = require("./reports.service");

async function search(req, res, next) {
  try {
    const result = await reportsService.globalSearch(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function receivables(req, res, next) {
  try {
    const report = await reportsService.getReceivablesReport(req.query);
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

async function received(req, res, next) {
  try {
    const report = await reportsService.getReceivedReport(req.query);
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

async function payables(req, res, next) {
  try {
    const report = await reportsService.getPayablesReport(req.query);
    res.json({ report });
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

async function groupStatement(req, res, next) {
  try {
    const statement = await reportsService.groupStatement(req.params.id, req.query);
    res.json({ statement });
  } catch (err) {
    next(err);
  }
}

async function customersOverviewStatement(req, res, next) {
  try {
    const statement = await reportsService.customersOverviewStatement(req.query);
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
      if (kind === "receivables") return await reportsService.exportReceivables(q, format, res);
      if (kind === "received") return await reportsService.exportReceived(q, format, res);
      if (kind === "payables") return await reportsService.exportPayables(q, format, res);
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

async function exportGroupStatement(req, res, next) {
  try {
    const format = String(req.query.format || "xlsx").toLowerCase() === "pdf" ? "pdf" : "xlsx";
    await reportsService.exportGroupStatement(req.params.id, req.query, format, res);
  } catch (err) {
    next(err);
  }
}

async function exportCustomersOverviewStatement(req, res, next) {
  try {
    const format = String(req.query.format || "xlsx").toLowerCase() === "pdf" ? "pdf" : "xlsx";
    await reportsService.exportCustomersOverviewStatement(req.query, format, res);
  } catch (err) {
    next(err);
  }
}

async function exportFull(req, res, next) {
  try {
    const format = String(req.query.format || "pdf").toLowerCase() === "xlsx" ? "xlsx" : "pdf";
    await reportsService.exportFull(req.query, format, res);
  } catch (err) {
    next(err);
  }
}

async function exportCustom(req, res, next) {
  try {
    const format = String(req.query.format || "pdf").toLowerCase() === "xlsx" ? "xlsx" : "pdf";
    await reportsService.exportCustom(req.query, format, res);
  } catch (err) {
    next(err);
  }
}

async function combinedPreview(req, res, next) {
  try {
    const report = await reportsService.getCombinedPreview(req.query);
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  search,
  receivables,
  received,
  payables,
  customerStatement,
  supplierStatement,
  groupStatement,
  customersOverviewStatement,
  exportSales: exportHandler("sales"),
  exportPurchases: exportHandler("purchases"),
  exportProduction: exportHandler("production"),
  exportExpenses: exportHandler("expenses"),
  exportInventory: exportHandler("inventory"),
  exportFinance: exportHandler("finance"),
  exportReceivables: exportHandler("receivables"),
  exportReceived: exportHandler("received"),
  exportPayables: exportHandler("payables"),
  exportCustomerStatement,
  exportSupplierStatement,
  exportGroupStatement,
  exportCustomersOverviewStatement,
  exportFull,
  exportCustom,
  combinedPreview,
};
