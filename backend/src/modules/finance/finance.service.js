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
    finishedKg: 0,
    scrapKg: 0,
    daigKg: 0,
    wasteKg: 0,
    materialCost: 0,
    overhead: 0,
    totalCost: 0,
    sellValue: 0,
    unitsSold: 0,
    profit: 0,
    costPerKg: null,
    overheadPerKg: null,
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
      row.weightKg = Number(prod.weightKg) || 0;
    } else {
      row.weightKg = Number(row.weightKg) || 0;
    }
    row.finishedKg = roundKg((row.weightKg || 0) * (row.pieces || 0));
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
  const categoryAmountMap = Object.fromEntries(
    expenseByCategory.map((e) => [e._id, e.amount || 0])
  );
  const categoryLabel = Object.fromEntries(expenseCats.map((c) => [c.id, c.label]));

  const expenseByScopeCategory = await BatchExpense.aggregate([
    { $match: dateMatch("expenseDate", from, to) },
    {
      $lookup: {
        from: "workers",
        localField: "worker",
        foreignField: "_id",
        as: "_worker",
      },
    },
    {
      $addFields: {
        effectiveScope: {
          $let: {
            vars: {
              expenseScope: "$scope",
              workerScope: { $arrayElemAt: ["$_worker.scope", 0] },
            },
            in: {
              $cond: [
                {
                  $in: [
                    "$category",
                    ["electricity", "taxes", "paint", "lpg_gas", "petrol", "tools", "machine", "repairs"],
                  ],
                },
                "common",
                {
                  $cond: [
                    { $in: ["$$expenseScope", ["hub", "drum", "common"]] },
                    "$$expenseScope",
                    {
                      $cond: [
                        { $in: ["$$workerScope", ["hub", "drum", "common"]] },
                        "$$workerScope",
                        "common",
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $group: {
        _id: {
          scope: "$effectiveScope",
          category: "$category",
        },
        amount: { $sum: "$amount" },
      },
    },
  ]);
  /** Hub vs drum electricity intensity when production kg is equal (60% / 40%). */
  const ELECTRICITY_HUB_INTENSITY = 0.6;
  const ELECTRICITY_DRUM_INTENSITY = 0.4;
  const overheadPools = { hub: 0, drum: 0, common: 0 };
  let electricityCommon = 0;
  for (const row of expenseByScopeCategory) {
    const scope =
      row._id?.scope === "hub" || row._id?.scope === "drum" ? row._id.scope : "common";
    const amount = row.amount || 0;
    if (row._id?.category === "electricity" && scope === "common") {
      electricityCommon = roundMoney(electricityCommon + amount);
    } else {
      overheadPools[scope] = roundMoney((overheadPools[scope] || 0) + amount);
    }
  }
  const overheadTotal = roundMoney(
    overheadPools.hub + overheadPools.drum + overheadPools.common + electricityCommon
  );

  const workingRows = [...byProductMap.values()].filter((r) => r.pieces > 0);
  const hubFinishedKg = roundKg(
    workingRows.filter((r) => (r.family || "hub") !== "drum").reduce((s, r) => s + (r.finishedKg || 0), 0)
  );
  const drumFinishedKg = roundKg(
    workingRows.filter((r) => r.family === "drum").reduce((s, r) => s + (r.finishedKg || 0), 0)
  );
  const allFinishedKg = roundKg(hubFinishedKg + drumFinishedKg);
  const electricityWeightTotal = workingRows.reduce((s, r) => {
    const kg = r.finishedKg || 0;
    const intensity =
      r.family === "drum" ? ELECTRICITY_DRUM_INTENSITY : ELECTRICITY_HUB_INTENSITY;
    return s + kg * intensity;
  }, 0);

  const totalPieces = workingRows.reduce((s, r) => s + r.pieces, 0);

  const productRows = workingRows
    .map((row) => {
      const scrapCost = row.scrapKg * avgScrapRate;
      const daigCost = row.daigKg * avgDaigRate;
      const materialCost = scrapCost + daigCost;
      const fam = row.family === "drum" ? "drum" : "hub";
      const finishedKg = row.finishedKg || 0;
      let overhead = 0;
      if (fam === "hub" && hubFinishedKg > 0) {
        overhead += (finishedKg / hubFinishedKg) * overheadPools.hub;
      }
      if (fam === "drum" && drumFinishedKg > 0) {
        overhead += (finishedKg / drumFinishedKg) * overheadPools.drum;
      }
      if (allFinishedKg > 0) {
        overhead += (finishedKg / allFinishedKg) * overheadPools.common;
      }
      if (electricityCommon > 0 && electricityWeightTotal > 0) {
        const intensity =
          fam === "drum" ? ELECTRICITY_DRUM_INTENSITY : ELECTRICITY_HUB_INTENSITY;
        overhead += ((finishedKg * intensity) / electricityWeightTotal) * electricityCommon;
      }
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
      const sellValue = roundMoney(period?.revenue || 0);
      const profit = sellValue - totalCost;
      const costPerPiece = row.pieces > 0 ? totalCost / row.pieces : 0;
      const profitPerPiece = sellPricePerPiece - costPerPiece;
      const marginPct = sellValue > 0 ? (profit / sellValue) * 100 : null;
      const costPerKg = finishedKg > 0 ? totalCost / finishedKg : null;
      const overheadPerKg = finishedKg > 0 ? overhead / finishedKg : null;
      return {
        productId: row.productId,
        name: row.name,
        family: row.family,
        pieces: row.pieces,
        weightKg: roundKg(row.weightKg || 0),
        finishedKg: roundKg(finishedKg),
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
        costPerKg: costPerKg != null ? roundMoney(costPerKg) : null,
        overheadPerKg: overheadPerKg != null ? roundMoney(overheadPerKg) : null,
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
    t.finishedKg = roundKg(t.finishedKg + (row.finishedKg || 0));
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
  byFamily.hub.costPerKg =
    byFamily.hub.finishedKg > 0
      ? roundMoney(byFamily.hub.totalCost / byFamily.hub.finishedKg)
      : null;
  byFamily.drum.costPerKg =
    byFamily.drum.finishedKg > 0
      ? roundMoney(byFamily.drum.totalCost / byFamily.drum.finishedKg)
      : null;
  byFamily.hub.overheadPerKg =
    byFamily.hub.finishedKg > 0
      ? roundMoney(byFamily.hub.overhead / byFamily.hub.finishedKg)
      : null;
  byFamily.drum.overheadPerKg =
    byFamily.drum.finishedKg > 0
      ? roundMoney(byFamily.drum.overhead / byFamily.drum.finishedKg)
      : null;
  for (const key of Object.keys(byFamily)) {
    const t = byFamily[key];
    t.marginPct = t.sellValue > 0 ? roundMoney((t.profit / t.sellValue) * 100) : null;
  }

  const salaryPools = { hub: 0, drum: 0, common: 0 };
  const mfgExpensePools = { hub: 0, drum: 0, common: 0 };
  let mfgElectricity = 0;
  let salesmanChannelLoad = 0;
  for (const row of expenseByScopeCategory) {
    const scope =
      row._id?.scope === "hub" || row._id?.scope === "drum" ? row._id.scope : "common";
    const category = row._id?.category || "";
    const amount = row.amount || 0;
    if (category === "salesman_commission" || category === "tour_expenses") {
      salesmanChannelLoad = roundMoney(salesmanChannelLoad + amount);
      continue;
    }
    if (category === "fixed_salary") {
      salaryPools[scope] = roundMoney((salaryPools[scope] || 0) + amount);
      continue;
    }
    if (category === "electricity" && scope === "common") {
      mfgElectricity = roundMoney(mfgElectricity + amount);
      continue;
    }
    mfgExpensePools[scope] = roundMoney((mfgExpensePools[scope] || 0) + amount);
  }

  function allocateBucketPerKg(pools, electricityAmount) {
    const out = { hub: null, drum: null };
    for (const fam of ["hub", "drum"]) {
      const finishedKg = fam === "drum" ? drumFinishedKg : hubFinishedKg;
      if (finishedKg <= 0) {
        out[fam] = null;
        continue;
      }
      let amount = 0;
      if (fam === "hub") amount += pools.hub || 0;
      if (fam === "drum") amount += pools.drum || 0;
      if (allFinishedKg > 0) amount += (finishedKg / allFinishedKg) * (pools.common || 0);
      if (electricityAmount > 0 && electricityWeightTotal > 0) {
        const intensity =
          fam === "drum" ? ELECTRICITY_DRUM_INTENSITY : ELECTRICITY_HUB_INTENSITY;
        amount += ((finishedKg * intensity) / electricityWeightTotal) * electricityAmount;
      }
      out[fam] = roundMoney(amount / finishedKg);
    }
    return out;
  }

  const materialPerKg = {
    hub:
      byFamily.hub.finishedKg > 0
        ? roundMoney(byFamily.hub.materialCost / byFamily.hub.finishedKg)
        : null,
    drum:
      byFamily.drum.finishedKg > 0
        ? roundMoney(byFamily.drum.materialCost / byFamily.drum.finishedKg)
        : null,
  };
  const salariesPerKg = allocateBucketPerKg(salaryPools, 0);
  const mfgExpensesPerKg = allocateBucketPerKg(mfgExpensePools, mfgElectricity);
  const salesmanAddOnPerKg =
    allFinishedKg > 0 ? roundMoney(salesmanChannelLoad / allFinishedKg) : 0;

  function familyChannelLine(fam, withSalesmanAddOn) {
    const material = materialPerKg[fam];
    const salaries = salariesPerKg[fam];
    const mfgExpenses = mfgExpensesPerKg[fam];
    const addOn = withSalesmanAddOn ? salesmanAddOnPerKg : 0;
    const parts = [material, salaries, mfgExpenses].filter((n) => n != null);
    if (!parts.length && !(withSalesmanAddOn && salesmanAddOnPerKg)) {
      return {
        materialPerKg: material,
        salariesPerKg: salaries,
        mfgExpensesPerKg: mfgExpenses,
        salesmanAddOnPerKg: withSalesmanAddOn ? salesmanAddOnPerKg : 0,
        totalPerKg: null,
      };
    }
    const base = roundMoney(
      (material || 0) + (salaries || 0) + (mfgExpenses || 0) + addOn
    );
    return {
      materialPerKg: material,
      salariesPerKg: salaries,
      mfgExpensesPerKg: mfgExpenses,
      salesmanAddOnPerKg: withSalesmanAddOn ? salesmanAddOnPerKg : 0,
      totalPerKg: base,
    };
  }

  const channelManufacture = {
    ikEngineering: {
      id: "ik_engineering",
      name: "IK Engineering",
      hub: familyChannelLine("hub", false),
      drum: familyChannelLine("drum", false),
    },
    powerEngineering: {
      id: "power_engineering",
      name: "Power Engineering Salesmans",
      hub: familyChannelLine("hub", true),
      drum: familyChannelLine("drum", true),
      salesmanLoad: salesmanChannelLoad,
      salesmanAddOnPerKg,
    },
  };

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
      hubFinishedKg,
      drumFinishedKg,
      hubCostPerKg: byFamily.hub.costPerKg,
      drumCostPerKg: byFamily.drum.costPerKg,
      hubOverheadPerKg: byFamily.hub.overheadPerKg,
      drumOverheadPerKg: byFamily.drum.overheadPerKg,
      overheadPools: {
        hub: overheadPools.hub,
        drum: overheadPools.drum,
        common: overheadPools.common,
        electricity: electricityCommon,
      },
      electricityIntensity: {
        hub: ELECTRICITY_HUB_INTENSITY,
        drum: ELECTRICITY_DRUM_INTENSITY,
      },
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
    channelManufacture,
  };
}

/** Groups that do NOT carry salesman commission + tour (user rule). */
const NO_SALESMAN_GROUP_NAMES = new Set(["i k", "ik", "machi goth"]);

const MAIN_CHANNELS = {
  powerEngineering: {
    id: "power_engineering",
    name: "Power Engineering Salesmans",
    salesmanChannel: true,
  },
  ikEngineering: {
    id: "ik_engineering",
    name: "IK Engineering",
    salesmanChannel: false,
    memberGroups: ["I K", "Machi Goth"],
  },
};

function isSalesmanGroupName(name) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!key || key === "(no group)") return false;
  return !NO_SALESMAN_GROUP_NAMES.has(key);
}

/**
 * Party-wise sale vs manufacture P/L.
 * Does not change production-margin behaviour.
 * Factory mfg/kg = production cost/kg with commission+tour removed from common.
 * Salesman groups add commission+tour / salesman-sold-kg on top.
 */
async function getPartySalesMargin(query = {}) {
  const { from, to } = periodBounds(query);
  const margin = await getProductionMargin(query);

  const salesmanLoad = roundMoney(
    (margin.expenseBreakdown || [])
      .filter((e) => e.id === "salesman_commission" || e.id === "tour_expenses")
      .reduce((s, e) => s + (e.amount || 0), 0)
  );

  const hubFinishedKg = margin.summary?.hubFinishedKg || 0;
  const drumFinishedKg = margin.summary?.drumFinishedKg || 0;
  const allFinishedKg = roundKg(hubFinishedKg + drumFinishedKg);
  const commonSalesmanPerFinishedKg =
    allFinishedKg > 0 ? roundMoney(salesmanLoad / allFinishedKg) : 0;

  const hubFactoryCostPerKg =
    margin.summary?.hubCostPerKg != null
      ? roundMoney(margin.summary.hubCostPerKg - commonSalesmanPerFinishedKg)
      : null;
  const drumFactoryCostPerKg =
    margin.summary?.drumCostPerKg != null
      ? roundMoney(margin.summary.drumCostPerKg - commonSalesmanPerFinishedKg)
      : null;

  const Product = require("../products/product.model");
  const products = await Product.find({}).select("name family weightKg").lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const salesRows = await Builty.aggregate([
    { $match: dateMatch("builtyDate", from, to) },
    {
      $lookup: {
        from: "customers",
        localField: "customer",
        foreignField: "_id",
        as: "customerDoc",
      },
    },
    { $unwind: { path: "$customerDoc", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "partygroups",
        localField: "customerDoc.group",
        foreignField: "_id",
        as: "groupDoc",
      },
    },
    { $unwind: { path: "$groupDoc", preserveNullAndEmptyArrays: true } },
    { $unwind: "$items" },
    {
      $project: {
        customerId: "$customer",
        customerName: { $ifNull: ["$customerDoc.name", "Unknown party"] },
        groupId: "$groupDoc._id",
        groupName: { $ifNull: ["$groupDoc.name", "(no group)"] },
        productId: "$items.product",
        quantity: { $ifNull: ["$items.quantity", 0] },
        lineTotal: { $ifNull: ["$items.lineTotal", 0] },
        itemWeightKg: { $ifNull: ["$items.weightKg", 0] },
      },
    },
  ]);

  const partyMap = new Map();
  let salesmanSoldKg = 0;

  for (const row of salesRows) {
    const pid = String(row.customerId || "unknown");
    const product = productMap.get(String(row.productId)) || {};
    const family = product.family === "drum" ? "drum" : "hub";
    const weightKg = Number(row.itemWeightKg) || Number(product.weightKg) || 0;
    const qty = Number(row.quantity) || 0;
    const kg = weightKg * qty;
    const amount = Number(row.lineTotal) || 0;
    const groupName = row.groupName || "(no group)";
    const salesmanChannel = isSalesmanGroupName(groupName);

    if (!partyMap.has(pid)) {
      partyMap.set(pid, {
        partyId: pid,
        partyName: row.customerName || "Unknown party",
        groupId: row.groupId ? String(row.groupId) : null,
        groupName,
        salesmanChannel,
        hubQty: 0,
        drumQty: 0,
        hubKg: 0,
        drumKg: 0,
        hubSale: 0,
        drumSale: 0,
      });
    }
    const p = partyMap.get(pid);
    if (family === "drum") {
      p.drumQty += qty;
      p.drumKg += kg;
      p.drumSale += amount;
    } else {
      p.hubQty += qty;
      p.hubKg += kg;
      p.hubSale += amount;
    }
  }

  for (const p of partyMap.values()) {
    if (p.salesmanChannel) {
      salesmanSoldKg += p.hubKg + p.drumKg;
    }
  }
  salesmanSoldKg = roundKg(salesmanSoldKg);
  const salesmanPerSoldKg =
    salesmanSoldKg > 0 ? roundMoney(salesmanLoad / salesmanSoldKg) : 0;

  const hubMfgSalesman =
    hubFactoryCostPerKg != null
      ? roundMoney(hubFactoryCostPerKg + salesmanPerSoldKg)
      : null;
  const drumMfgSalesman =
    drumFactoryCostPerKg != null
      ? roundMoney(drumFactoryCostPerKg + salesmanPerSoldKg)
      : null;

  const parties = [...partyMap.values()]
    .map((p) => {
      const hubQty = Math.round(p.hubQty || 0);
      const drumQty = Math.round(p.drumQty || 0);
      const totalQty = hubQty + drumQty;
      const hubKg = roundKg(p.hubKg);
      const drumKg = roundKg(p.drumKg);
      const totalKg = roundKg(hubKg + drumKg);
      const hubSale = roundMoney(p.hubSale);
      const drumSale = roundMoney(p.drumSale);
      const totalSale = roundMoney(hubSale + drumSale);

      const hubMfgPerKg = p.salesmanChannel ? hubMfgSalesman : hubFactoryCostPerKg;
      const drumMfgPerKg = p.salesmanChannel ? drumMfgSalesman : drumFactoryCostPerKg;

      const hubMfg = hubMfgPerKg != null ? roundMoney(hubKg * hubMfgPerKg) : 0;
      const drumMfg = drumMfgPerKg != null ? roundMoney(drumKg * drumMfgPerKg) : 0;
      const totalMfg = roundMoney(hubMfg + drumMfg);
      const hubProfit = roundMoney(hubSale - hubMfg);
      const drumProfit = roundMoney(drumSale - drumMfg);
      const profit = roundMoney(hubProfit + drumProfit);

      const hubSalePerKg = hubKg > 0 ? roundMoney(hubSale / hubKg) : null;
      const drumSalePerKg = drumKg > 0 ? roundMoney(drumSale / drumKg) : null;
      const avgSalePerKg = totalKg > 0 ? roundMoney(totalSale / totalKg) : null;
      const avgMfgPerKg = totalKg > 0 ? roundMoney(totalMfg / totalKg) : null;
      const hubProfitPerKg = hubKg > 0 ? roundMoney(hubProfit / hubKg) : null;
      const drumProfitPerKg = drumKg > 0 ? roundMoney(drumProfit / drumKg) : null;
      const profitPerKg = totalKg > 0 ? roundMoney(profit / totalKg) : null;

      return {
        partyId: p.partyId,
        partyName: p.partyName,
        groupId: p.groupId,
        groupName: p.groupName,
        salesmanChannel: p.salesmanChannel,
        hubQty,
        drumQty,
        totalQty,
        hubKg,
        drumKg,
        totalKg,
        hubSale,
        drumSale,
        totalSale,
        hubSalePerKg,
        drumSalePerKg,
        avgSalePerKg,
        hubMfgPerKg,
        drumMfgPerKg,
        avgMfgPerKg,
        hubMfg,
        drumMfg,
        totalMfg,
        hubProfit,
        drumProfit,
        profit,
        hubProfitPerKg,
        drumProfitPerKg,
        profitPerKg,
      };
    })
    .filter((p) => p.totalKg > 0 || p.totalSale > 0)
    .sort((a, b) => a.profit - b.profit);

  const totals = parties.reduce(
    (acc, p) => {
      acc.hubQty += p.hubQty;
      acc.drumQty += p.drumQty;
      acc.totalQty += p.totalQty;
      acc.hubKg += p.hubKg;
      acc.drumKg += p.drumKg;
      acc.totalKg += p.totalKg;
      acc.hubSale += p.hubSale;
      acc.drumSale += p.drumSale;
      acc.totalSale += p.totalSale;
      acc.hubMfg += p.hubMfg;
      acc.drumMfg += p.drumMfg;
      acc.totalMfg += p.totalMfg;
      acc.hubProfit += p.hubProfit;
      acc.drumProfit += p.drumProfit;
      acc.profit += p.profit;
      if (p.salesmanChannel) {
        acc.salesman.hubQty += p.hubQty;
        acc.salesman.drumQty += p.drumQty;
        acc.salesman.totalQty += p.totalQty;
        acc.salesman.hubKg += p.hubKg;
        acc.salesman.drumKg += p.drumKg;
        acc.salesman.totalKg += p.totalKg;
        acc.salesman.hubSale += p.hubSale;
        acc.salesman.drumSale += p.drumSale;
        acc.salesman.totalSale += p.totalSale;
        acc.salesman.hubMfg += p.hubMfg;
        acc.salesman.drumMfg += p.drumMfg;
        acc.salesman.totalMfg += p.totalMfg;
        acc.salesman.hubProfit += p.hubProfit;
        acc.salesman.drumProfit += p.drumProfit;
        acc.salesman.profit += p.profit;
      } else {
        acc.direct.hubQty += p.hubQty;
        acc.direct.drumQty += p.drumQty;
        acc.direct.totalQty += p.totalQty;
        acc.direct.hubKg += p.hubKg;
        acc.direct.drumKg += p.drumKg;
        acc.direct.totalKg += p.totalKg;
        acc.direct.hubSale += p.hubSale;
        acc.direct.drumSale += p.drumSale;
        acc.direct.totalSale += p.totalSale;
        acc.direct.hubMfg += p.hubMfg;
        acc.direct.drumMfg += p.drumMfg;
        acc.direct.totalMfg += p.totalMfg;
        acc.direct.hubProfit += p.hubProfit;
        acc.direct.drumProfit += p.drumProfit;
        acc.direct.profit += p.profit;
      }
      return acc;
    },
    {
      hubQty: 0,
      drumQty: 0,
      totalQty: 0,
      hubKg: 0,
      drumKg: 0,
      totalKg: 0,
      hubSale: 0,
      drumSale: 0,
      totalSale: 0,
      hubMfg: 0,
      drumMfg: 0,
      totalMfg: 0,
      hubProfit: 0,
      drumProfit: 0,
      profit: 0,
      salesman: {
        hubQty: 0,
        drumQty: 0,
        totalQty: 0,
        hubKg: 0,
        drumKg: 0,
        totalKg: 0,
        hubSale: 0,
        drumSale: 0,
        totalSale: 0,
        hubMfg: 0,
        drumMfg: 0,
        totalMfg: 0,
        hubProfit: 0,
        drumProfit: 0,
        profit: 0,
      },
      direct: {
        hubQty: 0,
        drumQty: 0,
        totalQty: 0,
        hubKg: 0,
        drumKg: 0,
        totalKg: 0,
        hubSale: 0,
        drumSale: 0,
        totalSale: 0,
        hubMfg: 0,
        drumMfg: 0,
        totalMfg: 0,
        hubProfit: 0,
        drumProfit: 0,
        profit: 0,
      },
    }
  );

  for (const key of ["hubKg", "drumKg", "totalKg"]) {
    totals[key] = roundKg(totals[key]);
  }
  totals.salesman.hubKg = roundKg(totals.salesman.hubKg);
  totals.salesman.drumKg = roundKg(totals.salesman.drumKg);
  totals.salesman.totalKg = roundKg(totals.salesman.totalKg);
  totals.direct.hubKg = roundKg(totals.direct.hubKg);
  totals.direct.drumKg = roundKg(totals.direct.drumKg);
  totals.direct.totalKg = roundKg(totals.direct.totalKg);
  for (const bucket of ["salesman", "direct", null]) {
    const t = bucket ? totals[bucket] : totals;
    t.hubQty = Math.round(t.hubQty || 0);
    t.drumQty = Math.round(t.drumQty || 0);
    t.totalQty = Math.round(t.totalQty || 0);
  }
  for (const key of [
    "hubSale",
    "drumSale",
    "totalSale",
    "hubMfg",
    "drumMfg",
    "totalMfg",
    "hubProfit",
    "drumProfit",
    "profit",
  ]) {
    totals[key] = roundMoney(totals[key]);
  }
  for (const bucket of ["salesman", "direct"]) {
    for (const key of [
      "hubSale",
      "drumSale",
      "totalSale",
      "hubMfg",
      "drumMfg",
      "totalMfg",
      "hubProfit",
      "drumProfit",
      "profit",
    ]) {
      totals[bucket][key] = roundMoney(totals[bucket][key]);
    }
    totals[bucket].hubKg = roundKg(totals[bucket].hubKg);
    totals[bucket].drumKg = roundKg(totals[bucket].drumKg);
    totals[bucket].totalKg = roundKg(totals[bucket].totalKg);
    totals[bucket].avgSalePerKg =
      totals[bucket].totalKg > 0
        ? roundMoney(totals[bucket].totalSale / totals[bucket].totalKg)
        : null;
    totals[bucket].avgMfgPerKg =
      totals[bucket].totalKg > 0
        ? roundMoney(totals[bucket].totalMfg / totals[bucket].totalKg)
        : null;
    totals[bucket].hubProfitPerKg =
      totals[bucket].hubKg > 0
        ? roundMoney(totals[bucket].hubProfit / totals[bucket].hubKg)
        : null;
    totals[bucket].drumProfitPerKg =
      totals[bucket].drumKg > 0
        ? roundMoney(totals[bucket].drumProfit / totals[bucket].drumKg)
        : null;
    totals[bucket].profitPerKg =
      totals[bucket].totalKg > 0
        ? roundMoney(totals[bucket].profit / totals[bucket].totalKg)
        : null;
  }
  totals.avgSalePerKg =
    totals.totalKg > 0 ? roundMoney(totals.totalSale / totals.totalKg) : null;
  totals.avgMfgPerKg =
    totals.totalKg > 0 ? roundMoney(totals.totalMfg / totals.totalKg) : null;
  totals.hubProfitPerKg =
    totals.hubKg > 0 ? roundMoney(totals.hubProfit / totals.hubKg) : null;
  totals.drumProfitPerKg =
    totals.drumKg > 0 ? roundMoney(totals.drumProfit / totals.drumKg) : null;
  totals.profitPerKg =
    totals.totalKg > 0 ? roundMoney(totals.profit / totals.totalKg) : null;

  const byGroupMap = new Map();
  for (const p of parties) {
    const gid = p.groupId || p.groupName;
    if (!byGroupMap.has(gid)) {
      byGroupMap.set(gid, {
        groupId: p.groupId,
        groupName: p.groupName,
        salesmanChannel: p.salesmanChannel,
        hubQty: 0,
        drumQty: 0,
        totalQty: 0,
        hubKg: 0,
        drumKg: 0,
        totalKg: 0,
        hubSale: 0,
        drumSale: 0,
        totalSale: 0,
        hubMfg: 0,
        drumMfg: 0,
        totalMfg: 0,
        hubProfit: 0,
        drumProfit: 0,
        profit: 0,
        partyCount: 0,
      });
    }
    const g = byGroupMap.get(gid);
    g.hubQty += p.hubQty;
    g.drumQty += p.drumQty;
    g.totalQty += p.totalQty;
    g.hubKg += p.hubKg;
    g.drumKg += p.drumKg;
    g.totalKg += p.totalKg;
    g.hubSale += p.hubSale;
    g.drumSale += p.drumSale;
    g.totalSale += p.totalSale;
    g.hubMfg += p.hubMfg;
    g.drumMfg += p.drumMfg;
    g.totalMfg += p.totalMfg;
    g.hubProfit += p.hubProfit;
    g.drumProfit += p.drumProfit;
    g.profit += p.profit;
    g.partyCount += 1;
  }

  const groups = [...byGroupMap.values()]
    .map((g) => ({
      ...g,
      hubQty: Math.round(g.hubQty),
      drumQty: Math.round(g.drumQty),
      totalQty: Math.round(g.totalQty),
      hubKg: roundKg(g.hubKg),
      drumKg: roundKg(g.drumKg),
      totalKg: roundKg(g.totalKg),
      hubSale: roundMoney(g.hubSale),
      drumSale: roundMoney(g.drumSale),
      totalSale: roundMoney(g.totalSale),
      hubMfg: roundMoney(g.hubMfg),
      drumMfg: roundMoney(g.drumMfg),
      totalMfg: roundMoney(g.totalMfg),
      hubProfit: roundMoney(g.hubProfit),
      drumProfit: roundMoney(g.drumProfit),
      profit: roundMoney(g.profit),
      hubSalePerKg: g.hubKg > 0 ? roundMoney(g.hubSale / g.hubKg) : null,
      drumSalePerKg: g.drumKg > 0 ? roundMoney(g.drumSale / g.drumKg) : null,
      avgSalePerKg: g.totalKg > 0 ? roundMoney(g.totalSale / g.totalKg) : null,
      hubMfgPerKg: g.salesmanChannel ? hubMfgSalesman : hubFactoryCostPerKg,
      drumMfgPerKg: g.salesmanChannel ? drumMfgSalesman : drumFactoryCostPerKg,
      avgMfgPerKg: g.totalKg > 0 ? roundMoney(g.totalMfg / g.totalKg) : null,
      hubProfitPerKg: g.hubKg > 0 ? roundMoney(g.hubProfit / g.hubKg) : null,
      drumProfitPerKg: g.drumKg > 0 ? roundMoney(g.drumProfit / g.drumKg) : null,
      profitPerKg: g.totalKg > 0 ? roundMoney(g.profit / g.totalKg) : null,
    }))
    .sort((a, b) => a.profit - b.profit);

  const elecBill = margin.summary?.overheadPools?.electricity || 0;
  const hubW = hubFinishedKg * 0.6;
  const drumW = drumFinishedKg * 0.4;
  const elecW = hubW + drumW;
  const elecHubShare = elecW > 0 ? (hubW / elecW) * elecBill : 0;
  const elecDrumShare = elecW > 0 ? (drumW / elecW) * elecBill : 0;

  const channelExpenseDocs = await BatchExpense.find({
    ...dateMatch("expenseDate", from, to),
    category: { $in: ["tour_expenses", "salesman_commission"] },
  })
    .populate("salesman", "name")
    .sort({ expenseDate: -1, createdAt: -1 })
    .lean();

  const channelExpenses = channelExpenseDocs.map((e) => ({
    _id: String(e._id),
    category: e.category,
    amount: roundMoney(e.amount || 0),
    expenseDate: e.expenseDate,
    notes: e.notes || "",
    title: e.title || "",
    salesmanId: e.salesman?._id ? String(e.salesman._id) : e.salesman ? String(e.salesman) : null,
    salesmanName: e.salesman?.name || null,
  }));

  const tourTotal = roundMoney(
    channelExpenses
      .filter((e) => e.category === "tour_expenses")
      .reduce((s, e) => s + e.amount, 0)
  );
  const salesmanPayTotal = roundMoney(
    channelExpenses
      .filter((e) => e.category === "salesman_commission")
      .reduce((s, e) => s + e.amount, 0)
  );

  const powerGroups = groups.filter((g) => g.salesmanChannel);
  const ikGroups = groups.filter((g) => !g.salesmanChannel);

  return {
    period: margin.period,
    rates: {
      hubFactoryCostPerKg,
      drumFactoryCostPerKg,
      hubMfgSalesman,
      drumMfgSalesman,
      salesmanPerSoldKg,
      salesmanLoad,
      salesmanSoldKg,
      noSalesmanGroups: MAIN_CHANNELS.ikEngineering.memberGroups,
    },
    mainChannels: {
      powerEngineering: {
        ...MAIN_CHANNELS.powerEngineering,
        memberGroups: powerGroups.map((g) => g.groupName),
      },
      ikEngineering: {
        ...MAIN_CHANNELS.ikEngineering,
        memberGroups: ikGroups.map((g) => g.groupName).length
          ? ikGroups.map((g) => g.groupName)
          : MAIN_CHANNELS.ikEngineering.memberGroups,
      },
    },
    channelExpenses: {
      items: channelExpenses,
      tourTotal,
      salesmanPayTotal,
      total: roundMoney(tourTotal + salesmanPayTotal),
    },
    electricity: {
      bill: roundMoney(elecBill),
      hubShare: roundMoney(elecHubShare),
      drumShare: roundMoney(elecDrumShare),
      hubPerKg: hubFinishedKg > 0 ? roundMoney(elecHubShare / hubFinishedKg) : null,
      drumPerKg: drumFinishedKg > 0 ? roundMoney(elecDrumShare / drumFinishedKg) : null,
    },
    totals,
    groups,
    parties,
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
  getPartySalesMargin,
  EXPENSE_CATEGORIES,
};
