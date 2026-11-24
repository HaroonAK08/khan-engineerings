const assert = require("node:assert/strict");
const test = require("node:test");
const { randomBytes } = require("node:crypto");
const { gzipSync } = require("node:zlib");
const mongoose = require("../../backend/node_modules/mongoose");
const { createSnapshot, dumpDatabase, decryptArchive, reassemble, restoreBsonToLocal } = require("../sync-protocol.cjs");

const rows = [{ _id: new mongoose.Types.ObjectId(), role: "admin" }];
const source = { mongo: mongoose.mongo, createConnection: () => ({ asPromise: async () => ({
  close: async () => {}, db: {
    listCollections: () => ({ toArray: async () => [{ name: "users", type: "collection" }] }),
    collection: () => ({ find: () => ({ sort: () => ({ toArray: async () => rows }) }) }),
  },
}) }) };
const stagingUri = "mongodb://127.0.0.1:27017/ke_restore_012345678901234567890123";

test("encrypted snapshot round trips and rejects corruption and a wrong key", async () => {
  const key = randomBytes(32);
  const snapshot = await createSnapshot({ uri: stagingUri, mongoose: source, key, deviceId: "factory-desktop", sequence: 1 });
  const data = reassemble(snapshot.chunks, snapshot.manifest);
  const { nonce, authTag } = snapshot.manifest;
  assert.deepEqual(decryptArchive(data, key, nonce, authTag), gzipSync(await dumpDatabase(stagingUri, source), { level: 6 }));
  assert.throws(() => decryptArchive(data, randomBytes(32), nonce, authTag));
  const corrupt = Buffer.from(snapshot.chunks[0].data);
  corrupt[0] ^= 1;
  assert.throws(() => reassemble([{ ...snapshot.chunks[0], data: corrupt }], snapshot.manifest), /hash mismatch/);
});

test("restore refuses non-staging databases and leaves existing data untouched", async () => {
  const archive = gzipSync(await dumpDatabase(stagingUri, source));
  await assert.rejects(restoreBsonToLocal({ archive, uri: "mongodb://127.0.0.1:27017/khan-engineerings-app", mongoose: {} }), /fresh desktop database/);
  const writes = [];
  const driver = { mongo: mongoose.mongo, createConnection: () => ({ asPromise: async () => ({ close: async () => {}, db: {
    listCollections: () => ({ toArray: async () => [{ name: "users" }] }),
    createCollection: async () => writes.push("create"),
    dropDatabase: async () => writes.push("drop"),
  } }) }) };
  await assert.rejects(restoreBsonToLocal({ archive, uri: stagingUri, mongoose: driver }), /not empty/);
  assert.deepEqual(writes, []);
});

test("failed insert cleans up only the fresh staging database", async () => {
  const archive = gzipSync(await dumpDatabase(stagingUri, source));
  const writes = [];
  const driver = { mongo: mongoose.mongo, createConnection: (uri) => ({ asPromise: async () => ({ close: async () => {}, db: {
    listCollections: () => ({ toArray: async () => [] }),
    createCollection: async () => ({ insertMany: async () => { throw new Error("disk full"); } }),
    dropDatabase: async () => writes.push(uri),
  } }) }) };
  await assert.rejects(restoreBsonToLocal({ archive, uri: stagingUri, mongoose: driver }), /disk full/);
  assert.deepEqual(writes, [stagingUri]);
});
