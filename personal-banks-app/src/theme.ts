export type ThemeColors = {
  bg: string;
  bgSoft: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  muted: string;
  border: string;
  accent: string;
  accentSoft: string;
  accentDark: string;
  blue: string;
  blueSoft: string;
  amber: string;
  amberSoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  shadow: string;
  skeleton: string;
};

export const lightColors: ThemeColors = {
  bg: "#F3F6F9",
  bgSoft: "#E8EEF5",
  surface: "#FFFFFF",
  surfaceMuted: "#F8FAFC",
  text: "#0F172A",
  textSecondary: "#475569",
  muted: "#94A3B8",
  border: "#E2E8F0",
  accent: "#0F766E",
  accentSoft: "#CCFBF1",
  accentDark: "#115E59",
  blue: "#1D4ED8",
  blueSoft: "#DBEAFE",
  amber: "#B45309",
  amberSoft: "#FEF3C7",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  success: "#059669",
  successSoft: "#D1FAE5",
  shadow: "#0F172A",
  skeleton: "#E2E8F0",
};

export const darkColors: ThemeColors = {
  bg: "#0B1220",
  bgSoft: "#111827",
  surface: "#152033",
  surfaceMuted: "#1A2740",
  text: "#F8FAFC",
  textSecondary: "#CBD5E1",
  muted: "#64748B",
  border: "#243247",
  accent: "#14B8A6",
  accentSoft: "#134E4A",
  accentDark: "#5EEAD4",
  blue: "#60A5FA",
  blueSoft: "#1E3A5F",
  amber: "#FBBF24",
  amberSoft: "#3F2E12",
  danger: "#F87171",
  dangerSoft: "#3F1D1D",
  success: "#34D399",
  successSoft: "#14352C",
  shadow: "#000000",
  skeleton: "#243247",
};

/** @deprecated use useTheme().colors — kept for gradual migration */
export const colors = lightColors;

export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
};

export const type = {
  hero: { fontSize: 36, fontWeight: "800" as const, letterSpacing: -0.9 },
  title: { fontSize: 22, fontWeight: "800" as const, letterSpacing: -0.4 },
  subtitle: { fontSize: 17, fontWeight: "700" as const },
  body: { fontSize: 15, fontWeight: "500" as const },
  meta: { fontSize: 12, fontWeight: "600" as const },
  label: {
    fontSize: 12,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
  },
  amount: { fontSize: 24, fontWeight: "800" as const, letterSpacing: -0.4 },
};

export const space = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
};
