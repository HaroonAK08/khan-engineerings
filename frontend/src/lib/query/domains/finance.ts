"use client";

import {
  getFinanceMonthly,
  getPartySalesMargin,
  getProductionMargin,
  getYearProgress,
  type MonthlyPoint,
  type PartySalesMarginReport,
  type ProductionMarginReport,
  type YearProgressReport,
} from "@/lib/finance-api";
import { cachePolicy, policyForRange } from "../cache-policy";
import { useAppQuery } from "../hooks";
import { queryKeys } from "../keys";

type MarginParams = {
  dateFrom?: string;
  dateTo?: string;
  taxSplit?: "half" | "per_kg" | "percent";
};

export function useProductionMargin(params: MarginParams, enabled = true) {
  return useAppQuery<ProductionMarginReport>(
    queryKeys.finance.productionMargin(params),
    (signal) => getProductionMargin(params, signal),
    { enabled, ...policyForRange(params.dateTo) }
  );
}

export function usePartySalesMargin(params: MarginParams, enabled = true) {
  return useAppQuery<PartySalesMarginReport>(
    queryKeys.finance.partySalesMargin(params),
    (signal) => getPartySalesMargin(params, signal),
    { enabled, ...policyForRange(params.dateTo) }
  );
}

/** Rolling monthly series. Historical months cannot change on their own. */
export function useFinanceMonthly(months: number, enabled = true) {
  return useAppQuery<MonthlyPoint[]>(
    queryKeys.finance.monthly({ months }),
    (signal) => getFinanceMonthly({ months }, signal),
    { enabled, ...cachePolicy.historical }
  );
}

/** Year-to-date progress for a closed or in-flight year. */
export function useYearProgress(year: number, enabled = true) {
  const closed = year < new Date().getFullYear();
  return useAppQuery<YearProgressReport>(
    queryKeys.finance.yearProgress({ year }),
    (signal) => getYearProgress({ year }, signal),
    { enabled, ...(closed ? cachePolicy.historical : cachePolicy.financial) }
  );
}
