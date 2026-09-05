const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { VaultConfig, VaultAsset, VaultSnapshot } = require("./vault.model");

const PIN_ROUNDS = 12;
const VAULT_TOKEN_TTL = "30m";
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const CONFIG_KEY = "default";

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function assertPin(pin) {
  const value = String(pin ?? "").trim();
  if (!/^\d{6}$/.test(value)) {
    throw httpError("Vault PIN must be exactly 6 digits", 400);
  }
  return value;
}

function signVaultToken(userId) {
  return jwt.sign(
    { sub: String(userId), typ: "vault" },
    process.env.JWT_SECRET,
    { expiresIn: VAULT_TOKEN_TTL }
  );
}

function verifyVaultToken(token) {
  if (!token) throw httpError("Vault unlock required", 403);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload?.typ !== "vault" || !payload?.sub) {
      throw httpError("Vault unlock required", 403);
    }
    return payload;
  } catch (err) {
    if (err.statusCode) throw err;
    throw httpError("Vault session expired — unlock again", 403);
  }
}

async function getConfig() {
  return VaultConfig.findOne({ key: CONFIG_KEY });
}

async function getStatus() {
  const config = await getConfig();
  const lockedUntil = config?.lockedUntil ? new Date(config.lockedUntil) : null;
  const now = new Date();
  return {
    configured: Boolean(config?.pinHash),
    locked: Boolean(lockedUntil && lockedUntil > now),
    lockedUntil: lockedUntil && lockedUntil > now ? lockedUntil.toISOString() : null,
  };
}

async function setup({ pin, confirmPin }) {
  const existing = await getConfig();
  if (existing?.pinHash) {
    throw httpError("Vault PIN is already set", 409);
  }
  const value = assertPin(pin);
  if (value !== String(confirmPin ?? "").trim()) {
    throw httpError("PIN confirmation does not match", 400);
  }
  const pinHash = await bcrypt.hash(value, PIN_ROUNDS);
  await VaultConfig.create({
    key: CONFIG_KEY,
    pinHash,
    failedAttempts: 0,
    lockedUntil: null,
  });
  return { ok: true, configured: true };
}

async function unlock({ pin, userId }) {
  const config = await getConfig();
  if (!config?.pinHash) {
    throw httpError("Set up a vault PIN first", 400);
  }

  const now = new Date();
  if (config.lockedUntil && new Date(config.lockedUntil) > now) {
    throw httpError("Vault temporarily locked — try again later", 429);
  }

  const value = assertPin(pin);
  const ok = await bcrypt.compare(value, config.pinHash);
  if (!ok) {
    config.failedAttempts = (config.failedAttempts || 0) + 1;
    if (config.failedAttempts >= MAX_ATTEMPTS) {
      config.lockedUntil = new Date(now.getTime() + LOCK_MS);
      config.failedAttempts = 0;
      await config.save();
      throw httpError("Too many attempts — vault locked for 15 minutes", 429);
    }
    await config.save();
    const left = MAX_ATTEMPTS - config.failedAttempts;
    throw httpError(`Wrong vault PIN (${left} tries left)`, 401);
  }

  config.failedAttempts = 0;
  config.lockedUntil = null;
  await config.save();

  return {
    vaultToken: signVaultToken(userId),
    expiresIn: VAULT_TOKEN_TTL,
  };
}

async function changePin({ currentPin, newPin, confirmPin }) {
  const config = await getConfig();
  if (!config?.pinHash) throw httpError("Vault is not set up", 400);

  const current = assertPin(currentPin);
  const next = assertPin(newPin);
  if (next !== String(confirmPin ?? "").trim()) {
    throw httpError("New PIN confirmation does not match", 400);
  }
  if (current === next) {
    throw httpError("New PIN must be different", 400);
  }

  const ok = await bcrypt.compare(current, config.pinHash);
  if (!ok) throw httpError("Current vault PIN is wrong", 401);

  config.pinHash = await bcrypt.hash(next, PIN_ROUNDS);
  config.failedAttempts = 0;
  config.lockedUntil = null;
  await config.save();
  return { ok: true };
}

function serializeAsset(doc) {
  return {
    id: String(doc._id),
    owner: doc.owner,
    kind: doc.kind,
    name: doc.name,
    institution: doc.institution || "",
    amount: roundMoney(doc.amount),
    notes: doc.notes || "",
    sortOrder: doc.sortOrder || 0,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

async function recordSnapshot(asset, recordedAt = new Date()) {
  const at = recordedAt instanceof Date ? recordedAt : new Date(recordedAt);
  const year = at.getFullYear();
  const month = at.getMonth() + 1;
  await VaultSnapshot.findOneAndUpdate(
    { asset: asset._id, year, month },
    {
      asset: asset._id,
      owner: asset.owner,
      kind: asset.kind,
      name: asset.name,
      amount: roundMoney(asset.amount),
      recordedAt: at,
      year,
      month,
    },
    { upsert: true, new: true }
  );
}

async function listAssets() {
  const rows = await VaultAsset.find().sort({ owner: 1, sortOrder: 1, name: 1 }).lean();
  const assets = rows.map(serializeAsset);
  const personal = roundMoney(
    assets.filter((a) => a.owner === "personal").reduce((s, a) => s + a.amount, 0)
  );
  const company = roundMoney(
    assets.filter((a) => a.owner === "company").reduce((s, a) => s + a.amount, 0)
  );
  return {
    assets,
    totals: {
      personal,
      company,
      all: roundMoney(personal + company),
      count: assets.length,
    },
  };
}

async function createAsset(body) {
  const owner = body.owner === "company" ? "company" : "personal";
  const kind = ["bank", "cash", "property", "investment", "other"].includes(body.kind)
    ? body.kind
    : "bank";
  const name = String(body.name || "").trim();
  if (!name) throw httpError("Asset name is required", 400);
  const amount = roundMoney(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw httpError("Amount must be 0 or more", 400);
  }

  const asset = await VaultAsset.create({
    owner,
    kind,
    name,
    institution: String(body.institution || "").trim(),
    amount,
    notes: String(body.notes || "").trim(),
    sortOrder: Number(body.sortOrder) || 0,
  });
  await recordSnapshot(asset);
  return serializeAsset(asset);
}

async function updateAsset(id, body) {
  const asset = await VaultAsset.findById(id);
  if (!asset) throw httpError("Asset not found", 404);

  if (body.owner === "personal" || body.owner === "company") asset.owner = body.owner;
  if (["bank", "cash", "property", "investment", "other"].includes(body.kind)) {
    asset.kind = body.kind;
  }
  if (body.name != null) {
    const name = String(body.name).trim();
    if (!name) throw httpError("Asset name is required", 400);
    asset.name = name;
  }
  if (body.institution != null) asset.institution = String(body.institution).trim();
  if (body.notes != null) asset.notes = String(body.notes).trim();
  if (body.sortOrder != null) asset.sortOrder = Number(body.sortOrder) || 0;

  let amountChanged = false;
  if (body.amount != null) {
    const amount = roundMoney(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw httpError("Amount must be 0 or more", 400);
    }
    if (amount !== roundMoney(asset.amount)) amountChanged = true;
    asset.amount = amount;
  }

  await asset.save();
  if (amountChanged || body.recordSnapshot) {
    await recordSnapshot(asset, body.snapshotDate ? new Date(body.snapshotDate) : new Date());
  }
  return serializeAsset(asset);
}

async function removeAsset(id) {
  const asset = await VaultAsset.findById(id);
  if (!asset) throw httpError("Asset not found", 404);
  await VaultSnapshot.deleteMany({ asset: asset._id });
  await asset.deleteOne();
  return { ok: true };
}

async function getYearSummary(yearQuery) {
  const now = new Date();
  const yearNum = Number(yearQuery);
  const year =
    Number.isFinite(yearNum) && yearNum >= 2000 && yearNum <= 2100
      ? Math.trunc(yearNum)
      : now.getFullYear();

  const snapshots = await VaultSnapshot.find({ year }).lean();
  const byMonth = Array.from({ length: 12 }, (_, i) => ({
    year,
    month: i + 1,
    label: `${year}-${String(i + 1).padStart(2, "0")}`,
    personal: 0,
    company: 0,
    all: 0,
  }));

  // Latest snapshot per asset per month wins
  const latestByMonthAsset = new Map();
  for (const s of snapshots) {
    const key = `${s.month}:${String(s.asset)}`;
    const prev = latestByMonthAsset.get(key);
    if (!prev || new Date(s.recordedAt) > new Date(prev.recordedAt)) {
      latestByMonthAsset.set(key, s);
    }
  }

  for (const s of latestByMonthAsset.values()) {
    const row = byMonth[s.month - 1];
    if (!row) continue;
    const amt = roundMoney(s.amount);
    if (s.owner === "company") row.company = roundMoney(row.company + amt);
    else row.personal = roundMoney(row.personal + amt);
    row.all = roundMoney(row.personal + row.company);
  }

  // Carry forward last known balances into later empty months within the year
  let lastPersonal = 0;
  let lastCompany = 0;
  let sawAny = false;
  for (const row of byMonth) {
    const hasData = [...latestByMonthAsset.keys()].some((k) => k.startsWith(`${row.month}:`));
    if (hasData) {
      lastPersonal = row.personal;
      lastCompany = row.company;
      sawAny = true;
    } else if (sawAny) {
      row.personal = lastPersonal;
      row.company = lastCompany;
      row.all = roundMoney(lastPersonal + lastCompany);
    }
  }

  const live = await listAssets();
  const yearEnd = byMonth[11];

  return {
    year,
    current: live.totals,
    yearEnd: {
      personal: yearEnd.personal,
      company: yearEnd.company,
      all: yearEnd.all,
    },
    months: byMonth,
  };
}

module.exports = {
  getStatus,
  setup,
  unlock,
  changePin,
  verifyVaultToken,
  listAssets,
  createAsset,
  updateAsset,
  removeAsset,
  getYearSummary,
};
