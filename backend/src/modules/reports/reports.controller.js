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

async function monthlyReceivables(req, res, next) {
  try {
    const report = await reportsService.getMonthlyReceivablesReport(req.query);
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

async function paid(req, res, next) {
  try {
    const report = await reportsService.getPaidReport(req.query);
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

async function position(req, res, next) {
  try {
    const report = await reportsService.getPositionReport(req.query);
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

async function yearly(req, res, next) {
  try {
    const report = await reportsService.getYearlyCalendarReport(req.query);
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
      if (kind === "monthly-receivables") {
        return await reportsService.exportMonthlyReceivables(q, format, res);
      }
      if (kind === "received") return await reportsService.exportReceived(q, format, res);
      if (kind === "paid") return await reportsService.exportPaid(q, format, res);
      if (kind === "payables") return await reportsService.exportPayables(q, format, res);
      if (kind === "position") {
        const report = await reportsService.getCombinedPreview({
          ...q,
          modules: "position",
          summaryOnly: q.summaryOnly,
        });
        const section = report.sections[0];
        const title = section?.title || "Company position";
        if (format === "pdf") {
          const buf = await require("./export.util").buildPdf({
            title,
            subtitle: "Khan Engineerings",
            metaLines: [`Period: ${report.period}`],
            sections: section?.subsections?.length
              ? section.subsections
              : [
                  {
                    heading: section?.heading || title,
                    columns: section?.columns || ["Item", "Value"],
                    rows: section?.rows || [],
                  },
                ],
          });
          return require("./export.util").sendPdf(res, buf, "position-report.pdf");
        }
        const buf = await require("./export.util").buildExcel({
          title,
          sheetName: "Position",
          columns: section?.columns || ["Item", "Value"],
          rows: section?.rows || [],
          meta: section?.meta || {},
          sections: section?.subsections || undefined,
        });
        return require("./export.util").sendExcel(res, buf, "position-report.xlsx");
      }
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

async function exportYearlyBill(req, res, next) {
  try {
    const format = String(req.query.format || "pdf").toLowerCase() === "xlsx" ? "xlsx" : "pdf";
    await reportsService.exportYearlyCalendar(req.query, format, res);
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

async function handoutPreview(req, res, next) {
  try {
    const report = await reportsService.getHandoutPreview(req.query);
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

async function exportHandout(req, res, next) {
  try {
    const format = String(req.query.format || "pdf").toLowerCase() === "xlsx" ? "xlsx" : "pdf";
    await reportsService.exportHandout(req.query, format, res);
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
  monthlyReceivables,
  received,
  paid,
  payables,
  position,
  yearly,
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
  exportMonthlyReceivables: exportHandler("monthly-receivables"),
  exportReceived: exportHandler("received"),
  exportPaid: exportHandler("paid"),
  exportPayables: exportHandler("payables"),
  exportPosition: exportHandler("position"),
  exportCustomerStatement,
  exportSupplierStatement,
  exportGroupStatement,
  exportCustomersOverviewStatement,
  exportYearlyBill,
  exportFull,
  exportCustom,
  combinedPreview,
  handoutPreview,
  exportHandout,
};
