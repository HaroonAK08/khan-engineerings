import { api } from "@/lib/api";
import type { BatchExpense } from "@/types/production";

export type PayType = "weekly" | "monthly" | "per_unit";
export type PayDay = "monday" | "thursday";

export type Worker = {
  _id: string;
  name: string;
  /** Urdu display name when UI is in Urdu */
  nameUr: string;
  /** Last used pay style — suggestion only, not locked */
  payType: PayType | null;
  /** Last paid amount (or last per-unit rate) — suggestion only */
  rate: number | null;
  unitLabel: string;
  payDays: PayDay[];
  job: string;
  notes: string;
  isActive: boolean;
};

export async function listWorkers(params?: { active?: string }) {
  const { data } = await api.get<{ workers: Worker[] }>("/workers", { params });
  return data.workers;
}

export async function createWorker(body: {
  name: string;
  nameUr?: string;
  payType?: PayType | null;
  rate?: number | null;
  unitLabel?: string;
  payDays?: PayDay[];
  job?: string;
  notes?: string;
}) {
  const { data } = await api.post<{ worker: Worker }>("/workers", body);
  return data.worker;
}

export async function updateWorker(
  id: string,
  body: Partial<{
    name: string;
    nameUr: string;
    payType: PayType | null;
    rate: number | null;
    unitLabel: string;
    payDays: PayDay[];
    job: string;
    notes: string;
    isActive: boolean;
  }>
) {
  const { data } = await api.patch<{ worker: Worker }>(`/workers/${id}`, body);
  return data.worker;
}

export async function deactivateWorker(id: string) {
  const { data } = await api.delete<{ worker: Worker }>(`/workers/${id}`);
  return data.worker;
}

export async function payWorker(
  id: string,
  body: {
    expenseDate: string;
    payType: PayType;
    amount?: number;
    units?: number;
    unitRate?: number;
    payDay?: PayDay;
    notes?: string;
  }
) {
  const { data } = await api.post<{ expense: BatchExpense; worker: Worker }>(
    `/workers/${id}/pay`,
    body
  );
  return data;
}

export async function listSalaryPayments(params?: {
  dateFrom?: string;
  dateTo?: string;
  workerId?: string;
}) {
  const { data } = await api.get<{ payments: BatchExpense[] }>("/workers/payments", {
    params,
  });
  return data.payments;
}
