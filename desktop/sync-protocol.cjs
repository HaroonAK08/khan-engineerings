const crypto = require("crypto");
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const CHUNK_SIZE = 64 * 1024;
const PROTOCOL_VERSION = 1;

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function loadJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function saveJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}

function encryptArchive(archive, key) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(archive), cipher.final()]);
  return { data: encrypted, nonce: nonce.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

function decryptArchive(data, key, nonce, authTag) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
// Restore into a fresh namespace. Only the caller can activate it, after verification.
async function restoreBsonToLocal({ archive, uri, mongoose }) {
  if (!/^mongodb:\/\/127\.0\.0\.1:27017\/ke_restore_[a-f0-9]{24}$/.test(uri)) {
    throw new Error("Restore requires a fresh desktop database");
  }
  const decoded = mongoose.mongo.BSON.deserialize(zlib.gunzipSync(archive, { maxOutputLength: 256 * 1024 * 1024 }), { promoteLongs: false });
  if (decoded.protocolVersion !== PROTOCOL_VERSION || !Array.isArray(decoded.collections)) throw new Error("Unsupported backup archive");
  const names = new Set();
  for (const row of decoded.collections) {
    if (typeof row.name !== "string" || !/^[a-z][a-z0-9_]*$/.test(row.name) || names.has(row.name) || !Array.isArray(row.docs)) {
      throw new Error("Invalid backup collection");
    }
    names.add(row.name);
  }
  if (!decoded.collections.find((row) => row.name === "users")?.docs.length) throw new Error("Backup has no factory user");
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  let ownsTarget = false;
  try {
    if ((await connection.db.listCollections().toArray()).length) throw new Error("Restore target is not empty");
    ownsTarget = true;
    for (const { name, docs } of decoded.collections) {
      const collection = await connection.db.createCollection(name);
      if (docs.length) await collection.insertMany(docs);
    }
  } catch (error) {
    if (ownsTarget) await connection.db.dropDatabase().catch(() => {});
    throw error;
  } finally { await connection.close(); }
}

function validateManifest(manifest) {
  if (!manifest || manifest.protocolVersion !== PROTOCOL_VERSION || !Number.isInteger(manifest.chunkCount) || manifest.chunkCount < 1 || manifest.chunkCount > 4000 || !Number.isInteger(manifest.chunkSize) || manifest.chunkSize < 1 || manifest.chunkSize > CHUNK_SIZE || manifest.chunkCount !== Math.ceil(manifest.encryptedSize / manifest.chunkSize) || !Number.isSafeInteger(manifest.encryptedSize) || manifest.encryptedSize < 1 || manifest.encryptedSize > 250 * 1024 * 1024 || !/^[a-f0-9]{64}$/i.test(manifest.archiveSha256 || "")) throw new Error("Invalid backup manifest");
}

function reassemble(chunks, manifest) {
  validateManifest(manifest);
  if (!Array.isArray(chunks) || chunks.length !== manifest.chunkCount) throw new Error("Backup is missing chunks");
  const ordered = [...chunks].sort((a, b) => a.index - b.index);
  const buffers = ordered.map((chunk, index) => {
    if (chunk.index !== index) throw new Error("Backup chunks are incomplete");
    if (!Buffer.isBuffer(chunk.data) && (typeof chunk.data !== "string" || chunk.data.length > Math.ceil(CHUNK_SIZE / 3) * 4)) throw new Error("Backup chunk too large or invalid");
    const data = Buffer.isBuffer(chunk.data) ? chunk.data : Buffer.from(chunk.data, "base64");
    if (data.length !== Math.min(manifest.chunkSize, manifest.encryptedSize - index * manifest.chunkSize) || sha256(data) !== chunk.sha256) throw new Error("Backup chunk hash mismatch");
    return data;
  });
  const archive = Buffer.concat(buffers);
  if (archive.length !== manifest.encryptedSize || sha256(archive) !== manifest.archiveSha256) throw new Error("Backup archive hash mismatch");
  return archive;
}
async function dumpDatabase(uri, mongoose) {
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    const collections = [];
    for (const info of (await conn.db.listCollections().toArray()).sort((a, b) => a.name.localeCompare(b.name))) {
      if (info.type !== "collection" || info.name.startsWith("system.") || ["syncuploads", "syncchunks"].includes(info.name)) continue;
      const docs = await conn.db.collection(info.name).find({}, { promoteLongs: false }).sort({ _id: 1 }).toArray();
      collections.push({ name: info.name, docs });
    }
    return mongoose.mongo.BSON.serialize({ protocolVersion: PROTOCOL_VERSION, collections });
  } finally {
    await conn.close();
  }
}

async function createSnapshot({ uri, mongoose, key, deviceId, sequence }) {
  const bson = await dumpDatabase(uri, mongoose);
  const fingerprint = sha256(bson);
  const compressed = zlib.gzipSync(bson, { level: 6 });
  const encrypted = encryptArchive(compressed, key);
  const archiveSha256 = sha256(encrypted.data);
  const chunks = [];
  for (let index = 0; index < encrypted.data.length; index += CHUNK_SIZE) {
    const data = encrypted.data.subarray(index, index + CHUNK_SIZE);
    chunks.push({ index: chunks.length, sha256: sha256(data), data });
  }
  return {
    manifest: {
      protocolVersion: PROTOCOL_VERSION,
      schemaVersion: "erp-1",
      deviceId,
      snapshotId: `${deviceId}-${sequence}-${archiveSha256.slice(0, 16)}`,
      sequence,
      encryptedSize: encrypted.data.length,
      archiveSha256,
      chunkSize: CHUNK_SIZE,
      chunkCount: chunks.length,
      nonce: encrypted.nonce,
      authTag: encrypted.authTag,
    },
    chunks, fingerprint,
  };
}

module.exports = { CHUNK_SIZE, loadJson, saveJson, sha256, dumpDatabase, createSnapshot, decryptArchive, reassemble, restoreBsonToLocal, validateManifest };
