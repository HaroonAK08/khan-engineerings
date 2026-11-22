import { api } from "@/lib/api";
import { cachedGet, invalidateReference, referenceKey } from "@/lib/reference-cache";
import type {
  BatchCosts,
  BatchExpense,
  CostReport,
  Product,
  ProductionBatch,
  ProductionMeta,
  ProductionReport,
} from "@/types/production";

export async function listProducts(params?: {
  q?: string;
  active?: string;
  family?: string;
}) {
  // Reference data — shared across screens and the voice resolver.
  return cachedGet(referenceKey("products", params), async () => {
    const { data } = await api.get<{ products: Product[] }>("/products", { params });
    return data.products;
  });
}

export async function createProduct(body: Partial<Product>) {
  // Writes change this list — drop the shared reference cache.
  invalidateReference("products");
  const { data } = await api.post<{ product: Product }>("/products", body);
  if (typeof window !== "undefined") {
    const { scheduleVoiceModelRetrain } = await import("@/lib/voice/voice-model");
    scheduleVoiceModelRetrain();
  }
  return data.product;
}

export async function updateProduct(id: string, body: Partial<Product>) {
  // Writes change this list — drop the shared reference cache.
  invalidateReference("products");
  const { data } = await api.patch<{ product: Product }>(`/products/${id}`, body);
  if (typeof window !== "undefined") {
    const { scheduleVoiceModelRetrain } = await import("@/lib/voice/voice-model");
    scheduleVoiceModelRetrain();
  }
  return data.product;
}

export async function deleteProduct(id: string) {
  // Writes change this list — drop the shared reference cache.
  invalidateReference("products");
  await api.delete(`/products/${id}`);
  if (typeof window !== "undefined") {
    const { scheduleVoiceModelRetrain } = await import("@/lib/voice/voice-model");
    scheduleVoiceModelRetrain();
  }
}

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  returned: number;
  all?: boolean;
};

export type ListBatchesParams = {
  product?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  status?: string;
  currentStage?: string;
  family?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  /** Opt out of paging — used by day-level bulk actions. */
  all?: boolean;
};

/**
 * Paginated production list. Returns rows plus the page metadata the server
 * now sends, so the UI can show "N of M" instead of a silently clipped list.
 */
export async function listBatchesPage(params?: ListBatchesParams, signal?: AbortSignal) {
  const { data } = await api.get<{ batches: ProductionBatch[]; page?: PageMeta }>(
    "/production",
    { params, signal }
  );
  return { batches: data.batches, page: data.page };
}

/** Rows only — kept for callers that do not care about paging. */
export async function listBatches(params?: ListBatchesParams, signal?: AbortSignal) {
  const { batches } = await listBatchesPage(params, signal);
  return batches;
}

export async function getBatch(id: string) {
  const { data } = await api.get<{ batch: ProductionBatch }>(`/production/${id}`);
  return data.batch;
}

export async function produce(body: {
  productId: string;
  quantity: number;
  wastePercent?: number;
  metalKg?: number;
  materialType?: "scrap" | "daig";
  productionDate?: string;
  notes?: string;
  batchNo?: string;
  confirmDuplicate?: boolean;
}) {
  const { data } = await api.post<{
    batch: ProductionBatch & {
      produceCalc?: {
        metalKg: number;
        wastePercent: number;
        wasteKg: number;
        chargedKg: number;
        materialType: string;
        availableAfter: number;
      };
    };
  }>("/production/produce", body);
  return data.batch;
}

export async function createBatch(body: {
  family: "hub" | "drum" | "other";
  materialType?: "scrap" | "daig";
  productionDate: string;
  notes?: string;
  batchNo?: string;
  isRework?: boolean;
}) {
  const { data } = await api.post<{ batch: ProductionBatch }>("/production", body);
  return data.batch;
}

export async function updateProduce(
  id: string,
  body: {
    productId?: string;
    quantity?: number;
    wastePercent?: number;
    metalKg?: number;
    materialType?: "scrap" | "daig";
    productionDate?: string;
    notes?: string;
  }
) {
  const { data } = await api.patch<{
    batch: ProductionBatch & {
      produceCalc?: {
        metalKg: number;
        wastePercent: number;
        wasteKg: number;
        chargedKg: number;
        materialType: string;
        availableAfter: number;
      };
    };
  }>(`/production/${id}`, body);
  return data.batch;
}

export async function deleteBatch(id: string) {
  await api.delete(`/production/${id}`);
}

export async function shiftProductionDates(ids: string[], productionDate: string) {
  const { data } = await api.post<{ updated: number; productionDate: string }>(
    "/production/shift-date",
    { ids, productionDate }
  );
  return data;
}

export async function deleteBatches(ids: string[]) {
  const { data } = await api.post<{ removed: number }>("/production/remove-many", { ids });
  return data;
}

export async function getProductionReport(params?: {
  dateFrom?: string;
  dateTo?: string;
  family?: string;
}) {
  const { data } = await api.get<{ report: ProductionReport }>("/production/reports", { params });
  return data.report;
}

export type ProductProductionReport = {
  product: {
    id: string;
    name: string;
    sku: string;
    family: "hub" | "drum" | string;
    weightKg: number | null;
  };
  period: { from: string | null; to: string | null };
  totals: {
    runCount: number;
    pieces: number;
    usedKg: number;
    wasteKg: number;
    wastePercent: number;
  };
  byDate: Array<{
    date: string;
    runs: number;
    quantity: number;
    usedKg: number;
    wasteKg: number;
  }>;
  runs: Array<{
    id: string;
    batchNo: string;
    productionDate: string;
    date: string;
    quantity: number;
    usedKg: number;
    wasteKg: number;
    wastePercent: number;
    materialType: string;
    status: string;
  }>;
};

export async function getProductProductionReport(
  productId: string,
  params?: { dateFrom?: string; dateTo?: string }
) {
  const { data } = await api.get<{ report: ProductProductionReport }>(
    `/production/reports/products/${productId}`,
    { params }
  );
  return data.report;
}

export async function getProductionMeta() {
  const { data } = await api.get<ProductionMeta>("/production/meta");
  return data;
}

export async function getBatchCosts(batchId: string) {
  const { data } = await api.get<{ costs: BatchCosts }>(`/production/${batchId}/costs`);
  return data.costs;
}

export async function listBatchExpenses(batchId: string) {
  const { data } = await api.get<{ expenses: BatchExpense[] }>(
    `/production/${batchId}/expenses`
  );
  return data.expenses;
}

export async function createBatchExpense(
  batchId: string,
  body: {
    stage: string;
    category: string;
    amount: number;
    expenseDate: string;
    notes?: string;
  }
) {
  const { data } = await api.post<{ expense: BatchExpense }>(
    `/production/${batchId}/expenses`,
    body
  );
  return data.expense;
}

export async function deleteBatchExpense(batchId: string, expenseId: string) {
  await api.delete(`/production/${batchId}/expenses/${expenseId}`);
}

export async function getCostReport(params?: {
  dateFrom?: string;
  dateTo?: string;
  batch?: string;
}) {
  const { data } = await api.get<{ report: CostReport }>("/production/cost-reports", { params });
  return data.report;
}

export function productName(product: Product | string | undefined | null) {
  if (!product) return "—";
  if (typeof product === "string") return product;
  return product.name;
}

export function productId(product: Product | string | undefined | null) {
  if (!product) return "";
  if (typeof product === "string") return product;
  return product._id;
}
