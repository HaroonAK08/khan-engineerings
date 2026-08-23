function startOfLocalDay(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const s = String(value || "").slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (y && m && d) return new Date(y, m - 1, d);
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function parseEffectiveFrom(value, label = "Weight date") {
  const day = startOfLocalDay(value);
  if (!day) {
    const err = new Error(`${label} is required`);
    err.statusCode = 400;
    throw err;
  }
  return day;
}

function roundKg(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function resolveWeightKg(product, asOfDate) {
  const catalog = Number(product?.weightKg);
  const history = Array.isArray(product?.weightHistory) ? product.weightHistory : [];
  if (!asOfDate || history.length === 0) {
    return Number.isFinite(catalog) ? catalog : 0;
  }
  const t = startOfLocalDay(asOfDate)?.getTime();
  if (t == null) return Number.isFinite(catalog) ? catalog : 0;

  const sorted = [...history].sort((a, b) => {
    const at = startOfLocalDay(a.effectiveFrom)?.getTime() || 0;
    const bt = startOfLocalDay(b.effectiveFrom)?.getTime() || 0;
    return at - bt;
  });

  const first = sorted[0];
  const firstAt = startOfLocalDay(first.effectiveFrom)?.getTime() || 0;
  if (t < firstAt) {
    const prev = Number(first.previousWeightKg);
    if (Number.isFinite(prev) && prev > 0) return prev;
  }

  let weight = Number.isFinite(catalog) ? catalog : 0;
  for (const row of sorted) {
    const at = startOfLocalDay(row.effectiveFrom)?.getTime();
    if (at != null && t >= at) weight = Number(row.weightKg);
  }
  return Number.isFinite(weight) ? weight : 0;
}

module.exports = {
  startOfLocalDay,
  parseEffectiveFrom,
  roundKg,
  resolveWeightKg,
};
