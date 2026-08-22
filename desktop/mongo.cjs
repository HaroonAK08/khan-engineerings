const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");
const { ROOT } = require("./env.cjs");

function mongoRunning(port = 27017) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

function bundledMongod() {
  const name = process.platform === "win32" ? "mongod.exe" : "mongod";
  const candidates = [
    path.join(ROOT, "mongo", name),
    path.join(__dirname, "resources", "mongo", name),
  ];
  return candidates.find((file) => fs.existsSync(file)) || null;
}

function startBundledMongo(dbPath, logPath) {
  const bin = bundledMongod();
  if (!bin) return null;
  fs.mkdirSync(dbPath, { recursive: true });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const child = spawn(
    bin,
    [
      "--dbpath",
      dbPath,
      "--port",
      "27017",
      "--bind_ip",
      "127.0.0.1",
      "--logpath",
      logPath,
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  return child;
}

async function ensureMongo(userDataDir) {
  if (await mongoRunning()) return { child: null, usingSystem: true };
  const child = startBundledMongo(
    path.join(userDataDir, "mongo-data"),
    path.join(userDataDir, "mongo.log")
  );
  if (!child) {
    throw new Error(
      "MongoDB is not installed and no bundled database was found.\nInstall MongoDB Community, or use the official desktop installer."
    );
  }
  const started = Date.now();
  while (!(await mongoRunning())) {
    if (Date.now() - started > 20000) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      throw new Error("Bundled MongoDB did not start.");
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { child, usingSystem: false };
}

module.exports = { mongoRunning, bundledMongod, ensureMongo };
