const Builty = require("./builty.model");
const SalesOrder = require("../orders/order.model");
const Dispatch = require("../orders/dispatch.model");
const orderService = require("../orders/order.service");
const customerService = require("../customers/customer.service");
const inventoryService = require("../inventory/inventory.service");
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

function money(orders) {
  const live = orders.filter((o) => o.status !== "cancelled");
  const totalAmount = roundMoney(live.reduce((s, o) => s + (o.totalAmount || 0), 0));
  const amountPaid = roundMoney(live.reduce((s, o) => s + (o.amountPaid || 0), 0));
  const balance = roundMoney(Math.max(0, totalAmount - amountPaid));
  let paymentStatus = "partial";
  if (amountPaid <= 0) paymentStatus = "unpaid";
  else if (balance <= 0.009) paymentStatus = "paid";
  return { totalAmount, amountPaid, balance, paymentStatus };
}

function orderLineSummary(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const parts = items
    .map((line) => {
      const name =
        line.product && typeof line.product === "object"
          ? line.product.name
          : "Item";
      const qty = line.quantity || 0;
      return `${name} x ${qty}`;
    })
    .filter(Boolean);
  return parts.join(", ");
}

function toRow(builty) {
  const orders = Array.isArray(builty.orders) ? builty.orders : [];
  const live = orders.filter((o) => o.status !== "cancelled");
  const orderDetails = live
    .map((o) => orderLineSummary(o))
    .filter(Boolean);
  return {
    _id: builty._id,
    builtyNo: builty.builtyNo,
    billNo: builty.billNo || "",
    builtyDate: builty.builtyDate,
    customer: builty.customer,
    orderCount: live.length,
    orderDetails,
    transporter: builty.transporter,
    vehicleNo: builty.vehicleNo,
    freightAmount: builty.freightAmount,
    notes: builty.notes,
    ...money(orders),
  };
}

async function listBuilties({ q, customer, paymentStatus, dateFrom, dateTo } = {}) {
  const filter = {};
  if (customer) filter.customer = customer;
  if (dateFrom || dateTo) {
    filter.builtyDate = {};
    if (dateFrom) filter.builtyDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      filter.builtyDate.$lte = end;
    }
  }
  if (q?.trim()) filter.builtyNo = new RegExp(q.trim(), "i");

  const builties = await Builty.find(filter)
    .populate("customer", "name phone")
    .populate({
      path: "orders",
      select: "orderNo invoiceNo totalAmount amountPaid balance status items",
      populate: { path: "items.product", select: "name sku" },
    })
    .sort({ builtyDate: -1, createdAt: -1 });

  const rows = builties.map(toRow);
  return paymentStatus ? rows.filter((r) => r.paymentStatus === paymentStatus) : rows;
}

async function getBuilty(id) {
  const builty = await Builty.findById(id)
    .populate("customer", "name phone email address")
    .populate({
      path: "orders",
      select: "orderNo invoiceNo orderDate totalAmount amountPaid balance status paymentStatus items",
      populate: { path: "items.product", select: "name sku" },
    });
  if (!builty) throw httpError("Builty not found", 404);
  return { builty, summary: money(builty.orders || []) };
}

/** Orders a customer has confirmed that are not on a builty yet. */
async function pendingOrders(customerId) {
  if (!customerId) throw httpError("Customer is required", 400);
  await customerService.getById(customerId);
  return SalesOrder.find({
    customer: customerId,
    status: { $ne: "cancelled" },
    builty: null,
  })
    .populate("items.product", "name sku")
    .sort({ orderDate: 1, createdAt: 1 });
}

/**
 * Fails before anything is written if the warehouse cannot cover every line
 * across all the orders, so a builty never dispatches half its orders.
 */
async function assertStockAvailable(orders, warehouse) {
  const stock = await inventoryService.getFinishedStock({ warehouse: String(warehouse) });
  const needed = new Map();
  for (const order of orders) {
    for (const line of order.items) {
      const remaining = line.quantity - (line.dispatchedQty || 0);
      if (remaining <= 0) continue;
      const key = String(line.product);
      needed.set(key, (needed.get(key) || 0) + remaining);
    }
  }
  for (const [productId, quantity] of needed) {
    const row = stock.items.find((i) => String(i.productId) === productId);
    const available = row?.quantity || 0;
    if (quantity > available + 1e-9) {
      // Products sitting at zero are dropped from the stock aggregate, so fall
      // back to the product itself for a message the user can act on.
      const name = row?.name || (await Product.findById(productId))?.name || "a product";
      throw httpError(
        `Not enough finished stock for ${name}. Need ${quantity}, have ${available}`,
        400
      );
    }
  }
}

async function createBuilty(data) {
  const builtyNo = String(data.builtyNo || "").trim();
  if (!builtyNo) throw httpError("Builty number is required", 400);
  if (await Builty.exists({ builtyNo })) {
    throw httpError(`Builty number ${builtyNo} is already used`, 409);
  }

  await customerService.getById(data.customer);

  const ids = Array.isArray(data.orders) ? data.orders.filter(Boolean) : [];
  if (ids.length === 0) throw httpError("Select at least one order", 400);

  const orders = await SalesOrder.find({ _id: { $in: ids } });
  if (orders.length !== ids.length) throw httpError("Order not found", 404);

  for (const order of orders) {
    if (String(order.customer) !== String(data.customer)) {
      throw httpError(`Order ${order.orderNo} belongs to another customer`, 400);
    }
    if (order.status === "cancelled") {
      throw httpError(`Order ${order.orderNo} is cancelled`, 400);
    }
    if (order.builty) {
      throw httpError(`Order ${order.orderNo} is already on a builty`, 409);
    }
  }

  const builtyDate = parseDate(data.builtyDate || new Date(), "Builty date");
  const warehouse = data.warehouse || (await inventoryService.getDefaultWarehouse())._id;
  await assertStockAvailable(orders, warehouse);

  const builty = await Builty.create({
    builtyNo,
    billNo: data.billNo?.trim() || "",
    customer: data.customer,
    orders: orders.map((o) => o._id),
    builtyDate,
    warehouse,
    transporter: "",
    vehicleNo: data.vehicleNo?.trim() || "",
    freightAmount: Math.max(0, Number(data.freightAmount) || 0),
    notes: data.notes?.trim() || "",
  });

  for (const order of orders) {
    const items = order.items
      .map((line) => ({
        itemId: line._id,
        product: line.product,
        quantity: line.quantity - (line.dispatchedQty || 0),
      }))
      .filter((i) => i.quantity > 0);

    if (items.length > 0) {
      await orderService.createDispatch({
        order: order._id,
        items,
        warehouse,
        builty: builty._id,
        dispatchDate: builtyDate,
        biltyNo: builtyNo,
        transporter: builty.transporter,
        vehicleNo: builty.vehicleNo,
        notes: `Builty ${builtyNo}`,
      });
    }
    await SalesOrder.updateOne({ _id: order._id }, { $set: { builty: builty._id } });
  }

  const paymentGiven = Number(data.amountPaid ?? data.paymentGiven ?? 0);
  if (Number.isFinite(paymentGiven) && paymentGiven > 0) {
    await recordBuiltyPayment(builty._id, {
      amount: paymentGiven,
      paymentDate: data.paymentDate || builtyDate,
      method: data.method,
      notes: data.paymentNotes,
    });
  }

  return getBuilty(builty._id);
}

async function updateBuilty(id, data) {
  const builty = await Builty.findById(id);
  if (!builty) throw httpError("Builty not found", 404);

  if (data.builtyNo !== undefined) {
    const nextNo = String(data.builtyNo || "").trim();
    if (!nextNo) throw httpError("Builty number is required", 400);
    if (nextNo !== builty.builtyNo) {
      if (await Builty.exists({ builtyNo: nextNo, _id: { $ne: builty._id } })) {
        throw httpError(`Builty number ${nextNo} is already used`, 409);
      }
      builty.builtyNo = nextNo;
      await Dispatch.updateMany({ builty: builty._id }, { $set: { biltyNo: nextNo } });
    }
  }

  if (data.billNo !== undefined) {
    builty.billNo = String(data.billNo || "").trim();
  }
  if (data.builtyDate !== undefined) {
    builty.builtyDate = parseDate(data.builtyDate, "Builty date");
  }
  if (data.notes !== undefined) {
    builty.notes = String(data.notes || "").trim();
  }

  await builty.save();
  return getBuilty(builty._id);
}

/**
 * One figure is entered against the builty; it is settled across that builty's
 * orders oldest first so the customer ledger and sales reports stay correct.
 */
async function recordBuiltyPayment(id, data) {
  const builty = await Builty.findById(id);
  if (!builty) throw httpError("Builty not found", 404);

  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError("Payment amount must be greater than 0", 400);
  }

  const orders = await SalesOrder.find({
    _id: { $in: builty.orders },
    status: { $ne: "cancelled" },
  }).sort({ orderDate: 1, createdAt: 1 });

  const due = roundMoney(orders.reduce((s, o) => s + (o.balance || 0), 0));
  if (due <= 0) throw httpError("This builty is already fully paid", 400);
  if (amount > due + 0.01) {
    throw httpError(`Payment exceeds remaining balance (${due})`, 400);
  }

  let left = roundMoney(amount);
  for (const order of orders) {
    if (left <= 0.009) break;
    const take = roundMoney(Math.min(order.balance || 0, left));
    if (take <= 0) continue;
    await orderService.recordPayment({
      order: order._id,
      amount: take,
      paymentDate: data.paymentDate,
      method: data.method,
      reference: data.reference,
      notes: data.notes?.trim() || `Payment on builty ${builty.builtyNo}`,
    });
    left = roundMoney(left - take);
  }

  return getBuilty(builty._id);
}

/** Undo a builty: puts the goods back in stock and frees its orders. */
async function removeBuilty(id) {
  const builty = await Builty.findById(id);
  if (!builty) throw httpError("Builty not found", 404);

  const orders = await SalesOrder.find({ _id: { $in: builty.orders } });
  const paid = orders.reduce((s, o) => s + (o.amountPaid || 0), 0);
  if (paid > 0) {
    throw httpError("Cannot delete a builty that has payments. Reverse the payments first.", 409);
  }

  const dispatches = await Dispatch.find({ builty: builty._id });

  for (const dispatch of dispatches) {
    for (const item of dispatch.items) {
      await inventoryService.recordMovement({
        itemType: "finished_good",
        direction: "in",
        reason: "adjustment",
        quantity: item.quantity,
        unit: "pcs",
        product: item.product,
        warehouse: dispatch.warehouse,
        refType: "builty_delete",
        refId: builty._id,
        movementDate: new Date(),
        notes: `Builty ${builty.builtyNo} deleted`,
      });

      const order = orders.find((o) => String(o._id) === String(dispatch.order));
      const line = order?.items.find((l) => String(l.product) === String(item.product));
      if (line) {
        line.dispatchedQty = Math.max(0, (line.dispatchedQty || 0) - item.quantity);
      }
    }
    await dispatch.deleteOne();
  }

  for (const order of orders) {
    const dispatched = order.items.reduce((s, l) => s + (l.dispatchedQty || 0), 0);
    const total = order.items.reduce((s, l) => s + l.quantity, 0);
    order.dispatchStatus =
      dispatched <= 0 ? "pending" : dispatched + 1e-9 >= total ? "dispatched" : "partial";
    order.builty = null;
    order.markModified("items");
    await order.save();
  }

  await builty.deleteOne();
  return { deleted: true };
}

module.exports = {
  listBuilties,
  getBuilty,
  pendingOrders,
  createBuilty,
  updateBuilty,
  recordBuiltyPayment,
  removeBuilty,
};
