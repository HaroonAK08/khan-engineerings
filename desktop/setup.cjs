const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { BrowserWindow, ipcMain } = require("electron");
const { createStore } = require("./secure-store.cjs");

function parseConfig(values) {
  const url = new URL(String(values.cloudApiUrl).trim());
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Enter the HTTPS API origin, without a path");
  }
  const token = String(values.token || "").trim();
  const deviceId = String(values.deviceId || "").trim();
  const encryptionKey = String(values.encryptionKey || "").trim();
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[\w:-]{8,128}$/.test(deviceId) ||
      Buffer.from(encryptionKey, "base64").toString("base64") !== encryptionKey ||
      Buffer.from(encryptionKey, "base64").length !== 32) throw new Error("Enter the backup token, device ID and recovery key supplied by your installer administrator");
  return { cloudApiUrl: url.origin, token, deviceId, encryptionKey };
}

async function isLocalEmpty(localUri, backendDir) {
  const mongoose = require(`${backendDir}/node_modules/mongoose`);
  const connection = await mongoose.createConnection(localUri).asPromise();
  try {
    const collections = await connection.db.listCollections().toArray();
    for (const collection of collections) {
      if (!collection.name.startsWith("system.") && await connection.db.collection(collection.name).estimatedDocumentCount() > 0) return false;
    }
    return true;
  } finally { await connection.close(); }
}

function collectSetup({ setupPage, preload, parent, apply }) {
  return new Promise((resolve, reject) => {
    const window = new BrowserWindow({ width: 560, height: 710, parent, modal: true,
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true } });
    let busy = false;
    let completed = false;
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    const check = (event) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error("Unexpected setup request");
    };
    ipcMain.handle("desktop-setup-submit", async (event, values) => {
      check(event);
      if (busy || completed) return { error: "Setup is already running" };
      busy = true;
      try {
        await apply(values, window);
        completed = true;
        setImmediate(() => { if (!window.isDestroyed()) window.close(); });
        return { ok: true };
      } catch (error) { return { error: error.message }; }
      finally { busy = false; }
    });
    ipcMain.handle("desktop-setup-cancel", (event) => { check(event); if (!busy) window.close(); });
    window.on("close", (event) => { if (busy) event.preventDefault(); });
    window.on("closed", () => {
      ipcMain.removeHandler("desktop-setup-submit");
      ipcMain.removeHandler("desktop-setup-cancel");
      resolve(completed);
    });
    window.loadFile(setupPage).catch((error) => { reject(error); window.destroy(); });
  });
}

async function ensureUser(uri, mongoose) {
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  try {
    const users = connection.db.collection("users");
    if (!await users.findOne({})) {
      const bcrypt = require(require("path").join(require("./env.cjs").BACKEND, "node_modules/bcryptjs"));
      await users.insertOne({ name: "Factory administrator", email: "desktop@khanengineerings.local", role: "admin", passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10) });
    }
  } finally { await connection.close(); }
}

module.exports = { collectSetup, parseConfig, isLocalEmpty, ensureUser, createStore };
