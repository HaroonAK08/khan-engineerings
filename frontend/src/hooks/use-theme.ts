"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ke-theme";
const THEME_EVENT = "ke-theme-change";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // Prefer stored theme; migrate previous default dark → light once
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== "light" && stored !== "dark") {
      applyTheme("light");
      setTheme("light");
    } else {
      setTheme(stored);
      applyTheme(stored);
    }
    function onChange(event: Event) {
      setTheme((event as CustomEvent<Theme>).detail);
    }
    window.addEventListener(THEME_EVENT, onChange);
    return () => window.removeEventListener(THEME_EVENT, onChange);
  }, []);

  function toggleTheme() {
    applyTheme(theme === "dark" ? "light" : "dark");
  }

  function setThemeValue(next: Theme) {
    applyTheme(next);
  }

  return { theme, toggleTheme, setTheme: setThemeValue };
}
