"use client";

import {
  getLiveInventoryReport,
  type InventoryReport,
} from "@/lib/inventory-api";
import { policyForRange } from "../cache-policy";
import { useAppQuery } from "../hooks";
import { queryKeys } from "../keys";

type ReportParams = { asOf?: string; dateFrom?: string; dateTo?: string };

export function useInventoryReport(params: ReportParams, enabled = true) {
  return useAppQuery<InventoryReport>(
    queryKeys.inventory.report(params),
    (signal) => getLiveInventoryReport(params, signal),
    { enabled, ...policyForRange(params.dateTo) }
  );
}
