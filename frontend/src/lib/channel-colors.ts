export type ChannelId = "ik" | "power";

/**
 * Fixed brand colors for IK Engineering vs Power Engineering.
 * Avoids Hub (sky), Drum (light yellow), and profit (emerald).
 */
export const channelColors = {
  ik: {
    fill: "border-slate-500/50 bg-slate-300 text-slate-900",
    text: "text-slate-900",
    muted: "text-slate-800/85",
    soft: "border-slate-400/60 bg-slate-200/70",
    softText: "text-slate-800 dark:text-slate-200",
    accent: "bg-slate-400",
    badge: "border-slate-300/80 bg-slate-200 text-slate-900",
    hover: "border-slate-400/50 hover:border-slate-400/80 hover:bg-slate-200/40",
    heading: "text-slate-700 dark:text-slate-300",
  },
  power: {
    fill: "border-pink-700/40 bg-pink-500 text-white",
    text: "text-white",
    muted: "text-white/90",
    soft: "border-pink-500/50 bg-pink-400/15",
    softText: "text-pink-900 dark:text-pink-300",
    accent: "bg-pink-500",
    badge: "border-pink-200/70 bg-pink-300/50 text-pink-950",
    hover: "border-pink-500/40 hover:border-pink-500/70 hover:bg-pink-400/10",
    heading: "text-pink-700 dark:text-pink-400",
  },
} as const;
