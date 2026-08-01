const Customer = require("../customers/customer.model");
const Supplier = require("../suppliers/supplier.model");
const Builty = require("../builty/builty.model");
const Purchase = require("../purchases/purchase.model");
const ProductionBatch = require("../production/production.model");
const Product = require("../products/product.model");
const CustomerLedgerEntry = require("../customers/customer-ledger.model");
const CustomerPayment = require("../customers/customer-payment.model");
const customerService = require("../customers/customer.service");
const supplierService = require("../suppliers/supplier.service");
const ledgerService = require("../ledger/ledger.service");
const builtyService = require("../builty/builty.service");
const purchaseService = require("../purchases/purchase.service");
const productionService = require("../production/production.service");
const expenseService = require("../expenses/expense.service");
const inventoryService = require("../inventory/inventory.service");
const financeService = require("../finance/finance.service");
const mongoose = require("mongoose");
const { buildExcel, buildExcelMulti, buildPdf, money, fmtDate, sendExcel, sendPdf } = require("./export.util");

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseDate(value, label = "Date") {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw httpError(`${label} is invalid`, 400);
  return d;
}

function periodLabel(dateFrom, dateTo) {
  if (dateFrom && dateTo) return `${dateFrom} → ${dateTo}`;
  if (dateFrom) return `From ${dateFrom}`;
  if (dateTo) return `Until ${dateTo}`;
  return "All time";
}

async function globalSearch({ q, limit = 8 } = {}) {
  const term = (q || "").trim();
  if (!term || term.length < 2) {
    return { q: term, results: { customers: [], suppliers: [], orders: [], purchases: [], batches: [], products: [] } };
  }
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const lim = Math.min(Math.max(Number(limit) || 8, 1), 25);

  const [customers, suppliers, orders, purchases, batches, products] = await Promise.all([
    Customer.find({ $or: [{ name: re }, { phone: re }, { email: re }] })
      .sort({ name: 1 })
      .limit(lim)
      .lean(),
    Supplier.find({ $or: [{ name: re }, { phone: re }, { email: re }] })
      .sort({ name: 1 })
      .limit(lim)
      .lean(),
    Builty.find({
      $or: [{ builtyNo: re }, { billNo: re }, { notes: re }],
    })
      .populate("customer", "name")
      .sort({ builtyDate: -1 })
      .limit(lim)
      .lean(),
    Purchase.find({ $or: [{ invoiceNo: re }, { notes: re }] })
      .populate("supplier", "name nameUr")
      .sort({ purchaseDate: -1 })
      .limit(lim)
      .lean(),
    ProductionBatch.find({ $or: [{ batchNo: re }, { notes: re }] })
      .populate("product", "name sku")
      .sort({ productionDate: -1 })
      .limit(lim)
      .lean(),
    Product.find({ $or: [{ name: re }, { sku: re }] })
      .sort({ name: 1 })
      .limit(lim)
      .lean(),
  ]);

  return {
    q: term,
    results: {
      customers: customers.map((c) => ({
        id: c._id,
        label: c.name,
        meta: c.phone || c.email || "",
        href: `/dashboard/customers/${c._id}`,
      })),
      suppliers: suppliers.map((s) => ({
        id: s._id,
        label: s.name,
        meta: s.phone || s.email || "",
        href: `/dashboard/suppliers/${s._id}`,
      })),
      orders: orders.map((o) => ({
        id: o._id,
        label: o.billNo ? `${o.builtyNo} / ${o.billNo}` : o.builtyNo,
        meta: `${o.customer?.name || ""} · ${money(o.totalAmount)}`,
        href: `/dashboard/builty/${o._id}`,
      })),
      purchases: purchases.map((p) => ({
        id: p._id,
        label: p.invoiceNo || `Purchase ${fmtDate(p.purchaseDate)}`,
        meta: `${p.supplier?.name || ""} · ${p.quantityKg} kg`,
        href: "/dashboard/inventory/purchases",
      })),
      batches: batches.map((b) => ({
        id: b._id,
        label: b.batchNo || String(b._id).slice(-6),
        meta: `${b.product?.name || ""} · ${b.goodUnits} units`,
        href: `/dashboard/production/${b._id}`,
      })),
      products: products.map((p) => ({
        id: p._id,
        label: p.name,
        meta: p.sku || "",
        href: "/dashboard/production/products",
      })),
    },
  };
}

async function customerStatement(customerId, { dateFrom, dateTo } = {}) {
  const customer = await customerService.getById(customerId);
  const filter = { customer: customerId };
  if (dateFrom || dateTo) {
    filter.entryDate = {};
    if (dateFrom) filter.entryDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      filter.entryDate.$lte = end;
    }
  }

  const entries = await CustomerLedgerEntry.find(filter)
    .populate("builty", "builtyNo billNo")
    .populate("payment", "amount method")
    .sort({ entryDate: 1, createdAt: 1 });

  let running = 0;
  // Opening balance = all entries before dateFrom
  if (dateFrom) {
    const prior = await CustomerLedgerEntry.find({
      customer: customerId,
      entryDate: { $lt: parseDate(dateFrom, "dateFrom") },
    });
    for (const e of prior) {
      if (e.type === "invoice") running += e.amount;
      else if (e.type === "payment") running -= e.amount;
      else if (e.type === "adjustment") running += e.signedAmount ?? 0;
    }
  }

  const openingBalance = Math.round(running * 100) / 100;
  const lines = [];
  let bal = openingBalance;
  for (const e of entries) {
    let debit = 0;
    let credit = 0;
    if (e.type === "invoice") {
      debit = e.amount;
      bal += e.amount;
    } else if (e.type === "payment") {
      credit = e.amount;
      bal -= e.amount;
    } else if (e.type === "adjustment") {
      const s = e.signedAmount ?? 0;
      if (s >= 0) debit = s;
      else credit = Math.abs(s);
      bal += s;
    }
    lines.push({
      id: e._id,
      date: e.entryDate,
      type: e.type,
      reference:
        e.builty?.builtyNo || e.builty?.billNo || e.notes || e.type,
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      balance: Math.round(bal * 100) / 100,
      notes: e.notes || "",
    });
  }

  const closingBalance = await customerService.getBalance(customerId);

  return {
    party: {
      id: customer._id,
      name: customer.name,
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      type: "customer",
    },
    period: { from: dateFrom || null, to: dateTo || null },
    openingBalance,
    closingBalance,
    periodBalance: Math.round(bal * 100) / 100,
    lines,
  };
}

async function groupStatement(groupId, { dateFrom, dateTo } = {}) {
  const PartyGroup = require("../party-groups/party-group.model");
  const Customer = require("../customers/customer.model");
  const group = await PartyGroup.findById(groupId);
  if (!group) throw httpError("Party group not found", 404);

  const members = await Customer.find({ group: groupId }).sort({ name: 1 });
  const parties = [];
  let openingBalance = 0;
  let closingBalance = 0;
  let periodBalance = 0;

  for (const member of members) {
    const s = await customerStatement(String(member._id), { dateFrom, dateTo });
    parties.push({
      partyId: String(s.party.id),
      name: s.party.name,
      phone: s.party.phone || "",
      openingBalance: s.openingBalance,
      closingBalance: s.closingBalance,
      periodBalance: s.periodBalance,
      lineCount: s.lines.length,
    });
    openingBalance += s.openingBalance;
    closingBalance += s.closingBalance;
    periodBalance += s.periodBalance;
  }

  return {
    group: { id: String(group._id), name: group.name },
    period: { from: dateFrom || null, to: dateTo || null },
    openingBalance: Math.round(openingBalance * 100) / 100,
    closingBalance: Math.round(closingBalance * 100) / 100,
    periodBalance: Math.round(periodBalance * 100) / 100,
    parties,
  };
}

async function customersOverviewStatement({ dateFrom, dateTo } = {}) {
  const Customer = require("../customers/customer.model");
  const members = await Customer.find({ isActive: true }).sort({ name: 1 });
  const parties = [];
  let openingBalance = 0;
  let closingBalance = 0;
  let periodBalance = 0;

  for (const member of members) {
    const s = await customerStatement(String(member._id), { dateFrom, dateTo });
    if (
      s.openingBalance === 0 &&
      s.closingBalance === 0 &&
      s.periodBalance === 0 &&
      s.lines.length === 0
    ) {
      continue;
    }
    parties.push({
      partyId: String(s.party.id),
      name: s.party.name,
      phone: s.party.phone || "",
      openingBalance: s.openingBalance,
      closingBalance: s.closingBalance,
      periodBalance: s.periodBalance,
      lineCount: s.lines.length,
    });
    openingBalance += s.openingBalance;
    closingBalance += s.closingBalance;
    periodBalance += s.periodBalance;
  }

  return {
    group: null,
    period: { from: dateFrom || null, to: dateTo || null },
    openingBalance: Math.round(openingBalance * 100) / 100,
    closingBalance: Math.round(closingBalance * 100) / 100,
    periodBalance: Math.round(periodBalance * 100) / 100,
    parties,
  };
}

async function supplierStatement(supplierId, { dateFrom, dateTo } = {}) {
  const supplier = await supplierService.getById(supplierId);
  const entries = await ledgerService.listBySupplier(supplierId, { dateFrom, dateTo });
  const chronological = [...entries].reverse();

  let openingBalance = 0;
  if (dateFrom) {
    const LedgerEntry = require("../ledger/ledger.model");
    const prior = await LedgerEntry.find({
      supplier: supplierId,
      entryDate: { $lt: parseDate(dateFrom, "dateFrom") },
    });
    for (const e of prior) {
      if (e.type === "purchase") openingBalance += e.amount;
      else if (e.type === "payment") openingBalance -= e.amount;
      else if (e.type === "adjustment") openingBalance += e.signedAmount ?? 0;
    }
  }
  openingBalance = Math.round(openingBalance * 100) / 100;

  let bal = openingBalance;
  const lines = chronological.map((e) => {
    let debit = 0;
    let credit = 0;
    if (e.type === "purchase") {
      debit = e.amount;
      bal += e.amount;
    } else if (e.type === "payment") {
      credit = e.amount;
      bal -= e.amount;
    } else if (e.type === "adjustment") {
      const s = e.signedAmount ?? 0;
      if (s >= 0) debit = s;
      else credit = Math.abs(s);
      bal += s;
    }
    return {
      id: e._id,
      date: e.entryDate,
      type: e.type,
      reference: e.purchase?.invoiceNo || e.notes || e.type,
      debit: Math.round(debit * 100) / 100,
      credit: Math.round(credit * 100) / 100,
      balance: Math.round(bal * 100) / 100,
      notes: e.notes || "",
    };
  });

  const closingBalance = await supplierService.getBalance(supplierId);

  return {
    party: {
      id: supplier._id,
      name: supplier.name,
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      type: "supplier",
    },
    period: { from: dateFrom || null, to: dateTo || null },
    openingBalance,
    closingBalance,
    periodBalance: Math.round(bal * 100) / 100,
    lines,
  };
}

async function exportSales(query, format, res) {
  const report = await builtyService.getSalesReport(query);
  const view = ["whole", "party", "group"].includes(query.view) ? query.view : "party";
  const viewLabel =
    view === "whole" ? "Overall" : view === "group" ? "Group wise" : "Party wise";
  const meta = {
    "Builty count": report.totals.orderCount,
    "Total sales": money(report.totals.totalSales),
    "Total paid": money(report.totals.totalPaid),
    Outstanding: money(report.totals.outstanding),
    Period: periodLabel(query.dateFrom, query.dateTo),
    View: viewLabel,
    Group: report.group?.name || "All groups",
  };
  const title = report.group
    ? `Sales report — ${report.group.name}`
    : "Sales & receivables report";

  const partyColumns = ["Party", "Orders", "Sales", "Paid", "Outstanding"];
  const partyRows = (report.topCustomers || []).map((p) => [
    p.name,
    p.orderCount,
    money(p.totalSales),
    money(p.totalPaid),
    money(p.outstanding),
  ]);

  const groupColumns = ["Group", "Parties", "Orders", "Sales", "Paid", "Outstanding"];
  const groupRows = (report.byGroup || []).map((g) => [
    g.name,
    g.partyCount,
    g.orderCount,
    money(g.totalSales),
    money(g.totalPaid),
    money(g.outstanding),
  ]);

  const recordColumns = ["Builty", "Bill", "Party", "Date", "Total", "Paid", "Balance", "Status"];
  const recordRows = (report.outstanding || []).map((o) => [
    o.orderNo,
    o.invoiceNo,
    o.customer,
    fmtDate(o.orderDate),
    money(o.totalAmount),
    money(o.amountPaid),
    money(o.balance),
    o.paymentStatus,
  ]);

  if (format === "pdf") {
    const sections = [];
    if (view === "group") {
      sections.push({ heading: "Sales by group", columns: groupColumns, rows: groupRows });
    } else if (view === "party") {
      sections.push({ heading: "Sales by party", columns: partyColumns, rows: partyRows });
      sections.push({
        heading: "Outstanding invoices",
        columns: recordColumns,
        rows: recordRows,
      });
    } else {
      sections.push({
        heading: "Overall sales",
        columns: ["Metric", "Value"],
        rows: [
          ["Builty count", report.totals.orderCount],
          ["Total sales", money(report.totals.totalSales)],
          ["Total paid", money(report.totals.totalPaid)],
          ["Outstanding", money(report.totals.outstanding)],
        ],
      });
    }
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
      sections,
    });
    return sendPdf(res, buf, `sales-report.pdf`);
  }
  const buf = await buildExcel({
    title,
    sheetName: "Sales",
    columns:
      view === "group" ? groupColumns : view === "whole" ? ["Metric", "Value"] : recordColumns,
    rows:
      view === "group"
        ? groupRows
        : view === "whole"
          ? [
              ["Builty count", report.totals.orderCount],
              ["Total sales", money(report.totals.totalSales)],
              ["Total paid", money(report.totals.totalPaid)],
              ["Outstanding", money(report.totals.outstanding)],
            ]
          : recordRows,
    meta,
  });
  return sendExcel(res, buf, `sales-report.xlsx`);
}

async function exportPurchases(query, format, res) {
  const report = await purchaseService.getReport(query);
  const view = ["whole", "party"].includes(query.view) ? query.view : "party";
  const viewLabel = view === "whole" ? "Overall" : "Party wise";
  const columns = ["Supplier", "Purchases", "Kg", "Spend", "Avg rate"];
  const rows = (report.bySupplier || []).map((s) => [
    s.name || s.supplierName || "Unknown",
    s.purchaseCount || s.count || 0,
    s.totalKg || s.kg || 0,
    money(s.totalSpend || s.spend || 0),
    money(s.avgRate || 0),
  ]);
  const meta = {
    Period: periodLabel(query.dateFrom, query.dateTo),
    View: viewLabel,
    "Total kg": report.totals?.totalKg ?? "",
    "Total spend": money(report.totals?.totalSpend),
    Purchases: report.totals?.purchaseCount ?? "",
  };
  const title = "Purchase report";
  if (format === "pdf") {
    const sections =
      view === "whole"
        ? [
            {
              heading: "Overall purchases",
              columns: ["Metric", "Value"],
              rows: [
                ["Purchases", report.totals?.purchaseCount ?? 0],
                ["Total kg", report.totals?.totalKg ?? 0],
                ["Total spend", money(report.totals?.totalSpend)],
                ["Avg rate", money(report.totals?.avgRate)],
              ],
            },
          ]
        : [{ heading: "Purchases by supplier", columns, rows }];
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
      sections,
    });
    return sendPdf(res, buf, "purchases-report.pdf");
  }
  const buf = await buildExcel({ title, sheetName: "Purchases", columns, rows, meta });
  return sendExcel(res, buf, "purchases-report.xlsx");
}

async function exportProduction(query, format, res) {
  if (query.product) {
    return exportProductionProduct(query.product, query, format, res);
  }
  const report = await productionService.getReport(query);
  const columns = ["Product", "Batches", "Good", "Rejected", "Net kg"];
  const toRow = (p) => [
    p.name,
    p.batchCount,
    p.goodUnits,
    p.rejectedUnits,
    p.netConsumedKg,
  ];
  const hubRows = (report.byProduct || [])
    .filter((p) => (p.family || "hub") === "hub")
    .map(toRow);
  const drumRows = (report.byProduct || [])
    .filter((p) => p.family === "drum")
    .map(toRow);
  const sections = [
    { heading: "Hub", columns, rows: hubRows.length ? hubRows : [["—", 0, 0, 0, 0]] },
    { heading: "Drum", columns, rows: drumRows.length ? drumRows : [["—", 0, 0, 0, 0]] },
  ];
  const meta = {
    Period: periodLabel(query.dateFrom, query.dateTo),
    Batches: report.totals.batchCount,
    Hub: report.totals.byFamily?.hub ?? 0,
    Drum: report.totals.byFamily?.drum ?? 0,
    "Good units": report.totals.goodUnits,
    "Reject rate": `${report.totals.rejectRate}%`,
  };
  const title = "Production report";
  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      sections,
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
    });
    return sendPdf(res, buf, "production-report.pdf");
  }
  const buf = await buildExcel({
    title,
    sheetName: "Production",
    sections,
    meta,
  });
  return sendExcel(res, buf, "production-report.xlsx");
}

async function exportProductionProduct(productId, query, format, res) {
  const report = await productionService.getProductReport(productId, query);
  const columns = ["Date", "Runs", "Pieces", "Used kg", "Waste kg"];
  const rows = (report.byDate || []).map((d) => [
    d.date,
    d.runs,
    d.quantity,
    d.usedKg,
    d.wasteKg,
  ]);
  const detailColumns = ["Date", "Pieces", "Used kg", "Waste kg", "Waste %", "Material"];
  const detailRows = (report.runs || []).map((r) => [
    r.date,
    r.quantity,
    r.usedKg,
    r.wasteKg,
    `${r.wastePercent}%`,
    r.materialType,
  ]);
  const meta = {
    Product: report.product.name,
    Family: report.product.family || "",
    Period: periodLabel(query.dateFrom, query.dateTo),
    Runs: report.totals.runCount,
    Pieces: report.totals.pieces,
    "Used kg": report.totals.usedKg,
    "Waste %": `${report.totals.wastePercent}%`,
  };
  const title = `Production — ${report.product.name}`;
  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
      sections: [
        { heading: "By date", columns, rows },
        { heading: "Run details", columns: detailColumns, rows: detailRows },
      ],
    });
    return sendPdf(res, buf, `production-${report.product.name.replace(/[^\w.-]+/g, "_")}.pdf`);
  }
  const buf = await buildExcel({
    title,
    sheetName: "By date",
    columns,
    rows,
    meta,
  });
  return sendExcel(res, buf, `production-${report.product.name.replace(/[^\w.-]+/g, "_")}.xlsx`);
}

async function exportExpenses(query, format, res) {
  const report = await expenseService.getCostReport(query);
  const columns = ["Category", "Amount", "Count"];
  const rows = (report.byCategory || []).map((c) => [
    c.label || c.category || "—",
    money(c.amount || 0),
    c.count || 0,
  ]);
  const meta = {
    Period: periodLabel(query.dateFrom, query.dateTo),
    "Total operating": money(report.totals?.totalOperatingCost || 0),
    Expenses: report.totals?.expenseCount || 0,
  };
  const title = "Expense / cost report";
  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      columns,
      rows,
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
    });
    return sendPdf(res, buf, "expenses-report.pdf");
  }
  const buf = await buildExcel({ title, sheetName: "Expenses", columns, rows, meta });
  return sendExcel(res, buf, "expenses-report.xlsx");
}

async function exportInventory(query, format, res) {
  const report = await inventoryService.getInventoryReport(query);
  const columns = ["Product", "SKU", "Warehouse", "Qty", "Low threshold"];
  const rows = (report.finishedStock?.items || []).map((i) => [
    i.name,
    i.sku || "",
    i.warehouseName || "",
    i.quantity,
    i.lowStockThreshold || 0,
  ]);
  const meta = {
    Period: periodLabel(query.dateFrom, query.dateTo),
    "Raw scrap kg": report.raw?.availableKg ?? report.raw?.totalKg ?? 0,
    "Finished units": report.finishedStock?.totalUnits ?? 0,
  };
  const title = "Inventory report";
  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      columns,
      rows,
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
    });
    return sendPdf(res, buf, "inventory-report.pdf");
  }
  const buf = await buildExcel({ title, sheetName: "Inventory", columns, rows, meta });
  return sendExcel(res, buf, "inventory-report.xlsx");
}

async function exportFinance(query, format, res) {
  const overview = await financeService.getOverview(query);
  const columns = ["Line", "Amount"];
  const rows = [
    ["Revenue", money(overview.profitAndLoss.revenue)],
    ["COGS", money(overview.profitAndLoss.cogs)],
    ["Gross profit", money(overview.profitAndLoss.grossProfit)],
    ["Other expenses", money(overview.profitAndLoss.otherExpenses)],
    ["Net profit", money(overview.profitAndLoss.netProfit)],
    ["Cash in", money(overview.cashFlow.cashIn)],
    ["Cash out", money(overview.cashFlow.cashOut)],
    ["Net cash", money(overview.cashFlow.net)],
  ];
  const meta = {
    Period: periodLabel(
      overview.period.from?.toISOString?.()?.slice(0, 10) || query.dateFrom,
      overview.period.to?.toISOString?.()?.slice(0, 10) || query.dateTo
    ),
  };
  const title = "Finance P&L report";
  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      columns,
      rows,
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
    });
    return sendPdf(res, buf, "finance-report.pdf");
  }
  const buf = await buildExcel({ title, sheetName: "PnL", columns, rows, meta });
  return sendExcel(res, buf, "finance-report.xlsx");
}

async function exportStatement(type, id, query, format, res) {
  const statement =
    type === "customer"
      ? await customerStatement(id, query)
      : await supplierStatement(id, query);
  const columns = ["Date", "Type", "Reference", "Debit", "Credit", "Balance"];
  const rows = statement.lines.map((l) => [
    fmtDate(l.date),
    l.type,
    l.reference,
    money(l.debit),
    money(l.credit),
    money(l.balance),
  ]);
  const meta = {
    Party: statement.party.name,
    Period: periodLabel(query.dateFrom, query.dateTo),
    Opening: money(statement.openingBalance),
    Closing: money(statement.closingBalance),
  };
  const title = `${type === "customer" ? "Customer" : "Supplier"} statement — ${statement.party.name}`;
  const filename = `${type}-statement-${statement.party.name.replace(/\s+/g, "-").toLowerCase()}`;
  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      columns,
      rows,
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
    });
    return sendPdf(res, buf, `${filename}.pdf`);
  }
  const buf = await buildExcel({ title, sheetName: "Statement", columns, rows, meta });
  return sendExcel(res, buf, `${filename}.xlsx`);
}

async function exportGroupStatement(groupId, query, format, res) {
  const statement = await groupStatement(groupId, query);
  const columns = ["Party", "Phone", "Opening", "Period", "Closing", "Lines"];
  const rows = statement.parties.map((p) => [
    p.name,
    p.phone || "",
    money(p.openingBalance),
    money(p.periodBalance),
    money(p.closingBalance),
    p.lineCount,
  ]);
  if (rows.length > 0) {
    rows.push([
      "Total",
      "",
      money(statement.openingBalance),
      money(statement.periodBalance),
      money(statement.closingBalance),
      "",
    ]);
  }
  const meta = {
    Group: statement.group.name,
    Period: periodLabel(query.dateFrom, query.dateTo),
    Opening: money(statement.openingBalance),
    Closing: money(statement.closingBalance),
    Parties: statement.parties.length,
  };
  const title = `Group statement — ${statement.group.name}`;
  const filename = `group-statement-${statement.group.name.replace(/\s+/g, "-").toLowerCase()}`;
  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      columns,
      rows,
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
    });
    return sendPdf(res, buf, `${filename}.pdf`);
  }
  const buf = await buildExcel({ title, sheetName: "Group", columns, rows, meta });
  return sendExcel(res, buf, `${filename}.xlsx`);
}

async function exportCustomersOverviewStatement(query, format, res) {
  const statement = await customersOverviewStatement(query);
  const columns = ["Party", "Phone", "Opening", "Period", "Closing", "Lines"];
  const rows = statement.parties.map((p) => [
    p.name,
    p.phone || "",
    money(p.openingBalance),
    money(p.periodBalance),
    money(p.closingBalance),
    p.lineCount,
  ]);
  if (rows.length > 0) {
    rows.push([
      "Total",
      "",
      money(statement.openingBalance),
      money(statement.periodBalance),
      money(statement.closingBalance),
      "",
    ]);
  }
  const meta = {
    View: "Overall",
    Period: periodLabel(query.dateFrom, query.dateTo),
    Opening: money(statement.openingBalance),
    Closing: money(statement.closingBalance),
    Parties: statement.parties.length,
  };
  const title = "Customer statements — Overall";
  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      columns,
      rows,
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
    });
    return sendPdf(res, buf, "customers-overview-statement.pdf");
  }
  const buf = await buildExcel({
    title,
    sheetName: "Customers",
    columns,
    rows,
    meta,
  });
  return sendExcel(res, buf, "customers-overview-statement.xlsx");
}

function dateRangeFilter(field, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return {};
  const range = {};
  if (dateFrom) range.$gte = parseDate(dateFrom, "dateFrom");
  if (dateTo) {
    const end = parseDate(dateTo, "dateTo");
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return { [field]: range };
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function inDateRange(date, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return false;
  if (dateFrom) {
    const from = parseDate(dateFrom, "dateFrom");
    from.setHours(0, 0, 0, 0);
    if (t < from.getTime()) return false;
  }
  if (dateTo) {
    const to = parseDate(dateTo, "dateTo");
    to.setHours(23, 59, 59, 999);
    if (t > to.getTime()) return false;
  }
  return true;
}

/**
 * Receivables after party payments: payments settle previous pending first,
 * then oldest builties — same as party "Payment pending".
 */
async function getReceivablesReport({ dateFrom, dateTo, groupId, customerId } = {}) {
  const PartyGroup = require("../party-groups/party-group.model");
  let allowedCustomerIds = null;
  let groupMeta = null;
  let partyMeta = null;

  if (groupId === "__ungrouped__" || groupId === "ungrouped") {
    groupMeta = { id: "", name: "Ungrouped" };
    const members = await Customer.find({
      $or: [{ group: null }, { group: { $exists: false } }],
    })
      .select("_id")
      .lean();
    allowedCustomerIds = new Set(members.map((m) => String(m._id)));
  } else if (groupId) {
    const group = await PartyGroup.findById(groupId).lean();
    if (!group) throw httpError("Party group not found", 404);
    groupMeta = { id: String(group._id), name: group.name };
    const members = await Customer.find({ group: group._id }).select("_id").lean();
    allowedCustomerIds = new Set(members.map((m) => String(m._id)));
  }

  if (customerId) {
    if (!mongoose.isValidObjectId(customerId)) throw httpError("Invalid party", 400);
    const customer = await Customer.findById(customerId).select("name phone").lean();
    if (!customer) throw httpError("Party not found", 404);
    partyMeta = { id: String(customer._id), name: customer.name };
    const id = String(customer._id);
    if (allowedCustomerIds && !allowedCustomerIds.has(id)) {
      allowedCustomerIds = new Set();
    } else {
      allowedCustomerIds = new Set([id]);
    }
  }

  const [builties, adjustments, paymentsAgg, allGroups] = await Promise.all([
    Builty.find({})
      .populate("customer", "name phone group")
      .populate({ path: "items.product", select: "name sku" })
      .sort({ builtyDate: 1, createdAt: 1 })
      .lean(),
    CustomerLedgerEntry.find({ type: "adjustment", signedAmount: { $gt: 0 } })
      .populate("customer", "name phone group")
      .sort({ entryDate: 1, createdAt: 1 })
      .lean(),
    CustomerPayment.aggregate([{ $group: { _id: "$customer", total: { $sum: "$amount" } } }]),
    PartyGroup.find({}).select("name").lean(),
  ]);

  const groupNameMap = new Map(allGroups.map((g) => [String(g._id), g.name]));

  const paidByCustomer = new Map(
    paymentsAgg.map((p) => [String(p._id), roundMoney(p.total)])
  );

  const byCustomer = new Map();

  function ensureParty(customerDoc, customerId) {
    const id = String(customerId || "");
    if (allowedCustomerIds && !allowedCustomerIds.has(id)) return null;
    if (!byCustomer.has(id)) {
      let partyGroupId = "";
      if (customerDoc && typeof customerDoc === "object" && customerDoc.group) {
        partyGroupId = String(customerDoc.group._id || customerDoc.group || "");
      }
      const c =
        customerDoc && typeof customerDoc === "object"
          ? {
              id,
              name: customerDoc.name || "—",
              phone: customerDoc.phone || "",
              groupId: partyGroupId,
            }
          : { id, name: "—", phone: "", groupId: "" };
      byCustomer.set(id, { ...c, previousPending: [], builties: [] });
    }
    return byCustomer.get(id);
  }

  for (const a of adjustments) {
    const cust = a.customer;
    const id = cust && typeof cust === "object" ? cust._id : a.customer;
    const party = ensureParty(cust, id);
    if (!party) continue;
    party.previousPending.push({
      type: "previous_pending",
      id: String(a._id),
      date: a.entryDate,
      reference: a.notes?.trim() || "Previous pending",
      totalAmount: roundMoney(a.signedAmount || a.amount),
      products: [],
      href: `/dashboard/party/customers/${party.id}`,
    });
  }

  for (const b of builties) {
    const cust = b.customer;
    const id = cust && typeof cust === "object" ? cust._id : b.customer;
    const party = ensureParty(cust, id);
    if (!party) continue;
    const products = (Array.isArray(b.items) ? b.items : [])
      .map((line) => {
        const name =
          line.product && typeof line.product === "object" ? line.product.name : "Item";
        const qty = line.quantity || 0;
        return `${name} x ${qty}`;
      })
      .filter(Boolean);
    party.builties.push({
      type: "builty",
      id: String(b._id),
      date: b.builtyDate,
      reference: b.builtyNo,
      totalAmount: roundMoney(b.totalAmount),
      products,
      href: `/dashboard/builty/${b._id}`,
    });
  }

  const records = [];
  for (const party of byCustomer.values()) {
    let remaining = paidByCustomer.get(party.id) || 0;
    const ordered = [
      ...party.previousPending.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
      ...party.builties.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
    ];

    for (const item of ordered) {
      const amountPaid = roundMoney(Math.min(remaining, item.totalAmount));
      const balance = roundMoney(Math.max(0, item.totalAmount - amountPaid));
      remaining = roundMoney(Math.max(0, remaining - amountPaid));

      if (balance <= 0) continue;
      if (!inDateRange(item.date, dateFrom, dateTo)) continue;

      records.push({
        id: item.id,
        type: item.type,
        date: item.date,
        reference: item.reference,
        partyId: party.id,
        partyName: party.name,
        partyPhone: party.phone,
        groupId: party.groupId || "",
        products: item.products || [],
        totalAmount: item.totalAmount,
        amountPaid,
        balance,
        href: item.href,
      });
    }
  }

  records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const byPartyMap = new Map();
  for (const r of records) {
    const key = r.partyId || r.partyName;
    const existing = byPartyMap.get(key);
    if (existing) {
      existing.balance = roundMoney(existing.balance + r.balance);
      existing.recordCount += 1;
    } else {
      byPartyMap.set(key, {
        partyId: r.partyId,
        name: r.partyName,
        phone: r.partyPhone,
        groupId: r.groupId || "",
        balance: r.balance,
        recordCount: 1,
      });
    }
  }
  const byParty = [...byPartyMap.values()].sort((a, b) => b.balance - a.balance);

  const byGroupMap = new Map();
  for (const p of byParty) {
    const key = p.groupId || "__ungrouped__";
    const existing = byGroupMap.get(key);
    if (existing) {
      existing.balance = roundMoney(existing.balance + p.balance);
      existing.recordCount += p.recordCount;
      existing.partyCount += 1;
    } else {
      byGroupMap.set(key, {
        groupId: p.groupId || "",
        name: p.groupId ? groupNameMap.get(p.groupId) || "—" : "Ungrouped",
        balance: p.balance,
        recordCount: p.recordCount,
        partyCount: 1,
      });
    }
  }
  const byGroup = [...byGroupMap.values()]
    .filter((g) => Boolean(g.groupId))
    .sort((a, b) => b.balance - a.balance);
  const totalReceivable = roundMoney(records.reduce((s, r) => s + r.balance, 0));

  return {
    period: { from: dateFrom || null, to: dateTo || null },
    group: groupMeta,
    party: partyMeta,
    totals: {
      totalReceivable,
      partyCount: byParty.length,
      groupCount: byGroup.length,
      recordCount: records.length,
    },
    byParty,
    byGroup,
    records,
  };
}

async function getPayablesReport({ dateFrom, dateTo } = {}) {
  const supplierIds = await Purchase.distinct("supplier");
  for (const id of supplierIds) {
    await ledgerService.syncSupplierPurchaseBalances(id);
  }

  const match = {
    balance: { $gt: 0 },
    ...dateRangeFilter("purchaseDate", dateFrom, dateTo),
  };

  const purchases = await Purchase.find(match)
    .populate("supplier", "name nameUr phone")
    .sort({ purchaseDate: -1, balance: -1 })
    .lean();

  const records = purchases.map((p) => {
    const supplier =
      p.supplier && typeof p.supplier === "object"
        ? {
            id: String(p.supplier._id),
            name: p.supplier.name || "—",
            phone: p.supplier.phone || "",
          }
        : { id: String(p.supplier || ""), name: "—", phone: "" };
    const payable = roundMoney((p.totalAmount || 0) + (p.freightAmount || 0));
    return {
      id: String(p._id),
      type: "purchase",
      date: p.purchaseDate,
      reference: p.invoiceNo || "—",
      partyId: supplier.id,
      partyName: supplier.name,
      partyPhone: supplier.phone,
      materialType: p.materialType || "scrap",
      totalAmount: payable,
      amountPaid: roundMoney(p.amountPaid),
      balance: roundMoney(p.balance),
      href: supplier.id ? `/dashboard/suppliers/${supplier.id}` : "/dashboard/suppliers",
    };
  });

  const bySupplierMap = new Map();
  for (const r of records) {
    const key = r.partyId || r.partyName;
    const existing = bySupplierMap.get(key);
    if (existing) {
      existing.balance = roundMoney(existing.balance + r.balance);
      existing.recordCount += 1;
    } else {
      bySupplierMap.set(key, {
        partyId: r.partyId,
        name: r.partyName,
        phone: r.partyPhone,
        balance: r.balance,
        recordCount: 1,
      });
    }
  }
  const bySupplier = [...bySupplierMap.values()].sort((a, b) => b.balance - a.balance);
  const totalPayable = roundMoney(records.reduce((s, r) => s + r.balance, 0));

  return {
    period: { from: dateFrom || null, to: dateTo || null },
    totals: {
      totalPayable,
      supplierCount: bySupplier.length,
      recordCount: records.length,
    },
    bySupplier,
    records,
  };
}

async function exportReceivables(query, format, res) {
  const report = await getReceivablesReport(query);
  const view = ["whole", "party", "group"].includes(query.view) ? query.view : "party";
  const period = periodLabel(query.dateFrom, query.dateTo);
  const viewLabel =
    view === "whole" ? "Overall" : view === "group" ? "Group wise" : "Party wise";
  const meta = {
    Period: period,
    Overall: !query.dateFrom && !query.dateTo ? "All" : period,
    View: viewLabel,
    Group: report.group?.name || "All groups",
    Party: report.party?.name || "All parties",
    "Total receivables": money(report.totals.totalReceivable),
    Parties: report.totals.partyCount,
    Groups: report.totals.groupCount,
    Records: report.totals.recordCount,
  };
  const title = report.party
    ? `Money receivables — ${report.party.name}`
    : report.group
      ? `Money receivables report — ${report.group.name}`
      : "Money receivables report";

  const partyColumns = ["Party", "Records", "Party receivable"];
  const partyRows = (report.byParty || []).map((p) => [
    p.name,
    p.recordCount,
    money(p.balance),
  ]);
  if (partyRows.length > 0) {
    partyRows.push([
      "Total receivables",
      report.totals.recordCount,
      money(report.totals.totalReceivable),
    ]);
  }

  const groupColumns = ["Group", "Parties", "Records", "Group receivable"];
  const groupRows = (report.byGroup || []).map((g) => [
    g.name,
    g.partyCount,
    g.recordCount,
    money(g.balance),
  ]);
  if (groupRows.length > 0) {
    groupRows.push([
      "Total receivables",
      report.totals.partyCount,
      report.totals.recordCount,
      money(report.totals.totalReceivable),
    ]);
  }

  const recordColumns = [
    "Date",
    "Type",
    "Reference",
    "Party",
    "Products",
    "Total",
    "Paid",
    "Balance",
  ];
  const recordRows = (report.records || []).map((r) => [
    fmtDate(r.date),
    r.type === "previous_pending" ? "Previous pending" : "Builty",
    r.reference,
    r.partyName,
    Array.isArray(r.products) && r.products.length ? r.products.join(", ") : "—",
    money(r.totalAmount),
    money(r.amountPaid),
    money(r.balance),
  ]);

  if (format === "pdf") {
    const sections = [];
    if (query.customerId || report.party) {
      sections.push({
        heading: report.party
          ? `Receivables — ${report.party.name}`
          : "Party receivables",
        columns: partyColumns,
        rows: partyRows,
      });
      sections.push({
        heading: "All records",
        columns: recordColumns,
        rows: recordRows,
      });
    } else if (view === "group") {
      sections.push({
        heading: "Receivable total of each group",
        columns: groupColumns,
        rows: groupRows,
      });
    } else if (view === "party") {
      sections.push({
        heading: "Receivable total of each party",
        columns: partyColumns,
        rows: partyRows,
      });
      sections.push({
        heading: "All records",
        columns: recordColumns,
        rows: recordRows,
      });
    } else {
      sections.push({
        heading: "Overall receivables",
        columns: ["Metric", "Value"],
        rows: [
          ["Total receivables", money(report.totals.totalReceivable)],
          ["Groups", report.totals.groupCount],
          ["Parties", report.totals.partyCount],
          ["Records", report.totals.recordCount],
        ],
      });
    }

    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines: [
        `View: ${viewLabel}`,
        `Overall: ${meta.Overall}`,
        `Group: ${meta.Group}`,
        `Party: ${meta.Party}`,
        `Total receivables: ${meta["Total receivables"]}`,
        `Parties: ${meta.Parties}`,
        `Records: ${meta.Records}`,
      ],
      sections,
    });
    return sendPdf(res, buf, "receivables-report.pdf");
  }

  const buf = await buildExcel({
    title,
    sheetName: "Receivables",
    columns: view === "group" ? groupColumns : view === "whole" ? ["Metric", "Value"] : recordColumns,
    rows:
      view === "group"
        ? groupRows
        : view === "whole"
          ? [
              ["Total receivables", money(report.totals.totalReceivable)],
              ["Groups", report.totals.groupCount],
              ["Parties", report.totals.partyCount],
              ["Records", report.totals.recordCount],
            ]
          : recordRows,
    meta,
  });
  return sendExcel(res, buf, "receivables-report.xlsx");
}

async function exportPayables(query, format, res) {
  const report = await getPayablesReport(query);
  const view = ["whole", "party"].includes(query.view) ? query.view : "party";
  const viewLabel = view === "whole" ? "Overall" : "Party wise";
  const period = periodLabel(query.dateFrom, query.dateTo);
  const meta = {
    Period: period,
    Overall: !query.dateFrom && !query.dateTo ? "All" : period,
    View: viewLabel,
    "Total payables": money(report.totals.totalPayable),
    Suppliers: report.totals.supplierCount,
    Records: report.totals.recordCount,
  };
  const title = "Money payables report";

  const partyColumns = ["Supplier", "Records", "Party payable"];
  const partyRows = (report.bySupplier || []).map((p) => [
    p.name,
    p.recordCount,
    money(p.balance),
  ]);
  if (partyRows.length > 0) {
    partyRows.push([
      "Total payables",
      report.totals.recordCount,
      money(report.totals.totalPayable),
    ]);
  }

  const recordColumns = ["Date", "Invoice / ref", "Supplier", "Material", "Total", "Paid", "Balance"];
  const recordRows = (report.records || []).map((r) => [
    fmtDate(r.date),
    r.reference,
    r.partyName,
    r.materialType || "scrap",
    money(r.totalAmount),
    money(r.amountPaid),
    money(r.balance),
  ]);

  if (format === "pdf") {
    const sections =
      view === "whole"
        ? [
            {
              heading: "Overall payables",
              columns: ["Metric", "Value"],
              rows: [
                ["Total payables", money(report.totals.totalPayable)],
                ["Suppliers", report.totals.supplierCount],
                ["Records", report.totals.recordCount],
              ],
            },
          ]
        : [
            {
              heading: "Payable total of each party",
              columns: partyColumns,
              rows: partyRows,
            },
            {
              heading: "All records",
              columns: recordColumns,
              rows: recordRows,
            },
          ];
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines: [
        `View: ${viewLabel}`,
        `Overall: ${meta.Overall}`,
        `Total payables: ${meta["Total payables"]}`,
        `Suppliers: ${meta.Suppliers}`,
        `Records: ${meta.Records}`,
      ],
      sections,
    });
    return sendPdf(res, buf, "payables-report.pdf");
  }

  const buf = await buildExcel({
    title,
    sheetName: "Payables",
    columns: recordColumns,
    rows: recordRows,
    meta,
  });
  return sendExcel(res, buf, "payables-report.xlsx");
}

const COMBINED_MODULES = [
  "sales",
  "purchases",
  "production",
  "expenses",
  "inventory",
  "finance",
  "receivables",
  "payables",
];

async function collectModuleSection(kind, query) {
  if (kind === "sales") {
    const report = await builtyService.getSalesReport(query);
    return {
      id: "sales",
      sheetName: "Sales",
      title: "Sales & receivables",
      heading: "Sales & receivables",
      columns: ["Builty", "Bill", "Party", "Date", "Total", "Paid", "Balance", "Status"],
      rows: (report.outstanding || []).map((o) => [
        o.orderNo,
        o.invoiceNo,
        o.customer,
        fmtDate(o.orderDate),
        money(o.totalAmount),
        money(o.amountPaid),
        money(o.balance),
        o.paymentStatus,
      ]),
      meta: {
        "Builty count": report.totals.orderCount,
        "Total sales": money(report.totals.totalSales),
        Outstanding: money(report.totals.outstanding),
      },
    };
  }

  if (kind === "purchases") {
    const report = await purchaseService.getReport(query);
    return {
      id: "purchases",
      sheetName: "Purchases",
      title: "Purchases",
      heading: "Purchases",
      columns: ["Supplier", "Purchases", "Kg", "Spend", "Avg rate"],
      rows: (report.bySupplier || []).map((s) => [
        s.name || s.supplierName || "Unknown",
        s.purchaseCount || s.count || 0,
        s.totalKg || s.kg || 0,
        money(s.totalSpend || s.spend || 0),
        money(s.avgRate || 0),
      ]),
      meta: {
        "Total kg": report.totals?.totalKg ?? "",
        "Total spend": money(report.totals?.totalSpend),
      },
    };
  }

  if (kind === "production") {
    const report = await productionService.getReport(query);
    const columns = ["Product", "Batches", "Good", "Rejected", "Net kg"];
    const toRow = (p) => [
      p.name,
      p.batchCount,
      p.goodUnits,
      p.rejectedUnits,
      p.netConsumedKg,
    ];
    const hubRows = (report.byProduct || [])
      .filter((p) => (p.family || "hub") === "hub")
      .map(toRow);
    const drumRows = (report.byProduct || [])
      .filter((p) => p.family === "drum")
      .map(toRow);
    return {
      id: "production",
      sheetName: "Production",
      title: "Production",
      heading: "Production",
      columns,
      rows: [...hubRows, ...drumRows],
      subsections: [
        {
          heading: "Hub",
          columns,
          rows: hubRows.length ? hubRows : [["—", 0, 0, 0, 0]],
        },
        {
          heading: "Drum",
          columns,
          rows: drumRows.length ? drumRows : [["—", 0, 0, 0, 0]],
        },
      ],
      meta: {
        Batches: report.totals.batchCount,
        Hub: report.totals.byFamily?.hub ?? 0,
        Drum: report.totals.byFamily?.drum ?? 0,
        "Good units": report.totals.goodUnits,
      },
    };
  }

  if (kind === "expenses") {
    const report = await expenseService.getCostReport(query);
    return {
      id: "expenses",
      sheetName: "Expenses",
      title: "Expenses / costs",
      heading: "Expenses / costs",
      columns: ["Category", "Amount", "Count"],
      rows: (report.byCategory || []).map((c) => [
        c.label || c.category || "—",
        money(c.amount || 0),
        c.count || 0,
      ]),
      meta: {
        "Total operating": money(report.totals?.totalOperatingCost || 0),
        Expenses: report.totals?.expenseCount || 0,
      },
    };
  }

  if (kind === "inventory") {
    const report = await inventoryService.getInventoryReport(query);
    return {
      id: "inventory",
      sheetName: "Inventory",
      title: "Inventory",
      heading: "Inventory",
      columns: ["Product", "SKU", "Warehouse", "Qty", "Low threshold"],
      rows: (report.finishedStock?.items || []).map((i) => [
        i.name,
        i.sku || "",
        i.warehouseName || "",
        i.quantity,
        i.lowStockThreshold || 0,
      ]),
      meta: {
        "Raw scrap kg": report.raw?.availableKg ?? report.raw?.totalKg ?? 0,
        "Finished units": report.finishedStock?.totalUnits ?? 0,
      },
    };
  }

  if (kind === "finance") {
    const overview = await financeService.getOverview(query);
    return {
      id: "finance",
      sheetName: "Finance",
      title: "Finance P&L",
      heading: "Finance P&L",
      columns: ["Line", "Amount"],
      rows: [
        ["Revenue", money(overview.profitAndLoss.revenue)],
        ["COGS", money(overview.profitAndLoss.cogs)],
        ["Gross profit", money(overview.profitAndLoss.grossProfit)],
        ["Other expenses", money(overview.profitAndLoss.otherExpenses)],
        ["Net profit", money(overview.profitAndLoss.netProfit)],
        ["Cash in", money(overview.cashFlow.cashIn)],
        ["Cash out", money(overview.cashFlow.cashOut)],
        ["Net cash", money(overview.cashFlow.net)],
      ],
      meta: {},
    };
  }

  if (kind === "receivables") {
    const report = await getReceivablesReport(query);
    return {
      id: "receivables",
      sheetName: "Receivables",
      title: "Receivables",
      heading: "Receivables",
      columns: ["Party", "Phone", "Records", "Balance"],
      rows: (report.byParty || []).map((p) => [
        p.name,
        p.phone || "",
        p.recordCount,
        money(p.balance),
      ]),
      meta: {
        "Total receivable": money(report.totals.totalReceivable),
        Parties: report.totals.partyCount,
      },
    };
  }

  if (kind === "payables") {
    const report = await getPayablesReport(query);
    return {
      id: "payables",
      sheetName: "Payables",
      title: "Payables",
      heading: "Payables",
      columns: ["Supplier", "Phone", "Records", "Balance"],
      rows: (report.bySupplier || []).map((p) => [
        p.name,
        p.phone || "",
        p.recordCount,
        money(p.balance),
      ]),
      meta: {
        "Total payable": money(report.totals.totalPayable),
        Suppliers: report.totals.supplierCount,
      },
    };
  }

  throw httpError(`Unknown report module: ${kind}`, 400);
}

function parseModules(raw) {
  const list = String(raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(list)].filter((m) => COMBINED_MODULES.includes(m));
  if (unique.length === 0) {
    throw httpError(
      `Select at least one module (${COMBINED_MODULES.join(", ")})`,
      400
    );
  }
  return unique;
}

async function exportCombined(modules, query, format, res, filenameBase) {
  const sections = [];
  for (const kind of modules) {
    sections.push(await collectModuleSection(kind, query));
  }

  const period = periodLabel(query.dateFrom, query.dateTo);
  const title =
    modules.length === COMBINED_MODULES.length
      ? "Full company report"
      : "Custom report";
  const metaLines = [
    `Period: ${period}`,
    `Modules: ${modules.join(", ")}`,
    `Generated: ${new Date().toISOString().slice(0, 19)}`,
  ];

  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines,
      sections: sections.flatMap((s) => {
        const metaSuffix = Object.keys(s.meta || {}).length
          ? ` — ${Object.entries(s.meta)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}`
          : "";
        if (Array.isArray(s.subsections) && s.subsections.length > 0) {
          return s.subsections.map((sub) => ({
            heading: `${s.heading} — ${sub.heading}${metaSuffix}`,
            columns: sub.columns,
            rows: sub.rows,
          }));
        }
        return [
          {
            heading: `${s.heading}${metaSuffix}`,
            columns: s.columns,
            rows: s.rows,
          },
        ];
      }),
    });
    return sendPdf(res, buf, `${filenameBase}.pdf`);
  }

  const buf = await buildExcelMulti({
    title,
    sheets: sections.flatMap((s) => {
      const meta = { Period: period, ...(s.meta || {}) };
      if (Array.isArray(s.subsections) && s.subsections.length > 0) {
        return s.subsections.map((sub) => ({
          sheetName: String(`${s.sheetName}-${sub.heading}`).slice(0, 31),
          title: `${s.title} — ${sub.heading}`,
          columns: sub.columns,
          rows: sub.rows,
          meta,
        }));
      }
      return [
        {
          sheetName: s.sheetName,
          title: s.title,
          columns: s.columns,
          rows: s.rows,
          meta,
        },
      ];
    }),
  });
  return sendExcel(res, buf, `${filenameBase}.xlsx`);
}

async function exportFull(query, format, res) {
  return exportCombined(COMBINED_MODULES, query, format, res, "full-report");
}

async function exportCustom(query, format, res) {
  const modules = parseModules(query.modules);
  return exportCombined(modules, query, format, res, "custom-report");
}

async function getCombinedPreview(query) {
  const modules = query.modules
    ? parseModules(query.modules)
    : COMBINED_MODULES;
  const sections = [];
  for (const kind of modules) {
    sections.push(await collectModuleSection(kind, query));
  }
  return {
    title:
      modules.length === COMBINED_MODULES.length
        ? "Full company report"
        : "Custom report",
    period: periodLabel(query.dateFrom, query.dateTo),
    modules,
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      heading: s.heading,
      columns: s.columns,
      rows: s.rows,
      subsections: s.subsections || null,
      meta: s.meta || {},
    })),
  };
}

module.exports = {
  globalSearch,
  customerStatement,
  supplierStatement,
  groupStatement,
  customersOverviewStatement,
  getReceivablesReport,
  getPayablesReport,
  exportSales,
  exportPurchases,
  exportProduction,
  exportExpenses,
  exportInventory,
  exportFinance,
  exportReceivables,
  exportPayables,
  exportStatement,
  exportGroupStatement,
  exportCustomersOverviewStatement,
  exportFull,
  exportCustom,
  getCombinedPreview,
  COMBINED_MODULES,
};
