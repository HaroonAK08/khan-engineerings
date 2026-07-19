import { api } from "@/lib/api";

export type InventoryOverview = {
  raw: {
    totalKg: number;
    availableKg?: number;
    purchasedKg?: number;
    consumedKg?: number;
    totalSpend: number;
    purchaseCount: number;
    avgRate: number;
  };
  finished: { totalUnits: number; skuCount: number };
  alerts: { count: number };
  movementCount: number;
};

export type FinishedStockItem = {
  productId: string;
  name: string;
  sku: string;
  unitLabel: string;
  lowStockThreshold: number;
  category: { id: string; name: string } | null;
  size: { id: string; name: string; code: string } | null;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  isLow: boolean;
};

export type StockMovement = {
  _id: string;
  itemType: "raw_scrap" | "raw_daig" | "reusable" | "finished_good";
  direction: "in" | "out";
  reason: string;
  quantity: number;
  unit: string;
  product?: { _id: string; name: string; sku: string } | null;
  warehouse?: { _id: string; name: string; code: string } | null;
  movementDate: string;
  notes: string;
};

export type CatalogItem = {
  _id: string;
  name: string;
  description?: string;
  code?: string;
  location?: string;
  isDefault?: boolean;
  isActive: boolean;
};

export type InventoryReport = {
  period: { from: string; to: string };
  raw: InventoryOverview["raw"];
  finishedStock: {
    totalUnits: number;
    skuCount: number;
    items: FinishedStockItem[];
  };
  producedThisPeriod: {
    totals: {
      goodUnits: number;
      rejectedUnits: number;
      batchCount: number;
      netConsumedKg: number;
    };
    byProduct: Array<{
      productId: string;
      name: string;
      batchCount: number;
      goodUnits: number;
      rejectedUnits: number;
      netConsumedKg: number;
    }>;
  };
  lowStock: FinishedStockItem[];
};

export async function getInventoryOverview() {
  const { data } = await api.get<{ overview: InventoryOverview }>("/inventory/overview");
  return data.overview;
}

export async function getFinishedStock(params?: {
  warehouse?: string;
  category?: string;
  q?: string;
}) {
  const { data } = await api.get<{
    items: FinishedStockItem[];
    totalUnits: number;
    skuCount: number;
  }>("/inventory/finished", { params });
  return data;
}

export async function getInventoryAlerts() {
  const { data } = await api.get<{
    alerts: {
      finished: FinishedStockItem[];
      raw: { material: string; availableKg: number; message: string } | null;
      count: number;
    };
  }>("/inventory/alerts");
  return data.alerts;
}

export async function listMovements(params?: {
  itemType?: string;
  product?: string;
  warehouse?: string;
  dateFrom?: string;
  dateTo?: string;
  reason?: string;
}) {
  const { data } = await api.get<{ movements: StockMovement[] }>("/inventory/movements", {
    params,
  });
  return data.movements;
}

export async function createAdjustment(body: {
  itemType: string;
  direction: string;
  quantity: number;
  product?: string;
  warehouse?: string;
  movementDate?: string;
  notes?: string;
}) {
  const { data } = await api.post<{ movement: StockMovement }>("/inventory/movements", body);
  return data.movement;
}

export async function getLiveInventoryReport(params?: { dateFrom?: string; dateTo?: string }) {
  const { data } = await api.get<{ report: InventoryReport }>("/inventory/reports", { params });
  return data.report;
}

export async function syncInventoryHistory() {
  const { data } = await api.post<{ purchaseSynced: number; batchSynced: number }>(
    "/inventory/sync"
  );
  return data;
}

export async function listCategories() {
  const { data } = await api.get<{ categories: CatalogItem[] }>("/inventory/categories");
  return data.categories;
}

export async function createCategory(body: Partial<CatalogItem>) {
  const { data } = await api.post<{ category: CatalogItem }>("/inventory/categories", body);
  return data.category;
}

export async function updateCategory(id: string, body: Partial<CatalogItem>) {
  const { data } = await api.patch<{ category: CatalogItem }>(`/inventory/categories/${id}`, body);
  return data.category;
}

export async function listSizes() {
  const { data } = await api.get<{ sizes: CatalogItem[] }>("/inventory/sizes");
  return data.sizes;
}

export async function createSize(body: Partial<CatalogItem>) {
  const { data } = await api.post<{ size: CatalogItem }>("/inventory/sizes", body);
  return data.size;
}

export async function updateSize(id: string, body: Partial<CatalogItem>) {
  const { data } = await api.patch<{ size: CatalogItem }>(`/inventory/sizes/${id}`, body);
  return data.size;
}

export async function listWarehouses() {
  const { data } = await api.get<{ warehouses: CatalogItem[] }>("/inventory/warehouses");
  return data.warehouses;
}

export async function createWarehouse(body: Partial<CatalogItem>) {
  const { data } = await api.post<{ warehouse: CatalogItem }>("/inventory/warehouses", body);
  return data.warehouse;
}

export async function updateWarehouse(id: string, body: Partial<CatalogItem>) {
  const { data } = await api.patch<{ warehouse: CatalogItem }>(
    `/inventory/warehouses/${id}`,
    body
  );
  return data.warehouse;
}
