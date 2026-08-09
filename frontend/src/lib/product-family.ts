import { cn } from "@/lib/utils";

export type ProductFamilyLike = "hub" | "drum" | string | null | undefined;

export function normalizeFamily(family: ProductFamilyLike): "hub" | "drum" | null {
  if (family === "hub" || family === "drum") return family;
  return null;
}

/** Table / list row background — hub = sky, drum = yellow */
export function familyRowClass(family: ProductFamilyLike, className?: string) {
  const f = normalizeFamily(family);
  return cn(
    f === "hub" &&
      "border-l-[3px] border-l-sky-500 bg-sky-500/10 hover:bg-sky-500/15 data-[state=selected]:bg-sky-500/15",
    f === "drum" &&
      "border-l-[3px] border-l-yellow-400 bg-yellow-400/15 hover:bg-yellow-400/25 data-[state=selected]:bg-yellow-400/25",
    className
  );
}

/** Family badge on tables */
export function familyBadgeClass(family: ProductFamilyLike, className?: string) {
  const f = normalizeFamily(family);
  return cn(
    "font-data text-[10px] uppercase",
    f === "hub" &&
      "border-sky-500/45 bg-sky-500/15 text-sky-800 dark:border-sky-400/40 dark:text-sky-300",
    f === "drum" &&
      "border-yellow-500/50 bg-yellow-400/20 text-yellow-900 dark:border-yellow-400/40 dark:text-yellow-300",
    className
  );
}

/** Product picker option rows */
export function familyPickerItemClass(
  family: ProductFamilyLike,
  active = false,
  className?: string
) {
  const f = normalizeFamily(family);
  return cn(
    f === "hub" && "border-l-[3px] border-l-sky-500 bg-sky-500/10 hover:bg-sky-500/18",
    f === "drum" && "border-l-[3px] border-l-yellow-400 bg-yellow-400/15 hover:bg-yellow-400/25",
    active && f === "hub" && "bg-sky-500/22",
    active && f === "drum" && "bg-yellow-400/30",
    active && !f && "bg-muted",
    className
  );
}

/** All / Hub / Drum filter chips */
export function familyFilterChipClass(
  family: "all" | "hub" | "drum",
  active: boolean,
  className?: string
) {
  if (!active) {
    if (family === "hub") {
      return cn(
        "border-sky-500/40 bg-sky-500/5 text-sky-800 hover:bg-sky-500/12 dark:text-sky-300",
        className
      );
    }
    if (family === "drum") {
      return cn(
        "border-yellow-500/40 bg-yellow-400/10 text-yellow-900 hover:bg-yellow-400/20 dark:text-yellow-300",
        className
      );
    }
    return cn("bg-background", className);
  }
  if (family === "hub") {
    return cn(
      "border-sky-600 bg-sky-600 text-white hover:bg-sky-600 hover:text-white dark:border-sky-500 dark:bg-sky-500",
      className
    );
  }
  if (family === "drum") {
    return cn(
      "border-yellow-500 bg-yellow-500 text-yellow-950 hover:bg-yellow-500 hover:text-yellow-950 dark:border-yellow-400 dark:bg-yellow-400",
      className
    );
  }
  return className;
}

export function familyMetaTextClass(family: ProductFamilyLike, className?: string) {
  const f = normalizeFamily(family);
  return cn(
    "font-data uppercase",
    f === "hub" && "text-sky-700 dark:text-sky-300",
    f === "drum" && "text-yellow-700 dark:text-yellow-300",
    !f && "text-muted-foreground",
    className
  );
}
