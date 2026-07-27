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
const { buildExcel, buildPdf, money, fmtDate, sendExcel, sendPdf } = require("./export.util");

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
  const columns = ["Builty", "Bill", "Party", "Date", "Total", "Paid", "Balance", "Status"];
  const rows = (report.outstanding || []).map((o) => [
    o.orderNo,
    o.invoiceNo,
    o.customer,
    fmtDate(o.orderDate),
    money(o.totalAmount),
    money(o.amountPaid),
    money(o.balance),
    o.paymentStatus,
  ]);
  // Also include summary sheet style: prepend totals as meta
  const meta = {
    "Builty count": report.totals.orderCount,
    "Total sales": money(report.totals.totalSales),
    "Total paid": money(report.totals.totalPaid),
    Outstanding: money(report.totals.outstanding),
    Period: periodLabel(query.dateFrom, query.dateTo),
  };
  const title = "Sales & receivables report";
  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      columns,
      rows,
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
    });
    return sendPdf(res, buf, `sales-report.pdf`);
  }
  const buf = await buildExcel({
    title,
    sheetName: "Outstanding",
    columns,
    rows,
    meta,
  });
  return sendExcel(res, buf, `sales-report.xlsx`);
}

async function exportPurchases(query, format, res) {
  const report = await purchaseService.getReport(query);
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
    "Total kg": report.totals?.totalKg ?? "",
    "Total spend": money(report.totals?.totalSpend),
    Purchases: report.totals?.purchaseCount ?? "",
  };
  const title = "Purchase report";
  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      columns,
      rows,
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
    });
    return sendPdf(res, buf, "purchases-report.pdf");
  }
  const buf = await buildExcel({ title, sheetName: "Purchases", columns, rows, meta });
  return sendExcel(res, buf, "purchases-report.xlsx");
}

async function exportProduction(query, format, res) {
  const report = await productionService.getReport(query);
  const columns = ["Product", "Batches", "Good", "Rejected", "Net kg"];
  const rows = (report.byProduct || []).map((p) => [
    p.name,
    p.batchCount,
    p.goodUnits,
    p.rejectedUnits,
    p.netConsumedKg,
  ]);
  const meta = {
    Period: periodLabel(query.dateFrom, query.dateTo),
    Batches: report.totals.batchCount,
    "Good units": report.totals.goodUnits,
    "Reject rate": `${report.totals.rejectRate}%`,
  };
  const title = "Production report";
  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      columns,
      rows,
      metaLines: Object.entries(meta).map(([k, v]) => `${k}: ${v}`),
    });
    return sendPdf(res, buf, "production-report.pdf");
  }
  const buf = await buildExcel({ title, sheetName: "Production", columns, rows, meta });
  return sendExcel(res, buf, "production-report.xlsx");
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
async function getReceivablesReport({ dateFrom, dateTo } = {}) {
  const [builties, adjustments, paymentsAgg] = await Promise.all([
    Builty.find({})
      .populate("customer", "name phone")
      .sort({ builtyDate: 1, createdAt: 1 })
      .lean(),
    CustomerLedgerEntry.find({ type: "adjustment", signedAmount: { $gt: 0 } })
      .populate("customer", "name phone")
      .sort({ entryDate: 1, createdAt: 1 })
      .lean(),
    CustomerPayment.aggregate([{ $group: { _id: "$customer", total: { $sum: "$amount" } } }]),
  ]);

  const paidByCustomer = new Map(
    paymentsAgg.map((p) => [String(p._id), roundMoney(p.total)])
  );

  const byCustomer = new Map();

  function ensureParty(customerDoc, customerId) {
    const id = String(customerId || "");
    if (!byCustomer.has(id)) {
      const c =
        customerDoc && typeof customerDoc === "object"
          ? { id, name: customerDoc.name || "—", phone: customerDoc.phone || "" }
          : { id, name: "—", phone: "" };
      byCustomer.set(id, { ...c, previousPending: [], builties: [] });
    }
    return byCustomer.get(id);
  }

  for (const a of adjustments) {
    const cust = a.customer;
    const id = cust && typeof cust === "object" ? cust._id : a.customer;
    const party = ensureParty(cust, id);
    party.previousPending.push({
      type: "previous_pending",
      id: String(a._id),
      date: a.entryDate,
      reference: a.notes?.trim() || "Previous pending",
      totalAmount: roundMoney(a.signedAmount || a.amount),
      href: `/dashboard/party/customers/${party.id}`,
    });
  }

  for (const b of builties) {
    const cust = b.customer;
    const id = cust && typeof cust === "object" ? cust._id : b.customer;
    const party = ensureParty(cust, id);
    party.builties.push({
      type: "builty",
      id: String(b._id),
      date: b.builtyDate,
      reference: b.builtyNo,
      totalAmount: roundMoney(b.totalAmount),
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
        balance: r.balance,
        recordCount: 1,
      });
    }
  }
  const byParty = [...byPartyMap.values()].sort((a, b) => b.balance - a.balance);
  const totalReceivable = roundMoney(records.reduce((s, r) => s + r.balance, 0));

  return {
    period: { from: dateFrom || null, to: dateTo || null },
    totals: {
      totalReceivable,
      partyCount: byParty.length,
      recordCount: records.length,
    },
    byParty,
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
  const period = periodLabel(query.dateFrom, query.dateTo);
  const meta = {
    Period: period,
    Overall: !query.dateFrom && !query.dateTo ? "All" : period,
    "Total receivables": money(report.totals.totalReceivable),
    Parties: report.totals.partyCount,
    Records: report.totals.recordCount,
  };
  const title = "Money receivables report";

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

  const recordColumns = ["Date", "Type", "Reference", "Party", "Total", "Paid", "Balance"];
  const recordRows = (report.records || []).map((r) => [
    fmtDate(r.date),
    r.type === "previous_pending" ? "Previous pending" : "Builty",
    r.reference,
    r.partyName,
    money(r.totalAmount),
    money(r.amountPaid),
    money(r.balance),
  ]);

  if (format === "pdf") {
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines: [
        `Overall: ${meta.Overall}`,
        `Total receivables: ${meta["Total receivables"]}`,
        `Parties: ${meta.Parties}`,
        `Records: ${meta.Records}`,
      ],
      sections: [
        {
          heading: "Receivable total of each party",
          columns: partyColumns,
          rows: partyRows,
        },
        {
          heading: "All records",
          columns: recordColumns,
          rows: recordRows,
        },
      ],
    });
    return sendPdf(res, buf, "receivables-report.pdf");
  }

  const buf = await buildExcel({
    title,
    sheetName: "Receivables",
    columns: recordColumns,
    rows: recordRows,
    meta,
  });
  return sendExcel(res, buf, "receivables-report.xlsx");
}

async function exportPayables(query, format, res) {
  const report = await getPayablesReport(query);
  const period = periodLabel(query.dateFrom, query.dateTo);
  const meta = {
    Period: period,
    Overall: !query.dateFrom && !query.dateTo ? "All" : period,
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
    const buf = await buildPdf({
      title,
      subtitle: "Khan Engineerings",
      metaLines: [
        `Overall: ${meta.Overall}`,
        `Total payables: ${meta["Total payables"]}`,
        `Suppliers: ${meta.Suppliers}`,
        `Records: ${meta.Records}`,
      ],
      sections: [
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
      ],
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

module.exports = {
  globalSearch,
  customerStatement,
  supplierStatement,
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
};
