import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkColors, lightColors, type ThemeColors } from "../theme";

const KEY = "pb_theme_mode";

type Mode = "light" | "dark";

type ThemeCtx = {
  mode: Mode;
  colors: ThemeColors;
  isDark: boolean;
  toggle: () => void;
  setMode: (m: Mode) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>("light");

  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((v) => {
      if (v === "dark" || v === "light") setModeState(v);
    });
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    void AsyncStorage.setItem(KEY, m);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === "light" ? "dark" : "light");
  }, [mode, setMode]);

  const value = useMemo<ThemeCtx>(
    () => ({
      mode,
      colors: mode === "dark" ? darkColors : lightColors,
      isDark: mode === "dark",
      toggle,
      setMode,
    }),
    [mode, toggle, setMode]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme requires ThemeProvider");
  return ctx;
}
