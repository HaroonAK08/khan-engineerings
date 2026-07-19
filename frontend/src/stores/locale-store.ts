import { create } from "zustand";

export type Locale = "en" | "ur";

const STORAGE_KEY = "ke-locale";

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "ur" ? "ur" : "en";
  } catch {
    return "en";
  }
}

function applyDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = locale === "ur" ? "ur" : "en";
  root.dir = locale === "ur" ? "rtl" : "ltr";
  root.classList.toggle("locale-ur", locale === "ur");
}

type LocaleState = {
  locale: Locale;
  hydrated: boolean;
  hydrate: () => void;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
};

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: "en",
  hydrated: false,
  hydrate: () => {
    const locale = readStoredLocale();
    applyDocumentLocale(locale);
    set({ locale, hydrated: true });
  },
  setLocale: (locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // ignore
    }
    applyDocumentLocale(locale);
    set({ locale });
  },
  toggleLocale: () => {
    const next: Locale = get().locale === "en" ? "ur" : "en";
    get().setLocale(next);
  },
}));
