"use client";

import { useCallback, useEffect, useState } from "react";

function readIds(storageKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(String).filter(Boolean);
  } catch {
    return [];
  }
}

function writeIds(storageKey: string, ids: Iterable<string>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...ids]));
  } catch {
    // ignore quota / private mode
  }
}

/** Persist tally checkmarks across reloads for a history/records list. */
export function useTallyChecks(scope: string) {
  const storageKey = `ke-tally:${scope}`;
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setChecked(new Set(readIds(storageKey)));
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    writeIds(storageKey, checked);
  }, [checked, hydrated, storageKey]);

  const isChecked = useCallback((id: string) => checked.has(String(id)), [checked]);

  const toggle = useCallback((id: string) => {
    const key = String(id);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setCheckedState = useCallback((id: string, value: boolean) => {
    const key = String(id);
    setChecked((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  return { isChecked, toggle, setCheckedState, hydrated };
}
