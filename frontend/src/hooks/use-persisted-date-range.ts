"use client";

import { useEffect } from "react";
import {
  isCurrentMonthRange,
  isTodayRange,
  useDateRangeStore,
} from "@/stores/date-range-store";

export function usePersistedDateRange() {
  const dateFrom = useDateRangeStore((s) => s.dateFrom);
  const dateTo = useDateRangeStore((s) => s.dateTo);
  const hydrated = useDateRangeStore((s) => s.hydrated);
  const hydrate = useDateRangeStore((s) => s.hydrate);
  const setDateFrom = useDateRangeStore((s) => s.setDateFrom);
  const setDateTo = useDateRangeStore((s) => s.setDateTo);
  const setRange = useDateRangeStore((s) => s.setRange);
  const setThisMonth = useDateRangeStore((s) => s.setThisMonth);
  const setToday = useDateRangeStore((s) => s.setToday);
  const clearRange = useDateRangeStore((s) => s.clearRange);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return {
    dateFrom,
    dateTo,
    hydrated,
    setDateFrom,
    setDateTo,
    setRange,
    setThisMonth,
    setToday,
    clearRange,
    isThisMonth: isCurrentMonthRange(dateFrom, dateTo),
    isToday: isTodayRange(dateFrom, dateTo),
    isAll: !dateFrom && !dateTo,
  };
}
