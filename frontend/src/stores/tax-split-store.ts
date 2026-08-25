import { create } from "zustand";
import {
  getTaxSplit,
  setTaxSplit,
  type TaxSplitMode,
} from "@/lib/settings-api";

const STORAGE_KEY = "ke-tax-split";

function readCache(): TaxSplitMode {
  if (typeof window === "undefined") return "per_kg";
  try {
    return localStorage.getItem(STORAGE_KEY) === "half" ? "half" : "per_kg";
  } catch {
    return "per_kg";
  }
}

function writeCache(mode: TaxSplitMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

type TaxSplitState = {
  mode: TaxSplitMode;
  hydrated: boolean;
  saving: boolean;
  hydrate: () => Promise<void>;
  setMode: (mode: TaxSplitMode) => Promise<void>;
};

export const useTaxSplitStore = create<TaxSplitState>((set, get) => ({
  mode: readCache(),
  hydrated: false,
  saving: false,
  hydrate: async () => {
    set({ mode: readCache() });
    try {
      const mode = await getTaxSplit();
      writeCache(mode);
      set({ mode, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setMode: async (mode) => {
    const previous = get().mode;
    writeCache(mode);
    set({ mode, saving: true });
    try {
      const saved = await setTaxSplit(mode);
      writeCache(saved);
      set({ mode: saved, saving: false });
    } catch (err) {
      writeCache(previous);
      set({ mode: previous, saving: false });
      throw err;
    }
  },
}));
