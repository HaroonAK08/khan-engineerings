const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function safeStorageOrThrow(electron) {
  const safeStorage = electron?.safeStorage;
  if (!safeStorage?.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === "basic_text") {
    throw new Error("OS secure storage is unavailable. Cloud backup setup cannot continue safely.");
  }
  return safeStorage;
}

function load(file, safeStorage) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const values = {};
    for (const [key, value] of Object.entries(raw.values || {})) {
      values[key] = safeStorage.decryptString(Buffer.from(value, "base64"));
    }
    return { ...raw, values };
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("Cannot read this computer’s protected backup settings");
    return { version: 1, values: {} };
  }
}

function save(file, values, safeStorage) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const encoded = {};
  for (const [key, value] of Object.entries(values)) {
    encoded[key] = safeStorage.encryptString(String(value)).toString("base64");
  }
  const temp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  fs.writeFileSync(temp, JSON.stringify({ version: 1, values: encoded }, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}

function createStore(userData, electron) {
  const safeStorage = safeStorageOrThrow(electron);
  const file = path.join(userData, "sync-secure.json");
  return {
    file,
    read: () => load(file, safeStorage).values,
    write: (values) => save(file, values, safeStorage),
    clear: () => { try { fs.rmSync(file, { force: true }); } catch {} },
  };
}

module.exports = { createStore };
