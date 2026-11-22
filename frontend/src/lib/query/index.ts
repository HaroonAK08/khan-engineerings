export { queryKeys, invalidationGroups, type InvalidationGroup } from "./keys";
export { cachePolicy, policyForRange } from "./cache-policy";
export { createQueryClient } from "./client";
export { useAppQuery, useAppMutation, useInvalidate, type Fetcher } from "./hooks";
export {
  useProductionMargin,
  usePartySalesMargin,
  useFinanceMonthly,
  useYearProgress,
} from "./domains/finance";
export { useInventoryReport } from "./domains/inventory";
export { useDashboard } from "./domains/dashboard";
export { useProductionList, type BatchPage } from "./domains/production";
