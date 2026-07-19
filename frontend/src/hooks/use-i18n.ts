"use client";

import { useCallback } from "react";
import {
  translate,
  type MessageKey,
  type TranslateParams,
} from "@/lib/i18n/messages";
import { useLocaleStore, type Locale } from "@/stores/locale-store";

export function useI18n() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const toggleLocale = useLocaleStore((s) => s.toggleLocale);

  const t = useCallback(
    (key: MessageKey, params?: TranslateParams) => translate(locale, key, params),
    [locale]
  );

  return {
    locale,
    setLocale,
    toggleLocale,
    t,
    dir: (locale === "ur" ? "rtl" : "ltr") as "rtl" | "ltr",
    isUrdu: locale === "ur",
  };
}

export type { Locale, MessageKey };
