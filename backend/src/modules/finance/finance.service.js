const FinanceEntry = require("./finance.model");
const CustomerPayment = require("../customers/customer-payment.model");
const Builty = require("../builty/builty.model");
const Purchase = require("../purchases/purchase.model");
const LedgerEntry = require("../ledger/ledger.model");
const BatchExpense = require("../expenses/expense.model");
const ProductionBatch = require("../production/production.model");
const { EXPENSE_CATEGORIES } = require("../expenses/expense.constants");
const mongoose = require("mongoose");

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

function roundKg(n) {
  return Math.round((n || 0) * 1000) / 1000;
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
    sumField(Builty, dateMatch("builtyDate", from, to), "totalAmount"),
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
      builties: salesInvoiced.count,
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

  const byCustomer = await Builty.aggregate([
    { $match: dateMatch("builtyDate", from, to) },
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

  const sales = await Builty.aggregate([
    { $match: dateMatch("builtyDate", from, to) },
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

async function getAvgMaterialRates(from, to) {
  const match = {};
  if (from || to) Object.assign(match, dateMatch("purchaseDate", from, to));

  async function ratesFor(filter) {
    const rows = await Purchase.aggregate([
      ...(Object.keys(filter).length ? [{ $match: filter }] : []),
      {
        $group: {
          _id: "$materialType",
          spend: {
            $sum: { $add: ["$totalAmount", { $ifNull: ["$freightAmount", 0] }] },
          },
          kg: { $sum: "$quantityKg" },
        },
      },
    ]);
    const rates = { scrap: 0, daig: 0 };
    for (const row of rows) {
      if (row._id === "scrap" || row._id === "daig") {
        rates[row._id] = row.kg > 0 ? (row.spend || 0) / row.kg : 0;
      }
    }
    return rates;
  }

  const period = await ratesFor(match);
  const needsFallback = (!period.scrap || !period.daig);
  const allTime = needsFallback ? await ratesFor({}) : period;
  return {
    scrap: period.scrap || allTime.scrap || 0,
    daig: period.daig || allTime.daig || 0,
    scrapSource: period.scrap ? "period" : "all_time",
    daigSource: period.daig ? "period" : "all_time",
  };
}

function emptyFamilyTotals() {
  return {
    pieces: 0,
    scrapKg: 0,
    daigKg: 0,
    wasteKg: 0,
    materialCost: 0,
    overhead: 0,
    totalCost: 0,
    sellValue: 0,
    unitsSold: 0,
    profit: 0,
    marginPct: null,
  };
}

async function getProductionMargin(query = {}) {
  const { from, to } = periodBounds(query);
  const Product = require("../products/product.model");
  const { EXPENSE_CATEGORIES: expenseCats } = require("../domain/mfg.constants");

  const match = {
    status: { $ne: "cancelled" },
    ...dateMatch("productionDate", from, to),
  };

  const batches = await ProductionBatch.find(match)
    .populate("outputs.product", "name sku family weightKg pricePerKg sellingPrice")
    .populate("outputProgress.product", "name sku family weightKg pricePerKg sellingPrice")
    .populate("product", "name sku family weightKg pricePerKg sellingPrice")
    .lean();

  const rates = await getAvgMaterialRates(from, to);
  const avgScrapRate = rates.scrap;
  const avgDaigRate = rates.daig;

  const purchaseRows = await Purchase.aggregate([
    { $match: dateMatch("purchaseDate", from, to) },
    {
      $group: {
        _id: "$materialType",
        kg: { $sum: "$quantityKg" },
        amount: {
          $sum: { $add: ["$totalAmount", { $ifNull: ["$freightAmount", 0] }] },
        },
        count: { $sum: 1 },
      },
    },
  ]);
  const purchasedByType = { scrap: { kg: 0, amount: 0, count: 0 }, daig: { kg: 0, amount: 0, count: 0 } };
  for (const row of purchaseRows) {
    if (row._id === "scrap" || row._id === "daig") {
      purchasedByType[row._id] = {
        kg: roundKg(row.kg || 0),
        amount: roundMoney(row.amount || 0),
        count: row.count || 0,
      };
    }
  }

  const byProductMap = new Map();

  function ensureRow(pid, name, family, sellPrice) {
    let row = byProductMap.get(pid);
    if (!row) {
      row = {
        productId: pid,
        name: name || "Product",
        family: family || "hub",
        pieces: 0,
        scrapKg: 0,
        daigKg: 0,
        wasteKg: 0,
        sellPricePerPiece: Number(sellPrice) || 0,
      };
      byProductMap.set(pid, row);
    } else if (sellPrice && !row.sellPricePerPiece) {
      row.sellPricePerPiece = Number(sellPrice) || 0;
    }
    return row;
  }

  for (const b of batches) {
    let batchScrapKg = 0;
    let batchDaigKg = 0;
    if (Array.isArray(b.inputs) && b.inputs.length) {
      for (const inp of b.inputs) {
        const qty = inp.quantityKg || 0;
        if (inp.materialType === "daig") batchDaigKg += qty;
        else if (inp.materialType === "scrap" || !inp.materialType) batchScrapKg += qty;
      }
    } else {
      batchScrapKg = Math.max(0, (b.inputScrapKg || 0) - (b.returnedScrapKg || 0));
    }
    const batchWasteKg = b.furnaceWasteKg || b.materialLossKg || 0;

    const pieceLines = [];
    if (Array.isArray(b.outputProgress) && b.outputProgress.length) {
      for (const p of b.outputProgress) {
        const fin = p.finishedQty || p.goodAfterTurning || 0;
        if (fin <= 0) continue;
        const pid = String(p.product?._id || p.product || "");
        if (!pid) continue;
        const prodObj = typeof p.product === "object" ? p.product : null;
        pieceLines.push({
          productId: pid,
          quantity: fin,
          name: prodObj?.name || "Product",
          family: prodObj?.family || b.family || "hub",
          sellPrice: prodObj?.sellingPrice,
        });
      }
    } else if (Array.isArray(b.outputs) && b.outputs.length) {
      for (const out of b.outputs) {
        const qty = out.quantity || 0;
        if (qty <= 0) continue;
        const pid = String(out.product?._id || out.product || "");
        if (!pid) continue;
        const prodObj = typeof out.product === "object" ? out.product : null;
        pieceLines.push({
          productId: pid,
          quantity: qty,
          name: prodObj?.name || "Product",
          family: out.family || prodObj?.family || b.family || "hub",
          sellPrice: prodObj?.sellingPrice,
        });
      }
    } else {
      const legacyPid = String(b.product?._id || b.product || "");
      const qty = b.goodUnits || 0;
      if (legacyPid && qty > 0) {
        const prodObj = typeof b.product === "object" ? b.product : null;
        pieceLines.push({
          productId: legacyPid,
          quantity: qty,
          name: prodObj?.name || "Product",
          family: prodObj?.family || b.family || "hub",
          sellPrice: prodObj?.sellingPrice,
        });
      }
    }

    const batchFinished = pieceLines.reduce((s, l) => s + l.quantity, 0);
    for (const line of pieceLines) {
      const row = ensureRow(line.productId, line.name, line.family, line.sellPrice);
      row.pieces += line.quantity;
      if (batchFinished > 0) {
        const share = line.quantity / batchFinished;
        row.scrapKg = roundKg(row.scrapKg + batchScrapKg * share);
        row.daigKg = roundKg(row.daigKg + batchDaigKg * share);
        row.wasteKg = roundKg(row.wasteKg + batchWasteKg * share);
      }
    }
  }

  const productIds = [...byProductMap.keys()].filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const productMap = Object.fromEntries(products.map((p) => [String(p._id), p]));

  for (const row of byProductMap.values()) {
    const prod = productMap[row.productId];
    if (prod) {
      row.name = prod.name || row.name;
      row.family = prod.family || row.family;
      row.catalogSellPrice = Number(prod.sellingPrice) || 0;
    }
  }

  // Actual builty sales this period (by product + by family).
  async function salesInPeriod() {
    const pipeline = [
      { $match: dateMatch("builtyDate", from, to) },
      { $unwind: "$items" },
      { $match: { "items.quantity": { $gt: 0 } } },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "productDoc",
        },
      },
      { $unwind: { path: "$productDoc", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            productId: "$items.product",
            family: { $ifNull: ["$productDoc.family", "hub"] },
          },
          revenue: { $sum: "$items.lineTotal" },
          units: { $sum: "$items.quantity" },
          builtyIds: { $addToSet: "$_id" },
        },
      },
    ];
    const rows = await Builty.aggregate(pipeline);
    const byProduct = {};
    const byFamily = {
      hub: { revenue: 0, units: 0, builtyIds: new Set() },
      drum: { revenue: 0, units: 0, builtyIds: new Set() },
    };
    const allBuiltyIds = new Set();
    for (const r of rows) {
      const pid = r._id?.productId ? String(r._id.productId) : "";
      const fam = r._id?.family === "drum" ? "drum" : "hub";
      const revenue = r.revenue || 0;
      const units = r.units || 0;
      if (pid) {
        byProduct[pid] = {
          revenue,
          units,
          avgSellPerPiece: units > 0 ? revenue / units : 0,
        };
      }
      byFamily[fam].revenue += revenue;
      byFamily[fam].units += units;
      for (const id of r.builtyIds || []) {
        byFamily[fam].builtyIds.add(String(id));
        allBuiltyIds.add(String(id));
      }
    }
    return {
      byProduct,
      hubSales: roundMoney(byFamily.hub.revenue),
      drumSales: roundMoney(byFamily.drum.revenue),
      hubUnits: byFamily.hub.units,
      drumUnits: byFamily.drum.units,
      totalSales: roundMoney(byFamily.hub.revenue + byFamily.drum.revenue),
      totalUnits: byFamily.hub.units + byFamily.drum.units,
      builtyCount: allBuiltyIds.size,
    };
  }

  const periodSalesAgg = await salesInPeriod();
  const periodSales = periodSalesAgg.byProduct;

  const expenseByCategory = await BatchExpense.aggregate([
    { $match: dateMatch("expenseDate", from, to) },
    { $group: { _id: "$category", amount: { $sum: "$amount" } } },
  ]);
  const overheadTotal = expenseByCategory.reduce((s, e) => s + (e.amount || 0), 0);
  const categoryAmountMap = Object.fromEntries(
    expenseByCategory.map((e) => [e._id, e.amount || 0])
  );
  const categoryLabel = Object.fromEntries(expenseCats.map((c) => [c.id, c.label]));

  const totalPieces = [...byProductMap.values()].reduce((s, r) => s + r.pieces, 0);

  const productRows = [...byProductMap.values()]
    .filter((r) => r.pieces > 0)
    .map((row) => {
      const scrapCost = row.scrapKg * avgScrapRate;
      const daigCost = row.daigKg * avgDaigRate;
      const materialCost = scrapCost + daigCost;
      const overhead =
        totalPieces > 0 ? (row.pieces / totalPieces) * overheadTotal : 0;
      const totalCost = materialCost + overhead;

      const period = periodSales[row.productId];
      const unitsSoldPeriod = period?.units || 0;
      let sellPricePerPiece = 0;
      let sellPriceSource = "none";
      if (unitsSoldPeriod > 0) {
        sellPricePerPiece = period.avgSellPerPiece;
        sellPriceSource = "period_sales";
      } else if (row.catalogSellPrice > 0) {
        sellPricePerPiece = row.catalogSellPrice;
        sellPriceSource = "catalog";
      }

      sellPricePerPiece = roundMoney(sellPricePerPiece);
      // Actual billed sales for this product in the period (not produced × avg).
      const sellValue = roundMoney(period?.revenue || 0);
      const profit = sellValue - totalCost;
      const costPerPiece = row.pieces > 0 ? totalCost / row.pieces : 0;
      const profitPerPiece = sellPricePerPiece - costPerPiece;
      const marginPct = sellValue > 0 ? (profit / sellValue) * 100 : null;
      return {
        productId: row.productId,
        name: row.name,
        family: row.family,
        pieces: row.pieces,
        scrapKg: roundKg(row.scrapKg),
        daigKg: roundKg(row.daigKg),
        wasteKg: roundKg(row.wasteKg),
        avgScrapRate: roundMoney(avgScrapRate),
        avgDaigRate: roundMoney(avgDaigRate),
        scrapCost: roundMoney(scrapCost),
        daigCost: roundMoney(daigCost),
        materialCost: roundMoney(materialCost),
        overhead: roundMoney(overhead),
        totalCost: roundMoney(totalCost),
        costPerPiece: roundMoney(costPerPiece),
        sellPricePerPiece,
        sellPriceSource,
        unitsSoldPeriod,
        sellValue,
        profit: roundMoney(profit),
        profitPerPiece: roundMoney(profitPerPiece),
        marginPct: marginPct != null ? roundMoney(marginPct) : null,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  const byFamily = { hub: emptyFamilyTotals(), drum: emptyFamilyTotals() };
  for (const row of productRows) {
    const fam = byFamily[row.family] ? row.family : "hub";
    const t = byFamily[fam];
    t.pieces += row.pieces;
    t.scrapKg = roundKg(t.scrapKg + row.scrapKg);
    t.daigKg = roundKg(t.daigKg + row.daigKg);
    t.wasteKg = roundKg(t.wasteKg + row.wasteKg);
    t.materialCost = roundMoney(t.materialCost + row.materialCost);
    t.overhead = roundMoney(t.overhead + row.overhead);
    t.totalCost = roundMoney(t.totalCost + row.totalCost);
  }
  byFamily.hub.sellValue = periodSalesAgg.hubSales;
  byFamily.drum.sellValue = periodSalesAgg.drumSales;
  byFamily.hub.unitsSold = periodSalesAgg.hubUnits;
  byFamily.drum.unitsSold = periodSalesAgg.drumUnits;
  byFamily.hub.profit = roundMoney(byFamily.hub.sellValue - byFamily.hub.totalCost);
  byFamily.drum.profit = roundMoney(byFamily.drum.sellValue - byFamily.drum.totalCost);
  for (const key of Object.keys(byFamily)) {
    const t = byFamily[key];
    t.marginPct = t.sellValue > 0 ? roundMoney((t.profit / t.sellValue) * 100) : null;
  }

  const totalScrapKg = roundKg(productRows.reduce((s, r) => s + r.scrapKg, 0));
  const totalDaigKg = roundKg(productRows.reduce((s, r) => s + r.daigKg, 0));
  const totalWasteKg = roundKg(productRows.reduce((s, r) => s + r.wasteKg, 0));
  const totalScrapCost = roundMoney(productRows.reduce((s, r) => s + r.scrapCost, 0));
  const totalDaigCost = roundMoney(productRows.reduce((s, r) => s + r.daigCost, 0));
  const totalMaterialCost = roundMoney(totalScrapCost + totalDaigCost);
  const totalOverhead = roundMoney(overheadTotal);
  const totalProductionCost = roundMoney(totalMaterialCost + totalOverhead);
  const totalSellValue = periodSalesAgg.totalSales;
  const totalProfit = roundMoney(totalSellValue - totalProductionCost);

  const expenseBreakdown = [
    { id: "scrap_cost", label: "Scrap Cost", amount: totalScrapCost, kind: "material" },
    { id: "daig_cost", label: "Daig Cost", amount: totalDaigCost, kind: "material" },
    ...expenseCats
      .map((c) => ({
        id: c.id,
        label: c.label,
        amount: roundMoney(categoryAmountMap[c.id] || 0),
        kind: "overhead",
      }))
      .filter((c) => c.amount > 0),
    ...Object.entries(categoryAmountMap)
      .filter(([id]) => !expenseCats.some((c) => c.id === id))
      .map(([id, amount]) => ({
        id,
        label: categoryLabel[id] || id,
        amount: roundMoney(amount),
        kind: "overhead",
      }))
      .filter((c) => c.amount > 0),
  ].filter((e) => e.amount > 0);

  const purchasedScrap = purchasedByType.scrap;
  const purchasedDaig = purchasedByType.daig;
  const purchasedTotalKg = roundKg(purchasedScrap.kg + purchasedDaig.kg);
  const purchasedTotalAmount = roundMoney(purchasedScrap.amount + purchasedDaig.amount);

  return {
    period: { from, to },
    rates: {
      avgScrapRate: roundMoney(avgScrapRate),
      avgDaigRate: roundMoney(avgDaigRate),
      scrapSource: rates.scrapSource,
      daigSource: rates.daigSource,
    },
    summary: {
      pieces: totalPieces,
      scrapKg: totalScrapKg,
      daigKg: totalDaigKg,
      wasteKg: totalWasteKg,
      scrapCost: totalScrapCost,
      daigCost: totalDaigCost,
      materialCost: totalMaterialCost,
      overhead: totalOverhead,
      totalCost: totalProductionCost,
      sellValue: totalSellValue,
      unitsSold: periodSalesAgg.totalUnits,
      hubSales: periodSalesAgg.hubSales,
      drumSales: periodSalesAgg.drumSales,
      hubUnits: periodSalesAgg.hubUnits,
      drumUnits: periodSalesAgg.drumUnits,
      builtyCount: periodSalesAgg.builtyCount,
      profit: totalProfit,
      marginPct: totalSellValue > 0 ? roundMoney((totalProfit / totalSellValue) * 100) : null,
    },
    purchasedVsUsed: {
      purchased: {
        scrapKg: purchasedScrap.kg,
        daigKg: purchasedDaig.kg,
        totalKg: purchasedTotalKg,
        scrapAmount: purchasedScrap.amount,
        daigAmount: purchasedDaig.amount,
        totalAmount: purchasedTotalAmount,
        scrapCount: purchasedScrap.count,
        daigCount: purchasedDaig.count,
        purchaseCount: purchasedScrap.count + purchasedDaig.count,
      },
      used: {
        scrapKg: totalScrapKg,
        daigKg: totalDaigKg,
        totalKg: roundKg(totalScrapKg + totalDaigKg),
        scrapAmount: totalScrapCost,
        daigAmount: totalDaigCost,
        totalAmount: totalMaterialCost,
      },
    },
    byFamily,
    products: productRows,
    expenseBreakdown,
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
  getProductionMargin,
  EXPENSE_CATEGORIES,
};
