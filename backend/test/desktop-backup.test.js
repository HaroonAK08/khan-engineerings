const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes, createHash } = require("node:crypto");
const { once } = require("node:events");
const mongoose = require("mongoose");
const app = require("../src/app");
const { SyncUpload, SyncChunk } = require("../src/modules/sync/sync.model");

test("desktop backup API round-trips authenticated encrypted chunks", async (t) => {
  const name = `ke_backup_test_${randomBytes(8).toString("hex")}`;
  try { await mongoose.connect(`mongodb://127.0.0.1:27017/${name}`, { serverSelectionTimeoutMS: 1500 }); }
  catch { t.skip("Local MongoDB unavailable"); return; }
  const token = randomBytes(32).toString("hex");
  const device = "factory-desktop";
  process.env.DESKTOP_BACKUP_TOKEN = token;
  process.env.DESKTOP_BACKUP_DEVICE = device;
  const server = app.listen(0, "127.0.0.1");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await once(server, "listening");
  await Promise.all([SyncUpload.init(), SyncChunk.init()]);
  const url = `http://127.0.0.1:${server.address().port}/api/sync`;
  function request(path, method = "GET", body, auth = token, id = device) {
    return fetch(url + path, { method, headers: { "content-type": "application/json", authorization: `Bearer ${auth}`, "x-desktop-device": id }, body: JSON.stringify(body) });
  }
  assert.equal((await request("/latest", "GET", undefined, "wrong")).status, 401);
  assert.equal((await request("/latest", "GET", undefined, token, "other-device")).status, 401);
  const data = randomBytes(32);
  const sha256 = createHash("sha256").update(data).digest("hex");
  const manifest = { snapshotId: "snapshot-123", sequence: 1, encryptedSize: data.length, chunkCount: 1, chunkSize: 64,
    protocolVersion: 1, archiveSha256: sha256, nonce: randomBytes(12).toString("base64"), authTag: randomBytes(16).toString("base64") };
  const start = await request("/uploads", "POST", manifest);
  assert.equal(start.status, 201);
  const { uploadId } = await start.json();
  assert.equal((await request(`/uploads/${uploadId}/complete`, "POST")).status, 409);
  assert.equal((await request(`/uploads/${uploadId}/chunks/0`, "PUT", { data: data.toString("base64"), sha256 })).status, 200);
  assert.equal((await request(`/uploads/${uploadId}/complete`, "POST")).status, 200);
  const { upload } = await (await request("/latest")).json();
  assert.equal(upload.nonce, manifest.nonce);
  assert.equal(upload.authTag, manifest.authTag);
  const chunk = await (await request(`/uploads/${uploadId}/chunks/0`)).json();
  assert.deepEqual(Buffer.from(chunk.data, "base64"), data);
});
