import { api } from "@/lib/api";
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
  const { data } = await api.get<{ products: Product[] }>("/products", { params });
  return data.products;
}

export async function createProduct(body: Partial<Product>) {
  const { data } = await api.post<{ product: Product }>("/products", body);
  return data.product;
}

export async function updateProduct(id: string, body: Partial<Product>) {
  const { data } = await api.patch<{ product: Product }>(`/products/${id}`, body);
  return data.product;
}

export async function deleteProduct(id: string) {
  await api.delete(`/products/${id}`);
}

export async function listBatches(params?: {
  product?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  status?: string;
  currentStage?: string;
  family?: string;
}) {
  const { data } = await api.get<{ batches: ProductionBatch[] }>("/production", { params });
  return data.batches;
}

export async function getBatch(id: string) {
  const { data } = await api.get<{ batch: ProductionBatch }>(`/production/${id}`);
  return data.batch;
}

export async function createBatch(body: {
  family: "hub" | "drum";
  materialType?: "scrap" | "daig" | "reusable";
  productionDate: string;
  notes?: string;
  batchNo?: string;
  isRework?: boolean;
}) {
  const { data } = await api.post<{ batch: ProductionBatch }>("/production", body);
  return data.batch;
}

export async function recordFurnace(
  id: string,
  body: {
    outputs: Array<{ product: string; quantity: number }>;
    handKg: number;
    wastePercent?: number;
    chargedKg?: number;
    notes?: string;
  }
) {
  const { data } = await api.post<{ batch: ProductionBatch }>(`/production/${id}/furnace`, body);
  return data.batch;
}

export async function recordTurning(
  id: string,
  body: {
    lines: Array<{
      product: string;
      goodUnits: number;
      brokenUnits: number;
      brokenKg: number;
    }>;
    notes?: string;
  }
) {
  const { data } = await api.post<{ batch: ProductionBatch }>(`/production/${id}/turning`, body);
  return data.batch;
}

export async function advanceBatch(id: string) {
  const { data } = await api.post<{ batch: ProductionBatch }>(`/production/${id}/advance`);
  return data.batch;
}

export async function finishBatch(id: string) {
  const { data } = await api.post<{ batch: ProductionBatch }>(`/production/${id}/finish`);
  return data.batch;
}

export async function cancelBatch(id: string) {
  const { data } = await api.post<{ batch: ProductionBatch }>(`/production/${id}/cancel`);
  return data.batch;
}

export async function deleteBatch(id: string) {
  await api.delete(`/production/${id}`);
}

export async function getProductionReport(params?: {
  dateFrom?: string;
  dateTo?: string;
  family?: string;
}) {
  const { data } = await api.get<{ report: ProductionReport }>("/production/reports", { params });
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
