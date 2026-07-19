const SalesOrder = require("./order.model");
const CustomerPayment = require("./payment.model");
const CustomerLedgerEntry = require("./customer-ledger.model");
const Dispatch = require("./dispatch.model");
const customerService = require("../customers/customer.service");
const Product = require("../products/product.model");

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
  return Math.round(n * 100) / 100;
}

function paymentStatus(amountPaid, totalAmount) {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid + 1e-9 >= totalAmount) return "paid";
  return "partial";
}

function dispatchStatus(items) {
  const total = items.reduce((s, i) => s + i.quantity, 0);
  const dispatched = items.reduce((s, i) => s + (i.dispatchedQty || 0), 0);
  if (dispatched <= 0) return "pending";
  if (dispatched + 1e-9 >= total) return "dispatched";
  return "partial";
}

async function nextOrderNos() {
  const start = new Date();
  const prefix = start.toISOString().slice(0, 10).replace(/-/g, "");
  const count = await SalesOrder.countDocuments({
    orderNo: new RegExp(`^SO-${prefix}`),
  });
  const n = String(count + 1).padStart(3, "0");
  return { orderNo: `SO-${prefix}-${n}`, invoiceNo: `INV-${prefix}-${n}` };
}

async function nextDispatchNo() {
  const start = new Date();
  const prefix = start.toISOString().slice(0, 10).replace(/-/g, "");
  const count = await Dispatch.countDocuments({
    dispatchNo: new RegExp(`^DSP-${prefix}`),
  });
  return `DSP-${prefix}-${String(count + 1).padStart(3, "0")}`;
}

async function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw httpError("At least one line item is required", 400);
  }
  const normalized = [];
  let totalAmount = 0;
  for (const raw of items) {
    if (!raw.product) throw httpError("Product is required on each line", 400);
    const product = await Product.findById(raw.product);
    if (!product) throw httpError("Product not found", 404);
    const quantity = Number(raw.quantity);
    const unitPrice = Number(raw.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw httpError("Quantity must be greater than 0", 400);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw httpError("Unit price is invalid", 400);
    }
    const lineTotal = roundMoney(quantity * unitPrice);
    totalAmount += lineTotal;
    normalized.push({
      product: product._id,
      quantity,
      unitPrice: roundMoney(unitPrice),
      lineTotal,
      dispatchedQty: 0,
    });
  }
  return { items: normalized, totalAmount: roundMoney(totalAmount) };
}

async function createOrder(data) {
  await customerService.getById(data.customer);
  const { items, totalAmount } = await normalizeItems(data.items);
  const nos = await nextOrderNos();

  const order = await SalesOrder.create({
    orderNo: data.orderNo?.trim() || nos.orderNo,
    invoiceNo: data.invoiceNo?.trim() || nos.invoiceNo,
    customer: data.customer,
    orderDate: parseDate(data.orderDate || new Date(), "Order date"),
    dueDate: data.dueDate ? parseDate(data.dueDate, "Due date") : null,
    city: data.city?.trim() || "",
    salesman: data.salesman?.trim() || "",
    commissionAmount: Math.max(0, Number(data.commissionAmount) || 0),
    items,
    totalAmount,
    amountPaid: 0,
    balance: totalAmount,
    status: "confirmed",
    paymentStatus: "unpaid",
    dispatchStatus: "pending",
    notes: data.notes?.trim() || "",
  });

  await CustomerLedgerEntry.create({
    customer: data.customer,
    type: "invoice",
    amount: totalAmount,
    order: order._id,
    entryDate: order.orderDate,
    notes: `Invoice ${order.invoiceNo}`,
  });

  return SalesOrder.findById(order._id)
    .populate("customer", "name phone email")
    .populate("items.product", "name sku unitLabel");
}

async function listOrders({ customer, paymentStatus, dispatchStatus, dateFrom, dateTo, q } = {}) {
  const filter = { status: { $ne: "cancelled" } };
  if (customer) filter.customer = customer;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (dispatchStatus) filter.dispatchStatus = dispatchStatus;
  if (dateFrom || dateTo) {
    filter.orderDate = {};
    if (dateFrom) filter.orderDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      filter.orderDate.$lte = end;
    }
  }
  if (q?.trim()) {
    const term = q.trim();
    filter.$or = [
      { orderNo: new RegExp(term, "i") },
      { invoiceNo: new RegExp(term, "i") },
    ];
  }

  return SalesOrder.find(filter)
    .populate("customer", "name phone")
    .populate("items.product", "name sku")
    .sort({ orderDate: -1, createdAt: -1 });
}

async function getOrder(id) {
  const order = await SalesOrder.findById(id)
    .populate("customer", "name phone email address")
    .populate("items.product", "name sku unitLabel");
  if (!order) throw httpError("Order not found", 404);
  return order;
}

async function cancelOrder(id) {
  const order = await SalesOrder.findById(id);
  if (!order) throw httpError("Order not found", 404);
  if (order.status === "cancelled") return order;
  if (order.amountPaid > 0) throw httpError("Cannot cancel an order with payments", 409);
  if (order.dispatchStatus !== "pending") {
    throw httpError("Cannot cancel an order that has been dispatched", 409);
  }

  order.status = "cancelled";
  order.balance = 0;
  await order.save();

  await CustomerLedgerEntry.deleteMany({ order: order._id, type: "invoice" });
  return getOrder(id);
}

async function recordPayment(data) {
  const order = await SalesOrder.findById(data.order);
  if (!order) throw httpError("Order not found", 404);
  if (order.status === "cancelled") throw httpError("Order is cancelled", 400);

  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError("Payment amount must be greater than 0", 400);
  }
  if (amount > order.balance + 0.01) {
    throw httpError(`Payment exceeds remaining balance (${order.balance})`, 400);
  }

  const payment = await CustomerPayment.create({
    customer: order.customer,
    order: order._id,
    amount: roundMoney(amount),
    paymentDate: parseDate(data.paymentDate || new Date(), "Payment date"),
    method: data.method || "cash",
    reference: data.reference?.trim() || "",
    notes: data.notes?.trim() || "",
  });

  order.amountPaid = roundMoney(order.amountPaid + amount);
  order.balance = roundMoney(Math.max(0, order.totalAmount - order.amountPaid));
  order.paymentStatus = paymentStatus(order.amountPaid, order.totalAmount);
  await order.save();

  await CustomerLedgerEntry.create({
    customer: order.customer,
    type: "payment",
    amount: payment.amount,
    order: order._id,
    payment: payment._id,
    entryDate: payment.paymentDate,
    notes: data.notes?.trim() || `Payment for ${order.invoiceNo}`,
  });

  return {
    payment,
    order: await getOrder(order._id),
    balance: await customerService.getBalance(order.customer),
  };
}

async function listPayments({ customer, order, dateFrom, dateTo } = {}) {
  const filter = {};
  if (customer) filter.customer = customer;
  if (order) filter.order = order;
  if (dateFrom || dateTo) {
    filter.paymentDate = {};
    if (dateFrom) filter.paymentDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      filter.paymentDate.$lte = end;
    }
  }
  return CustomerPayment.find(filter)
    .populate("customer", "name")
    .populate("order", "orderNo invoiceNo")
    .sort({ paymentDate: -1, createdAt: -1 });
}

async function listLedger(customerId) {
  await customerService.getById(customerId);
  const entries = await CustomerLedgerEntry.find({ customer: customerId })
    .populate("order", "orderNo invoiceNo")
    .populate("payment", "amount method")
    .sort({ entryDate: -1, createdAt: -1 });
  const balance = await customerService.getBalance(customerId);
  return { entries, balance };
}

async function createDispatch(data) {
  const order = await SalesOrder.findById(data.order);
  if (!order) throw httpError("Order not found", 404);
  if (order.status === "cancelled") throw httpError("Order is cancelled", 400);

  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw httpError("Dispatch items are required", 400);
  }

  const inventoryService = require("../inventory/inventory.service");
  const warehouse =
    data.warehouse ||
    (await inventoryService.getDefaultWarehouse())._id;

  const dispatchItems = [];
  for (const raw of data.items) {
    const qty = Number(raw.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const line = order.items.find(
      (i) =>
        String(i._id) === String(raw.itemId) ||
        String(i.product) === String(raw.product)
    );
    if (!line) throw httpError("Order line not found for dispatch", 404);

    const remaining = line.quantity - (line.dispatchedQty || 0);
    if (qty > remaining + 1e-9) {
      throw httpError(`Cannot dispatch more than remaining (${remaining}) for a line`, 400);
    }

    const stock = await inventoryService.getFinishedStock({ warehouse: String(warehouse) });
    const row = stock.items.find((i) => String(i.productId) === String(line.product));
    const available = row?.quantity || 0;
    if (qty > available + 1e-9) {
      throw httpError(`Insufficient finished stock for product. Available ${available}`, 400);
    }

    line.dispatchedQty = (line.dispatchedQty || 0) + qty;
    dispatchItems.push({ product: line.product, quantity: qty });
  }

  if (dispatchItems.length === 0) throw httpError("No valid dispatch quantities", 400);

  order.dispatchStatus = dispatchStatus(order.items);
  order.markModified("items");
  await order.save();

  const dispatch = await Dispatch.create({
    dispatchNo: await nextDispatchNo(),
    order: order._id,
    customer: order.customer,
    warehouse,
    items: dispatchItems,
    dispatchDate: parseDate(data.dispatchDate || new Date(), "Dispatch date"),
    biltyNo: data.biltyNo?.trim() || "",
    transporter: data.transporter?.trim() || "",
    vehicleNo: data.vehicleNo?.trim() || "",
    freightAmount: Math.max(0, Number(data.freightAmount) || 0),
    notes: data.notes?.trim() || "",
  });

  for (const item of dispatchItems) {
    await inventoryService.recordMovement({
      itemType: "finished_good",
      direction: "out",
      reason: "sale",
      quantity: item.quantity,
      unit: "pcs",
      product: item.product,
      warehouse,
      refType: "dispatch",
      refId: dispatch._id,
      movementDate: dispatch.dispatchDate,
      notes: `Dispatch ${dispatch.dispatchNo}`,
    });
  }

  return {
    dispatch: await Dispatch.findById(dispatch._id)
      .populate("order", "orderNo invoiceNo")
      .populate("customer", "name")
      .populate("warehouse", "name")
      .populate("items.product", "name sku"),
    order: await getOrder(order._id),
  };
}

async function listDispatches({ order, customer, dateFrom, dateTo } = {}) {
  const filter = {};
  if (order) filter.order = order;
  if (customer) filter.customer = customer;
  if (dateFrom || dateTo) {
    filter.dispatchDate = {};
    if (dateFrom) filter.dispatchDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      filter.dispatchDate.$lte = end;
    }
  }
  return Dispatch.find(filter)
    .populate("order", "orderNo invoiceNo")
    .populate("customer", "name")
    .populate("warehouse", "name")
    .populate("items.product", "name sku")
    .sort({ dispatchDate: -1, createdAt: -1 });
}

async function getSalesReport({ dateFrom, dateTo } = {}) {
  const match = { status: { $ne: "cancelled" } };
  if (dateFrom || dateTo) {
    match.orderDate = {};
    if (dateFrom) match.orderDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      match.orderDate.$lte = end;
    }
  }

  const outstanding = await SalesOrder.find({
    status: { $ne: "cancelled" },
    paymentStatus: { $in: ["unpaid", "partial"] },
    balance: { $gt: 0 },
  })
    .populate("customer", "name phone")
    .sort({ balance: -1 });

  const byCustomer = await SalesOrder.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$customer",
        orderCount: { $sum: 1 },
        totalSales: { $sum: "$totalAmount" },
        totalPaid: { $sum: "$amountPaid" },
        outstanding: { $sum: "$balance" },
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
    { $sort: { totalSales: -1 } },
  ]);

  const totals = await SalesOrder.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        orderCount: { $sum: 1 },
        totalSales: { $sum: "$totalAmount" },
        totalPaid: { $sum: "$amountPaid" },
        outstanding: { $sum: "$balance" },
      },
    },
  ]);

  const unpaidInvoices = outstanding.map((o) => ({
    orderId: o._id,
    orderNo: o.orderNo,
    invoiceNo: o.invoiceNo,
    customer: o.customer?.name || "Unknown",
    customerId: o.customer?._id,
    orderDate: o.orderDate,
    dueDate: o.dueDate,
    totalAmount: o.totalAmount,
    amountPaid: o.amountPaid,
    balance: o.balance,
    paymentStatus: o.paymentStatus,
  }));

  const t = totals[0] || { orderCount: 0, totalSales: 0, totalPaid: 0, outstanding: 0 };

  return {
    totals: {
      orderCount: t.orderCount,
      totalSales: roundMoney(t.totalSales || 0),
      totalPaid: roundMoney(t.totalPaid || 0),
      outstanding: roundMoney(t.outstanding || 0),
    },
    outstanding: unpaidInvoices,
    topCustomers: byCustomer.map((row) => ({
      customerId: row._id,
      name: row.customer?.name || "Unknown",
      orderCount: row.orderCount,
      totalSales: roundMoney(row.totalSales),
      totalPaid: roundMoney(row.totalPaid),
      outstanding: roundMoney(row.outstanding),
    })),
    whoOwes: unpaidInvoices.reduce((acc, inv) => {
      const key = String(inv.customerId || inv.customer);
      const existing = acc.find((a) => a.customerId === key);
      if (existing) {
        existing.balance = roundMoney(existing.balance + inv.balance);
        existing.invoices += 1;
      } else {
        acc.push({
          customerId: key,
          name: inv.customer,
          balance: inv.balance,
          invoices: 1,
        });
      }
      return acc;
    }, []).sort((a, b) => b.balance - a.balance),
  };
}

module.exports = {
  createOrder,
  listOrders,
  getOrder,
  cancelOrder,
  recordPayment,
  listPayments,
  listLedger,
  createDispatch,
  listDispatches,
  getSalesReport,
};
