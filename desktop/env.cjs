const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const text = fs.readFileSync(filePath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function isAtlasUri(uri) {
  const value = String(uri || "");
  return (
    value.includes("mongodb.net") ||
    value.startsWith("mongodb+srv://") ||
    value.includes("mongodb+srv")
  );
}

function dbNameFromUri(uri, fallback = "khan-engineerings") {
  try {
    const noQuery = String(uri).split("?")[0];
    const parts = noQuery.split("/");
    const name = parts[parts.length - 1];
    return name || fallback;
  } catch {
    return fallback;
  }
}

function isPackagedElectron() {
  try {
    const electron = require("electron");
    const electronApp = electron.app;
    return Boolean(electronApp?.isPackaged);
  } catch {
    return false;
  }
}

function resolveRoot() {
  if (process.env.KE_APP_ROOT) return process.env.KE_APP_ROOT;
  if (isPackagedElectron() && process.resourcesPath) {
    return process.resourcesPath;
  }
  return path.resolve(__dirname, "..");
}

const ROOT = resolveRoot();
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");

const LOCAL_DB = "khan-engineerings-app";
const LOCAL_URI = `mongodb://127.0.0.1:27017/${LOCAL_DB}`;
const API_PORT = Number(process.env.KE_API_PORT || 5000);
const WEB_PORT = Number(process.env.KE_WEB_PORT || 3000);
const API_URL = `http://127.0.0.1:${API_PORT}/api`;

module.exports = {
  ROOT,
  BACKEND,
  FRONTEND,
  LOCAL_DB,
  LOCAL_URI,
  API_PORT,
  WEB_PORT,
  API_URL,
  loadEnvFile,
  isAtlasUri,
  dbNameFromUri,
};
