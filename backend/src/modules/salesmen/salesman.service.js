const Salesman = require("./salesman.model");
const SalesOrder = require("../orders/order.model");

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function create(data) {
  const name = data.name?.trim();
  if (!name) throw httpError("Name is required", 400);
  return Salesman.create({
    name,
    phone: data.phone?.trim() || "",
    notes: data.notes?.trim() || "",
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
  });
}

async function list({ q, active } = {}) {
  const filter = {};
  if (active === "true" || active === true) filter.isActive = true;
  if (active === "false" || active === false) filter.isActive = false;
  if (q?.trim()) {
    const term = q.trim();
    filter.$or = [
      { name: new RegExp(term, "i") },
      { phone: new RegExp(term, "i") },
    ];
  }
  return Salesman.find(filter).sort({ name: 1 });
}

async function getById(id) {
  const salesman = await Salesman.findById(id);
  if (!salesman) throw httpError("Salesman not found", 404);
  return salesman;
}

async function update(id, data) {
  const salesman = await getById(id);
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw httpError("Name is required", 400);
    salesman.name = name;
  }
  if (data.phone !== undefined) salesman.phone = data.phone.trim();
  if (data.notes !== undefined) salesman.notes = data.notes.trim();
  if (data.isActive !== undefined) salesman.isActive = Boolean(data.isActive);
  await salesman.save();
  return salesman;
}

async function remove(id) {
  const salesman = await getById(id);
  const orderCount = await SalesOrder.countDocuments({ salesmanRef: id });
  if (orderCount > 0) {
    throw httpError("Cannot delete salesman with orders. Deactivate instead.", 409);
  }
  await salesman.deleteOne();
  return { ok: true };
}

module.exports = { create, list, getById, update, remove };
