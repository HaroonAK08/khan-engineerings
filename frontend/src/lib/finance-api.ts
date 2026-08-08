import { api } from "@/lib/api";

export type FinanceOverview = {
  period: { from: string; to: string };
  income: {
    customerPayments: number;
    salesInvoiced: number;
    otherIncome: number;
    cashIn: number;
    revenue: number;
  };
  expenses: {
    supplierPayments: number;
    rawMaterialPurchases: number;
    manufacturingOperating: number;
    materialEstimate: number;
    otherExpenses: number;
    cashOut: number;
    totalAccrual: number;
    pnlExpenseTotal: number;
  };
  profitAndLoss: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    otherExpenses: number;
    netProfit: number;
    marginPct: number | null;
    isProfit: boolean;
  };
  cashFlow: {
    cashIn: number;
    cashOut: number;
    net: number;
  };
  counts: Record<string, number>;
};

export type FinanceEntry = {
  _id: string;
  type: "income" | "expense";
  category: string;
  amount: number;
  entryDate: string;
  notes: string;
  reference: string;
};

export type MonthlyPoint = {
  year: number;
  month: number;
  label: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  cashIn: number;
  cashOut: number;
  cashNet: number;
  isProfit: boolean;
};

export async function getFinanceOverview(params?: { dateFrom?: string; dateTo?: string }) {
  const { data } = await api.get<{ overview: FinanceOverview }>("/finance/overview", { params });
  return data.overview;
}

export async function getFinanceMonthly(params?: { months?: number }) {
  const { data } = await api.get<{ months: MonthlyPoint[] }>("/finance/monthly", { params });
  return data.months;
}

export async function getCustomerRevenue(params?: { dateFrom?: string; dateTo?: string }) {
  const { data } = await api.get<{
    period: { from: string; to: string };
    customers: Array<{
      customerId: string;
      name: string;
      revenue: number;
      paid: number;
      cashCollected: number;
      orderCount: number;
    }>;
  }>("/finance/customer-revenue", { params });
  return data;
}

export async function getSupplierExpenses(params?: { dateFrom?: string; dateTo?: string }) {
  const { data } = await api.get<{
    period: { from: string; to: string };
    suppliers: Array<{
      supplierId: string;
      name: string;
      purchaseSpend: number;
      cashPaid: number;
      purchaseCount: number;
      kg: number;
    }>;
  }>("/finance/supplier-expenses", { params });
  return data;
}

export async function getProductProfit(params?: { dateFrom?: string; dateTo?: string }) {
  const { data } = await api.get<{
    period: { from: string; to: string };
    products: Array<{
      productId: string;
      name: string;
      revenue: number;
      unitsSold: number;
      goodUnitsProduced: number;
      operatingCost: number;
      materialCostShare: number;
      totalCost: number;
      profit: number;
      marginPct: number | null;
    }>;
    topEarner: { name: string; profit: number; revenue: number } | null;
  }>("/finance/product-profit", { params });
  return data;
}

export type ProductionMarginFamily = {
  pieces: number;
  finishedKg?: number;
  scrapKg: number;
  daigKg: number;
  wasteKg: number;
  materialCost: number;
  overhead: number;
  totalCost: number;
  sellValue: number;
  unitsSold?: number;
  profit: number;
  costPerKg?: number | null;
  overheadPerKg?: number | null;
  marginPct: number | null;
};

export type ProductionMarginProduct = {
  productId: string;
  name: string;
  family: string;
  pieces: number;
  weightKg?: number;
  finishedKg?: number;
  scrapKg: number;
  daigKg: number;
  wasteKg: number;
  avgScrapRate: number;
  avgDaigRate: number;
  scrapCost: number;
  daigCost: number;
  materialCost: number;
  overhead: number;
  totalCost: number;
  costPerPiece: number;
  costPerKg?: number | null;
  overheadPerKg?: number | null;
  sellPricePerPiece: number;
  sellPriceSource?: "period_sales" | "all_time_sales" | "catalog" | "none";
  unitsSoldPeriod?: number;
  sellValue: number;
  profit: number;
  profitPerPiece: number;
  marginPct: number | null;
};

export type ProductionMarginReport = {
  period: { from: string; to: string };
  rates: {
    avgScrapRate: number;
    avgDaigRate: number;
    scrapSource?: "period" | "all_time";
    daigSource?: "period" | "all_time";
  };
  summary: ProductionMarginFamily & {
    scrapCost: number;
    daigCost: number;
    unitsSold?: number;
    hubSales?: number;
    drumSales?: number;
    hubUnits?: number;
    drumUnits?: number;
    builtyCount?: number;
    hubFinishedKg?: number;
    drumFinishedKg?: number;
    hubCostPerKg?: number | null;
    drumCostPerKg?: number | null;
    hubOverheadPerKg?: number | null;
    drumOverheadPerKg?: number | null;
    overheadPools?: {
      hub: number;
      drum: number;
      common: number;
      electricity?: number;
    };
    electricityIntensity?: { hub: number; drum: number };
  };
  purchasedVsUsed: {
    purchased: {
      scrapKg: number;
      daigKg: number;
      totalKg: number;
      scrapAmount: number;
      daigAmount: number;
      totalAmount: number;
      scrapCount: number;
      daigCount: number;
      purchaseCount: number;
    };
    used: {
      scrapKg: number;
      daigKg: number;
      totalKg: number;
      scrapAmount: number;
      daigAmount: number;
      totalAmount: number;
    };
  };
  byFamily: { hub: ProductionMarginFamily; drum: ProductionMarginFamily };
  products: ProductionMarginProduct[];
  expenseBreakdown: Array<{
    id: string;
    label: string;
    amount: number;
    kind: "material" | "overhead";
  }>;
  channelManufacture?: {
    ikEngineering: {
      id: string;
      name: string;
      hub: ChannelManufactureLine;
      drum: ChannelManufactureLine;
    };
    powerEngineering: {
      id: string;
      name: string;
      hub: ChannelManufactureLine;
      drum: ChannelManufactureLine;
      salesmanLoad: number;
      salesmanAddOnPerKg: number;
      salesmanSoldKg?: number;
    };
  };
};

export type ChannelManufactureDetailLine = {
  id: string;
  label: string;
  perKg: number;
};

export type ChannelManufactureLine = {
  materialPerKg: number | null;
  salariesPerKg: number | null;
  mfgExpensesPerKg: number | null;
  salesmanAddOnPerKg: number;
  totalPerKg: number | null;
  salaryLines?: ChannelManufactureDetailLine[];
  expenseLines?: ChannelManufactureDetailLine[];
};

export async function getProductionMargin(params?: { dateFrom?: string; dateTo?: string }) {
  const { data } = await api.get<ProductionMarginReport>("/finance/production-margin", {
    params,
  });
  return data;
}

export type PartySalesMarginParty = {
  partyId: string;
  partyName: string;
  groupId: string | null;
  groupName: string;
  salesmanChannel: boolean;
  hubQty: number;
  drumQty: number;
  totalQty: number;
  hubKg: number;
  drumKg: number;
  totalKg: number;
  hubSale: number;
  drumSale: number;
  totalSale: number;
  hubSalePerKg: number | null;
  drumSalePerKg: number | null;
  avgSalePerKg: number | null;
  hubMfgPerKg: number | null;
  drumMfgPerKg: number | null;
  avgMfgPerKg: number | null;
  hubMfg: number;
  drumMfg: number;
  totalMfg: number;
  hubProfit: number;
  drumProfit: number;
  profit: number;
  hubProfitPerKg: number | null;
  drumProfitPerKg: number | null;
  profitPerKg: number | null;
};

export type PartySalesMarginGroup = PartySalesMarginParty & {
  partyCount: number;
};

export type PartySalesMarginReport = {
  period: { from: string; to: string };
  rates: {
    hubFactoryCostPerKg: number | null;
    drumFactoryCostPerKg: number | null;
    hubMfgSalesman: number | null;
    drumMfgSalesman: number | null;
    salesmanPerSoldKg: number;
    salesmanLoad: number;
    salesmanSoldKg: number;
    noSalesmanGroups: string[];
  };
  electricity: {
    bill: number;
    hubShare: number;
    drumShare: number;
    hubPerKg: number | null;
    drumPerKg: number | null;
  };
  totals: {
    hubQty: number;
    drumQty: number;
    totalQty: number;
    hubKg: number;
    drumKg: number;
    totalKg: number;
    hubSale: number;
    drumSale: number;
    totalSale: number;
    hubMfg: number;
    drumMfg: number;
    totalMfg: number;
    hubProfit: number;
    drumProfit: number;
    profit: number;
    avgSalePerKg: number | null;
    avgMfgPerKg: number | null;
    hubProfitPerKg: number | null;
    drumProfitPerKg: number | null;
    profitPerKg: number | null;
    salesman: {
      hubQty: number;
      drumQty: number;
      totalQty: number;
      hubKg: number;
      drumKg: number;
      totalKg: number;
      hubSale: number;
      drumSale: number;
      totalSale: number;
      hubMfg: number;
      drumMfg: number;
      totalMfg: number;
      hubProfit: number;
      drumProfit: number;
      profit: number;
      avgSalePerKg: number | null;
      avgMfgPerKg: number | null;
      hubProfitPerKg: number | null;
      drumProfitPerKg: number | null;
      profitPerKg: number | null;
    };
    direct: {
      hubQty: number;
      drumQty: number;
      totalQty: number;
      hubKg: number;
      drumKg: number;
      totalKg: number;
      hubSale: number;
      drumSale: number;
      totalSale: number;
      hubMfg: number;
      drumMfg: number;
      totalMfg: number;
      hubProfit: number;
      drumProfit: number;
      profit: number;
      avgSalePerKg: number | null;
      avgMfgPerKg: number | null;
      hubProfitPerKg: number | null;
      drumProfitPerKg: number | null;
      profitPerKg: number | null;
    };
  };
  groups: PartySalesMarginGroup[];
  parties: PartySalesMarginParty[];
  mainChannels?: {
    powerEngineering: {
      id: string;
      name: string;
      salesmanChannel: boolean;
      memberGroups: string[];
    };
    ikEngineering: {
      id: string;
      name: string;
      salesmanChannel: boolean;
      memberGroups: string[];
    };
  };
  channelExpenses?: {
    items: Array<{
      _id: string;
      category: string;
      amount: number;
      expenseDate: string;
      notes: string;
      title: string;
      salesmanId: string | null;
      salesmanName: string | null;
    }>;
    tourTotal: number;
    salesmanPayTotal: number;
    total: number;
  };
};

export async function getPartySalesMargin(params?: { dateFrom?: string; dateTo?: string }) {
  const { data } = await api.get<PartySalesMarginReport>("/finance/party-sales-margin", {
    params,
  });
  return data;
}

export async function getManufacturingFinance(params?: { dateFrom?: string; dateTo?: string }) {
  const { data } = await api.get<{
    period: { from: string; to: string };
    operating: { totalOperatingCost: number; expenseCount: number };
    byStage: Array<{ stage: string; label: string; amount: number }>;
    byCategory: Array<{ category: string; label: string; amount: number; sharePct: number }>;
    mostExpensiveStage: { label: string; amount: number } | null;
    materialEstimate: { total: number; netKg: number; avgRate: number };
    totalManufacturingCost: number;
    expenseHotspots: Array<{ category: string; label: string; amount: number }>;
  }>("/finance/manufacturing", { params });
  return data;
}

export async function getExpenseBreakdown(params?: { dateFrom?: string; dateTo?: string }) {
  const { data } = await api.get<{
    period: { from: string; to: string };
    buckets: Array<{ id: string; label: string; amount: number }>;
    manufacturingCategories: Array<{ category: string; label: string; amount: number }>;
    manualCategories: Array<{ category: string; amount: number; count: number }>;
    hotspots: Array<{ id: string; label: string; amount: number }>;
  }>("/finance/expense-breakdown", { params });
  return data;
}

export async function listFinanceEntries(params?: {
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}) {
  const { data } = await api.get<{ entries: FinanceEntry[] }>("/finance/entries", { params });
  return data.entries;
}

export async function createFinanceEntry(body: {
  type: "income" | "expense";
  category: string;
  amount: number;
  entryDate: string;
  notes?: string;
  reference?: string;
}) {
  const { data } = await api.post<{ entry: FinanceEntry }>("/finance/entries", body);
  return data.entry;
}

export async function deleteFinanceEntry(id: string) {
  await api.delete(`/finance/entries/${id}`);
}
