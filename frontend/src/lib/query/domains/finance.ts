"use client";

import {
  getPartySalesMargin,
  getProductionMargin,
  type PartySalesMarginReport,
  type ProductionMarginReport,
} from "@/lib/finance-api";
import { policyForRange } from "../cache-policy";
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
