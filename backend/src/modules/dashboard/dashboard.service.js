const financeService = require("../finance/finance.service");
const inventoryService = require("../inventory/inventory.service");
const orderService = require("../orders/order.service");
const purchaseService = require("../purchases/purchase.service");
const productionService = require("../production/production.service");
const SalesOrder = require("../orders/order.model");
const CustomerPayment = require("../orders/payment.model");
const Purchase = require("../purchases/purchase.model");
const ProductionBatch = require("../production/production.model");
const BatchExpense = require("../expenses/expense.model");
const LedgerEntry = require("../ledger/ledger.model");
const FinanceEntry = require("../finance/finance.model");

function roundMoney(n) {
  return Math.round((n || 0) * 100) / 100;
}

function dayBounds(d = new Date()) {
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { from, to };
}

function monthBounds(d = new Date()) {
  const from = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

async function sumAmount(Model, match, field = "amount") {
  const result = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: `$${field}` }, count: { $sum: 1 } } },
  ]);
  return {
    total: roundMoney(result[0]?.total || 0),
    count: result[0]?.count || 0,
  };
}

async function getCashBalance() {
  const [paymentsIn, incomeIn, supplierOut, mfgOut, otherOut] = await Promise.all([
    sumAmount(CustomerPayment, {}, "amount"),
    sumAmount(FinanceEntry, { type: "income" }, "amount"),
    sumAmount(LedgerEntry, { type: "payment" }, "amount"),
    sumAmount(BatchExpense, {}, "amount"),
    sumAmount(FinanceEntry, { type: "expense" }, "amount"),
  ]);
  return roundMoney(
    paymentsIn.total + incomeIn.total - supplierOut.total - mfgOut.total - otherOut.total
  );
}

async function productionSeries(months = 6) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const rows = await ProductionBatch.aggregate([
    { $match: { productionDate: { $gte: start } } },
    {
      $group: {
        _id: {
          y: { $year: "$productionDate" },
          m: { $month: "$productionDate" },
        },
        goodUnits: { $sum: "$goodUnits" },
        batches: { $sum: 1 },
        netKg: { $sum: { $subtract: ["$inputScrapKg", "$returnedScrapKg"] } },
      },
    },
  ]);
  const map = new Map(
    rows.map((r) => [`${r._id.y}-${r._id.m}`, r])
  );
  const series = [];
  for (let i = 0; i < months; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    const row = map.get(key);
    series.push({
      label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      goodUnits: row?.goodUnits || 0,
      batches: row?.batches || 0,
      netKg: Math.round((row?.netKg || 0) * 1000) / 1000,
    });
  }
  return series;
}

async function recentActivity(limit = 12) {
  const [orders, payments, purchases, batches, expenses, ledgerPays] = await Promise.all([
    SalesOrder.find({ status: { $ne: "cancelled" } })
      .populate("customer", "name")
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    CustomerPayment.find()
      .populate("customer", "name")
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    Purchase.find()
      .populate("supplier", "name")
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    ProductionBatch.find()
      .populate("product", "name")
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    BatchExpense.find().sort({ createdAt: -1 }).limit(6).lean(),
    LedgerEntry.find({ type: "payment" })
      .populate("supplier", "name")
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
  ]);

  const events = [];

  for (const o of orders) {
    events.push({
      at: o.createdAt || o.orderDate,
      type: "sale",
      message: `Order ${o.orderNo} · ${o.customer?.name || "Customer"} · ${roundMoney(o.totalAmount)}`,
      href: `/dashboard/orders/${o._id}`,
    });
  }
  for (const p of payments) {
    events.push({
      at: p.createdAt || p.paymentDate,
      type: "payment",
      message: `Payment received · ${p.customer?.name || "Customer"} · ${roundMoney(p.amount)}`,
      href: p.order ? `/dashboard/orders/${p.order}` : "/dashboard/orders",
    });
  }
  for (const p of purchases) {
    events.push({
      at: p.createdAt || p.purchaseDate,
      type: "purchase",
      message: `Scrap purchase · ${p.supplier?.name || "Supplier"} · ${p.quantityKg} kg`,
      href: "/dashboard/inventory/purchases",
    });
  }
  for (const b of batches) {
    events.push({
      at: b.createdAt || b.productionDate,
      type: "production",
      message: `Batch · ${b.product?.name || "Product"} · ${b.goodUnits} good units`,
      href: `/dashboard/production/${b._id}`,
    });
  }
  for (const e of expenses) {
    events.push({
      at: e.createdAt || e.expenseDate,
      type: "expense",
      message: `Stage expense · ${e.category || "ops"} · ${roundMoney(e.amount)}`,
      href: e.batch ? `/dashboard/production/${e.batch}` : "/dashboard/production/costs",
    });
  }
  for (const l of ledgerPays) {
    events.push({
      at: l.createdAt || l.entryDate,
      type: "supplier_pay",
      message: `Paid supplier · ${l.supplier?.name || "Supplier"} · ${roundMoney(l.amount)}`,
      href: l.supplier?._id ? `/dashboard/suppliers/${l.supplier._id}` : "/dashboard/suppliers",
    });
  }

  return events
    .filter((e) => e.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
    .map((e) => ({
      ...e,
      at: new Date(e.at).toISOString(),
    }));
}

async function topSuppliersSpend(dateFrom, dateTo, limit = 5) {
  const report = await financeService.getSupplierExpenses({ dateFrom, dateTo });
  return (report.suppliers || []).slice(0, limit);
}

async function getDashboard() {
  const now = new Date();
  const today = dayBounds(now);
  const month = monthBounds(now);
  const todayFrom = isoDay(today.from);
  const todayTo = isoDay(today.to);
  const monthFrom = isoDay(month.from);
  const monthTo = isoDay(month.to);

  const [
    salesToday,
    salesMonthOverview,
    cashBalance,
    salesReport,
    inventoryOverview,
    alerts,
    productionToday,
    productionMonth,
    expensesTodayBatch,
    expensesTodayManual,
    pendingOrders,
    monthlyFinance,
    productionChart,
    activity,
    suppliersMonth,
  ] = await Promise.all([
    sumAmount(
      SalesOrder,
      {
        orderDate: { $gte: today.from, $lte: today.to },
        status: { $ne: "cancelled" },
      },
      "totalAmount"
    ),
    financeService.getOverview({ dateFrom: monthFrom, dateTo: monthTo }),
    getCashBalance(),
    orderService.getSalesReport({ dateFrom: monthFrom, dateTo: monthTo }),
    inventoryService.getOverview(),
    inventoryService.getAlerts(),
    productionService.getReport({ dateFrom: todayFrom, dateTo: todayTo }),
    productionService.getReport({ dateFrom: monthFrom, dateTo: monthTo }),
    sumAmount(BatchExpense, { expenseDate: { $gte: today.from, $lte: today.to } }, "amount"),
    sumAmount(
      FinanceEntry,
      { type: "expense", entryDate: { $gte: today.from, $lte: today.to } },
      "amount"
    ),
    SalesOrder.countDocuments({
      status: { $ne: "cancelled" },
      dispatchStatus: { $in: ["pending", "partial"] },
    }),
    financeService.getMonthly({ months: 6 }),
    productionSeries(6),
    recentActivity(14),
    topSuppliersSpend(monthFrom, monthTo, 5),
  ]);

  const expensesToday = roundMoney(expensesTodayBatch.total + expensesTodayManual.total);
  const months = monthlyFinance.months || [];

  return {
    generatedAt: now.toISOString(),
    kpis: {
      salesToday: salesToday.total,
      salesTodayCount: salesToday.count,
      salesMonth: salesMonthOverview.profitAndLoss.revenue,
      profitMonth: salesMonthOverview.profitAndLoss.netProfit,
      profitIsPositive: salesMonthOverview.profitAndLoss.isProfit,
      marginPct: salesMonthOverview.profitAndLoss.marginPct,
      cashBalance,
      cashFlowMonth: salesMonthOverview.cashFlow.net,
      outstandingPayments: salesReport.totals.outstanding,
      rawMaterialKg: inventoryOverview.raw?.availableKg ?? inventoryOverview.raw?.totalKg ?? 0,
      finishedGoodsUnits: inventoryOverview.finished?.totalUnits ?? 0,
      productionToday: productionToday.totals?.goodUnits ?? 0,
      productionTodayBatches: productionToday.totals?.batchCount ?? 0,
      expensesToday,
      pendingOrders,
      lowStockCount: alerts.count,
    },
    charts: {
      sales: months.map((m) => ({ label: m.label, value: m.revenue })),
      expenses: months.map((m) => ({ label: m.label, value: m.expenses })),
      profit: months.map((m) => ({ label: m.label, value: m.netProfit })),
      production: productionChart,
    },
    outstanding: (salesReport.outstanding || []).slice(0, 8),
    lowStock: {
      count: alerts.count,
      raw: alerts.raw,
      finished: (alerts.finished || []).slice(0, 8),
    },
    recentActivity: activity,
    topCustomers: (salesReport.topCustomers || []).slice(0, 5),
    topSuppliers: suppliersMonth,
    productionSummary: {
      today: {
        batches: productionToday.totals?.batchCount ?? 0,
        goodUnits: productionToday.totals?.goodUnits ?? 0,
        rejectedUnits: productionToday.totals?.rejectedUnits ?? 0,
        netConsumedKg: productionToday.totals?.netConsumedKg ?? 0,
        rejectRate: productionToday.totals?.rejectRate ?? 0,
      },
      month: {
        batches: productionMonth.totals?.batchCount ?? 0,
        goodUnits: productionMonth.totals?.goodUnits ?? 0,
        rejectedUnits: productionMonth.totals?.rejectedUnits ?? 0,
        netConsumedKg: productionMonth.totals?.netConsumedKg ?? 0,
        rejectRate: productionMonth.totals?.rejectRate ?? 0,
        lossRate: productionMonth.totals?.lossRate ?? 0,
      },
    },
  };
}

module.exports = { getDashboard };
