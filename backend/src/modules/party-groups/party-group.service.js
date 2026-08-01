const mongoose = require("mongoose");
const PartyGroup = require("./party-group.model");
const Customer = require("../customers/customer.model");
const CustomerLedgerEntry = require("../customers/customer-ledger.model");

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function normalizeIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [
    ...new Set(
      ids
        .map((id) => String(id || "").trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    ),
  ];
}

async function create(data) {
  const name = data.name?.trim();
  if (!name) throw httpError("Group name is required", 400);

  const existing = await PartyGroup.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") });
  if (existing) throw httpError("A group with this name already exists", 409);

  const group = await PartyGroup.create({
    name,
    notes: data.notes?.trim() || "",
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
  });

  if (data.partyIds) {
    await setMembers(group._id, data.partyIds);
  }

  return getWithMembers(group._id);
}

async function list({ q, active } = {}) {
  const filter = {};
  if (active === "true" || active === true) filter.isActive = true;
  if (active === "false" || active === false) filter.isActive = false;
  if (q?.trim()) {
    filter.name = new RegExp(q.trim(), "i");
  }

  const groups = await PartyGroup.find(filter).sort({ name: 1 }).lean();
  const counts = await Customer.aggregate([
    { $match: { group: { $in: groups.map((g) => g._id) } } },
    { $group: { _id: "$group", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  return groups.map((g) => ({
    ...g,
    partyCount: countMap.get(String(g._id)) || 0,
  }));
}

async function getById(id) {
  const group = await PartyGroup.findById(id);
  if (!group) throw httpError("Party group not found", 404);
  return group;
}

async function getWithMembers(id) {
  const group = await getById(id);
  const parties = await Customer.find({ group: id })
    .select("name phone isActive")
    .sort({ name: 1 })
    .lean();

  const ids = parties.map((p) => p._id);
  const balanceMap = new Map();
  if (ids.length) {
    const balances = await CustomerLedgerEntry.aggregate([
      { $match: { customer: { $in: ids } } },
      {
        $group: {
          _id: "$customer",
          balance: {
            $sum: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ["$type", "payment"] },
                    then: { $multiply: ["$amount", -1] },
                  },
                  {
                    case: { $eq: ["$type", "adjustment"] },
                    then: { $ifNull: ["$signedAmount", 0] },
                  },
                ],
                default: "$amount",
              },
            },
          },
        },
      },
    ]);
    for (const row of balances) {
      balanceMap.set(String(row._id), roundMoney(row.balance || 0));
    }
  }

  return {
    ...group.toObject(),
    parties: parties.map((p) => ({
      ...p,
      balance: balanceMap.get(String(p._id)) || 0,
    })),
    partyCount: parties.length,
  };
}

async function setMembers(groupId, partyIds) {
  await getById(groupId);
  const ids = normalizeIds(partyIds);

  if (ids.length) {
    const candidates = await Customer.find({ _id: { $in: ids } })
      .select("name group")
      .lean();
    const taken = candidates.filter(
      (c) => c.group && String(c.group) !== String(groupId)
    );
    if (taken.length) {
      throw httpError(
        `Already in another group: ${taken.map((c) => c.name).join(", ")}. Change group from the party edit instead.`,
        409
      );
    }
  }

  await Customer.updateMany(
    { group: groupId, ...(ids.length ? { _id: { $nin: ids } } : {}) },
    { $set: { group: null } }
  );

  if (ids.length) {
    await Customer.updateMany(
      {
        _id: { $in: ids },
        $or: [{ group: null }, { group: groupId }],
      },
      { $set: { group: groupId } }
    );
  }
}

async function update(id, data) {
  const group = await getById(id);

  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw httpError("Group name is required", 400);
    const existing = await PartyGroup.findOne({
      _id: { $ne: id },
      name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    });
    if (existing) throw httpError("A group with this name already exists", 409);
    group.name = name;
  }
  if (data.notes !== undefined) group.notes = data.notes.trim();
  if (data.isActive !== undefined) group.isActive = Boolean(data.isActive);
  await group.save();

  if (data.partyIds !== undefined) {
    await setMembers(id, data.partyIds);
  }

  return getWithMembers(id);
}

async function remove(id) {
  const group = await getById(id);
  await Customer.updateMany({ group: id }, { $set: { group: null } });
  await group.deleteOne();
  return { ok: true };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  create,
  list,
  getById,
  getWithMembers,
  setMembers,
  update,
  remove,
};
