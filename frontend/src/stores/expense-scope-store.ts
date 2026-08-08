import { create } from "zustand";
import type { ExpenseScope } from "@/lib/workers-api";

const STORAGE_KEY = "ke-expense-scope";

export type ExpenseScopeFilter = ExpenseScope | "all";

export type ExpenseScopeState = {
  scope: ExpenseScopeFilter;
  hydrated: boolean;
  hydrate: () => void;
  setScope: (scope: ExpenseScopeFilter) => void;
};

function readStored(): ExpenseScopeFilter | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "all" || raw === "hub" || raw === "drum" || raw === "common") return raw;
    return null;
  } catch {
    return null;
  }
}

function writeStored(scope: ExpenseScopeFilter) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, scope);
  } catch {
    // ignore
  }
}

export const useExpenseScopeStore = create<ExpenseScopeState>((set, get) => ({
  scope: "all",
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    const stored = readStored();
    set({ scope: stored ?? "all", hydrated: true });
  },
  setScope: (scope) => {
    writeStored(scope);
    set({ scope });
  },
}));
