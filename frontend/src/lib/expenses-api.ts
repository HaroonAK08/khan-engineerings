import { api } from "@/lib/api";
import type { BatchExpense, ProductionMeta } from "@/types/production";

export async function getExpenseMeta() {
  const { data } = await api.get<ProductionMeta>("/expenses/meta");
  return data;
}

export async function listFactoryExpenses(params?: {
  dateFrom?: string;
  dateTo?: string;
  category?: string;
}) {
  const { data } = await api.get<{ expenses: BatchExpense[] }>("/expenses", { params });
  return data.expenses;
}

export async function createFactoryExpense(body: {
  category: string;
  amount: number;
  expenseDate: string;
  stage?: string;
  notes?: string;
}) {
  const { data } = await api.post<{ expense: BatchExpense }>("/expenses", body);
  return data.expense;
}

export async function deleteFactoryExpense(id: string) {
  await api.delete(`/expenses/${id}`);
}
