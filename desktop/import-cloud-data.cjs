#!/usr/bin/env node
/**
 * Copies factory data FROM MongoDB Atlas (read-only) INTO the local desktop DB.
 * Never writes to Atlas. Never uses the Atlas URI as a restore target.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  ROOT,
  BACKEND,
  LOCAL_DB,
  LOCAL_URI,
  loadEnvFile,
  isAtlasUri,
  dbNameFromUri,
} = require("./env.cjs");

const force = process.argv.includes("--force");
const dumpDir = path.join(ROOT, ".mongo-cloud-export");

function run(cmd, args, extra = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...extra,
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim() || `${cmd} failed`;
    throw new Error(err);
  }
  return result.stdout || "";
}

function toolExists(name) {
  const finder = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(finder, [name], { encoding: "utf8" });
  return result.status === 0;
}

function assertLocalTarget(uri) {
  if (isAtlasUri(uri)) {
    throw new Error("Refusing to restore into Atlas. Target must be local MongoDB.");
  }
  if (!uri.includes("127.0.0.1") && !uri.includes("localhost")) {
    throw new Error("Desktop restore target must be localhost.");
  }
}

async function localHasData() {
  const mongoosePath = path.join(BACKEND, "node_modules/mongoose");
  const mongoose = require(mongoosePath);
  const conn = await mongoose.createConnection(LOCAL_URI).asPromise();
  try {
    const names = await conn.db.listCollections().toArray();
    for (const { name } of names) {
      if (name.startsWith("system.")) continue;
      const count = await conn.db.collection(name).estimatedDocumentCount();
      if (count > 0) return true;
    }
    return false;
  } finally {
    await conn.close();
  }
}

function dumpFromAtlas(atlasUri) {
  if (!toolExists("mongodump")) {
    throw new Error("mongodump is not installed. Install MongoDB Database Tools.");
  }
  fs.rmSync(dumpDir, { recursive: true, force: true });
  fs.mkdirSync(dumpDir, { recursive: true });
  console.log("Downloading a copy of cloud data (Atlas is not changed)…");
  run("mongodump", [`--uri=${atlasUri}`, `--out=${dumpDir}`], {
    env: process.env,
  });
}

function dumpFolderForDb(dbName) {
  const direct = path.join(dumpDir, dbName);
  if (fs.existsSync(direct)) return direct;
  const children = fs.existsSync(dumpDir)
    ? fs.readdirSync(dumpDir).filter((name) => {
        const full = path.join(dumpDir, name);
        return fs.statSync(full).isDirectory();
      })
    : [];
  if (children.length === 1) return path.join(dumpDir, children[0]);
  throw new Error("Cloud dump folder not found. Import did not finish.");
}

function restoreLocal(dumpDbDir) {
  if (!toolExists("mongorestore")) {
    throw new Error("mongorestore is not installed. Install MongoDB Database Tools.");
  }
  assertLocalTarget(LOCAL_URI);
  console.log(`Restoring into local database "${LOCAL_DB}"…`);
  run("mongorestore", [
    `--uri=${LOCAL_URI}`,
    "--drop",
    dumpDbDir,
  ]);
}

async function copyWithMongoose(atlasUri) {
  assertLocalTarget(LOCAL_URI);
  const mongoose = require(path.join(BACKEND, "node_modules/mongoose"));
  const src = await mongoose.createConnection(atlasUri).asPromise();
  const dst = await mongoose.createConnection(LOCAL_URI).asPromise();
  try {
    console.log("Copying cloud collections with Mongoose (Atlas is not changed)…");
    const cols = await src.db.listCollections().toArray();
    for (const { name } of cols) {
      if (name.startsWith("system.")) continue;
      const docs = await src.db.collection(name).find({}).toArray();
      await dst.db.collection(name).deleteMany({});
      for (let i = 0; i < docs.length; i += 400) {
        const chunk = docs.slice(i, i + 400);
        if (chunk.length) {
          await dst.db.collection(name).insertMany(chunk, { ordered: false });
        }
      }
    }
  } finally {
    await src.close();
    await dst.close();
  }
}

async function main() {
  const prod = loadEnvFile(path.join(BACKEND, ".env.production"));
  const atlasUri = prod.MONGODB_URI;
  if (!atlasUri || !isAtlasUri(atlasUri)) {
    throw new Error(
      "backend/.env.production has no Atlas MONGODB_URI. Cannot import existing cloud data."
    );
  }

  if (!force && (await localHasData())) {
    console.log(
      `Local desktop DB "${LOCAL_DB}" already has data. Skipping import.\nRe-run with --force to replace the local copy only (Atlas stays as-is).`
    );
    return;
  }

  const dbName = dbNameFromUri(atlasUri);
  if (toolExists("mongodump") && toolExists("mongorestore")) {
    dumpFromAtlas(atlasUri);
    restoreLocal(dumpFolderForDb(dbName));
  } else {
    await copyWithMongoose(atlasUri);
  }
  console.log("Import finished. All previous cloud records are on this PC.");
  console.log("Atlas was only read. The live website still has the original data.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
