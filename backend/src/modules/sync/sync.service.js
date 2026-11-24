const crypto = require("crypto");
const { SyncUpload, SyncChunk } = require("./sync.model");

const MAX_CHUNK_BYTES = 64 * 1024;
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;

function httpError(message, status = 400) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

function ownerId(user) {
  return user?.sub || user?._id;
}

function assertDevice(deviceId) {
  if (!deviceId || !/^[A-Za-z0-9._:-]{8,128}$/.test(deviceId)) {
    throw httpError("A valid desktop device id is required", 400);
  }
}

function assertHash(value, label) {
  if (!/^[a-f0-9]{64}$/i.test(String(value || ""))) {
    throw httpError(`${label} must be a SHA-256 hash`, 400);
  }
}

async function begin({ user, deviceId, manifest }) {
  assertDevice(deviceId);
  const owner = ownerId(user);
  const encryptedSize = Number(manifest?.encryptedSize);
  const chunkSize = Number(manifest?.chunkSize);
  const chunkCount = Number(manifest?.chunkCount);
  if (!manifest?.snapshotId || !Number.isInteger(manifest.sequence) || manifest.sequence < 1) {
    throw httpError("Invalid backup manifest");
  }
  if (!Number.isInteger(encryptedSize) || encryptedSize < 1 || encryptedSize > MAX_ARCHIVE_BYTES) {
    throw httpError("Backup archive is too large or invalid", 413);
  }
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_CHUNK_BYTES) {
    throw httpError("Invalid backup chunk size");
  }
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 10000) {
    throw httpError("Invalid backup chunk count");
  }
  assertHash(manifest.archiveSha256, "archiveSha256");
  if (manifest.protocolVersion !== 1 || !/^[\w:-]{8,200}$/.test(manifest.snapshotId) ||
      chunkCount !== Math.ceil(encryptedSize / chunkSize) ||
      !/^[A-Za-z0-9+/]{16}$/.test(manifest.nonce || "") ||
      !/^[A-Za-z0-9+/]{22}==$/.test(manifest.authTag || "")) throw httpError("Invalid archive metadata");

  const existing = await SyncUpload.findOne({ owner, deviceId, snapshotId: manifest.snapshotId });
  if (existing) return existing;

  const latest = await SyncUpload.findOne({ owner, deviceId, status: "complete" }).sort({ sequence: -1 });
  if (latest && manifest.sequence <= latest.sequence) {
    throw httpError("Backup sequence is not newer than the latest cloud backup", 409);
  }

  return SyncUpload.create({
    owner,
    deviceId,
    snapshotId: manifest.snapshotId,
    sequence: manifest.sequence,
    archiveSha256: manifest.archiveSha256,
    nonce: manifest.nonce,
    authTag: manifest.authTag,
    encryptedSize,
    chunkSize,
    chunkCount,
    protocolVersion: Number(manifest.protocolVersion) || 1,
    schemaVersion: String(manifest.schemaVersion || "1"),
  });
}

async function putChunk({ user, uploadId, index, data, sha256 }) {
  const owner = ownerId(user);
  const upload = await SyncUpload.findOne({ _id: uploadId, owner });
  if (!upload) throw httpError("Backup upload not found", 404);
  if (upload.status === "complete") return { ok: true, alreadyComplete: true };
  if (!Number.isInteger(index) || index < 0 || index >= upload.chunkCount) {
    throw httpError("Invalid backup chunk index");
  }
  if (!Buffer.isBuffer(data) || data.length < 1 || data.length !== Math.min(upload.chunkSize, upload.encryptedSize - index * upload.chunkSize)) {
    throw httpError("Invalid backup chunk", 413);
  }
  const digest = crypto.createHash("sha256").update(data).digest("hex");
  if (digest !== String(sha256 || "").toLowerCase()) throw httpError("Backup chunk hash mismatch", 422);
  const saved = await SyncChunk.findOneAndUpdate(
    { upload: upload._id, index },
    { $setOnInsert: { upload: upload._id, index, sha256: digest, data } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  if (saved.sha256 !== digest) throw httpError("Chunk already contains different data", 409);
  return { ok: true, index };
}

async function complete({ user, uploadId }) {
  const owner = ownerId(user);
  const upload = await SyncUpload.findOne({ _id: uploadId, owner });
  if (!upload) throw httpError("Backup upload not found", 404);
  if (upload.status === "complete") return upload;
  let total = 0;
  let expected = 0;
  const hash = crypto.createHash("sha256");
  for await (const chunk of SyncChunk.find({ upload: upload._id }).sort({ index: 1 }).cursor()) {
    if (chunk.index !== expected++) throw httpError("Backup chunks are incomplete", 409);
    total += chunk.data.length;
    hash.update(chunk.data);
  }
  if (expected !== upload.chunkCount) throw httpError("Backup is missing chunks", 409);
  if (total !== upload.encryptedSize || hash.digest("hex") !== upload.archiveSha256) {
    throw httpError("Backup archive hash mismatch", 422);
  }
  upload.status = "complete";
  upload.completedAt = new Date();
  await upload.save();
  // Preserve recent recovery points. A cleanup failure must not invalidate a committed backup.
  try {
    const obsolete = await SyncUpload.find({ owner, deviceId: upload.deviceId, status: "complete" })
      .sort({ sequence: -1 }).skip(5).limit(100).select("_id").lean();
    const abandoned = await SyncUpload.find({ owner, deviceId: upload.deviceId, status: "uploading",
      createdAt: { $lt: new Date(Date.now() - 7 * 86400000) } }).limit(100).select("_id").lean();
    const ids = [...obsolete, ...abandoned].map((item) => item._id);
    if (ids.length) {
      await SyncChunk.deleteMany({ upload: { $in: ids } });
      await SyncUpload.deleteMany({ _id: { $in: ids } });
    }
  } catch { /* Retry cleanup on the next successful backup. */ }
  return upload;
}

async function latest({ user, deviceId }) {
  assertDevice(deviceId);
  return SyncUpload.findOne({ owner: ownerId(user), deviceId, status: "complete" }).sort({ sequence: -1 }).lean();
}

async function getChunk({ user, uploadId, index }) {
  const upload = await SyncUpload.exists({ _id: uploadId, owner: ownerId(user), status: "complete" });
  const chunk = upload && await SyncChunk.findOne({ upload: upload._id, index });
  if (!chunk) throw httpError("Backup chunk not found", 404);
  return chunk;
}

module.exports = { begin, putChunk, complete, latest, getChunk };
