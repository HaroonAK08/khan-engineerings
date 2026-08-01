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

/** First and last day of the calendar month that is currently running. */
export function thisMonthRange(now = new Date()) {
  return {
    from: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

/** First and last day of the previous calendar month. */
export function previousMonthRange(now = new Date()) {
  return {
    from: toDateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: toDateInput(new Date(now.getFullYear(), now.getMonth(), 0)),
  };
}

/**
 * Default range for report/list filters: previous month.
 * (Early in a new month, work is still usually on last month’s data.)
 */
export function currentMonthRange(now = new Date()) {
  return previousMonthRange(now);
}
