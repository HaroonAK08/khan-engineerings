import { create } from "zustand";
import { currentMonthRange, todayInput } from "@/lib/date-range";

const STORAGE_KEY = "ke-date-range";

export type DateRangeState = {
  dateFrom: string;
  dateTo: string;
  hydrated: boolean;
  hydrate: () => void;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  setRange: (from: string, to: string) => void;
  setThisMonth: () => void;
  setToday: () => void;
  clearRange: () => void;
};

function readStored(): { from: string; to: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { from?: unknown; to?: unknown };
    if (typeof parsed.from !== "string" || typeof parsed.to !== "string") return null;
    return { from: parsed.from, to: parsed.to };
  } catch {
    return null;
  }
}

function writeStored(from: string, to: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ from, to }));
  } catch {
    // ignore
  }
}

function defaultRange() {
  return currentMonthRange();
}

export const useDateRangeStore = create<DateRangeState>((set, get) => {
  const initial = defaultRange();
  return {
    dateFrom: initial.from,
    dateTo: initial.to,
    hydrated: false,
    hydrate: () => {
      if (get().hydrated) return;
      const stored = readStored();
      if (stored) {
        set({ dateFrom: stored.from, dateTo: stored.to, hydrated: true });
        return;
      }
      const range = defaultRange();
      writeStored(range.from, range.to);
      set({ dateFrom: range.from, dateTo: range.to, hydrated: true });
    },
    setDateFrom: (value) => {
      writeStored(value, get().dateTo);
      set({ dateFrom: value });
    },
    setDateTo: (value) => {
      writeStored(get().dateFrom, value);
      set({ dateTo: value });
    },
    setRange: (from, to) => {
      writeStored(from, to);
      set({ dateFrom: from, dateTo: to });
    },
    setThisMonth: () => {
      const range = currentMonthRange();
      get().setRange(range.from, range.to);
    },
    setToday: () => {
      const d = todayInput();
      get().setRange(d, d);
    },
    clearRange: () => {
      get().setRange("", "");
    },
  };
});

export function isCurrentMonthRange(dateFrom: string, dateTo: string) {
  const month = currentMonthRange();
  return dateFrom === month.from && dateTo === month.to;
}

export function isTodayRange(dateFrom: string, dateTo: string) {
  const d = todayInput();
  return dateFrom === d && dateTo === d;
}
