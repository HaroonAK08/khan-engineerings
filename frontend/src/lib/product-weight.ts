import type { Product } from "@/types/production";

function dayStamp(value?: string | Date | null) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function productWeightOnDate(product: Product | null | undefined, asOfDate?: string) {
  const catalog = Number(product?.weightKg) || 0;
  const history = product?.weightHistory || [];
  if (!product || !asOfDate || history.length === 0) return catalog;

  const t = dayStamp(asOfDate);
  if (!t) return catalog;

  const sorted = [...history].sort(
    (a, b) => dayStamp(a.effectiveFrom).localeCompare(dayStamp(b.effectiveFrom))
  );
  const first = sorted[0];
  if (t < dayStamp(first.effectiveFrom)) {
    const prev = Number(first.previousWeightKg);
    if (Number.isFinite(prev) && prev > 0) return prev;
  }

  let weight = catalog;
  for (const row of sorted) {
    const from = dayStamp(row.effectiveFrom);
    if (from && t >= from) weight = Number(row.weightKg) || weight;
  }
  return weight;
}
