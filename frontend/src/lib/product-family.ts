import { cn } from "@/lib/utils";

export type ProductFamilyLike = "hub" | "drum" | string | null | undefined;

export function normalizeFamily(family: ProductFamilyLike): "hub" | "drum" | null {
  if (family === "hub" || family === "drum") return family;
  return null;
}

/** Table / list row background — hub = sky, drum = amber */
export function familyRowClass(family: ProductFamilyLike, className?: string) {
  const f = normalizeFamily(family);
  return cn(
    f === "hub" &&
      "border-l-[3px] border-l-sky-500 bg-sky-500/10 hover:bg-sky-500/15 data-[state=selected]:bg-sky-500/15",
    f === "drum" &&
      "border-l-[3px] border-l-amber-500 bg-amber-500/10 hover:bg-amber-500/15 data-[state=selected]:bg-amber-500/15",
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
      "border-amber-500/45 bg-amber-500/15 text-amber-900 dark:border-amber-400/40 dark:text-amber-300",
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
    f === "drum" && "border-l-[3px] border-l-amber-500 bg-amber-500/10 hover:bg-amber-500/18",
    active && f === "hub" && "bg-sky-500/22",
    active && f === "drum" && "bg-amber-500/22",
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
        "border-amber-500/40 bg-amber-500/5 text-amber-900 hover:bg-amber-500/12 dark:text-amber-300",
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
      "border-amber-600 bg-amber-600 text-white hover:bg-amber-600 hover:text-white dark:border-amber-500 dark:bg-amber-500",
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
    f === "drum" && "text-amber-800 dark:text-amber-300",
    !f && "text-muted-foreground",
    className
  );
}
