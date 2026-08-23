import type { WasteSettings } from "@/lib/settings-api";

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

export function wastePercentOnDate(
  settings: WasteSettings | null | undefined,
  family?: "hub" | "drum" | string | null,
  asOfDate?: string
) {
  const fallback =
    family === "drum" ? Number(settings?.drumPercent) || 6 : Number(settings?.hubPercent) || 6;
  if (!settings || (family !== "hub" && family !== "drum")) return fallback;
  const history = (settings.history || [])
    .filter((row) => row.family === family)
    .sort((a, b) => dayStamp(a.effectiveFrom).localeCompare(dayStamp(b.effectiveFrom)));
  if (!asOfDate || history.length === 0) return fallback;
  const t = dayStamp(asOfDate);
  if (!t) return fallback;
  const first = history[0];
  if (t < dayStamp(first.effectiveFrom)) {
    const prev = Number(first.previousPercent);
    return Number.isFinite(prev) ? prev : 6;
  }
  let percent = fallback;
  for (const row of history) {
    const from = dayStamp(row.effectiveFrom);
    if (from && t >= from) percent = Number(row.percent);
  }
  return Number.isFinite(percent) ? percent : fallback;
}
