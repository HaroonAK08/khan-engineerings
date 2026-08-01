/** Local-date formatting for <input type="date">. Avoids the UTC shift of toISOString(). */
export function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
