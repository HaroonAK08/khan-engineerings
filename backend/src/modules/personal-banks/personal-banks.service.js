const bcrypt = require("bcryptjs");
const {
  PersonalBanksAuth,
  PersonalBank,
  PersonalAccount,
  PersonalTransaction,
} = require("./personal-banks.model");
const { signPersonalBanksToken } = require("./personal-banks.auth");

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parseDate(value, label = "Date") {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw httpError(`${label} is invalid`, 400);
  return d;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertPin(pin) {
  const s = String(pin || "").trim();
  if (!/^\d{4}$/.test(s)) throw httpError("PIN must be exactly 4 digits", 400);
  return s;
}

async function getAuthDoc() {
  let doc = await PersonalBanksAuth.findOne({ key: "personal_banks" });
  if (!doc) {
    doc = await PersonalBanksAuth.create({ key: "personal_banks" });
  }
  return doc;
}

async function authStatus() {
  const doc = await getAuthDoc();
  const locked =
    doc.lockUntil && new Date(doc.lockUntil).getTime() > Date.now();
  return {
    setupRequired: !doc.pinHash,
    locked: Boolean(locked),
    lockUntil: locked ? doc.lockUntil : null,
  };
}

async function setupPin(pin) {
  const doc = await getAuthDoc();
  if (doc.pinHash) throw httpError("PIN already set — unlock instead", 400);
  const code = assertPin(pin);
  doc.pinHash = await bcrypt.hash(code, 10);
  doc.failedAttempts = 0;
  doc.lockUntil = null;
  await doc.save();
  return { token: signPersonalBanksToken(), ...await authStatus() };
}

async function unlock(pin) {
  const doc = await getAuthDoc();
  if (!doc.pinHash) throw httpError("Set up a PIN first", 400);

  if (doc.lockUntil && new Date(doc.lockUntil).getTime() > Date.now()) {
    throw httpError("Too many wrong PINs — wait 15 minutes", 429);
  }

  const code = assertPin(pin);
  const ok = await bcrypt.compare(code, doc.pinHash);
  if (!ok) {
    doc.failedAttempts = (doc.failedAttempts || 0) + 1;
    if (doc.failedAttempts >= MAX_FAILS) {
      doc.lockUntil = new Date(Date.now() + LOCK_MS);
      doc.failedAttempts = 0;
    }
    await doc.save();
    throw httpError("Wrong PIN", 401);
  }

  doc.failedAttempts = 0;
  doc.lockUntil = null;
  await doc.save();
  return { token: signPersonalBanksToken(), ...await authStatus() };
}

async function changePin({ currentPin, newPin }) {
  const doc = await getAuthDoc();
  if (!doc.pinHash) throw httpError("Set up a PIN first", 400);
  const current = assertPin(currentPin);
  const next = assertPin(newPin);
  const ok = await bcrypt.compare(current, doc.pinHash);
  if (!ok) throw httpError("Current PIN is wrong", 401);
  doc.pinHash = await bcrypt.hash(next, 10);
  doc.failedAttempts = 0;
  doc.lockUntil = null;
  await doc.save();
  return { ok: true };
}

async function resetPin({ factoryPin, newPin }) {
  const APP_PIN = process.env.APP_PIN || "3811";
  if (String(factoryPin || "") !== APP_PIN) {
    throw httpError("Factory unlock code is wrong", 401);
  }
  const doc = await getAuthDoc();
  const next = assertPin(newPin);
  doc.pinHash = await bcrypt.hash(next, 10);
  doc.failedAttempts = 0;
  doc.lockUntil = null;
  await doc.save();
  return { ok: true };
}

async function summary() {
  const banks = await listBanks();
  const grandTotal = roundMoney(banks.reduce((s, b) => s + (b.totalBalance || 0), 0));
  const accountCount = banks.reduce((s, b) => s + (b.accountCount || 0), 0);
  return { banks, grandTotal, accountCount };
}

async function listBanks() {
  const banks = await PersonalBank.find().sort({ sortOrder: 1, name: 1 }).lean();
  const totals = await PersonalAccount.aggregate([
    {
      $group: {
        _id: "$bank",
        accountCount: { $sum: 1 },
        totalBalance: { $sum: { $ifNull: ["$balance", 0] } },
      },
    },
  ]);
  const byId = new Map(totals.map((t) => [String(t._id), t]));
  return banks.map((b) => {
    const row = byId.get(String(b._id));
    return {
      ...b,
      accountCount: row?.accountCount || 0,
      totalBalance: roundMoney(row?.totalBalance || 0),
    };
  });
}

async function createBank(data) {
  const name = String(data.name || "").trim();
  if (!name) throw httpError("Bank name is required", 400);
  const existing = await PersonalBank.findOne({
    name: new RegExp(`^${escapeRegex(name)}$`, "i"),
  });
  if (existing) throw httpError("A bank with this name already exists", 409);
  return PersonalBank.create({
    name,
    notes: String(data.notes || "").trim(),
    sortOrder: Number(data.sortOrder) || 0,
  });
}

async function updateBank(id, data) {
  const bank = await PersonalBank.findById(id);
  if (!bank) throw httpError("Bank not found", 404);
  if (data.name !== undefined) {
    const name = String(data.name || "").trim();
    if (!name) throw httpError("Bank name is required", 400);
    const existing = await PersonalBank.findOne({
      _id: { $ne: bank._id },
      name: new RegExp(`^${escapeRegex(name)}$`, "i"),
    });
    if (existing) throw httpError("A bank with this name already exists", 409);
    bank.name = name;
  }
  if (data.notes !== undefined) bank.notes = String(data.notes || "").trim();
  if (data.sortOrder !== undefined) bank.sortOrder = Number(data.sortOrder) || 0;
  await bank.save();
  return bank;
}

async function removeBank(id) {
  const bank = await PersonalBank.findById(id);
  if (!bank) throw httpError("Bank not found", 404);
  await PersonalTransaction.deleteMany({ bank: id });
  await PersonalAccount.deleteMany({ bank: id });
  await bank.deleteOne();
  return { ok: true };
}

async function listAccounts({ bank } = {}) {
  const filter = {};
  if (bank) filter.bank = bank;
  return PersonalAccount.find(filter)
    .populate("bank", "name")
    .sort({ sortOrder: 1, name: 1 });
}

async function createAccount(data) {
  const name = String(data.name || "").trim();
  if (!name) throw httpError("Account name is required", 400);
  if (!data.bank) throw httpError("Bank is required", 400);
  const bank = await PersonalBank.findById(data.bank);
  if (!bank) throw httpError("Bank not found", 404);

  const balance = roundMoney(data.balance);
  if (!Number.isFinite(balance)) throw httpError("Balance is invalid", 400);

  const account = await PersonalAccount.create({
    bank: bank._id,
    name,
    balance,
    notes: String(data.notes || "").trim(),
    sortOrder: Number(data.sortOrder) || 0,
  });

  if (Math.abs(balance) > 0.001) {
    await PersonalTransaction.create({
      account: account._id,
      bank: bank._id,
      type: "deposit",
      amount: Math.abs(balance),
      balanceAfter: balance,
      recipient: "",
      notes: balance >= 0 ? "Opening balance" : "Opening balance (negative)",
      txnDate: new Date(),
    });
  }

  return PersonalAccount.findById(account._id).populate("bank", "name");
}

async function updateAccount(id, data) {
  const account = await PersonalAccount.findById(id);
  if (!account) throw httpError("Account not found", 404);

  if (data.bank !== undefined) {
    const bank = await PersonalBank.findById(data.bank);
    if (!bank) throw httpError("Bank not found", 404);
    account.bank = bank._id;
  }
  if (data.name !== undefined) {
    const name = String(data.name || "").trim();
    if (!name) throw httpError("Account name is required", 400);
    account.name = name;
  }
  if (data.notes !== undefined) account.notes = String(data.notes || "").trim();
  if (data.sortOrder !== undefined) account.sortOrder = Number(data.sortOrder) || 0;

  if (data.balance !== undefined) {
    const next = roundMoney(data.balance);
    if (!Number.isFinite(next)) throw httpError("Balance is invalid", 400);
    const prev = roundMoney(account.balance);
    const delta = roundMoney(next - prev);
    account.balance = next;
    await account.save();
    if (Math.abs(delta) > 0.001) {
      await PersonalTransaction.create({
        account: account._id,
        bank: account.bank,
        type: "adjust",
        amount: Math.abs(delta),
        balanceAfter: next,
        recipient: "",
        notes: String(data.adjustNotes || data.notes || "Balance adjusted").trim(),
        txnDate: data.txnDate ? parseDate(data.txnDate, "Date") : new Date(),
      });
    }
    return PersonalAccount.findById(account._id).populate("bank", "name");
  }

  await account.save();
  return PersonalAccount.findById(account._id).populate("bank", "name");
}

async function removeAccount(id) {
  const account = await PersonalAccount.findById(id);
  if (!account) throw httpError("Account not found", 404);
  await PersonalTransaction.deleteMany({ account: id });
  await account.deleteOne();
  return { ok: true };
}

async function deposit(data) {
  const account = await PersonalAccount.findById(data.account);
  if (!account) throw httpError("Account not found", 404);
  const amount = roundMoney(data.amount);
  if (!(amount > 0)) throw httpError("Amount must be greater than 0", 400);
  account.balance = roundMoney(account.balance + amount);
  await account.save();
  const txn = await PersonalTransaction.create({
    account: account._id,
    bank: account.bank,
    type: "deposit",
    amount,
    balanceAfter: account.balance,
    recipient: "",
    notes: String(data.notes || "").trim(),
    txnDate: data.txnDate ? parseDate(data.txnDate, "Date") : new Date(),
  });
  return {
    account: await PersonalAccount.findById(account._id).populate("bank", "name"),
    transaction: txn,
  };
}

async function send(data) {
  const account = await PersonalAccount.findById(data.account);
  if (!account) throw httpError("Account not found", 404);
  const amount = roundMoney(data.amount);
  if (!(amount > 0)) throw httpError("Amount must be greater than 0", 400);
  const recipient = String(data.recipient || "").trim();
  if (!recipient) throw httpError("Recipient name is required", 400);

  if (account.balance + 1e-9 < amount) {
    throw httpError("Insufficient balance", 400);
  }

  account.balance = roundMoney(account.balance - amount);
  await account.save();

  const txn = await PersonalTransaction.create({
    account: account._id,
    bank: account.bank,
    type: "send",
    amount,
    balanceAfter: account.balance,
    recipient,
    notes: String(data.notes || "").trim(),
    txnDate: data.txnDate ? parseDate(data.txnDate, "Date") : new Date(),
  });

  return {
    account: await PersonalAccount.findById(account._id).populate("bank", "name"),
    transaction: txn,
  };
}

async function listTransactions({ account, bank, type, q, recipient, limit } = {}) {
  const filter = {};
  if (account) filter.account = account;
  if (bank) filter.bank = bank;
  if (type) filter.type = type;
  if (recipient?.trim()) {
    filter.recipient = new RegExp(`^${escapeRegex(recipient.trim())}$`, "i");
  } else if (q?.trim()) {
    filter.$or = [
      { recipient: new RegExp(escapeRegex(q.trim()), "i") },
      { notes: new RegExp(escapeRegex(q.trim()), "i") },
    ];
  }
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 500);
  return PersonalTransaction.find(filter)
    .populate("account", "name")
    .populate("bank", "name")
    .sort({ txnDate: -1, createdAt: -1 })
    .limit(cap);
}

async function listPeople({ q, limit } = {}) {
  const match = {
    type: "send",
    recipient: { $exists: true, $nin: [null, ""] },
  };
  if (q?.trim()) {
    match.recipient = new RegExp(escapeRegex(q.trim()), "i");
  }

  const cap = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const rows = await PersonalTransaction.aggregate([
    { $match: match },
    { $sort: { txnDate: -1, createdAt: -1 } },
    {
      $group: {
        _id: { $toLower: { $trim: { input: "$recipient" } } },
        name: { $first: "$recipient" },
        totalSent: { $sum: "$amount" },
        count: { $sum: 1 },
        lastTxnDate: { $first: "$txnDate" },
      },
    },
    { $sort: { lastTxnDate: -1 } },
    { $limit: cap },
    {
      $project: {
        _id: 0,
        name: 1,
        totalSent: { $round: ["$totalSent", 2] },
        count: 1,
        lastTxnDate: 1,
      },
    },
  ]);

  return rows;
}

function recipientFilter(name) {
  return new RegExp(`^${escapeRegex(String(name || "").trim())}$`, "i");
}

async function renamePerson({ name, newName }) {
  const from = String(name || "").trim();
  const to = String(newName || "").trim();
  if (!from) throw httpError("Person name is required", 400);
  if (!to) throw httpError("New name is required", 400);
  if (from.toLowerCase() === to.toLowerCase() && from !== to) {
    await PersonalTransaction.updateMany(
      { type: "send", recipient: recipientFilter(from) },
      { $set: { recipient: to } }
    );
    return { ok: true, name: to };
  }
  if (from.toLowerCase() === to.toLowerCase()) return { ok: true, name: to };

  const result = await PersonalTransaction.updateMany(
    { type: "send", recipient: recipientFilter(from) },
    { $set: { recipient: to } }
  );
  if (!result.matchedCount) throw httpError("Person not found", 404);
  return { ok: true, name: to };
}

async function removePerson({ name }) {
  const from = String(name || "").trim();
  if (!from) throw httpError("Person name is required", 400);
  const txns = await PersonalTransaction.find({
    type: "send",
    recipient: recipientFilter(from),
  });
  for (const txn of txns) {
    await removeTransaction(txn._id);
  }
  return { ok: true, removed: txns.length };
}

async function removeTransaction(id) {
  const txn = await PersonalTransaction.findById(id);
  if (!txn) throw httpError("Transaction not found", 404);

  const account = await PersonalAccount.findById(txn.account);
  if (account) {
    if (txn.type === "send") {
      account.balance = roundMoney(account.balance + txn.amount);
      await account.save();
    } else if (txn.type === "deposit") {
      account.balance = roundMoney(account.balance - txn.amount);
      await account.save();
    }
  }

  await txn.deleteOne();
  return { ok: true };
}

async function updateTransaction(id, data) {
  const txn = await PersonalTransaction.findById(id);
  if (!txn) throw httpError("Transaction not found", 404);

  if (data.recipient !== undefined) {
    if (txn.type !== "send") throw httpError("Only send entries have a recipient", 400);
    const recipient = String(data.recipient || "").trim();
    if (!recipient) throw httpError("Recipient name is required", 400);
    txn.recipient = recipient;
  }
  if (data.notes !== undefined) txn.notes = String(data.notes || "").trim();

  if (data.amount !== undefined) {
    const nextAmount = roundMoney(data.amount);
    if (!(nextAmount > 0)) throw httpError("Amount must be greater than 0", 400);
    const account = await PersonalAccount.findById(txn.account);
    if (!account) throw httpError("Account not found", 404);
    const prev = roundMoney(txn.amount);
    const delta = roundMoney(nextAmount - prev);

    if (txn.type === "send") {
      if (delta > 0 && account.balance + 1e-9 < delta) {
        throw httpError("Insufficient balance", 400);
      }
      account.balance = roundMoney(account.balance - delta);
      txn.amount = nextAmount;
      txn.balanceAfter = account.balance;
      await account.save();
    } else if (txn.type === "deposit") {
      account.balance = roundMoney(account.balance + delta);
      txn.amount = nextAmount;
      txn.balanceAfter = account.balance;
      await account.save();
    } else {
      throw httpError("Adjust entries cannot change amount here", 400);
    }
  }

  await txn.save();
  return PersonalTransaction.findById(txn._id)
    .populate("account", "name")
    .populate("bank", "name");
}

module.exports = {
  authStatus,
  setupPin,
  unlock,
  changePin,
  resetPin,
  summary,
  listBanks,
  createBank,
  updateBank,
  removeBank,
  listAccounts,
  createAccount,
  updateAccount,
  removeAccount,
  deposit,
  send,
  listTransactions,
  listPeople,
  renamePerson,
  removePerson,
  removeTransaction,
  updateTransaction,
};
