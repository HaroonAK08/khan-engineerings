/** Local-date formatting for <input type="date">. Avoids the UTC shift of toISOString(). */
export function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calendar YYYY-MM-DD from an API date, without a timezone day shift. */
export function calendarDay(value: string | Date | null | undefined) {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return toDateInput(value);
  }
  const raw = String(value).trim();
  const isoDay = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDay) return isoDay[1];
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return toDateInput(d);
}

export function todayInput() {
  return toDateInput(new Date());
}

/** First and last day of the current calendar month. */
export function thisMonthRange(now = new Date()) {
  return {
    from: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

/** Default range for report/list filters: current calendar month. */
export function currentMonthRange(now = new Date()) {
  return thisMonthRange(now);
}
