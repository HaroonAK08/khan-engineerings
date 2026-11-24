const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { dumpDatabase } = require("./sync-protocol.cjs");

async function backupLocal({ userData, uri, mongoose }) {
  const dir = path.join(userData, "local-backups");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.bson.gz`);
  const data = zlib.gzipSync(await dumpDatabase(uri, mongoose), { level: 6 });
  fs.writeFileSync(file, data, { mode: 0o600 });
  const files = fs.readdirSync(dir).filter((name) => /^backup-[\dTZ-]+\.bson\.gz$/.test(name)).sort().reverse();
  for (const old of files.slice(5)) fs.rmSync(path.join(dir, old), { force: true });
  return file;
}

module.exports = { backupLocal };
