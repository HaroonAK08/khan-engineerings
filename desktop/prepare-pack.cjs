#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const https = require("https");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const RESOURCES = path.join(__dirname, "resources");
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");
const MONGO_VERSION = "7.0.14";

function run(cmd, args, cwd, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (from) => {
      const base = path.basename(from);
      if (base === ".env" || base === ".env.production" || base === ".env.local") return false;
      return true;
    },
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          fs.unlinkSync(dest);
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed ${res.statusCode} ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", reject);
  });
}

async function fetchMongod() {
  const mongoDir = path.join(RESOURCES, "mongo");
  fs.mkdirSync(mongoDir, { recursive: true });
  const binName = process.platform === "win32" ? "mongod.exe" : "mongod";
  if (fs.existsSync(path.join(mongoDir, binName))) return;

  const tmp = path.join(RESOURCES, "mongo-download");
  fs.mkdirSync(tmp, { recursive: true });

  if (process.platform === "win32") {
    const url = `https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-${MONGO_VERSION}.zip`;
    const zip = path.join(tmp, "mongo.zip");
    console.log("Downloading MongoDB for Windows…");
    await download(url, zip);
    run("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force '${zip}' '${tmp}'`], ROOT);
    const found = findFile(tmp, "mongod.exe");
    if (!found) throw new Error("mongod.exe not found in MongoDB zip");
    fs.copyFileSync(found, path.join(mongoDir, "mongod.exe"));
  } else if (process.platform === "linux") {
    const url = `https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-${MONGO_VERSION}.tgz`;
    const tgz = path.join(tmp, "mongo.tgz");
    console.log("Downloading MongoDB for Linux…");
    await download(url, tgz);
    run("tar", ["-xzf", tgz, "-C", tmp], ROOT);
    const found = findFile(tmp, "mongod");
    if (!found) throw new Error("mongod not found in MongoDB archive");
    fs.copyFileSync(found, path.join(mongoDir, "mongod"));
    fs.chmodSync(path.join(mongoDir, "mongod"), 0o755);
  } else {
    console.log("Skipping bundled MongoDB on this OS.");
  }
}

function findFile(dir, name) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return full;
    if (entry.isDirectory()) {
      const nested = findFile(full, name);
      if (nested) return nested;
    }
  }
  return null;
}

async function main() {
  fs.rmSync(RESOURCES, { recursive: true, force: true });
  fs.mkdirSync(RESOURCES, { recursive: true });

  console.log("Installing backend production modules…");
  run("npm", ["install", "--omit=dev"], BACKEND);

  console.log("Building frontend…");
  run("npm", ["run", "build"], FRONTEND, {
    NEXT_OUTPUT: "standalone",
    NEXT_PUBLIC_API_URL: "http://127.0.0.1:5000/api",
  });

  const standalone = path.join(FRONTEND, ".next", "standalone");
  if (fs.existsSync(path.join(standalone, "server.js"))) {
    copyDir(standalone, path.join(RESOURCES, "frontend"));
    const staticSrc = path.join(FRONTEND, ".next", "static");
    const staticDest = path.join(RESOURCES, "frontend", ".next", "static");
    if (fs.existsSync(staticSrc)) copyDir(staticSrc, staticDest);
    const publicSrc = path.join(FRONTEND, "public");
    if (fs.existsSync(publicSrc)) copyDir(publicSrc, path.join(RESOURCES, "frontend", "public"));
  } else {
    copyDir(FRONTEND, path.join(RESOURCES, "frontend"));
  }

  copyDir(BACKEND, path.join(RESOURCES, "backend"));
  await fetchMongod();
  console.log("Pack resources ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
