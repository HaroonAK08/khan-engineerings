const Builty = require("./builty.model");
const CustomerPayment = require("../customers/customer-payment.model");
const CustomerLedgerEntry = require("../customers/customer-ledger.model");
const customerService = require("../customers/customer.service");
const inventoryService = require("../inventory/inventory.service");
const Product = require("../products/product.model");
const mongoose = require("mongoose");
const {
  dayRange,
  wantsConfirmDuplicate,
  sameDayDuplicateError,
} = require("../../utils/sameDay");

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (typeof id === "object" && id._id) return toObjectId(id._id);
  return new mongoose.Types.ObjectId(String(id));
}

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

function paymentStatusFor(amountPaid, totalAmount) {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid + 1e-9 >= totalAmount) return "paid";
  return "partial";
}

/**
 * Turn raw line input into priced builty items. Two pricing modes:
 *  - rate_kg: lineTotal = quantity x product.weightKg x ratePerKg
 *  - fixed:   lineTotal = the amount the user typed for the whole line
 */
async function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw httpError("Add at least one product", 400);
  }
  const normalized = [];
  let totalAmount = 0;
  for (const raw of items) {
    if (!raw.product) throw httpError("Product is required on each line", 400);
    const product = await Product.findById(raw.product);
    if (!product) throw httpError("Product not found", 404);

    const quantity = Number(raw.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw httpError("Quantity must be greater than 0", 400);
    }

    const mode = raw.pricingMode === "fixed" ? "fixed" : "rate_kg";
    const weightKg = Number.isFinite(product.weightKg) ? product.weightKg : 0;
    let ratePerKg = 0;
    let unitPrice = 0;
    let lineTotal = 0;

    if (mode === "rate_kg") {
      ratePerKg = Number(raw.ratePerKg);
      if (!Number.isFinite(ratePerKg) || ratePerKg < 0) {
        throw httpError("Rate per kg is invalid", 400);
      }
      if (weightKg <= 0) {
        throw httpError(`Set a weight (kg) on "${product.name}" or use a fixed amount`, 400);
      }
      unitPrice = roundMoney(weightKg * ratePerKg);
      lineTotal = roundMoney(quantity * unitPrice);
    } else {
      const fixed = Number(raw.fixedAmount ?? raw.unitPrice ?? raw.lineTotal);
      if (!Number.isFinite(fixed) || fixed < 0) {
        throw httpError("Fixed amount is invalid", 400);
      }
      unitPrice = roundMoney(fixed);
      lineTotal = roundMoney(quantity * unitPrice);
    }

    totalAmount += lineTotal;
    normalized.push({
      product: product._id,
      quantity,
      pricingMode: mode,
      ratePerKg: roundMoney(ratePerKg),
      weightKg: roundMoney(weightKg),
      unitPrice,
      lineTotal,
    });
  }
  return { items: normalized, totalAmount: roundMoney(totalAmount) };
}

/** Stock may go negative when shipping — no hard block. */
async function assertStockAvailable() {
  return;
}

function summary(builty) {
  return {
    totalAmount: roundMoney(builty.totalAmount || 0),
    amountPaid: roundMoney(builty.amountPaid || 0),
    balance: roundMoney(builty.balance || 0),
    paymentStatus: builty.paymentStatus || "unpaid",
  };
}

async function refreshBuiltyTotals(builty) {
  const payments = await CustomerPayment.find({ builty: builty._id });
  const amountPaid = roundMoney(payments.reduce((sum, p) => sum + (p.amount || 0), 0));
  builty.amountPaid = amountPaid;
  builty.balance = roundMoney(Math.max(0, (builty.totalAmount || 0) - amountPaid));
  builty.paymentStatus = paymentStatusFor(amountPaid, builty.totalAmount || 0);
  await builty.save();
  return builty;
}

/**
 * Party payments settle previous pending first, then builties oldest → newest.
 * Each builty status becomes unpaid / partial / paid from how much is still left.
 */
async function syncCustomerBuiltyPaymentStatuses(customerId) {
  const oid = toObjectId(customerId);
  if (!oid) return;

  const [paymentsAgg, previousPendingAgg, builties] = await Promise.all([
    CustomerPayment.aggregate([
      { $match: { customer: oid } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    CustomerLedgerEntry.aggregate([
      {
        $match: {
          customer: oid,
          type: "adjustment",
          signedAmount: { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: "$signedAmount" } } },
    ]),
    Builty.find({ customer: oid }).sort({ builtyDate: 1, createdAt: 1 }),
  ]);

  let remaining = roundMoney(paymentsAgg[0]?.total || 0);
  const previousPending = roundMoney(previousPendingAgg[0]?.total || 0);
  remaining = roundMoney(Math.max(0, remaining - previousPending));

  for (const builty of builties) {
    const total = roundMoney(builty.totalAmount || 0);
    const amountPaid = roundMoney(Math.min(remaining, total));
    const balance = roundMoney(Math.max(0, total - amountPaid));
    const paymentStatus = paymentStatusFor(amountPaid, total);
    remaining = roundMoney(Math.max(0, remaining - amountPaid));

    const changed =
      roundMoney(builty.amountPaid || 0) !== amountPaid ||
      roundMoney(builty.balance || 0) !== balance ||
      (builty.paymentStatus || "unpaid") !== paymentStatus;

    if (changed) {
      builty.amountPaid = amountPaid;
      builty.balance = balance;
      builty.paymentStatus = paymentStatus;
      await builty.save();
    }
  }
}

function itemSummary(builty) {
  const items = Array.isArray(builty.items) ? builty.items : [];
  return items
    .map((line) => {
      const name =
        line.product && typeof line.product === "object" ? line.product.name : "Item";
      return `${name} x ${line.quantity || 0}`;
    })
    .filter(Boolean);
}

function toRow(builty) {
  return {
    _id: builty._id,
    builtyNo: builty.builtyNo,
    billNo: builty.billNo || "",
    builtyDate: builty.builtyDate,
    customer: builty.customer,
    itemCount: (builty.items || []).length,
    itemDetails: itemSummary(builty),
    notes: builty.notes,
    ...summary(builty),
  };
}

async function listBuilties({ q, customer, paymentStatus, dateFrom, dateTo } = {}) {
  const filter = {};
  if (customer) filter.customer = customer;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (dateFrom || dateTo) {
    filter.builtyDate = {};
    if (dateFrom) filter.builtyDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      filter.builtyDate.$lte = end;
    }
  }
  if (q?.trim()) {
    const term = q.trim();
    filter.$or = [{ builtyNo: new RegExp(term, "i") }, { billNo: new RegExp(term, "i") }];
  }

  const builties = await Builty.find(filter)
    .populate("customer", "name phone")
    .populate({ path: "items.product", select: "name sku" })
    .sort({ builtyDate: -1, createdAt: -1 })
    .lean();

  return builties.map(toRow);
}

async function getBuilty(id) {
  const builty = await Builty.findById(id)
    .populate("customer", "name phone address")
    .populate({ path: "items.product", select: "name sku unitLabel weightKg" });
  if (!builty) throw httpError("Builty not found", 404);
  await syncCustomerBuiltyPaymentStatuses(builty.customer?._id || builty.customer);
  const fresh = await Builty.findById(id)
    .populate("customer", "name phone address")
    .populate({ path: "items.product", select: "name sku unitLabel weightKg" });
  const payments = await CustomerPayment.find({ builty: fresh._id }).sort({
    paymentDate: -1,
    createdAt: -1,
  });
  return { builty: fresh, summary: summary(fresh), payments };
}

async function createBuilty(data) {
  const builtyNo = String(data.builtyNo || "").trim();
  if (!builtyNo) throw httpError("Builty number is required", 400);
  if (await Builty.exists({ builtyNo })) {
    throw httpError(`Builty number ${builtyNo} is already used`, 409);
  }

  await customerService.getById(data.customer);
  const { items, totalAmount } = await normalizeItems(data.items);

  const builtyDate = parseDate(data.builtyDate || new Date(), "Builty date");

  if (!wantsConfirmDuplicate(data)) {
    const { start, end } = dayRange(builtyDate);
    const existing = await Builty.findOne({
      customer: data.customer,
      builtyDate: { $gte: start, $lte: end },
    })
      .select("_id builtyNo")
      .lean();
    if (existing) {
      const customer = await customerService.getById(data.customer);
      const partyName = customer?.name || "this party";
      const err = sameDayDuplicateError(
        `Trying to create a duplicate builty entry on the same day for "${partyName}". Do you want to continue?`
      );
      err.existingId = existing._id;
      throw err;
    }
  }

  const warehouse = data.warehouse || (await inventoryService.getDefaultWarehouse())._id;
  await assertStockAvailable(items, warehouse);

  const builty = await Builty.create({
    builtyNo,
    billNo: data.billNo?.trim() || "",
    customer: data.customer,
    builtyDate,
    warehouse,
    items,
    totalAmount,
    amountPaid: 0,
    balance: totalAmount,
    paymentStatus: "unpaid",
    notes: data.notes?.trim() || "",
  });

  for (const line of items) {
    await inventoryService.recordMovement({
      itemType: "finished_good",
      direction: "out",
      reason: "sale",
      quantity: line.quantity,
      unit: "pcs",
      product: line.product,
      warehouse,
      refType: "builty",
      refId: builty._id,
      movementDate: builtyDate,
      notes: `Builty ${builtyNo}`,
    });
  }

  await CustomerLedgerEntry.create({
    customer: data.customer,
    type: "invoice",
    amount: totalAmount,
    builty: builty._id,
    entryDate: builtyDate,
    notes: `Builty ${builtyNo}`,
  });

  const paymentGiven = Number(data.amountPaid ?? data.paymentGiven ?? 0);
  if (Number.isFinite(paymentGiven) && paymentGiven > 0) {
    await recordBuiltyPayment(builty._id, {
      amount: paymentGiven,
      paymentDate: data.paymentDate || builtyDate,
      method: data.method,
      reference: data.reference,
      notes: data.paymentNotes,
    });
  }

  await syncCustomerBuiltyPaymentStatuses(data.customer);
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
    }
  }
  if (data.billNo !== undefined) builty.billNo = String(data.billNo || "").trim();
  if (data.builtyDate !== undefined) {
    builty.builtyDate = parseDate(data.builtyDate, "Builty date");
  }
  if (data.notes !== undefined) builty.notes = String(data.notes || "").trim();

  if (data.items !== undefined) {
    const { items, totalAmount } = await normalizeItems(data.items);
    const warehouse =
      builty.warehouse || (await inventoryService.getDefaultWarehouse())._id;

    for (const line of builty.items || []) {
      await inventoryService.recordMovement({
        itemType: "finished_good",
        direction: "in",
        reason: "adjustment",
        quantity: line.quantity,
        unit: "pcs",
        product: line.product,
        warehouse,
        refType: "builty_edit",
        refId: builty._id,
        movementDate: new Date(),
        notes: `Builty ${builty.builtyNo} edited (restore)`,
      });
    }

    await assertStockAvailable(items, warehouse);

    for (const line of items) {
      await inventoryService.recordMovement({
        itemType: "finished_good",
        direction: "out",
        reason: "sale",
        quantity: line.quantity,
        unit: "pcs",
        product: line.product,
        warehouse,
        refType: "builty",
        refId: builty._id,
        movementDate: builty.builtyDate,
        notes: `Builty ${builty.builtyNo} edited`,
      });
    }

    builty.items = items;
    builty.totalAmount = totalAmount;
    builty.warehouse = warehouse;

    const invoiceUpdate = await CustomerLedgerEntry.updateMany(
      { builty: builty._id, type: "invoice" },
      {
        $set: {
          amount: totalAmount,
          entryDate: builty.builtyDate,
          notes: `Builty ${builty.builtyNo}`,
        },
      }
    );
    if (!invoiceUpdate.matchedCount) {
      await CustomerLedgerEntry.create({
        customer: builty.customer,
        type: "invoice",
        amount: totalAmount,
        builty: builty._id,
        entryDate: builty.builtyDate,
        notes: `Builty ${builty.builtyNo}`,
      });
    }
  }

  await builty.save();
  await syncCustomerBuiltyPaymentStatuses(builty.customer);
  return getBuilty(builty._id);
}

async function setBuiltyAmountPaid(id, targetPaid, meta = {}) {
  const builty = await Builty.findById(id);
  if (!builty) throw httpError("Builty not found", 404);

  const target = roundMoney(Math.min(Math.max(0, Number(targetPaid) || 0), builty.totalAmount || 0));
  const payments = await CustomerPayment.find({ builty: builty._id }).sort({
    paymentDate: -1,
    createdAt: -1,
  });
  const current = roundMoney(payments.reduce((sum, p) => sum + (p.amount || 0), 0));
  const delta = roundMoney(target - current);

  if (Math.abs(delta) < 1e-9) {
    await refreshBuiltyTotals(builty);
    return getBuilty(builty._id);
  }

  if (delta > 0) {
    await recordBuiltyPayment(builty._id, {
      amount: delta,
      paymentDate: meta.paymentDate || new Date(),
      method: meta.method || "cash",
      notes: meta.notes || "Payment updated",
    });
    return getBuilty(builty._id);
  }

  let remaining = roundMoney(-delta);
  for (const payment of payments) {
    if (remaining <= 1e-9) break;
    if (payment.amount <= remaining + 1e-9) {
      remaining = roundMoney(remaining - payment.amount);
      await CustomerLedgerEntry.deleteMany({ payment: payment._id });
      await payment.deleteOne();
    } else {
      const nextAmount = roundMoney(payment.amount - remaining);
      payment.amount = nextAmount;
      await payment.save();
      await CustomerLedgerEntry.updateMany(
        { payment: payment._id },
        { $set: { amount: nextAmount } }
      );
      remaining = 0;
    }
  }

  await refreshBuiltyTotals(builty);
  return getBuilty(builty._id);
}

async function updateBuiltyPayment(builtyId, paymentId, data) {
  const builty = await Builty.findById(builtyId);
  if (!builty) throw httpError("Builty not found", 404);

  const payment = await CustomerPayment.findOne({ _id: paymentId, builty: builty._id });
  if (!payment) throw httpError("Payment not found", 404);

  const nextAmount =
    data.amount !== undefined ? Number(data.amount) : payment.amount;
  if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
    throw httpError("Payment amount must be greater than 0", 400);
  }

  const otherPaid = roundMoney(
    (await CustomerPayment.find({ builty: builty._id, _id: { $ne: payment._id } })).reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    )
  );
  const maxAllowed = roundMoney((builty.totalAmount || 0) - otherPaid);
  if (nextAmount > maxAllowed + 0.01) {
    throw httpError(`Payment exceeds remaining balance (${roundMoney(maxAllowed)})`, 400);
  }

  payment.amount = roundMoney(nextAmount);
  if (data.paymentDate !== undefined) {
    payment.paymentDate = parseDate(data.paymentDate, "Payment date");
  }
  if (data.method !== undefined) payment.method = data.method || "cash";
  if (data.reference !== undefined) payment.reference = String(data.reference || "").trim();
  if (data.notes !== undefined) payment.notes = String(data.notes || "").trim();
  await payment.save();

  await CustomerLedgerEntry.updateMany(
    { payment: payment._id },
    {
      $set: {
        amount: payment.amount,
        entryDate: payment.paymentDate,
        notes: payment.notes || `Payment on builty ${builty.builtyNo}`,
      },
    }
  );

  await refreshBuiltyTotals(builty);
  return getBuilty(builty._id);
}

async function removeBuiltyPayment(builtyId, paymentId) {
  const builty = await Builty.findById(builtyId);
  if (!builty) throw httpError("Builty not found", 404);

  const payment = await CustomerPayment.findOne({ _id: paymentId, builty: builty._id });
  if (!payment) throw httpError("Payment not found", 404);

  await CustomerLedgerEntry.deleteMany({ payment: payment._id });
  await payment.deleteOne();
  await refreshBuiltyTotals(builty);
  return getBuilty(builty._id);
}

async function recordBuiltyPayment(id, data) {
  const builty = await Builty.findById(id);
  if (!builty) throw httpError("Builty not found", 404);

  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError("Payment amount must be greater than 0", 400);
  }
  if (amount > builty.balance + 0.01) {
    throw httpError(`Payment exceeds remaining balance (${builty.balance})`, 400);
  }

  const payment = await CustomerPayment.create({
    customer: builty.customer,
    builty: builty._id,
    amount: roundMoney(amount),
    paymentDate: parseDate(data.paymentDate || new Date(), "Payment date"),
    method: data.method || "cash",
    reference: data.reference?.trim() || "",
    notes: data.notes?.trim() || "",
  });

  builty.amountPaid = roundMoney(builty.amountPaid + amount);
  builty.balance = roundMoney(Math.max(0, builty.totalAmount - builty.amountPaid));
  builty.paymentStatus = paymentStatusFor(builty.amountPaid, builty.totalAmount);
  await builty.save();

  await CustomerLedgerEntry.create({
    customer: builty.customer,
    type: "payment",
    amount: payment.amount,
    builty: builty._id,
    payment: payment._id,
    entryDate: payment.paymentDate,
    notes: data.notes?.trim() || `Payment on builty ${builty.builtyNo}`,
  });

  return getBuilty(builty._id);
}

/** Undo a builty: puts the goods back in stock and clears its ledger. */
async function removeBuilty(id) {
  const builty = await Builty.findById(id);
  if (!builty) throw httpError("Builty not found", 404);
  if ((builty.amountPaid || 0) > 0 || builty.paymentStatus === "paid") {
    throw httpError("Cannot delete a paid builty.", 409);
  }

  for (const line of builty.items) {
    await inventoryService.recordMovement({
      itemType: "finished_good",
      direction: "in",
      reason: "adjustment",
      quantity: line.quantity,
      unit: "pcs",
      product: line.product,
      warehouse: builty.warehouse,
      refType: "builty_delete",
      refId: builty._id,
      movementDate: new Date(),
      notes: `Builty ${builty.builtyNo} deleted`,
    });
  }

  await CustomerLedgerEntry.deleteMany({ builty: builty._id });
  const customerId = builty.customer;
  await builty.deleteOne();
  await syncCustomerBuiltyPaymentStatuses(customerId);
  return { deleted: true };
}

async function listPayments({ customer, builty, dateFrom, dateTo } = {}) {
  const filter = {};
  if (customer) filter.customer = customer;
  if (builty) filter.builty = builty;
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
    .populate("builty", "builtyNo billNo")
    .sort({ paymentDate: -1, createdAt: -1 });
}

async function listLedger(customerId) {
  await customerService.getById(customerId);
  const entries = await CustomerLedgerEntry.find({ customer: customerId })
    .populate("builty", "builtyNo billNo")
    .populate("payment", "amount method")
    .sort({ entryDate: -1, createdAt: -1 });
  const balance = await customerService.getBalance(customerId);
  return { entries, balance };
}

async function getSalesReport({ dateFrom, dateTo, groupId } = {}) {
  const mongoose = require("mongoose");
  const Customer = require("../customers/customer.model");
  const PartyGroup = require("../party-groups/party-group.model");

  const match = {};
  let groupMeta = null;

  if (groupId) {
    if (!mongoose.isValidObjectId(groupId)) throw httpError("Invalid party group", 400);
    const group = await PartyGroup.findById(groupId).lean();
    if (!group) throw httpError("Party group not found", 404);
    groupMeta = { id: String(group._id), name: group.name };
    const members = await Customer.find({ group: group._id }).select("_id").lean();
    const ids = members.map((m) => m._id);
    if (ids.length === 0) {
      return {
        period: { from: dateFrom || null, to: dateTo || null },
        group: groupMeta,
        totals: { orderCount: 0, totalSales: 0, totalPaid: 0, outstanding: 0 },
        outstanding: [],
        topCustomers: [],
        byGroup: [],
        whoOwes: [],
      };
    }
    match.customer = { $in: ids };
  }

  if (dateFrom || dateTo) {
    match.builtyDate = {};
    if (dateFrom) match.builtyDate.$gte = parseDate(dateFrom, "dateFrom");
    if (dateTo) {
      const end = parseDate(dateTo, "dateTo");
      end.setHours(23, 59, 59, 999);
      match.builtyDate.$lte = end;
    }
  }

  const outstandingMatch = { balance: { $gt: 0 } };
  if (match.customer) outstandingMatch.customer = match.customer;

  const outstanding = await Builty.find(outstandingMatch)
    .populate("customer", "name phone group")
    .sort({ balance: -1 });

  const byCustomer = await Builty.aggregate([
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

  const totals = await Builty.aggregate([
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

  const unpaidInvoices = outstanding.map((b) => ({
    orderId: b._id,
    orderNo: b.builtyNo,
    invoiceNo: b.billNo || b.builtyNo,
    customer: b.customer?.name || "Unknown",
    customerId: b.customer?._id,
    groupId: b.customer?.group ? String(b.customer.group) : "",
    orderDate: b.builtyDate,
    dueDate: null,
    totalAmount: b.totalAmount,
    amountPaid: b.amountPaid,
    balance: b.balance,
    paymentStatus: b.paymentStatus,
  }));

  const t = totals[0] || { orderCount: 0, totalSales: 0, totalPaid: 0, outstanding: 0 };

  const topCustomers = byCustomer.map((row) => ({
    customerId: row._id,
    name: row.customer?.name || "Unknown",
    groupId: row.customer?.group ? String(row.customer.group) : "",
    orderCount: row.orderCount,
    totalSales: roundMoney(row.totalSales),
    totalPaid: roundMoney(row.totalPaid),
    outstanding: roundMoney(row.outstanding),
  }));

  const allGroups = await PartyGroup.find({}).select("name").lean();
  const groupNameMap = new Map(allGroups.map((g) => [String(g._id), g.name]));
  const byGroupMap = new Map();
  for (const p of topCustomers) {
    const key = p.groupId || "__ungrouped__";
    const existing = byGroupMap.get(key);
    if (existing) {
      existing.orderCount += p.orderCount;
      existing.totalSales = roundMoney(existing.totalSales + p.totalSales);
      existing.totalPaid = roundMoney(existing.totalPaid + p.totalPaid);
      existing.outstanding = roundMoney(existing.outstanding + p.outstanding);
      existing.partyCount += 1;
    } else {
      byGroupMap.set(key, {
        groupId: p.groupId || "",
        name: p.groupId ? groupNameMap.get(p.groupId) || "—" : "Ungrouped",
        orderCount: p.orderCount,
        totalSales: p.totalSales,
        totalPaid: p.totalPaid,
        outstanding: p.outstanding,
        partyCount: 1,
      });
    }
  }
  const byGroup = [...byGroupMap.values()].sort((a, b) => b.totalSales - a.totalSales);

  return {
    period: { from: dateFrom || null, to: dateTo || null },
    group: groupMeta,
    totals: {
      orderCount: t.orderCount,
      totalSales: roundMoney(t.totalSales || 0),
      totalPaid: roundMoney(t.totalPaid || 0),
      outstanding: roundMoney(t.outstanding || 0),
      partyCount: topCustomers.length,
      groupCount: byGroup.length,
    },
    outstanding: unpaidInvoices,
    topCustomers,
    byGroup,
    whoOwes: unpaidInvoices
      .reduce((acc, inv) => {
        const key = String(inv.customerId || inv.customer);
        const existing = acc.find((a) => a.customerId === key);
        if (existing) {
          existing.balance = roundMoney(existing.balance + inv.balance);
          existing.invoices += 1;
        } else {
          acc.push({ customerId: key, name: inv.customer, balance: inv.balance, invoices: 1 });
        }
        return acc;
      }, [])
      .sort((a, b) => b.balance - a.balance),
  };
}

module.exports = {
  listBuilties,
  getBuilty,
  createBuilty,
  updateBuilty,
  recordBuiltyPayment,
  updateBuiltyPayment,
  removeBuiltyPayment,
  removeBuilty,
  listPayments,
  listLedger,
  getSalesReport,
  syncCustomerBuiltyPaymentStatuses,
};
