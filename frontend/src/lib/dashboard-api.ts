import { api } from "@/lib/api";

export type DashboardKpis = {
  salesToday: number;
  salesTodayCount: number;
  salesMonth: number;
  profitMonth: number;
  profitIsPositive: boolean;
  marginPct: number | null;
  cashBalance: number;
  cashFlowMonth: number;
  outstandingPayments: number;
  rawMaterialKg: number;
  finishedGoodsUnits: number;
  productionToday: number;
  productionTodayBatches: number;
  expensesToday: number;
  pendingOrders: number;
  lowStockCount: number;
};

export type DashboardData = {
  generatedAt: string;
  kpis: DashboardKpis;
  charts: {
    sales: Array<{ label: string; value: number }>;
    expenses: Array<{ label: string; value: number }>;
    profit: Array<{ label: string; value: number }>;
    production: Array<{ label: string; goodUnits: number; batches: number; netKg: number }>;
  };
  outstanding: Array<{
    orderId: string;
    orderNo: string;
    invoiceNo: string;
    customer: string;
    customerId?: string;
    balance: number;
    paymentStatus: string;
    dueDate?: string | null;
  }>;
  lowStock: {
    count: number;
    raw: { material: string; availableKg: number; message: string } | null;
    finished: Array<{
      productId?: string;
      name: string;
      quantity: number;
      lowStockThreshold: number;
    }>;
  };
  recentActivity: Array<{
    at: string;
    type: string;
    message: string;
    href: string;
  }>;
  topCustomers: Array<{
    customerId: string;
    name: string;
    orderCount: number;
    totalSales: number;
    outstanding: number;
  }>;
  topSuppliers: Array<{
    supplierId: string;
    name: string;
    purchaseSpend: number;
    cashPaid: number;
    kg: number;
  }>;
  productionSummary: {
    today: {
      batches: number;
      goodUnits: number;
      rejectedUnits: number;
      netConsumedKg: number;
      rejectRate: number;
    };
    month: {
      batches: number;
      goodUnits: number;
      rejectedUnits: number;
      netConsumedKg: number;
      rejectRate: number;
      lossRate: number;
    };
  };
};

export async function getDashboard() {
  const { data } = await api.get<{ dashboard: DashboardData }>("/dashboard");
  return data.dashboard;
}
