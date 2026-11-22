"use client";

import { getDashboard, type DashboardData } from "@/lib/dashboard-api";
import { cachePolicy } from "../cache-policy";
import { useAppQuery } from "../hooks";
import { queryKeys } from "../keys";

/**
 * Business overview KPIs.
 *
 * `/api/dashboard` has existed and been maintained since the start but was
 * never called by any screen — see docs/audit/02 (BL-020). The overview page
 * now consumes it rather than recomputing the same figures client-side.
 */
export function useDashboard(enabled = true) {
  return useAppQuery<DashboardData>(
    queryKeys.dashboard.overview(),
    (signal) => getDashboard(signal),
    { enabled, ...cachePolicy.live }
  );
}
