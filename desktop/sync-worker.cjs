const path = require("path");
const { createSnapshot, loadJson, saveJson, reassemble, decryptArchive } = require("./sync-protocol.cjs");

class SyncWorker {
  constructor({ userData, localUri, backendDir, onStatus, store }) {
    this.userData = userData;
    this.localUri = localUri;
    this.backendDir = backendDir;
    this.onStatus = onStatus || (() => {});
    this.stateFile = path.join(userData, "sync-state.json");
    this.store = store;
    this.timer = null;
    this.running = false;
    this.status = { state: "disabled", lastSuccessAt: null, pending: false, error: null };
  }

  config() { return this.store?.read() || {}; }

  isConfigured() { return Boolean(this.config().token); }

  getStatus() { return { ...this.status }; }

  setStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.onStatus(this.getStatus());
  }

  async request(url, options = {}, config = this.config()) {
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${config.token}`, "x-desktop-device": config.deviceId };
    const response = await fetch(`${config.cloudApiUrl}${url}`, {
      ...options, headers, redirect: "error", signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error(`Cloud backup request failed (${response.status})`);
    return response.json();
  }

  async downloadLatest(config) {
    const { upload } = await this.request("/api/sync/latest", {}, config);
    if (!upload) throw new Error("No cloud backup exists for this device");
    const { validateManifest } = require("./sync-protocol.cjs");
    validateManifest(upload);
    if (!/^[a-f0-9]{24}$/.test(upload._id) || upload.deviceId !== config.deviceId) throw new Error("Invalid backup identity");
    const chunks = [];
    for (let index = 0; index < upload.chunkCount; index++) {
      chunks.push(await this.request(`/api/sync/uploads/${upload._id}/chunks/${index}`, {}, config));
    }
    const archive = reassemble(chunks, upload);
    return decryptArchive(archive, Buffer.from(config.encryptionKey, "base64"), upload.nonce, upload.authTag);
  }

  async upload() {
    if (this.running) return;
    try { if (!this.isConfigured()) return; }
    catch (error) { this.setStatus({ state: "failed", error: error.message }); return; }
    this.running = true;
    this.setStatus({ state: "syncing", error: null, pending: true });
    try {
      const c = this.config();
      const mongoose = require(path.join(this.backendDir, "node_modules/mongoose"));
      const state = loadJson(this.stateFile, { sequence: 0, lastArchiveHash: null });
      const latest = await this.request(`/api/sync/latest?deviceId=${encodeURIComponent(c.deviceId)}`);
      const sequence = Math.max(Number(state.sequence) || 0, Number(latest.upload?.sequence) || 0) + 1;
      const key = Buffer.from(c.encryptionKey, "base64");
      if (key.length !== 32) throw new Error("Desktop sync encryption key must be 32 bytes");
      const snapshot = await createSnapshot({ uri: this.localUri, mongoose, key, deviceId: c.deviceId, sequence });
      if (latest.upload?.archiveSha256 === state.lastArchiveHash && snapshot.fingerprint === state.fingerprint) {
        this.setStatus({ state: "up-to-date", pending: false, lastSuccessAt: state.lastSuccessAt });
        return;
      }
      const started = await this.request("/api/sync/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snapshot.manifest),
      });
      for (const chunk of snapshot.chunks) {
        await this.request(`/api/sync/uploads/${started.uploadId}/chunks/${chunk.index}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sha256: chunk.sha256, data: chunk.data.toString("base64") }),
        });
      }
      await this.request(`/api/sync/uploads/${started.uploadId}/complete`, { method: "POST" });
      saveJson(this.stateFile, { sequence, fingerprint: snapshot.fingerprint, lastArchiveHash: snapshot.manifest.archiveSha256, lastSuccessAt: new Date().toISOString() });
      this.setStatus({ state: "synced", lastSuccessAt: new Date().toISOString(), pending: false, error: null });
    } catch (error) {
      this.setStatus({ state: error instanceof TypeError || error.name === "TimeoutError" ? "offline" : "failed", pending: true, error: error.message });
    } finally {
      this.running = false;
    }
  }

  start(intervalMs = 15 * 60 * 1000) {
    if (!this.isConfigured()) {
      this.setStatus({ state: "disabled", pending: false });
      return;
    }
    void this.upload();
    this.timer = setInterval(() => void this.upload(), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { SyncWorker };
