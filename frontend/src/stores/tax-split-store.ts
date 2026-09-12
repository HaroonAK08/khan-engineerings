import { create } from "zustand";
import {
  getTaxSplit,
  setTaxSplit,
  type TaxSplitMode,
  type TaxSplitSettings,
} from "@/lib/settings-api";

const STORAGE_KEY = "ke-tax-split-v2";

function readCache(): TaxSplitSettings {
  if (typeof window === "undefined") {
    return { mode: "per_kg", hubPercent: 50, drumPercent: 50 };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TaxSplitSettings>;
      const mode: TaxSplitMode =
        parsed.mode === "half" || parsed.mode === "percent" ? parsed.mode : "per_kg";
      return {
        mode,
        hubPercent: Number(parsed.hubPercent) || 50,
        drumPercent: Number(parsed.drumPercent) || 50,
      };
    }
    const legacy = localStorage.getItem("ke-tax-split");
    if (legacy === "half") return { mode: "half", hubPercent: 50, drumPercent: 50 };
  } catch {
    // ignore
  }
  return { mode: "per_kg", hubPercent: 50, drumPercent: 50 };
}

function writeCache(settings: TaxSplitSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

type TaxSplitState = TaxSplitSettings & {
  hydrated: boolean;
  saving: boolean;
  hydrate: () => Promise<void>;
  setMode: (mode: TaxSplitMode) => Promise<void>;
  setPercents: (hubPercent: number, drumPercent: number) => Promise<void>;
};

export const useTaxSplitStore = create<TaxSplitState>((set, get) => ({
  ...readCache(),
  hydrated: false,
  saving: false,
  hydrate: async () => {
    set({ ...readCache() });
    try {
      const settings = await getTaxSplit();
      writeCache(settings);
      set({ ...settings, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setMode: async (mode) => {
    const previous = {
      mode: get().mode,
      hubPercent: get().hubPercent,
      drumPercent: get().drumPercent,
    };
    const next = { ...previous, mode };
    writeCache(next);
    set({ ...next, saving: true });
    try {
      const saved = await setTaxSplit({
        mode,
        hubPercent: next.hubPercent,
        drumPercent: next.drumPercent,
      });
      writeCache(saved);
      set({ ...saved, saving: false });
    } catch (err) {
      writeCache(previous);
      set({ ...previous, saving: false });
      throw err;
    }
  },
  setPercents: async (hubPercent, drumPercent) => {
    const previous = {
      mode: get().mode,
      hubPercent: get().hubPercent,
      drumPercent: get().drumPercent,
    };
    const next = {
      mode: "percent" as const,
      hubPercent,
      drumPercent,
    };
    writeCache(next);
    set({ ...next, saving: true });
    try {
      const saved = await setTaxSplit(next);
      writeCache(saved);
      set({ ...saved, saving: false });
    } catch (err) {
      writeCache(previous);
      set({ ...previous, saving: false });
      throw err;
    }
  },
}));
