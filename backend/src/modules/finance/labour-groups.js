function normalizeName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\/_,.-]+/g, " ")
    .replace(/\s+/g, " ");
}

function firstToken(name) {
  return normalizeName(name).split(" ")[0] || "";
}

function hasToken(name, token) {
  return normalizeName(name)
    .split(" ")
    .includes(String(token).toLowerCase());
}

function isJavedWarma(name) {
  const n = normalizeName(name);
  return firstToken(n) === "javed" && (hasToken(n, "warma") || n === "javed");
}

/** Hub Khrad: Abbas, Abdullah, Afzal*, Ejaz, Ramzan khrad, Sajid khrad, Javed (60%). */
function isHubKhradWorkerName(name) {
  if (isJavedWarma(name)) return true;
  const first = firstToken(name);
  if (first === "abbas" || first === "abdullah" || first === "afzal" || first === "ejaz") {
    return true;
  }
  if (first === "ramzan" && hasToken(name, "khrad")) return true;
  if (first === "sajid" && hasToken(name, "khrad")) return true;
  return false;
}

/** Hub Casting: Amin 4man, Amir molder, Banaras, Ikram, Madad Ali/Tariq, Shahbaz. */
function isHubCastingWorkerName(name) {
  const n = normalizeName(name);
  const first = firstToken(n);
  if (first === "amin" && (hasToken(n, "4man") || hasToken(n, "4"))) return true;
  if (first === "amir" && hasToken(n, "molder")) return true;
  if (first === "banaras") return true;
  if (first === "ikram") return true;
  if (first === "madad") return true;
  if (first === "shahbaz") return true;
  return false;
}

/** Hub Others: Ali (standalone), plus any unmatched hub worker. */
function isHubOthersNamedWorker(name) {
  const n = normalizeName(name);
  if (n === "ali") return true;
  if (firstToken(n) === "ali" && !hasToken(n, "madad") && !hasToken(n, "tariq")) return true;
  return false;
}

function classifyHubLabour(name) {
  if (isHubKhradWorkerName(name)) return "khrad";
  if (isHubCastingWorkerName(name)) return "casting";
  if (isHubOthersNamedWorker(name)) return "others";
  return "others";
}

const DRUM_KHRAD_FIRST_NAMES = new Set(["idrees", "idris", "amin", "ashraf", "shakeel"]);

function isDrumKhradWorkerName(name) {
  if (isJavedWarma(name)) return true;
  const first = firstToken(name);
  return DRUM_KHRAD_FIRST_NAMES.has(first);
}

const JAVED_HUB_SHARE = 0.6;
const JAVED_DRUM_SHARE = 0.4;

module.exports = {
  normalizeName,
  isJavedWarma,
  isHubKhradWorkerName,
  isHubCastingWorkerName,
  isHubOthersNamedWorker,
  classifyHubLabour,
  isDrumKhradWorkerName,
  JAVED_HUB_SHARE,
  JAVED_DRUM_SHARE,
};
