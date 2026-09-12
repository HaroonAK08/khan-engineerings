const Customer = require("../customers/customer.model");
const Supplier = require("../suppliers/supplier.model");
const Builty = require("../builty/builty.model");
const Purchase = require("../purchases/purchase.model");
const ProductionBatch = require("../production/production.model");
const Product = require("../products/product.model");
const Worker = require("../workers/worker.model");
const Salesman = require("../salesmen/salesman.model");
const PartyGroup = require("../party-groups/party-group.model");
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
const { allocateThisMonthFirst } = require("../../utils/allocate-payments");

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

function emptySearchResults() {
  return {
    customers: [],
    suppliers: [],
    orders: [],
    purchases: [],
    batches: [],
    products: [],
    workers: [],
    salesmen: [],
    groups: [],
  };
}

function batchProductName(batch) {
  const out = (batch.outputs || [])[0];
  if (out?.product && typeof out.product === "object") return out.product.name || "";
  if (batch.product && typeof batch.product === "object") return batch.product.name || "";
  return "";
}

function batchQty(batch) {
  const fromOutputs = (batch.outputs || []).reduce((sum, row) => sum + (row.quantity || 0), 0);
  return fromOutputs || batch.goodUnits || 0;
}

async function globalSearch({ q, limit = 8 } = {}) {
  const term = (q || "").trim();
  if (!term || term.length < 2) {
    return { q: term, results: emptySearchResults() };
  }
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const lim = Math.min(Math.max(Number(limit) || 8, 1), 25);

  const [customers, suppliers] = await Promise.all([
    Customer.find({ $or: [{ name: re }, { phone: re }, { email: re }] })
      .sort({ name: 1 })
      .limit(lim)
      .lean(),
    Supplier.find({ $or: [{ name: re }, { nameUr: re }, { phone: re }, { email: re }] })
      .sort({ name: 1 })
      .limit(lim)
      .lean(),
  ]);
  const customerIds = customers.map((c) => c._id);
  const supplierIds = suppliers.map((s) => s._id);

  const [orders, purchases, batches, products, workers, salesmen, groups] = await Promise.all([
    Builty.find({
      $or: [
        { builtyNo: re },
        { billNo: re },
        { notes: re },
        ...(customerIds.length ? [{ customer: { $in: customerIds } }] : []),
      ],
    })
      .populate("customer", "name")
      .sort({ builtyDate: -1 })
      .limit(lim)
      .lean(),
    Purchase.find({
      $or: [
        { invoiceNo: re },
        { notes: re },
        { vehicleNo: re },
        ...(supplierIds.length ? [{ supplier: { $in: supplierIds } }] : []),
      ],
    })
      .populate("supplier", "name nameUr")
      .sort({ purchaseDate: -1 })
      .limit(lim)
      .lean(),
    ProductionBatch.find({ $or: [{ batchNo: re }, { notes: re }] })
      .populate("product", "name sku")
      .populate("outputs.product", "name sku")
      .sort({ productionDate: -1 })
      .limit(lim)
      .lean(),
    Product.find({ $or: [{ name: re }, { sku: re }] })
      .sort({ name: 1 })
      .limit(lim)
      .lean(),
    Worker.find({ $or: [{ name: re }, { nameUr: re }, { job: re }] })
      .sort({ name: 1 })
      .limit(lim)
      .lean(),
    Salesman.find({ $or: [{ name: re }, { phone: re }] })
      .sort({ name: 1 })
      .limit(lim)
      .lean(),
    PartyGroup.find({ name: re }).sort({ name: 1 }).limit(lim).lean(),
  ]);

  return {
    q: term,
    results: {
      customers: customers.map((c) => ({
        id: c._id,
        label: c.name,
        meta: c.phone || c.email || "",
        href: `/dashboard/party/customers/${c._id}`,
      })),
      suppliers: suppliers.map((s) => ({
        id: s._id,
        label: s.name,
        meta: s.phone || s.email || s.nameUr || "",
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
        href: "/dashboard/inventory",
      })),
      batches: batches.map((b) => ({
        id: b._id,
        label: b.batchNo || String(b._id).slice(-6),
        meta: `${batchProductName(b)} · ${batchQty(b)} units`,
        href: `/dashboard/production/history?q=${encodeURIComponent(b.batchNo || "")}`,
      })),
      products: products.map((p) => ({
        id: p._id,
        label: p.name,
        meta: p.sku || "",
        href: `/dashboard/products?q=${encodeURIComponent(p.name)}`,
      })),
      workers: workers.map((w) => ({
        id: w._id,
        label: w.name,
        meta: w.job || w.nameUr || "",
        href: `/dashboard/expenses/salaries/${w._id}`,
      })),
      salesmen: salesmen.map((s) => ({
        id: s._id,
        label: s.name,
        meta: s.phone || "",
        href: `/dashboard/salesmen/${s._id}`,
      })),
      groups: groups.map((g) => ({
        id: g._id,
        label: g.name,
        meta: g.notes || "",
        href: `/dashboard/party/groups/${g._id}`,
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
  const drilledParty = Boolean(query.customerId || report.party);
  const view = ["whole", "party", "group"].includes(query.view) ? query.view : "party";
  const viewLabel = drilledParty
    ? `Party — ${report.party?.name || "detail"}`
    : view === "whole"
      ? "Overall"
      : view === "group"
        ? "Group wise"
        : "Party wise";
  const meta = {
    "Builty count": report.totals.orderCount,
    "Total sales": money(report.totals.totalSales),
    "Hub sales": money(report.totals.hubSales),
    "Drum sales": money(report.totals.drumSales),
    "Total paid": money(report.totals.totalPaid),
    Outstanding: money(report.totals.outstanding),
    "Hub units": report.totals.hubUnits ?? 0,
    "Drum units": report.totals.drumUnits ?? 0,
    "Total units": report.totals.totalUnits ?? 0,
    Period: periodLabel(query.dateFrom, query.dateTo),
    View: viewLabel,
    Group: report.group?.name || "All groups",
    Party: report.party?.name || "",
  };
  const title = report.party
    ? `Sales report — ${report.party.name}`
    : report.group
      ? `Sales report — ${report.group.name}`
      : "Sales report";

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
  const recordSource = report.records?.length ? report.records : report.outstanding || [];
  const recordRows = recordSource.map((o) => [
    o.orderNo,
    o.invoiceNo,
    o.customer,
    fmtDate(o.orderDate),
    money(o.totalAmount),
    money(o.amountPaid),
    money(o.balance),
    o.paymentStatus,
  ]);

  const itemColumns = ["Product", "Qty sold", "Avg price", "Sales"];
  const hubItemRows = (report.byProduct || [])
    .filter((p) => (p.family || "hub") === "hub")
    .map((p) => [p.name, p.quantity, money(p.avgUnitPrice), money(p.revenue)]);
  const drumItemRows = (report.byProduct || [])
    .filter((p) => p.family === "drum")
    .map((p) => [p.name, p.quantity, money(p.avgUnitPrice), money(p.revenue)]);

  if (format === "pdf") {
    const sections = [];
    if (hubItemRows.length) {
      sections.push({
        heading: "Hub — items sold",
        columns: itemColumns,
        rows: hubItemRows,
      });
    }
    if (drumItemRows.length) {
      sections.push({
        heading: "Drum — items sold",
        columns: itemColumns,
        rows: drumItemRows,
      });
    }
    if (drilledParty) {
      sections.push({
        heading: `All builties — ${report.party?.name || "Party"}`,
        columns: recordColumns,
        rows: recordRows,
      });
    } else if (view === "group") {
      sections.push({ heading: "Sales by group", columns: groupColumns, rows: groupRows });
    } else if (view === "party") {
      sections.push({ heading: "Sales by party", columns: partyColumns, rows: partyRows });
    } else {
      sections.push({
        heading: "Overall totals",
        columns: ["Metric", "Value"],
        rows: [
          ["Builty count", report.totals.orderCount],
          ["Total sales", money(report.totals.totalSales)],
          ["Hub sales", money(report.totals.hubSales)],
          ["Drum sales", money(report.totals.drumSales)],
          ["Total paid", money(report.totals.totalPaid)],
          ["Outstanding", money(report.totals.outstanding)],
          ["Hub units", report.totals.hubUnits ?? 0],
          ["Drum units", report.totals.drumUnits ?? 0],
          ["Total units", report.totals.totalUnits ?? 0],
        ],
      });
      sections.push({
        heading: "All builties",
        columns: recordColumns,
        rows: recordRows,
      });
    }
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines: Object.entries(meta)
        .filter(([, v]) => v !== "" && v != null)
        .map(([k, v]) => `${k}: ${v}`),
      sections,
    });
    return sendPdf(res, buf, drilledParty ? "sales-party-report.pdf" : "sales-report.pdf");
  }
  const buf = await buildExcel({
    title,
    sheetName: "Sales",
    columns: drilledParty
      ? recordColumns
      : view === "group"
        ? groupColumns
        : view === "whole"
          ? recordColumns
          : partyColumns,
    rows: drilledParty
      ? recordRows
      : view === "group"
        ? groupRows
        : view === "whole"
          ? recordRows
          : partyRows,
    meta,
  });
  return sendExcel(res, buf, drilledParty ? "sales-party-report.xlsx" : "sales-report.xlsx");
}

async function exportPurchases(query, format, res) {
  const report = await purchaseService.getReport(query);
  const drilledParty = Boolean(query.supplier || report.party);
  const view = ["whole", "party"].includes(query.view) ? query.view : "party";
  const viewLabel = drilledParty
    ? `Supplier — ${report.party?.name || "detail"}`
    : view === "whole"
      ? "Overall"
      : "Party wise";

  const partyColumns = ["Supplier", "Purchases", "Kg", "Spend", "Avg rate"];
  const partyRows = (report.byParty || report.bySupplier || []).map((s) => [
    s.name || s.supplierName || "Unknown",
    s.purchaseCount || s.count || 0,
    s.totalKg || s.kg || 0,
    money(s.totalSpend || s.spend || 0),
    money(s.avgRate || 0),
  ]);

  const recordColumns = [
    "Date",
    "Supplier",
    "Material",
    "Kg",
    "Rate",
    "Spend",
  ];
  const recordRows = (report.records || []).map((r) => [
    fmtDate(r.date),
    r.supplierName,
    r.materialType,
    r.quantityKg,
    money(r.ratePerKg),
    money(r.spend),
  ]);

  const meta = {
    Period: periodLabel(query.dateFrom, query.dateTo),
    View: viewLabel,
    Supplier: report.party?.name || "",
    "Total kg": report.totals?.totalKg ?? "",
    "Total spend": money(report.totals?.totalSpend),
    Purchases: report.totals?.purchaseCount ?? "",
  };
  const title = report.party
    ? `Purchase report — ${report.party.name}`
    : "Purchase report";

  if (format === "pdf") {
    const sections = [];
    if (drilledParty) {
      sections.push({
        heading: `All purchases — ${report.party?.name || "Supplier"}`,
        columns: recordColumns,
        rows: recordRows,
      });
    } else if (view === "whole") {
      sections.push({
        heading: "Overall totals",
        columns: ["Metric", "Value"],
        rows: [
          ["Purchases", report.totals?.purchaseCount ?? 0],
          ["Total kg", report.totals?.totalKg ?? 0],
          ["Total spend", money(report.totals?.totalSpend)],
          ["Avg rate", money(report.totals?.avgRate)],
        ],
      });
      sections.push({
        heading: "All purchases",
        columns: recordColumns,
        rows: recordRows,
      });
    } else {
      sections.push({ heading: "Purchases by supplier", columns: partyColumns, rows: partyRows });
    }
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines: Object.entries(meta)
        .filter(([, v]) => v !== "" && v != null)
        .map(([k, v]) => `${k}: ${v}`),
      sections,
    });
    return sendPdf(
      res,
      buf,
      drilledParty ? "purchases-supplier-report.pdf" : "purchases-report.pdf"
    );
  }
  const buf = await buildExcel({
    title,
    sheetName: "Purchases",
    columns: drilledParty || view === "whole" ? recordColumns : partyColumns,
    rows: drilledParty || view === "whole" ? recordRows : partyRows,
    meta,
  });
  return sendExcel(
    res,
    buf,
    drilledParty ? "purchases-supplier-report.xlsx" : "purchases-report.xlsx"
  );
}

async function exportProduction(query, format, res) {
  if (query.product) {
    return exportProductionProduct(query.product, query, format, res);
  }
  const report = await productionService.getReport(query);
  const hubColumns = ["Product", "Pieces", "Scrap kg", "Avg sell / pc", "Sold price"];
  const drumColumns = ["Product", "Pieces", "Daig kg", "Avg sell / pc", "Sold price"];
  const toHubRow = (p) => [
    p.name,
    p.goodUnits,
    p.scrapKg ?? 0,
    p.avgSellPerPiece ?? 0,
    p.soldPrice ?? 0,
  ];
  const toDrumRow = (p) => [
    p.name,
    p.goodUnits,
    p.daigKg ?? 0,
    p.avgSellPerPiece ?? 0,
    p.soldPrice ?? 0,
  ];
  const hubRows = (report.byProduct || [])
    .filter((p) => (p.family || "hub") === "hub")
    .map(toHubRow);
  const drumRows = (report.byProduct || [])
    .filter((p) => p.family === "drum")
    .map(toDrumRow);
  const sections = [
    { heading: "Hub", columns: hubColumns, rows: hubRows.length ? hubRows : [["—", 0, 0, 0, 0]] },
    { heading: "Drum", columns: drumColumns, rows: drumRows.length ? drumRows : [["—", 0, 0, 0, 0]] },
  ];
  const meta = {
    Period: periodLabel(query.dateFrom, query.dateTo),
    Batches: report.totals.batchCount,
    Hub: report.totals.byFamily?.hub ?? 0,
    Drum: report.totals.byFamily?.drum ?? 0,
    "Scrap used (kg)": report.totals.byMaterial?.scrap ?? report.totals.scrapKg ?? 0,
    "Daig used (kg)": report.totals.byMaterial?.daig ?? report.totals.daigKg ?? 0,
    "Good units": report.totals.goodUnits,
    "Reject rate": `${report.totals.rejectRate}%`,
    "Sold price": report.totals.soldPrice ?? 0,
    "Units sold": report.totals.unitsSold ?? 0,
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

function inventorySummaryRows(report) {
  const scrapKg =
    report.raw?.scrapKg ??
    report.raw?.byMaterial?.scrap?.availableKg ??
    report.raw?.availableKg ??
    0;
  const daigKg =
    report.raw?.daigKg ?? report.raw?.byMaterial?.daig?.availableKg ?? 0;
  const hubUnits = report.finishedStock?.hubUnits ?? 0;
  const drumUnits = report.finishedStock?.drumUnits ?? 0;
  const totalUnits = report.finishedStock?.totalUnits ?? 0;
  return {
    scrapKg,
    daigKg,
    hubUnits,
    drumUnits,
    totalUnits,
    summaryRows: [
      ["Raw scrap available (kg)", Number(scrapKg)],
      ["Raw daig available (kg)", Number(daigKg)],
      ["Finished hub units", Number(hubUnits)],
      ["Finished drum units", Number(drumUnits)],
      ["Finished total units", Number(totalUnits)],
    ],
    finishedRows: (report.finishedStock?.items || []).map((i) => [
      i.name,
      (i.family || "hub") === "drum" ? "Drum" : "Hub",
      i.quantity,
    ]),
  };
}

async function exportInventory(query, format, res) {
  const report = await inventoryService.getInventoryReport(query);
  const { summaryRows, finishedRows } = inventorySummaryRows(report);
  const asOfLabel = query.asOf
    ? String(query.asOf)
    : report.asOf
      ? new Date(report.asOf).toISOString().slice(0, 10)
      : "today";
  const meta = {
    "As of": asOfLabel,
    Period: periodLabel(query.dateFrom, query.dateTo),
  };
  const title = "Inventory report";
  const sections = [
    { heading: "Stock summary", columns: ["Item", "Value"], rows: summaryRows },
    { heading: "Finished goods", columns: ["Product", "Type", "Qty"], rows: finishedRows },
  ];
  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
      sections,
    });
    return sendPdf(res, buf, "inventory-report.pdf");
  }
  const buf = await buildExcel({
    title,
    sheetName: "Inventory",
    meta,
    sections,
  });
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
 * Money still to collect after payment allocation (this month's builties first,
 * then older, then previous pending). With no dates = full outstanding (khata).
 * With a date range = unpaid builties / pending in that period only.
 */
async function getReceivablesReport({ dateFrom, dateTo, groupId, customerId, asOfDate } = {}) {
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

  const asOf = asOfDate ? String(asOfDate).slice(0, 10) : null;

  const [builties, adjustments, payments, creditAdjustments, allGroups] = await Promise.all([
    Builty.find({})
      .populate("customer", "name phone group")
      .populate({ path: "items.product", select: "name sku weightKg" })
      .sort({ builtyDate: 1, createdAt: 1 })
      .lean(),
    CustomerLedgerEntry.find({ type: "adjustment", signedAmount: { $gt: 0 } })
      .populate("customer", "name phone group")
      .sort({ entryDate: 1, createdAt: 1 })
      .lean(),
    CustomerPayment.find({}).select("customer amount paymentDate").lean(),
    CustomerLedgerEntry.find({ type: "adjustment", signedAmount: { $lt: 0 } })
      .select("customer signedAmount entryDate")
      .lean(),
    PartyGroup.find({}).select("name").lean(),
  ]);

  const groupNameMap = new Map(allGroups.map((g) => [String(g._id), g.name]));

  const paymentsByCustomer = new Map();
  for (const p of payments) {
    if (asOf && !inDateRange(p.paymentDate, null, asOf)) continue;
    const id = String(p.customer || "");
    if (!id) continue;
    const list = paymentsByCustomer.get(id) || [];
    list.push({
      id: String(p._id),
      date: p.paymentDate,
      amount: p.amount || 0,
    });
    paymentsByCustomer.set(id, list);
  }
  for (const a of creditAdjustments) {
    if (asOf && !inDateRange(a.entryDate, null, asOf)) continue;
    const id = String(a.customer || "");
    if (!id) continue;
    const list = paymentsByCustomer.get(id) || [];
    list.push({
      id: String(a._id),
      date: a.entryDate,
      amount: Math.abs(a.signedAmount || 0),
    });
    paymentsByCustomer.set(id, list);
  }

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
    if (asOf && !inDateRange(a.entryDate, null, asOf)) continue;
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
      productLines: [],
      href: `/dashboard/party/customers/${party.id}`,
    });
  }

  for (const b of builties) {
    if (asOf && !inDateRange(b.builtyDate, null, asOf)) continue;
    const cust = b.customer;
    const id = cust && typeof cust === "object" ? cust._id : b.customer;
    const party = ensureParty(cust, id);
    if (!party) continue;
    const productLines = builtyProductLines(b);
    const products = (Array.isArray(b.items) ? b.items : [])
      .map((line) => formatBuiltyItemLine(line))
      .filter(Boolean);
    if (Number(b.discountAmount) > 0) {
      products.push(`Discount given −${formatMoneyPlain(b.discountAmount)}`);
    }
    party.builties.push({
      type: "builty",
      id: String(b._id),
      date: b.builtyDate,
      reference: b.builtyNo,
      totalAmount: roundMoney(b.totalAmount),
      products,
      productLines,
      href: `/dashboard/builty/${b._id}`,
    });
  }

  const records = [];
  for (const party of byCustomer.values()) {
    const charges = [
      ...party.previousPending.map((item) => ({
        ...item,
        kind: "adjustment",
        amount: item.totalAmount,
      })),
      ...party.builties.map((item) => ({
        ...item,
        kind: "invoice",
        amount: item.totalAmount,
      })),
    ];
    const allocated = allocateThisMonthFirst(
      charges,
      paymentsByCustomer.get(party.id) || []
    );
    const byId = new Map(allocated.map((c) => [c.id, c]));

    for (const item of [...party.previousPending, ...party.builties]) {
      const row = byId.get(item.id);
      const amountPaid = roundMoney(row?.paid || 0);
      const balance = roundMoney(row?.remaining ?? item.totalAmount);
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
        productLines: item.productLines || [],
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
  const byGroup = [...byGroupMap.values()].sort((a, b) => b.balance - a.balance);
  const totalReceivable = roundMoney(records.reduce((s, r) => s + r.balance, 0));

  return {
    period: { from: dateFrom || null, to: dateTo || null },
    group: groupMeta,
    party: partyMeta,
    totals: {
      totalReceivable,
      partyCount: byParty.length,
      groupCount: byGroup.filter((g) => Boolean(g.groupId)).length,
      recordCount: records.length,
    },
    byParty,
    byGroup,
    records,
  };
}

/**
 * Jan–Dec matrix of receivables as of a selected date (payments after that date ignored).
 * Overall = rows are party groups; with groupId = rows are parties.
 */
async function getMonthlyReceivablesReport({ date, year, groupId } = {}) {
  const asOfRaw = date || toIsoDateLocal(new Date());
  const asOf = parseDate(asOfRaw, "date");
  asOf.setHours(23, 59, 59, 999);
  const y = Number(year) || asOf.getFullYear();
  const bounds = yearBounds(y);
  const dateFrom = toIsoDateLocal(bounds.start);
  const dateTo = toIsoDateLocal(asOf);
  const asOfIso = toIsoDateLocal(asOf);

  const report = await getReceivablesReport({
    dateFrom,
    dateTo,
    asOfDate: asOfIso,
    groupId: groupId || undefined,
  });

  const months = MONTH_LABELS.map((label, i) => ({
    key: `${y}-${String(i + 1).padStart(2, "0")}`,
    label,
  }));

  function emptyMonthMap() {
    return Object.fromEntries(months.map((m) => [m.key, 0]));
  }

  const mode = groupId ? "party" : "group";
  const groupNameById = new Map(
    (report.byGroup || []).map((g) => [g.groupId || "__ungrouped__", g.name || "Ungrouped"])
  );

  const rowsMap = new Map();
  for (const r of report.records || []) {
    const mk = monthKeyFromDate(r.date);
    if (!mk.startsWith(`${y}-`)) continue;
    const balance = roundMoney(r.balance || 0);
    if (balance <= 0) continue;

    let rowId;
    let rowName;
    if (mode === "party") {
      rowId = r.partyId || r.partyName || "unknown";
      rowName = r.partyName || "—";
    } else {
      rowId = r.groupId || "__ungrouped__";
      rowName = groupNameById.get(rowId) || (r.groupId ? "—" : "Ungrouped");
    }

    if (!rowsMap.has(rowId)) {
      rowsMap.set(rowId, {
        id: rowId === "__ungrouped__" ? "" : rowId,
        name: rowName,
        months: emptyMonthMap(),
        total: 0,
      });
    }
    const row = rowsMap.get(rowId);
    row.months[mk] = roundMoney((row.months[mk] || 0) + balance);
    row.total = roundMoney(row.total + balance);
  }

  const rows = [...rowsMap.values()].sort((a, b) => b.total - a.total);
  const monthTotals = emptyMonthMap();
  let grandTotal = 0;
  for (const row of rows) {
    for (const m of months) {
      monthTotals[m.key] = roundMoney((monthTotals[m.key] || 0) + (row.months[m.key] || 0));
    }
    grandTotal = roundMoney(grandTotal + row.total);
  }

  return {
    year: y,
    asOf: asOfIso,
    period: { from: dateFrom, to: dateTo },
    group: report.group || null,
    mode,
    months,
    rows,
    totals: {
      months: monthTotals,
      total: grandTotal,
      rowCount: rows.length,
    },
  };
}

/**
 * Cash/bank received from parties in a period — from CustomerPayment.
 * Supports party-wise and group-wise rollups.
 */
async function getReceivedReport({ dateFrom, dateTo, groupId, customerId } = {}) {
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

  const filter = {
    ...dateRangeFilter("paymentDate", dateFrom, dateTo),
  };
  if (allowedCustomerIds) {
    filter.customer = { $in: [...allowedCustomerIds] };
  }

  const [payments, allGroups] = await Promise.all([
    CustomerPayment.find(filter)
      .populate("customer", "name phone group")
      .populate("builty", "builtyNo")
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean(),
    PartyGroup.find({}).select("name").lean(),
  ]);

  const groupNameMap = new Map(allGroups.map((g) => [String(g._id), g.name]));

  const records = payments.map((p) => {
    const cust = p.customer && typeof p.customer === "object" ? p.customer : null;
    const partyId = cust ? String(cust._id) : String(p.customer || "");
    const groupIdVal =
      cust && cust.group ? String(cust.group._id || cust.group || "") : "";
    const builtyNo =
      p.builty && typeof p.builty === "object" ? p.builty.builtyNo || "" : "";
    const reference =
      (p.reference && String(p.reference).trim()) ||
      builtyNo ||
      (p.notes && String(p.notes).trim()) ||
      "—";
    return {
      id: String(p._id),
      type: "payment",
      date: p.paymentDate,
      reference,
      method: p.method || "cash",
      notes: p.notes || "",
      partyId,
      partyName: cust?.name || "—",
      partyPhone: cust?.phone || "",
      groupId: groupIdVal,
      builtyId: p.builty
        ? String(typeof p.builty === "object" ? p.builty._id : p.builty)
        : "",
      amount: roundMoney(p.amount),
      href: partyId
        ? `/dashboard/party/customers/${partyId}`
        : "/dashboard/party/customers",
    };
  });

  const byPartyMap = new Map();
  for (const r of records) {
    const key = r.partyId || r.partyName;
    const existing = byPartyMap.get(key);
    if (existing) {
      existing.amount = roundMoney(existing.amount + r.amount);
      existing.recordCount += 1;
    } else {
      byPartyMap.set(key, {
        partyId: r.partyId,
        name: r.partyName,
        phone: r.partyPhone,
        groupId: r.groupId || "",
        amount: r.amount,
        recordCount: 1,
      });
    }
  }
  const byParty = [...byPartyMap.values()].sort((a, b) => b.amount - a.amount);

  const byGroupMap = new Map();
  for (const p of byParty) {
    const key = p.groupId || "__ungrouped__";
    const existing = byGroupMap.get(key);
    if (existing) {
      existing.amount = roundMoney(existing.amount + p.amount);
      existing.recordCount += p.recordCount;
      existing.partyCount += 1;
    } else {
      byGroupMap.set(key, {
        groupId: p.groupId || "",
        name: p.groupId ? groupNameMap.get(p.groupId) || "—" : "Ungrouped",
        amount: p.amount,
        recordCount: p.recordCount,
        partyCount: 1,
      });
    }
  }
  const byGroup = [...byGroupMap.values()]
    .filter((g) => Boolean(g.groupId))
    .sort((a, b) => b.amount - a.amount);

  const totalReceived = roundMoney(records.reduce((s, r) => s + r.amount, 0));

  return {
    period: { from: dateFrom || null, to: dateTo || null },
    group: groupMeta,
    party: partyMeta,
    totals: {
      totalReceived,
      partyCount: byParty.length,
      groupCount: byGroup.length,
      recordCount: records.length,
    },
    byParty,
    byGroup,
    records,
  };
}

async function getPaidReport({ dateFrom, dateTo, supplierId } = {}) {
  const LedgerEntry = require("../ledger/ledger.model");
  let partyMeta = null;

  const filter = {
    type: "payment",
    ...dateRangeFilter("entryDate", dateFrom, dateTo),
  };

  if (supplierId) {
    if (!mongoose.isValidObjectId(supplierId)) throw httpError("Invalid supplier", 400);
    const supplier = await Supplier.findById(supplierId).select("name phone").lean();
    if (!supplier) throw httpError("Supplier not found", 404);
    partyMeta = { id: String(supplier._id), name: supplier.name };
    filter.supplier = supplier._id;
  }

  const payments = await LedgerEntry.find(filter)
    .populate("supplier", "name nameUr phone")
    .populate("purchase", "invoiceNo")
    .sort({ entryDate: -1, createdAt: -1 })
    .lean();

  const records = payments.map((p) => {
    const supplier =
      p.supplier && typeof p.supplier === "object"
        ? {
            id: String(p.supplier._id),
            name: p.supplier.name || "—",
            phone: p.supplier.phone || "",
          }
        : { id: String(p.supplier || ""), name: "—", phone: "" };
    const invoiceNo =
      p.purchase && typeof p.purchase === "object" ? p.purchase.invoiceNo || "" : "";
    const reference =
      (p.notes && String(p.notes).trim()) || invoiceNo || "—";
    return {
      id: String(p._id),
      type: "payment",
      date: p.entryDate,
      reference,
      notes: p.notes || "",
      partyId: supplier.id,
      partyName: supplier.name,
      partyPhone: supplier.phone,
      amount: roundMoney(p.amount),
      href: supplier.id ? `/dashboard/suppliers/${supplier.id}` : "/dashboard/suppliers",
    };
  });

  const bySupplierMap = new Map();
  for (const r of records) {
    const key = r.partyId || r.partyName;
    const existing = bySupplierMap.get(key);
    if (existing) {
      existing.amount = roundMoney(existing.amount + r.amount);
      existing.recordCount += 1;
    } else {
      bySupplierMap.set(key, {
        partyId: r.partyId,
        name: r.partyName,
        phone: r.partyPhone,
        amount: r.amount,
        balance: 0,
        recordCount: 1,
      });
    }
  }

  const supplierIdsForBalance = partyMeta
    ? [partyMeta.id]
    : [...bySupplierMap.keys()].filter((id) => mongoose.isValidObjectId(id));

  await Promise.all(
    supplierIdsForBalance.map(async (id) => {
      const balance = await supplierService.getBalance(id);
      const row = bySupplierMap.get(id);
      if (row) row.balance = roundMoney(balance);
      else if (partyMeta) {
        bySupplierMap.set(id, {
          partyId: id,
          name: partyMeta.name,
          phone: "",
          amount: 0,
          balance: roundMoney(balance),
          recordCount: 0,
        });
      }
    })
  );

  const bySupplier = [...bySupplierMap.values()].sort((a, b) => b.amount - a.amount);
  const totalPaid = roundMoney(records.reduce((s, r) => s + r.amount, 0));
  const totalLeft = roundMoney(bySupplier.reduce((s, r) => s + Math.max(0, r.balance || 0), 0));

  return {
    period: { from: dateFrom || null, to: dateTo || null },
    party: partyMeta,
    totals: {
      totalPaid,
      totalLeft,
      supplierCount: bySupplier.length,
      recordCount: records.length,
    },
    bySupplier,
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

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function yearBounds(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw httpError("Year is invalid", 400);
  }
  const start = new Date(y, 0, 1, 0, 0, 0, 0);
  const end = new Date(y, 11, 31, 23, 59, 59, 999);
  return { year: y, start, end };
}

function toIsoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Period for yearly/bill records: optional dateFrom/dateTo, else full calendar year. */
function resolveBillPeriod({ year, dateFrom, dateTo } = {}) {
  const hasFrom = Boolean(dateFrom);
  const hasTo = Boolean(dateTo);
  if (hasFrom || hasTo) {
    let start;
    let end;
    if (hasFrom) {
      start = parseDate(dateFrom, "dateFrom");
      start.setHours(0, 0, 0, 0);
    } else {
      start = new Date(2000, 0, 1, 0, 0, 0, 0);
    }
    if (hasTo) {
      end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
    } else {
      end = new Date(2100, 11, 31, 23, 59, 59, 999);
    }
    if (start.getTime() > end.getTime()) {
      throw httpError("dateFrom must be before dateTo", 400);
    }
    const fromStr = hasFrom ? toIsoDateLocal(start) : null;
    const toStr = hasTo ? toIsoDateLocal(end) : null;
    return {
      year: start.getFullYear(),
      start,
      end,
      dateFrom: fromStr,
      dateTo: toStr,
      label: periodLabel(fromStr, toStr) || String(start.getFullYear()),
    };
  }
  const bounds = yearBounds(year || new Date().getFullYear());
  return {
    ...bounds,
    dateFrom: toIsoDateLocal(bounds.start),
    dateTo: toIsoDateLocal(bounds.end),
    label: String(bounds.year),
  };
}

function monthKeyFromDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`;
}

function monthLabelFromKey(key) {
  const [ys, ms] = String(key || "").split("-");
  const mi = Number(ms) - 1;
  if (!ys || mi < 0 || mi > 11) return key || "—";
  return `${MONTH_LABELS[mi]} ${ys}`;
}

function formatMoneyPlain(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  if (Math.abs(v - Math.round(v)) < 0.005) return String(Math.round(v));
  return v.toFixed(2);
}

function formatBuiltyItemLine(line) {
  const name =
    line.product && typeof line.product === "object" ? line.product.name : "Item";
  const qty = Number(line.quantity) || 0;
  const productWeight =
    line.product && typeof line.product === "object" ? Number(line.product.weightKg) || 0 : 0;
  const weight = Number(line.weightKg) > 0 ? Number(line.weightKg) : productWeight;
  let unit = Number(line.unitPrice) || 0;
  const total = Number(line.lineTotal) || 0;
  if (unit <= 0 && qty > 0 && total > 0) unit = total / qty;

  let head = String(name || "Item").trim();
  const nameHasKg = /\d+(\.\d+)?\s*kg\b/i.test(head);
  if (weight > 0 && !nameHasKg) head += ` - ${formatMoneyPlain(weight)}kg`;
  head += ` × ${formatMoneyPlain(qty)}`;
  return `${head}  |  ${formatMoneyPlain(unit)} × ${formatMoneyPlain(qty)} = ${formatMoneyPlain(total)}`;
}

function builtyProductLines(b) {
  const lines = (Array.isArray(b.items) ? b.items : [])
    .map((line) => {
      const name =
        line.product && typeof line.product === "object" ? line.product.name : "Item";
      const qty = Number(line.quantity) || 0;
      let unit = Number(line.unitPrice) || 0;
      const total = Number(line.lineTotal) || 0;
      if (unit <= 0 && qty > 0 && total > 0) unit = total / qty;
      return {
        name: String(name || "Item").trim(),
        quantity: qty,
        unitPrice: roundMoney(unit),
        lineTotal: roundMoney(total),
      };
    })
    .filter((line) => line.name);
  if (Number(b.discountAmount) > 0) {
    const discount = roundMoney(b.discountAmount);
    lines.push({
      name: "Discount given",
      quantity: 1,
      unitPrice: roundMoney(-discount),
      lineTotal: roundMoney(-discount),
    });
  }
  return lines;
}

function builtyItemsLabel(b) {
  return (Array.isArray(b.items) ? b.items : [])
    .map((line) => formatBuiltyItemLine(line))
    .filter(Boolean)
    .join("\n");
}

function mapBuiltyRow(b) {
  const items = (Array.isArray(b.items) ? b.items : [])
    .map((line) => {
      const name =
        line.product && typeof line.product === "object" ? line.product.name : "Item";
      return {
        name,
        quantity: line.quantity || 0,
        weightKg: Number(line.weightKg) || 0,
        unitPrice: roundMoney(line.unitPrice || 0),
        ratePerKg: roundMoney(line.ratePerKg || 0),
        pricingMode: line.pricingMode || "rate_kg",
        lineTotal: roundMoney(line.lineTotal || 0),
        label: formatBuiltyItemLine(line),
      };
    })
    .filter((line) => line.name);
  return {
    id: String(b._id),
    builtyNo: b.builtyNo || "—",
    billNo: b.billNo || "",
    date: b.builtyDate,
    items,
    itemsLabel: builtyItemsLabel(b),
    total: roundMoney(b.totalAmount || 0),
    paid: roundMoney(b.amountPaid || 0),
    left: roundMoney(b.balance || 0),
    paymentStatus: b.paymentStatus || "unpaid",
    href: `/dashboard/builty/${b._id}`,
  };
}

function summarizeBuiltyRows(rows) {
  let billed = 0;
  let paid = 0;
  let leftover = 0;
  for (const r of rows) {
    billed += r.total || 0;
    paid += r.paid || 0;
    leftover += r.left || 0;
  }
  return {
    billed: roundMoney(billed),
    paid: roundMoney(paid),
    leftover: roundMoney(leftover),
    builtyCount: rows.length,
  };
}

async function buildPartyYearlyRecord(customer, period, groupNameMap) {
  const customerId = customer._id;
  await builtyService.syncCustomerBuiltyPaymentStatuses(customerId);

  const builties = await Builty.find({
    customer: customerId,
    $or: [
      { builtyDate: { $gte: period.start, $lte: period.end } },
      { builtyDate: { $lt: period.start }, balance: { $gt: 0 } },
    ],
  })
    .populate({ path: "items.product", select: "name sku weightKg" })
    .sort({ builtyDate: 1, createdAt: 1 })
    .lean();

  const yearBuilties = [];
  const openBeforeYear = [];
  for (const b of builties) {
    const row = mapBuiltyRow(b);
    const t = new Date(b.builtyDate).getTime();
    if (t < period.start.getTime()) {
      if (row.left > 0.001) openBeforeYear.push(row);
    } else if (t <= period.end.getTime()) {
      yearBuilties.push(row);
    }
  }

  const byMonth = new Map();
  for (const row of yearBuilties) {
    const key = monthKeyFromDate(row.date);
    if (!key) continue;
    const list = byMonth.get(key) || [];
    list.push(row);
    byMonth.set(key, list);
  }

  const months = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, rows]) => ({
      key,
      label: monthLabelFromKey(key),
      builties: rows,
      totals: summarizeBuiltyRows(rows),
    }));

  const groupId = customer.group ? String(customer.group._id || customer.group) : "";
  return {
    partyId: String(customerId),
    name: customer.name || "—",
    phone: customer.phone || "",
    groupId,
    groupName: groupId ? groupNameMap.get(groupId) || "—" : "",
    summary: summarizeBuiltyRows(yearBuilties),
    months,
    openBeforeYear,
  };
}

/**
 * Yearly party/group bill records — builty totals, paid, leftover by month.
 * Optional dateFrom/dateTo narrow the period; otherwise full calendar year.
 */
async function getYearlyBillReport({ year, groupId, customerId, dateFrom, dateTo } = {}) {
  const period = resolveBillPeriod({ year, dateFrom, dateTo });
  const allGroups = await PartyGroup.find({}).select("name").lean();
  const groupNameMap = new Map(allGroups.map((g) => [String(g._id), g.name]));

  let groupMeta = null;
  let partyMeta = null;
  let customers = [];

  if (customerId) {
    if (!mongoose.isValidObjectId(customerId)) throw httpError("Invalid party", 400);
    const customer = await Customer.findById(customerId).select("name phone group").lean();
    if (!customer) throw httpError("Party not found", 404);
    partyMeta = { id: String(customer._id), name: customer.name };
    customers = [customer];
    if (customer.group) {
      const gid = String(customer.group._id || customer.group);
      groupMeta = { id: gid, name: groupNameMap.get(gid) || "—" };
    }
  } else if (groupId === "__ungrouped__" || groupId === "ungrouped") {
    groupMeta = { id: "", name: "Ungrouped" };
    customers = await Customer.find({
      $or: [{ group: null }, { group: { $exists: false } }],
    })
      .select("name phone group")
      .sort({ name: 1 })
      .lean();
  } else if (groupId) {
    if (!mongoose.isValidObjectId(groupId)) throw httpError("Invalid party group", 400);
    const group = await PartyGroup.findById(groupId).lean();
    if (!group) throw httpError("Party group not found", 404);
    groupMeta = { id: String(group._id), name: group.name };
    customers = await Customer.find({ group: group._id })
      .select("name phone group")
      .sort({ name: 1 })
      .lean();
  } else {
    const activeIds = await Builty.distinct("customer", {
      $or: [
        { builtyDate: { $gte: period.start, $lte: period.end } },
        { builtyDate: { $lt: period.start }, balance: { $gt: 0 } },
      ],
    });
    customers = await Customer.find({ _id: { $in: activeIds } })
      .select("name phone group")
      .sort({ name: 1 })
      .lean();
  }

  const parties = [];
  for (const c of customers) {
    parties.push(await buildPartyYearlyRecord(c, period, groupNameMap));
  }

  const byGroupMap = new Map();
  for (const p of parties) {
    const key = p.groupId || "__ungrouped__";
    const existing = byGroupMap.get(key);
    if (existing) {
      existing.billed = roundMoney(existing.billed + p.summary.billed);
      existing.paid = roundMoney(existing.paid + p.summary.paid);
      existing.leftover = roundMoney(existing.leftover + p.summary.leftover);
      existing.builtyCount += p.summary.builtyCount;
      existing.partyCount += 1;
    } else {
      byGroupMap.set(key, {
        groupId: p.groupId || "",
        name: p.groupId ? p.groupName || "—" : "Ungrouped",
        billed: p.summary.billed,
        paid: p.summary.paid,
        leftover: p.summary.leftover,
        builtyCount: p.summary.builtyCount,
        partyCount: 1,
      });
    }
  }
  const byGroup = [...byGroupMap.values()].sort((a, b) => b.leftover - a.leftover);

  const totals = parties.reduce(
    (acc, p) => {
      acc.billed += p.summary.billed;
      acc.paid += p.summary.paid;
      acc.leftover += p.summary.leftover;
      acc.builtyCount += p.summary.builtyCount;
      return acc;
    },
    { billed: 0, paid: 0, leftover: 0, builtyCount: 0 }
  );

  return {
    year: period.year,
    period: {
      from: period.dateFrom,
      to: period.dateTo,
      label: period.label,
    },
    group: groupMeta,
    party: partyMeta,
    totals: {
      billed: roundMoney(totals.billed),
      paid: roundMoney(totals.paid),
      leftover: roundMoney(totals.leftover),
      builtyCount: totals.builtyCount,
      partyCount: parties.length,
      groupCount: byGroup.filter((g) => Boolean(g.groupId)).length,
    },
    byParty: parties
      .map((p) => ({
        partyId: p.partyId,
        name: p.name,
        phone: p.phone,
        groupId: p.groupId,
        groupName: p.groupName,
        billed: p.summary.billed,
        paid: p.summary.paid,
        leftover: p.summary.leftover,
        builtyCount: p.summary.builtyCount,
      }))
      .sort((a, b) => b.leftover - a.leftover),
    byGroup,
    parties,
  };
}

function parseIdList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

async function exportYearlyBill(query, format, res) {
  const period = resolveBillPeriod({
    year: query.year,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });
  const reportQuery = {
    year: period.year,
    dateFrom: query.dateFrom || undefined,
    dateTo: query.dateTo || undefined,
    groupId: query.groupId,
    customerId: query.customerId,
  };
  const mode = String(query.mode || "").toLowerCase();
  const monthKey = String(query.monthKey || "").trim();
  const wantBill = mode === "bill" || Boolean(monthKey);

  const yearlyColumns = ["Builty no", "Items", "Sent", "Total", "Paid", "Left"];
  const yearlyColWidths = [0.11, 0.44, 0.09, 0.12, 0.12, 0.12];
  const yearlyColAlign = ["left", "left", "left", "right", "right", "right"];
  const toRows = (rows) =>
    rows.map((r) => [
      r.builtyNo,
      r.itemsLabel || "—",
      fmtDate(r.date),
      money(r.total),
      money(r.paid),
      money(r.left),
    ]);

  if (wantBill) {
    const customerId = query.customerId;
    if (!customerId || !mongoose.isValidObjectId(customerId)) {
      throw httpError("Party is required for yearly bill export", 400);
    }
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      throw httpError("monthKey is required (YYYY-MM)", 400);
    }

    const report = await getYearlyBillReport({
      ...reportQuery,
      customerId,
    });
    const party = report.parties[0];
    if (!party) throw httpError("Party not found", 404);

    const month = party.months.find((m) => m.key === monthKey);
    if (!month) throw httpError("No builties in that month", 404);

    const previousCandidates = [
      ...party.openBeforeYear,
      ...party.months
        .filter((m) => m.key < monthKey)
        .flatMap((m) => m.builties)
        .filter((b) => b.left > 0.001),
    ];

    const previousIds = parseIdList(query.previousIds);
    let selectedPrevious;
    if (query.includePrevious === "0") {
      selectedPrevious = [];
    } else if (query.previousIds !== undefined) {
      const idSet = new Set(previousIds);
      selectedPrevious = previousCandidates.filter((b) => idSet.has(b.id));
    } else {
      selectedPrevious = previousCandidates;
    }

    const monthIds = parseIdList(query.monthIds);
    const selectedMonth =
      monthIds.length > 0 ? month.builties.filter((b) => monthIds.includes(b.id)) : month.builties;

    const prevTotals = summarizeBuiltyRows(selectedPrevious);
    const monthTotals = summarizeBuiltyRows(selectedMonth);
    const amountDue = roundMoney(prevTotals.leftover + monthTotals.leftover);

    const title = `Bill statement — ${party.name}`;
    const meta = {
      Period: report.period?.label || period.label,
      Month: month.label,
      Party: party.name,
      Group: party.groupName || "—",
      "Previous leftover": money(prevTotals.leftover),
      "Month billed": money(monthTotals.billed),
      "Month paid": money(monthTotals.paid),
      "Month left": money(monthTotals.leftover),
      "Amount due": money(amountDue),
    };
    const metaPairs = Object.entries(meta);

    const sections = [];
    if (selectedPrevious.length > 0) {
      sections.push({
        heading: "Previous leftover (selected)",
        columns: yearlyColumns,
        columnWidths: yearlyColWidths,
        columnAlign: yearlyColAlign,
        rows: [
          ...toRows(selectedPrevious),
          {
            bold: true,
            cells: [
              "Total",
              "",
              "",
              money(prevTotals.billed),
              money(prevTotals.paid),
              money(prevTotals.leftover),
            ],
          },
        ],
      });
    }
    sections.push({
      heading: `${month.label} builties`,
      columns: yearlyColumns,
      columnWidths: yearlyColWidths,
      columnAlign: yearlyColAlign,
      rows: [
        ...toRows(selectedMonth),
        {
          bold: true,
          cells: [
            "Total",
            "",
            "",
            money(monthTotals.billed),
            money(monthTotals.paid),
            money(monthTotals.leftover),
          ],
        },
      ],
    });
    sections.push({
      heading: "Bill totals",
      columns: ["Metric", "Amount"],
      columnWidths: [0.65, 0.35],
      columnAlign: ["left", "right"],
      rows: [
        ["Previous leftover", money(prevTotals.leftover)],
        ["Month billed", money(monthTotals.billed)],
        ["Month paid", money(monthTotals.paid)],
        ["Month left", money(monthTotals.leftover)],
        {
          bold: true,
          cells: ["Amount due on this bill", money(amountDue)],
        },
      ],
    });

    if (format === "pdf") {
      const buf = await buildPdf({
        title,
        subtitle: "Khan Engineerings · Printable bill statement",
        metaPairs,
        sections,
        layout: "landscape",
      });
      return sendPdf(res, buf, `yearly-bill-${party.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
    }

    const buf = await buildExcel({
      title,
      sheetName: "Yearly bill",
      meta,
      sections,
    });
    return sendExcel(res, buf, `yearly-bill-${party.name.replace(/\s+/g, "-").toLowerCase()}.xlsx`);
  }

  const report = await getYearlyBillReport(reportQuery);

  if (query.customerId && report.parties[0]) {
    const party = report.parties[0];
    const title = `Party statement — ${party.name}`;
    const meta = {
      Period: report.period?.label || period.label,
      Party: party.name,
      Group: party.groupName || "—",
      Billed: money(party.summary.billed),
      Paid: money(party.summary.paid),
      Leftover: money(party.summary.leftover),
      Builties: party.summary.builtyCount,
    };
    const metaPairs = Object.entries(meta);
    const sections = [];
    if (party.openBeforeYear.length > 0) {
      const openTotals = summarizeBuiltyRows(party.openBeforeYear);
      sections.push({
        heading: "Open before period",
        columns: yearlyColumns,
        columnWidths: yearlyColWidths,
        columnAlign: yearlyColAlign,
        rows: [
          ...toRows(party.openBeforeYear),
          {
            bold: true,
            cells: [
              "Total",
              "",
              "",
              money(openTotals.billed),
              money(openTotals.paid),
              money(openTotals.leftover),
            ],
          },
        ],
      });
    }
    for (const month of party.months) {
      sections.push({
        heading: month.label,
        columns: yearlyColumns,
        columnWidths: yearlyColWidths,
        columnAlign: yearlyColAlign,
        rows: [
          ...toRows(month.builties),
          {
            bold: true,
            cells: [
              "Total",
              "",
              "",
              money(month.totals.billed),
              money(month.totals.paid),
              money(month.totals.leftover),
            ],
          },
        ],
      });
    }
    if (sections.length === 0) {
      sections.push({
        heading: "Period summary",
        columns: ["Metric", "Amount"],
        columnWidths: [0.65, 0.35],
        columnAlign: ["left", "right"],
        rows: [
          ["Billed", money(party.summary.billed)],
          ["Paid", money(party.summary.paid)],
          ["Leftover", money(party.summary.leftover)],
        ],
      });
    }

    if (format === "pdf") {
      const buf = await buildPdf({
        title,
        subtitle: "Khan Engineerings · Printable party statement",
        metaPairs,
        sections,
        layout: "landscape",
      });
      return sendPdf(
        res,
        buf,
        `yearly-record-${party.name.replace(/\s+/g, "-").toLowerCase()}.pdf`
      );
    }
    const buf = await buildExcel({ title, sheetName: "Yearly", meta, sections });
    return sendExcel(
      res,
      buf,
      `yearly-record-${party.name.replace(/\s+/g, "-").toLowerCase()}.xlsx`
    );
  }

  const title = report.group
    ? `Party statement — ${report.group.name}`
    : `Party statements — ${report.period?.label || period.label}`;
  const meta = {
    Period: report.period?.label || period.label,
    Group: report.group?.name || "All",
    Billed: money(report.totals.billed),
    Paid: money(report.totals.paid),
    Leftover: money(report.totals.leftover),
    Parties: report.totals.partyCount,
  };
  const partyColumns = ["Party", "Group", "Builties", "Billed", "Paid", "Leftover"];
  const partyRows = report.byParty.map((p) => [
    p.name,
    p.groupName || "Ungrouped",
    p.builtyCount,
    money(p.billed),
    money(p.paid),
    money(p.leftover),
  ]);
  if (partyRows.length > 0) {
    partyRows.push([
      "Total",
      "",
      report.totals.builtyCount,
      money(report.totals.billed),
      money(report.totals.paid),
      money(report.totals.leftover),
    ]);
  }
  const sections = [
    {
      heading: report.group ? "Parties in group" : "All parties",
      columns: partyColumns,
      columnWidths: [0.28, 0.2, 0.1, 0.14, 0.14, 0.14],
      columnAlign: ["left", "left", "right", "right", "right", "right"],
      rows: partyRows,
    },
  ];

  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings · Printable statement",
      metaPairs: Object.entries(meta),
      sections,
      layout: "landscape",
    });
    return sendPdf(res, buf, `yearly-record-${period.year}.pdf`);
  }
  const buf = await buildExcel({ title, sheetName: "Yearly", meta, sections });
  return sendExcel(res, buf, `yearly-record-${period.year}.xlsx`);
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
    "Total",
    "Paid",
    "Balance",
  ];
  const recordColWidths = [0.11, 0.12, 0.16, 0.19, 0.14, 0.14, 0.14];
  const recordColAlign = ["left", "left", "left", "left", "right", "right", "right"];
  const recordRows = (report.records || []).map((r) => [
    fmtDate(r.date),
    r.type === "previous_pending" ? "Previous pending" : "Builty",
    r.reference,
    r.partyName,
    money(r.totalAmount),
    money(r.amountPaid),
    money(r.balance),
  ]);

  const itemColumns = ["Product", "Qty", "Price", "Amount"];
  const itemColWidths = [0.46, 0.12, 0.21, 0.21];
  const itemColAlign = ["left", "right", "right", "right"];

  function pushRecordsSections(sections) {
    sections.push({
      heading: "All records",
      columns: recordColumns,
      columnWidths: recordColWidths,
      columnAlign: recordColAlign,
      rows: recordRows,
    });

    for (const r of report.records || []) {
      const lines = r.productLines || [];
      if (!lines.length) continue;
      const rows = lines.map((line) => [
        line.name,
        line.quantity,
        money(line.unitPrice),
        money(line.lineTotal),
      ]);
      const productsTotal = roundMoney(
        lines.reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0)
      );
      rows.push({
        bold: true,
        cells: ["Builty total", "", "", money(r.totalAmount)],
      });
      if (Math.abs(productsTotal - Number(r.totalAmount || 0)) > 0.009) {
        rows.splice(rows.length - 1, 0, {
          bold: false,
          cells: ["Line total", "", "", money(productsTotal)],
        });
      }
      const when = fmtDate(r.date);
      const heading = `Builty ${r.reference}  ·  ${r.partyName}  ·  ${when}`;
      sections.push({
        heading,
        columns: itemColumns,
        columnWidths: itemColWidths,
        columnAlign: itemColAlign,
        rows,
      });
    }
  }

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
      pushRecordsSections(sections);
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
      pushRecordsSections(sections);
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
      pushRecordsSections(sections);
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

  const excelProductSections = [];
  for (const r of report.records || []) {
    const lines = r.productLines || [];
    if (!lines.length) continue;
    excelProductSections.push({
      heading: `Builty ${r.reference} · ${r.partyName} · ${fmtDate(r.date)}`,
      columns: itemColumns,
      rows: [
        ...lines.map((line) => [
          line.name,
          line.quantity,
          money(line.unitPrice),
          money(line.lineTotal),
        ]),
        {
          bold: true,
          cells: ["Builty total", "", "", money(r.totalAmount)],
        },
      ],
    });
  }

  const buf = await buildExcel({
    title,
    sheetName: "Receivables",
    meta,
    sections:
      view === "group"
        ? [{ heading: "By group", columns: groupColumns, rows: groupRows }]
        : view === "whole"
          ? [
              {
                heading: "Overall",
                columns: ["Metric", "Value"],
                rows: [
                  ["Total receivables", money(report.totals.totalReceivable)],
                  ["Groups", report.totals.groupCount],
                  ["Parties", report.totals.partyCount],
                  ["Records", report.totals.recordCount],
                ],
              },
              { heading: "All records", columns: recordColumns, rows: recordRows },
              ...excelProductSections,
            ]
          : [
              { heading: "By party", columns: partyColumns, rows: partyRows },
              { heading: "All records", columns: recordColumns, rows: recordRows },
              ...excelProductSections,
            ],
  });
  return sendExcel(res, buf, "receivables-report.xlsx");
}

async function exportMonthlyReceivables(query, format, res) {
  const report = await getMonthlyReceivablesReport(query);
  const year = report.year;
  const rowLabel = report.mode === "party" ? "Party" : "Group";
  const title = report.group
    ? `Monthly receivables — ${report.group.name} (${year})`
    : `Monthly receivables — all groups (${year})`;
  const columns = [rowLabel, ...report.months.map((m) => m.label), "Total"];
  const colWidths = [
    0.16,
    ...report.months.map(() => 0.06),
    0.12,
  ];
  const colAlign = ["left", ...report.months.map(() => "right"), "right"];
  const rows = (report.rows || []).map((r) => [
    r.name,
    ...report.months.map((m) => money(r.months[m.key] || 0)),
    money(r.total),
  ]);
  if (rows.length > 0) {
    rows.push({
      bold: true,
      cells: [
        "Total",
        ...report.months.map((m) => money(report.totals.months[m.key] || 0)),
        money(report.totals.total),
      ],
    });
  }
  const meta = {
    "As of": report.asOf || "",
    Year: year,
    View: report.mode === "party" ? "Party wise" : "Group wise",
    Group: report.group?.name || "All groups",
    "Total receivables": money(report.totals.total),
    Rows: report.totals.rowCount,
  };

  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      layout: "landscape",
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
      sections: [
        {
          heading: report.group
            ? `Receivable by month — ${report.group.name}`
            : "Receivable by month — party groups",
          columns,
          columnWidths: colWidths,
          columnAlign: colAlign,
          rows,
        },
      ],
    });
    return sendPdf(res, buf, "monthly-receivables.pdf");
  }

  const buf = await buildExcel({
    title,
    sheetName: "Monthly",
    columns,
    rows: rows.map((r) => (Array.isArray(r) ? r : r.cells)),
    meta,
  });
  return sendExcel(res, buf, "monthly-receivables.xlsx");
}

async function exportReceived(query, format, res) {
  const report = await getReceivedReport(query);
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
    "Total received": money(report.totals.totalReceived),
    Parties: report.totals.partyCount,
    Groups: report.totals.groupCount,
    Records: report.totals.recordCount,
  };
  const title = report.party
    ? `Money received — ${report.party.name}`
    : report.group
      ? `Money received report — ${report.group.name}`
      : "Money received report";

  const partyColumns = ["Party", "Records", "Amount received"];
  const partyRows = (report.byParty || []).map((p) => [
    p.name,
    p.recordCount,
    money(p.amount),
  ]);
  if (partyRows.length > 0) {
    partyRows.push([
      "Total received",
      report.totals.recordCount,
      money(report.totals.totalReceived),
    ]);
  }

  const groupColumns = ["Group", "Parties", "Records", "Amount received"];
  const groupRows = (report.byGroup || []).map((g) => [
    g.name,
    g.partyCount,
    g.recordCount,
    money(g.amount),
  ]);
  if (groupRows.length > 0) {
    groupRows.push([
      "Total received",
      report.totals.partyCount,
      report.totals.recordCount,
      money(report.totals.totalReceived),
    ]);
  }

  const recordColumns = ["Date", "Party", "Reference", "Method", "Amount"];
  const recordRows = (report.records || []).map((r) => [
    fmtDate(r.date),
    r.partyName,
    r.reference,
    r.method || "cash",
    money(r.amount),
  ]);

  if (format === "pdf") {
    const sections = [];
    if (query.customerId || report.party) {
      sections.push({
        heading: report.party
          ? `Received — ${report.party.name}`
          : "Party received",
        columns: partyColumns,
        rows: partyRows,
      });
      sections.push({
        heading: "All payments",
        columns: recordColumns,
        rows: recordRows,
      });
    } else if (view === "group") {
      sections.push({
        heading: "Received total of each group",
        columns: groupColumns,
        rows: groupRows,
      });
    } else if (view === "party") {
      sections.push({
        heading: "Received total of each party",
        columns: partyColumns,
        rows: partyRows,
      });
      sections.push({
        heading: "All payments",
        columns: recordColumns,
        rows: recordRows,
      });
    } else {
      sections.push({
        heading: "Overall received",
        columns: ["Metric", "Value"],
        rows: [
          ["Total received", money(report.totals.totalReceived)],
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
        `Total received: ${meta["Total received"]}`,
        `Parties: ${meta.Parties}`,
        `Records: ${meta.Records}`,
      ],
      sections,
    });
    return sendPdf(res, buf, "received-report.pdf");
  }

  const buf = await buildExcel({
    title,
    sheetName: "Received",
    columns: view === "group" ? groupColumns : view === "whole" ? ["Metric", "Value"] : recordColumns,
    rows:
      view === "group"
        ? groupRows
        : view === "whole"
          ? [
              ["Total received", money(report.totals.totalReceived)],
              ["Groups", report.totals.groupCount],
              ["Parties", report.totals.partyCount],
              ["Records", report.totals.recordCount],
            ]
          : recordRows,
    meta,
  });
  return sendExcel(res, buf, "received-report.xlsx");
}

async function exportPaid(query, format, res) {
  const report = await getPaidReport(query);
  const view = ["whole", "party"].includes(query.view) ? query.view : "party";
  const viewLabel = view === "whole" ? "Overall" : "Party wise";
  const period = periodLabel(query.dateFrom, query.dateTo);
  const meta = {
    Period: period,
    Overall: !query.dateFrom && !query.dateTo ? "All" : period,
    View: viewLabel,
    Supplier: report.party?.name || "All suppliers",
    "Total paid": money(report.totals.totalPaid),
    "Amount left": money(report.totals.totalLeft),
    Suppliers: report.totals.supplierCount,
    Records: report.totals.recordCount,
  };
  const title = report.party
    ? `Money paid — ${report.party.name}`
    : "Money paid to suppliers";

  const partyColumns = ["Supplier", "Payments", "Amount paid", "Amount left"];
  const partyRows = (report.bySupplier || []).map((p) => [
    p.name,
    p.recordCount,
    money(p.amount),
    money(Math.max(0, p.balance || 0)),
  ]);
  if (partyRows.length > 0) {
    partyRows.push([
      "Total",
      report.totals.recordCount,
      money(report.totals.totalPaid),
      money(report.totals.totalLeft),
    ]);
  }

  const recordColumns = ["Date", "Supplier", "Reference", "Amount"];
  const recordRows = (report.records || []).map((r) => [
    fmtDate(r.date),
    r.partyName,
    r.reference,
    money(r.amount),
  ]);

  if (format === "pdf") {
    const sections = [];
    if (query.supplierId || report.party) {
      sections.push({
        heading: report.party ? `Paid — ${report.party.name}` : "Supplier paid",
        columns: partyColumns,
        rows: partyRows,
      });
      sections.push({
        heading: "All payments",
        columns: recordColumns,
        rows: recordRows,
      });
    } else if (view === "party") {
      sections.push({
        heading: "Paid total of each supplier",
        columns: partyColumns,
        rows: partyRows,
      });
    } else {
      sections.push({
        heading: "Overall paid",
        columns: ["Metric", "Value"],
        rows: [
          ["Total paid", money(report.totals.totalPaid)],
          ["Amount left", money(report.totals.totalLeft)],
          ["Suppliers", report.totals.supplierCount],
          ["Records", report.totals.recordCount],
        ],
      });
      sections.push({
        heading: "All payments",
        columns: recordColumns,
        rows: recordRows,
      });
    }

    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines: [
        `View: ${viewLabel}`,
        `Overall: ${meta.Overall}`,
        `Supplier: ${meta.Supplier}`,
        `Total paid: ${meta["Total paid"]}`,
        `Amount left: ${meta["Amount left"]}`,
        `Suppliers: ${meta.Suppliers}`,
        `Records: ${meta.Records}`,
      ],
      sections,
    });
    return sendPdf(res, buf, "paid-report.pdf");
  }

  const buf = await buildExcel({
    title,
    sheetName: "Paid",
    columns: view === "whole" ? ["Metric", "Value"] : partyColumns,
    rows:
      view === "whole"
        ? [
            ["Total paid", money(report.totals.totalPaid)],
            ["Amount left", money(report.totals.totalLeft)],
            ["Suppliers", report.totals.supplierCount],
            ["Records", report.totals.recordCount],
          ]
        : partyRows,
    meta,
  });
  return sendExcel(res, buf, "paid-report.xlsx");
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
    const t = report.totals || {};
    return {
      id: "sales",
      sheetName: "Sales",
      title: "Sales",
      heading: "Sales",
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
        "Builty count": t.orderCount || 0,
        "Total sales (billed)": money(t.totalSales),
        "Hub sales": money(t.hubSales),
        "Drum sales": money(t.drumSales),
        "Total paid (collected)": money(t.totalPaid),
        "Outstanding (still unpaid)": money(t.outstanding),
        "Hub units": t.hubUnits ?? 0,
        "Drum units": t.drumUnits ?? 0,
        "Total units": t.totalUnits ?? 0,
      },
      conclusion: [
        ["Builty count", t.orderCount || 0],
        ["Total sales (billed)", money(t.totalSales)],
        ["Hub sales", money(t.hubSales)],
        ["Drum sales", money(t.drumSales)],
        ["Total paid (collected)", money(t.totalPaid)],
        ["Outstanding (still unpaid)", money(t.outstanding)],
        ["Hub units", t.hubUnits ?? 0],
        ["Drum units", t.drumUnits ?? 0],
        ["Total units", t.totalUnits ?? 0],
      ],
    };
  }

  if (kind === "purchases") {
    const report = await purchaseService.getReport(query);
    const t = report.totals || {};
    const byMat = report.byMaterialType || [];
    const scrap = byMat.find((m) => (m.materialType || "scrap") === "scrap");
    const daig = byMat.find((m) => m.materialType === "daig");
    const conclusion = [
      ["Purchase count", t.purchaseCount || 0],
      ["Total kg", t.totalKg ?? 0],
      ["Total spend", money(t.totalSpend)],
      ["Average rate / kg", money(t.avgRate)],
    ];
    if (scrap) {
      conclusion.push(
        ["Scrap kg", scrap.totalKg ?? 0],
        ["Scrap spend", money(scrap.totalSpend)]
      );
    }
    if (daig) {
      conclusion.push(
        ["Daig kg", daig.totalKg ?? 0],
        ["Daig spend", money(daig.totalSpend)]
      );
    }
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
        "Purchase count": t.purchaseCount || 0,
        "Total kg": t.totalKg ?? 0,
        "Total spend": money(t.totalSpend),
        "Average rate / kg": money(t.avgRate),
      },
      conclusion,
    };
  }

  if (kind === "production") {
    const report = await productionService.getReport(query);
    const t = report.totals || {};
    const hubColumns = ["Product", "Pieces", "Scrap kg", "Avg sell / pc", "Sold price"];
    const drumColumns = ["Product", "Pieces", "Daig kg", "Avg sell / pc", "Sold price"];
    const toHubRow = (p) => [
      p.name,
      p.goodUnits,
      p.scrapKg ?? 0,
      p.avgSellPerPiece ?? 0,
      p.soldPrice ?? 0,
    ];
    const toDrumRow = (p) => [
      p.name,
      p.goodUnits,
      p.daigKg ?? 0,
      p.avgSellPerPiece ?? 0,
      p.soldPrice ?? 0,
    ];
    const hubRows = (report.byProduct || [])
      .filter((p) => (p.family || "hub") === "hub")
      .map(toHubRow);
    const drumRows = (report.byProduct || [])
      .filter((p) => p.family === "drum")
      .map(toDrumRow);
    return {
      id: "production",
      sheetName: "Production",
      title: "Production",
      heading: "Production",
      columns: hubColumns,
      rows: [...hubRows, ...drumRows],
      subsections: [
        {
          heading: "Hub",
          columns: hubColumns,
          rows: hubRows.length ? hubRows : [["—", 0, 0, 0, 0]],
        },
        {
          heading: "Drum",
          columns: drumColumns,
          rows: drumRows.length ? drumRows : [["—", 0, 0, 0, 0]],
        },
      ],
      meta: {
        Batches: t.batchCount || 0,
        "Scrap used (kg)": t.totalInputKg ?? t.netConsumedKg ?? 0,
        "Waste (kg)": t.wasteKg ?? 0,
        "Good units": t.goodUnits || 0,
        "Rejected units": t.rejectedUnits || t.brokenUnits || 0,
        "Sold price": t.soldPrice || 0,
        "Units sold": t.unitsSold || 0,
      },
      conclusion: [
        ["Batches", t.batchCount || 0],
        ["Hub batches", t.byFamily?.hub ?? 0],
        ["Drum batches", t.byFamily?.drum ?? 0],
        ["Scrap used (kg)", t.totalInputKg ?? t.netConsumedKg ?? 0],
        ["Waste (kg)", t.wasteKg ?? 0],
        ["Good units", t.goodUnits || 0],
        ["Rejected units", t.rejectedUnits || t.brokenUnits || 0],
        ["Reject rate %", t.rejectRate ?? 0],
        ["Loss rate %", t.lossRate ?? 0],
        ["Sold price", t.soldPrice || 0],
        ["Units sold", t.unitsSold || 0],
      ],
    };
  }

  if (kind === "expenses") {
    const report = await expenseService.getCostReport(query);
    const t = report.totals || {};
    const topCats = (report.byCategory || [])
      .slice()
      .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      .slice(0, 5);
    const conclusion = [
      ["Expense entries", t.expenseCount || 0],
      ["Total operating cost", money(t.totalOperatingCost || 0)],
    ];
    for (const c of topCats) {
      conclusion.push([
        `Category — ${c.label || c.category || "—"}`,
        money(c.amount || 0),
      ]);
    }
    return {
      id: "expenses",
      sheetName: "Expenses",
      title: "Expenses / costs",
      heading: "Expenses",
      columns: ["Category", "Amount", "Count"],
      rows: (report.byCategory || []).map((c) => [
        c.label || c.category || "—",
        money(c.amount || 0),
        c.count || 0,
      ]),
      meta: {
        "Expense entries": t.expenseCount || 0,
        "Total operating cost": money(t.totalOperatingCost || 0),
      },
      conclusion,
    };
  }

  if (kind === "inventory") {
    const report = await inventoryService.getInventoryReport(query);
    const produced = report.producedThisPeriod?.totals || {};
    const { scrapKg, daigKg, hubUnits, drumUnits, totalUnits, summaryRows, finishedRows } =
      inventorySummaryRows(report);
    return {
      id: "inventory",
      sheetName: "Inventory",
      title: "Inventory",
      heading: "Inventory",
      columns: ["Product", "Type", "Qty"],
      rows: finishedRows,
      meta: {},
      subsections: [
        {
          heading: "Stock summary",
          columns: ["Item", "Value"],
          rows: summaryRows,
        },
        {
          heading: "Finished goods",
          columns: ["Product", "Type", "Qty"],
          rows: finishedRows,
        },
      ],
      conclusion: [
        ["Raw scrap available (kg)", scrapKg],
        ["Raw daig available (kg)", daigKg],
        ["Finished hub units", hubUnits],
        ["Finished drum units", drumUnits],
        ["Finished total units", totalUnits],
        ["Produced this period (good)", produced.goodUnits || 0],
        ["Produced this period (rejected)", produced.rejectedUnits || 0],
        ["Low-stock alerts", (report.lowStock || []).length],
      ],
    };
  }

  if (kind === "finance") {
    const overview = await financeService.getOverview(query);
    const pnl = overview.profitAndLoss || {};
    const cash = overview.cashFlow || {};
    const conclusion = [
      ["Revenue", money(pnl.revenue)],
      ["COGS", money(pnl.cogs)],
      ["Gross profit", money(pnl.grossProfit)],
      ["Other expenses", money(pnl.otherExpenses)],
      ["Net profit", money(pnl.netProfit)],
      ["Profit margin %", pnl.marginPct == null ? "—" : pnl.marginPct],
      ["Cash in", money(cash.cashIn)],
      ["Cash out", money(cash.cashOut)],
      ["Net cash", money(cash.net)],
    ];
    return {
      id: "finance",
      sheetName: "Finance",
      title: "Finance P&L",
      heading: "Finance",
      columns: ["Line", "Amount"],
      rows: conclusion,
      meta: {
        Revenue: money(pnl.revenue),
        "Net profit": money(pnl.netProfit),
        "Net cash": money(cash.net),
      },
      conclusion,
    };
  }

  if (kind === "receivables") {
    const report = await getReceivablesReport(query);
    const t = report.totals || {};
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
        "Total receivable (parties still owe)": money(t.totalReceivable),
        "Parties with balance": t.partyCount || 0,
        Records: t.recordCount || 0,
      },
      conclusion: [
        ["Total receivable (parties still owe)", money(t.totalReceivable)],
        ["Parties with balance", t.partyCount || 0],
        ["Open records", t.recordCount || 0],
        ["Groups with balance", t.groupCount || 0],
      ],
    };
  }

  if (kind === "payables") {
    const report = await getPayablesReport(query);
    const t = report.totals || {};
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
        "Total payable (you still owe)": money(t.totalPayable),
        "Suppliers with balance": t.supplierCount || 0,
        Records: t.recordCount || 0,
      },
      conclusion: [
        ["Total payable (you still owe)", money(t.totalPayable)],
        ["Suppliers with balance", t.supplierCount || 0],
        ["Open purchase records", t.recordCount || 0],
      ],
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

function wantsSummaryOnly(query) {
  const v = String(query?.summaryOnly ?? query?.conclusion ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "summary" || v === "conclusion";
}

/** Collapse a module section to totals / conclusion rows only. */
function toSummarySection(section) {
  const rows = [];
  if (Array.isArray(section.conclusion) && section.conclusion.length > 0) {
    for (const row of section.conclusion) {
      if (Array.isArray(row) && row.length >= 2) {
        rows.push([row[0], row[1] == null || row[1] === "" ? "—" : row[1]]);
      }
    }
  } else {
    const meta = section.meta || {};
    for (const [k, v] of Object.entries(meta)) {
      rows.push([k, v == null || v === "" ? "—" : v]);
    }
    if (rows.length === 0 && Array.isArray(section.rows) && section.rows.length > 0) {
      for (const row of section.rows) {
        if (Array.isArray(row) && row.length >= 2) rows.push([row[0], row[1]]);
      }
    }
  }
  if (rows.length === 0) {
    rows.push(["Records", Array.isArray(section.rows) ? section.rows.length : 0]);
  }
  return {
    ...section,
    title: `${section.title} — totals`,
    heading: `${section.heading} — totals`,
    sheetName: String(`${section.sheetName}-totals`).slice(0, 31),
    columns: ["Item", "Value"],
    rows,
    subsections: null,
    meta: {},
  };
}

function buildConclusionSection(sections) {
  const rows = [];
  for (const s of sections) {
    const summary = toSummarySection(s);
    for (const [item, value] of summary.rows) {
      rows.push([s.heading || s.title, item, value]);
    }
  }
  return {
    id: "conclusion",
    sheetName: "Conclusion",
    title: "Conclusion — totals",
    heading: "Conclusion — totals",
    columns: ["Module", "Item", "Value"],
    rows,
    subsections: null,
    meta: {},
  };
}

async function collectSections(modules, query) {
  const sections = [];
  for (const kind of modules) {
    sections.push(await collectModuleSection(kind, query));
  }
  if (wantsSummaryOnly(query)) {
    return [buildConclusionSection(sections)];
  }
  return sections;
}

async function exportCombined(modules, query, format, res, filenameBase) {
  const sections = await collectSections(modules, query);
  const summaryOnly = wantsSummaryOnly(query);

  const period = periodLabel(query.dateFrom, query.dateTo);
  const title = summaryOnly
    ? modules.length === COMBINED_MODULES.length
      ? "Full company report — totals"
      : "Custom report — totals"
    : modules.length === COMBINED_MODULES.length
      ? "Full company report"
      : "Custom report";
  const metaLines = [
    `Period: ${period}`,
    `Modules: ${modules.join(", ")}`,
    summaryOnly ? "Content: totals / conclusion only" : "Content: full detail",
    `Generated: ${new Date().toISOString().slice(0, 19)}`,
  ];
  const fileBase = summaryOnly ? `${filenameBase}-totals` : filenameBase;

  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines,
      sections: sections.flatMap((s) => {
        const out = [];
        if (Object.keys(s.meta || {}).length > 0) {
          out.push({
            heading: `${s.heading} — Summary`,
            columns: ["Item", "Value"],
            rows: Object.entries(s.meta).map(([k, v]) => [k, v]),
          });
        }
        if (Array.isArray(s.subsections) && s.subsections.length > 0) {
          s.subsections.forEach((sub) => {
            out.push({
              heading: `${s.heading} — ${sub.heading}`,
              columns: sub.columns,
              rows: sub.rows,
            });
          });
          return out;
        }
        out.push({
          heading: s.heading,
          columns: s.columns,
          rows: s.rows,
        });
        return out;
      }),
    });
    return sendPdf(res, buf, `${fileBase}.pdf`);
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
          meta: { Period: period },
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
  return sendExcel(res, buf, `${fileBase}.xlsx`);
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
  const summaryOnly = wantsSummaryOnly(query);
  const sections = await collectSections(modules, query);
  return {
    title: summaryOnly
      ? modules.length === COMBINED_MODULES.length
        ? "Full company report — totals"
        : "Custom report — totals"
      : modules.length === COMBINED_MODULES.length
        ? "Full company report"
        : "Custom report",
    period: periodLabel(query.dateFrom, query.dateTo),
    modules,
    summaryOnly,
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
  getMonthlyReceivablesReport,
  getReceivedReport,
  getPaidReport,
  getPayablesReport,
  getYearlyBillReport,
  exportSales,
  exportPurchases,
  exportProduction,
  exportExpenses,
  exportInventory,
  exportFinance,
  exportReceivables,
  exportMonthlyReceivables,
  exportReceived,
  exportPaid,
  exportPayables,
  exportYearlyBill,
  exportStatement,
  exportGroupStatement,
  exportCustomersOverviewStatement,
  exportFull,
  exportCustom,
  getCombinedPreview,
  COMBINED_MODULES,
};
