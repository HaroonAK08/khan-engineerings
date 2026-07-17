export type Product = {
  _id: string;
  name: string;
  sku: string;
  description: string;
  unitLabel: string;
  category?: { _id: string; name: string } | string | null;
  size?: { _id: string; name: string; code?: string } | string | null;
  defaultWarehouse?: { _id: string; name: string; code?: string } | string | null;
  lowStockThreshold?: number;
  isActive: boolean;
  createdAt?: string;
};

export type ProductionBatch = {
  _id: string;
  batchNo: string;
  product: Product | string;
  productionDate: string;
  inputScrapKg: number;
  materialLossKg: number;
  returnedScrapKg: number;
  goodUnits: number;
  rejectedUnits: number;
  notes: string;
  status: string;
  netConsumedKg?: number;
  totalUnits?: number;
  createdAt?: string;
};

export type ProductionReport = {
  totals: {
    batchCount: number;
    inputScrapKg: number;
    materialLossKg: number;
    returnedScrapKg: number;
    netConsumedKg: number;
    goodUnits: number;
    rejectedUnits: number;
    totalUnits: number;
    rejectRate: number;
    lossRate: number;
  };
  byProduct: Array<{
    productId: string;
    name: string;
    sku: string;
    batchCount: number;
    inputScrapKg: number;
    materialLossKg: number;
    returnedScrapKg: number;
    netConsumedKg: number;
    goodUnits: number;
    rejectedUnits: number;
  }>;
};

export type ProductionStageId =
  | "melting"
  | "casting"
  | "drilling"
  | "shaping"
  | "painting"
  | "finishing";

export type ExpenseCategoryId =
  | "electricity"
  | "fuel"
  | "labor"
  | "paint"
  | "packaging"
  | "maintenance"
  | "other";

export type ProductionMeta = {
  stages: Array<{ id: ProductionStageId; label: string; order: number }>;
  categories: Array<{ id: ExpenseCategoryId; label: string }>;
};

export type BatchExpense = {
  _id: string;
  batch: string;
  stage: ProductionStageId;
  category: ExpenseCategoryId;
  amount: number;
  expenseDate: string;
  notes: string;
};

export type BatchCosts = {
  batchId: string;
  batchNo: string;
  goodUnits: number;
  expenseCount: number;
  operatingCost: number;
  materialCost: number;
  avgRatePerKg: number;
  netConsumedKg: number;
  totalCost: number;
  costPerGoodUnit: number | null;
  operatingPerGoodUnit: number | null;
  byStage: Array<{ stage: string; label: string; amount: number }>;
  byCategory: Array<{ category: string; label: string; amount: number }>;
  mostExpensiveStage: { stage: string; label: string; amount: number } | null;
  expenses: BatchExpense[];
};

export type CostReport = {
  totals: {
    totalOperatingCost: number;
    expenseCount: number;
  };
  byStage: Array<{ stage: string; label: string; amount: number; count: number }>;
  byCategory: Array<{ category: string; label: string; amount: number; count: number }>;
  byMonth: Array<{
    year: number;
    month: number;
    label: string;
    amount: number;
    count: number;
    change: number | null;
    changePct: number | null;
  }>;
  byBatch: Array<{
    batchId: string;
    batchNo: string;
    productionDate: string | null;
    goodUnits: number;
    operatingCost: number;
    expenseCount: number;
    costPerGoodUnit: number | null;
  }>;
  mostExpensiveStage: { stage: string; label: string; amount: number; count: number } | null;
  risingCategories: Array<{ category: string; label: string; amount: number }>;
  expenseTrend: {
    from: string;
    to: string;
    change: number | null;
    changePct: number | null;
    direction: "up" | "down" | "flat";
  } | null;
};
