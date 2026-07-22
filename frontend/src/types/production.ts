export type ProductFamily = "hub" | "drum";

export type Product = {
  _id: string;
  name: string;
  sku: string;
  description: string;
  unitLabel: string;
  family: ProductFamily;
  weightKg?: number | null;
  standardCost?: number;
  pricePerKg?: number;
  sellingPrice?: number;
  category?: { _id: string; name: string } | string | null;
  size?: { _id: string; name: string; code?: string } | string | null;
  defaultWarehouse?: { _id: string; name: string; code?: string } | string | null;
  lowStockThreshold?: number;
  isActive: boolean;
  createdAt?: string;
};

export type BatchInput = {
  materialType: "scrap" | "daig";
  quantityKg: number;
};

export type BatchOutput = {
  product: Product | string;
  quantity: number;
  family: ProductFamily;
};

export type BatchStage = {
  stage: ProductionStageId;
  status: "pending" | "completed" | "skipped";
  completedAt?: string | null;
  goodUnits?: number | null;
  brokenUnits?: number | null;
  brokenKg?: number | null;
  notes?: string;
};

export type OutputProgress = {
  product: Product | string;
  furnaceQty: number;
  goodAfterTurning: number;
  brokenAfterTurning: number;
  finishedQty: number;
};

export type ProductionBatch = {
  _id: string;
  batchNo: string;
  family: ProductFamily;
  isRework?: boolean;
  productionDate: string;
  status: "in_progress" | "completed" | "cancelled" | string;
  currentStage: ProductionStageId | string;
  inputs: BatchInput[];
  outputs: BatchOutput[];
  furnaceWasteKg: number;
  handKg: number;
  stages: BatchStage[];
  outputProgress: OutputProgress[];
  notes: string;
  // legacy optional
  product?: Product | string;
  inputScrapKg?: number;
  materialLossKg?: number;
  returnedScrapKg?: number;
  goodUnits?: number;
  rejectedUnits?: number;
  totalInputKg?: number;
  totalFurnaceUnits?: number;
  createdAt?: string;
};

export type ProductionReport = {
  totals: {
    batchCount: number;
    totalInputKg: number;
    inputScrapKg?: number;
    handKg: number;
    returnedScrapKg?: number;
    wasteKg: number;
    materialLossKg?: number;
    netConsumedKg?: number;
    goodUnits: number;
    brokenUnits: number;
    rejectedUnits?: number;
    finishedUnits?: number;
    rejectRate?: number;
    lossRate?: number;
    byFamily?: Record<string, number>;
  };
  byProduct?: Array<{
    productId: string;
    name: string;
    batchCount: number;
    goodUnits: number;
    rejectedUnits: number;
    netConsumedKg: number;
    materialLossKg?: number;
  }>;
};

export type ProductionStageId =
  | "furnace"
  | "turning"
  | "drilling"
  | "painting"
  | "polishing"
  | "finished";

export type ExpenseCategoryId = string;

export type ProductionMeta = {
  stages: Array<{ id: ProductionStageId; label: string; order: number }>;
  categories: Array<{
    id: string;
    label: string;
    group?: string;
    groupLabel?: string;
  }>;
  categoryGroups?: Array<{
    id: string;
    label: string;
    items: Array<{ id: string; label: string }>;
  }>;
  materialTypes?: Array<{ id: string; label: string; typicalOutput?: string }>;
  productFamilies?: Array<{ id: string; label: string; stages: string[] }>;
  stockItemTypes?: Array<{ id: string; label: string; unit: string }>;
  stockReasons?: string[];
};

export type BatchExpense = {
  _id: string;
  batch?: string | null;
  stage?: ProductionStageId | string;
  category: ExpenseCategoryId;
  amount: number;
  expenseDate: string;
  notes: string;
  worker?:
    | string
    | null
    | {
        _id: string;
        name: string;
        payType?: string;
        rate?: number;
        job?: string;
      };
  units?: number | null;
  /** Purchase qty for paint/tools/etc. */
  quantity?: number | null;
  quantityUnit?: string | null;
  payType?: "weekly" | "monthly" | "per_unit" | null;
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
