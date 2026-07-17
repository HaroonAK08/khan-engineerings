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
