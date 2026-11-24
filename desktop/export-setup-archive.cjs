#!/usr/bin/env node
// Run on the administrator’s trusted machine, never from the installer.
const fs = require("fs/promises");
const zlib = require("zlib");
const { promisify } = require("util");
const path = require("path");
const { BACKEND, isAtlasUri } = require("./env.cjs");
const { dumpDatabase } = require("./sync-protocol.cjs");

async function main() {
  const uri = process.env.MONGODB_URI;
  const file = process.argv[2];
  if (!file || !isAtlasUri(uri)) throw new Error("Provide an output path and a read-only Atlas URI in MONGODB_URI");
  const mongoose = require(path.join(BACKEND, "node_modules/mongoose"));
  const data = await promisify(zlib.gzip)(await dumpDatabase(uri, mongoose));
  await fs.writeFile(file, data, { flag: "wx", mode: 0o600 });
  console.log("Setup archive saved. Transfer it privately; it contains unencrypted factory data.");
}
main().catch(() => {
  console.error("Setup archive could not be created. Check the read-only Atlas connection and choose an unused output path.");
  process.exitCode = 1;
});
