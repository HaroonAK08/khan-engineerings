"use client";

import {
  listBatchesPage,
  type ListBatchesParams,
  type PageMeta,
} from "@/lib/production-api";
import type { ProductionBatch } from "@/types/production";
import { cachePolicy } from "../cache-policy";
import { useAppQuery } from "../hooks";
import { queryKeys } from "../keys";

export type BatchPage = { batches: ProductionBatch[]; page?: PageMeta };

export function useProductionList(params: ListBatchesParams, enabled = true) {
  return useAppQuery<BatchPage>(
    queryKeys.production.list(params),
    (signal) => listBatchesPage(params, signal),
    {
      enabled,
      ...cachePolicy.list,
      // Keep the previous page on screen while the next one loads, so paging
      // does not blank the table.
      placeholderData: (previous) => previous,
    }
  );
}
