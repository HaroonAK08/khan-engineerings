const FinanceEntry = require("./finance.model");
const CustomerPayment = require("../orders/payment.model");
const SalesOrder = require("../orders/order.model");
const Purchase = require("../purchases/purchase.model");
const LedgerEntry = require("../ledger/ledger.model");
const BatchExpense = require("../expenses/expense.model");
const ProductionBatch = require("../production/production.model");
const { EXPENSE_CATEGORIES } = require("../expenses/expense.constants");

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

function roundMoney(n) {
  return Math.round((n || 0) * 100) / 100;
}

function periodBounds({ dateFrom, dateTo } = {}) {
  const now = new Date();
  const from = dateFrom
    ? parseDate(dateFrom, "dateFrom")
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = dateTo
    ? parseDate(dateTo, "dateTo")
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  if (!dateTo) {
    // if only defaulting to month end, ensure end of day
    to.setHours(23, 59, 59, 999);
  } else {
    to.setHours(23, 59, 59, 999);
  }
  return { from, to };
}

function dateMatch(field, from, to) {
  return { [field]: { $gte: from, $lte: to } };
}

async function createEntry(data) {
  if (!["income", "expense"].includes(data.type)) {
    throw httpError("Type must be income or expense", 400);
  }
  const category = data.category?.trim();
  if (!category) throw httpError("Category is required", 400);
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError("Amount must be greater than 0", 400);
  }
  return FinanceEntry.create({
    type: data.type,
    category,
    amount: roundMoney(amount),
    entryDate: parseDate(data.entryDate || new Date(), "Entry date"),
    notes: data.notes?.trim() || "",
    reference: data.reference?.trim() || "",
  });
}

async function listEntries({ type, dateFrom, dateTo, q } = {}) {
  const filter = {};
  if (type) filter.type = type;
  if (dateFrom || dateTo) {
    const { from, to } = periodBounds({ dateFrom, dateTo });
    filter.entryDate = { $gte: from, $lte: to };
  }
  if (q?.trim()) {
    const term = q.trim();
    filter.$or = [
      { category: new RegExp(term, "i") },
      { notes: new RegExp(term, "i") },
      { reference: new RegExp(term, "i") },
    ];
  }
  return FinanceEntry.find(filter).sort({ entryDate: -1, createdAt: -1 });
}

async function removeEntry(id) {
  const entry = await FinanceEntry.findById(id);
  if (!entry) throw httpError("Entry not found", 404);
  await entry.deleteOne();
  return { ok: true };
}

async function sumField(Model, match, amountField = "amount") {
  const result = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: `$${amountField}` }, count: { $sum: 1 } } },
  ]);
  return {
    total: roundMoney(result[0]?.total || 0),
    count: result[0]?.count || 0,
  };
}

async function getOverview(query = {}) {
  const { from, to } = periodBounds(query);

  const [
    customerRevenueCash,
    salesInvoiced,
    supplierPaymentsCash,
    purchasesAccrual,
    manufacturingOps,
    manualIncome,
    manualExpense,
    materialEstimate,
  ] = await Promise.all([
    sumField(CustomerPayment, dateMatch("paymentDate", from, to), "amount"),
    sumField(
      SalesOrder,
      { ...dateMatch("orderDate", from, to), status: { $ne: "cancelled" } },
      "totalAmount"
    ),
    sumField(
      LedgerEntry,
      { ...dateMatch("entryDate", from, to), type: "payment" },
      "amount"
    ),
    sumField(Purchase, dateMatch("purchaseDate", from, to), "totalAmount"),
    sumField(BatchExpense, dateMatch("expenseDate", from, to), "amount"),
    sumField(FinanceEntry, { ...dateMatch("entryDate", from, to), type: "income" }, "amount"),
    sumField(FinanceEntry, { ...dateMatch("entryDate", from, to), type: "expense" }, "amount"),
    estimateMaterialCost(from, to),
  ]);

  const income = {
    customerPayments: customerRevenueCash.total,
    salesInvoiced: salesInvoiced.total,
    otherIncome: manualIncome.total,
    /** Cash-basis income used for cash flow */
    cashIn: roundMoney(customerRevenueCash.total + manualIncome.total),
    /** Accrual revenue for P&L */
    revenue: roundMoney(salesInvoiced.total + manualIncome.total),
  };

  const expenses = {
    supplierPayments: supplierPaymentsCash.total,
    rawMaterialPurchases: purchasesAccrual.total,
    manufacturingOperating: manufacturingOps.total,
    materialEstimate: materialEstimate.total,
    otherExpenses: manualExpense.total,
    cashOut: roundMoney(
      supplierPaymentsCash.total + manufacturingOps.total + manualExpense.total
    ),
    totalAccrual: roundMoney(
      purchasesAccrual.total +
        manufacturingOps.total +
        materialEstimate.total +
        manualExpense.total
    ),
  };

  // Avoid double-counting material: use purchases for accrual COGS primary;
  // manufacturing ops separate; materialEstimate shown as insight not added twice
  const cogs = roundMoney(purchasesAccrual.total + manufacturingOps.total);
  const operatingOther = manualExpense.total;
  const totalExpense = roundMoney(cogs + operatingOther);
  const profit = roundMoney(income.revenue - totalExpense);
  const cashFlow = roundMoney(income.cashIn - expenses.cashOut);
  const marginPct =
    income.revenue > 0 ? roundMoney((profit / income.revenue) * 100) : null;

  return {
    period: { from, to },
    income,
    expenses: {
      ...expenses,
      // clarifying: P&L expense total excludes materialEstimate (already reflected via purchases)
      pnlExpenseTotal: totalExpense,
    },
    profitAndLoss: {
      revenue: income.revenue,
      cogs,
      grossProfit: roundMoney(income.revenue - cogs),
      otherExpenses: operatingOther,
      netProfit: profit,
      marginPct,
      isProfit: profit >= 0,
    },
    cashFlow: {
      cashIn: income.cashIn,
      cashOut: expenses.cashOut,
      net: cashFlow,
    },
    counts: {
      salesOrders: salesInvoiced.count,
      customerPayments: customerRevenueCash.count,
      purchases: purchasesAccrual.count,
      manufacturingExpenses: manufacturingOps.count,
      manualEntries: manualIncome.count + manualExpense.count,
    },
  };
}

async function estimateMaterialCost(from, to) {
  const rateResult = await Purchase.aggregate([
    { $group: { _id: null, avgRate: { $avg: "$ratePerKg" } } },
  ]);
  const avgRate = rateResult[0]?.avgRate || 0;
  const consumed = await ProductionBatch.aggregate([
    { $match: dateMatch("productionDate", from, to) },
    {
      $group: {
        _id: null,
        net: { $sum: { $subtract: ["$inputScrapKg", "$returnedScrapKg"] } },
        batches: { $sum: 1 },
      },
    },
  ]);
  const netKg = consumed[0]?.net || 0;
  return {
    total: roundMoney(netKg * avgRate),
    netKg: Math.round(netKg * 1000) / 1000,
    avgRate: roundMoney(avgRate),
    batches: consumed[0]?.batches || 0,
  };
}

async function getMonthly(query = {}) {
  const now = new Date();
  const months = Number(query.months) > 0 ? Math.min(Number(query.months), 24) : 12;
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const series = [];
  for (let i = 0; i < months; i += 1) {
    const from = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const to = new Date(start.getFullYear(), start.getMonth() + i + 1, 0, 23, 59, 59, 999);
    const overview = await getOverview({
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to.toISOString().slice(0, 10),
    });
    series.push({
      year: from.getFullYear(),
      month: from.getMonth() + 1,
      label: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`,
      revenue: overview.profitAndLoss.revenue,
      expenses: overview.profitAndLoss.pnlExpenseTotal,
      netProfit: overview.profitAndLoss.netProfit,
      cashIn: overview.cashFlow.cashIn,
      cashOut: overview.cashFlow.cashOut,
      cashNet: overview.cashFlow.net,
      isProfit: overview.profitAndLoss.isProfit,
    });
  }

  return { months: series };
}

async function getCustomerRevenue(query = {}) {
  const { from, to } = periodBounds(query);

  const byCustomer = await SalesOrder.aggregate([
    {
      $match: {
        ...dateMatch("orderDate", from, to),
        status: { $ne: "cancelled" },
      },
    },
    {
      $group: {
        _id: "$customer",
        revenue: { $sum: "$totalAmount" },
        paid: { $sum: "$amountPaid" },
        orderCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "customers",
        localField: "_id",
        foreignField: "_id",
        as: "customer",
      },
    },
    { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
    { $sort: { revenue: -1 } },
  ]);

  const payments = await CustomerPayment.aggregate([
    { $match: dateMatch("paymentDate", from, to) },
    {
      $group: {
        _id: "$customer",
        cashCollected: { $sum: "$amount" },
      },
    },
  ]);
  const payMap = Object.fromEntries(payments.map((p) => [String(p._id), p.cashCollected]));

  return {
    period: { from, to },
    customers: byCustomer.map((row) => ({
      customerId: row._id,
      name: row.customer?.name || "Unknown",
      revenue: roundMoney(row.revenue),
      paid: roundMoney(row.paid),
      cashCollected: roundMoney(payMap[String(row._id)] || 0),
      orderCount: row.orderCount,
    })),
  };
}

async function getSupplierExpenses(query = {}) {
  const { from, to } = periodBounds(query);

  const purchases = await Purchase.aggregate([
    { $match: dateMatch("purchaseDate", from, to) },
    {
      $group: {
        _id: "$supplier",
        purchaseSpend: { $sum: "$totalAmount" },
        purchaseCount: { $sum: 1 },
        kg: { $sum: "$quantityKg" },
      },
    },
    {
      $lookup: {
        from: "suppliers",
        localField: "_id",
        foreignField: "_id",
        as: "supplier",
      },
    },
    { $unwind: { path: "$supplier", preserveNullAndEmptyArrays: true } },
    { $sort: { purchaseSpend: -1 } },
  ]);

  const payments = await LedgerEntry.aggregate([
    { $match: { ...dateMatch("entryDate", from, to), type: "payment" } },
    {
      $group: {
        _id: "$supplier",
        cashPaid: { $sum: "$amount" },
      },
    },
  ]);
  const payMap = Object.fromEntries(payments.map((p) => [String(p._id), p.cashPaid]));

  return {
    period: { from, to },
    suppliers: purchases.map((row) => ({
      supplierId: row._id,
      name: row.supplier?.name || "Unknown",
      purchaseSpend: roundMoney(row.purchaseSpend),
      cashPaid: roundMoney(payMap[String(row._id)] || 0),
      purchaseCount: row.purchaseCount,
      kg: Math.round((row.kg || 0) * 1000) / 1000,
    })),
  };
}

async function getProductProfitability(query = {}) {
  const { from, to } = periodBounds(query);

  const sales = await SalesOrder.aggregate([
    {
      $match: {
        ...dateMatch("orderDate", from, to),
        status: { $ne: "cancelled" },
      },
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        revenue: { $sum: "$items.lineTotal" },
        unitsSold: { $sum: "$items.quantity" },
        orderLines: { $sum: 1 },
      },
    },
  ]);

  const production = await ProductionBatch.aggregate([
    { $match: dateMatch("productionDate", from, to) },
    {
      $group: {
        _id: "$product",
        goodUnits: { $sum: "$goodUnits" },
        rejectedUnits: { $sum: "$rejectedUnits" },
        netConsumedKg: { $sum: { $subtract: ["$inputScrapKg", "$returnedScrapKg"] } },
        batchCount: { $sum: 1 },
      },
    },
  ]);

  const batchCosts = await BatchExpense.aggregate([
    { $match: dateMatch("expenseDate", from, to) },
    {
      $lookup: {
        from: "productionbatches",
        localField: "batch",
        foreignField: "_id",
        as: "batchDoc",
      },
    },
    { $unwind: { path: "$batchDoc", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$batchDoc.product",
        operatingCost: { $sum: "$amount" },
      },
    },
  ]);

  const material = await estimateMaterialCost(from, to);
  const prodMap = Object.fromEntries(production.map((p) => [String(p._id), p]));
  const costMap = Object.fromEntries(batchCosts.map((c) => [String(c._id), c.operatingCost]));
  const totalGood = production.reduce((s, p) => s + (p.goodUnits || 0), 0) || 1;

  const productIds = new Set([
    ...sales.map((s) => String(s._id)),
    ...production.map((p) => String(p._id)),
  ]);

  const Product = require("../products/product.model");
  const products = await Product.find({
    _id: { $in: [...productIds].filter((id) => id && id !== "undefined" && id !== "null") },
  });
  const nameMap = Object.fromEntries(products.map((p) => [String(p._id), p.name]));

  const rows = [...productIds]
    .filter((id) => id && id !== "undefined" && id !== "null")
    .map((id) => {
      const sale = sales.find((s) => String(s._id) === id);
      const prod = prodMap[id];
      const revenue = sale?.revenue || 0;
      const unitsSold = sale?.unitsSold || 0;
      const goodUnits = prod?.goodUnits || 0;
      const operatingCost = costMap[id] || 0;
      const materialShare =
        totalGood > 0 && goodUnits > 0
          ? (goodUnits / totalGood) * material.total
          : 0;
      const cost = operatingCost + materialShare;
      const profit = revenue - cost;
      return {
        productId: id,
        name: nameMap[id] || "Unknown",
        revenue: roundMoney(revenue),
        unitsSold,
        goodUnitsProduced: goodUnits,
        operatingCost: roundMoney(operatingCost),
        materialCostShare: roundMoney(materialShare),
        totalCost: roundMoney(cost),
        profit: roundMoney(profit),
        marginPct: revenue > 0 ? roundMoney((profit / revenue) * 100) : null,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  return {
    period: { from, to },
    products: rows,
    topEarner: rows[0] || null,
  };
}

async function getManufacturingAnalysis(query = {}) {
  const { from, to } = periodBounds(query);
  const costReport = await require("../expenses/expense.service").getCostReport({
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  });
  const material = await estimateMaterialCost(from, to);

  const byCategory = costReport.byCategory.map((c) => ({
    ...c,
    sharePct:
      costReport.totals.totalOperatingCost > 0
        ? roundMoney((c.amount / costReport.totals.totalOperatingCost) * 100)
        : 0,
  }));

  const unnecessaryHint = byCategory
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  return {
    period: { from, to },
    operating: costReport.totals,
    byStage: costReport.byStage,
    byCategory,
    mostExpensiveStage: costReport.mostExpensiveStage,
    materialEstimate: material,
    totalManufacturingCost: roundMoney(
      costReport.totals.totalOperatingCost + material.total
    ),
    expenseHotspots: unnecessaryHint,
    monthlyTrend: costReport.byMonth,
  };
}

async function getExpenseBreakdown(query = {}) {
  const { from, to } = periodBounds(query);
  const overview = await getOverview({
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  });
  const manufacturing = await getManufacturingAnalysis({
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  });
  const manual = await FinanceEntry.aggregate([
    { $match: { ...dateMatch("entryDate", from, to), type: "expense" } },
    { $group: { _id: "$category", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $sort: { amount: -1 } },
  ]);

  const buckets = [
    {
      id: "raw_material",
      label: "Raw material purchases",
      amount: overview.expenses.rawMaterialPurchases,
    },
    {
      id: "manufacturing",
      label: "Manufacturing operating",
      amount: overview.expenses.manufacturingOperating,
    },
    {
      id: "other",
      label: "Other / manual expenses",
      amount: overview.expenses.otherExpenses,
    },
  ].sort((a, b) => b.amount - a.amount);

  return {
    period: { from, to },
    buckets,
    manufacturingCategories: manufacturing.byCategory,
    manualCategories: manual.map((m) => ({
      category: m._id,
      amount: roundMoney(m.amount),
      count: m.count,
    })),
    hotspots: [
      ...buckets.filter((b) => b.amount > 0).slice(0, 2),
      ...manufacturing.expenseHotspots.map((h) => ({
        id: h.category,
        label: `Mfg: ${h.label}`,
        amount: h.amount,
      })),
    ].sort((a, b) => b.amount - a.amount),
  };
}

module.exports = {
  createEntry,
  listEntries,
  removeEntry,
  getOverview,
  getMonthly,
  getCustomerRevenue,
  getSupplierExpenses,
  getProductProfitability,
  getManufacturingAnalysis,
  getExpenseBreakdown,
  EXPENSE_CATEGORIES,
};
