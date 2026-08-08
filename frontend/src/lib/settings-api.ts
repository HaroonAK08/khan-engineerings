import { api } from "@/lib/api";

export type PayrollPeriod = {
  month: string;
  paymentFrom: string;
  paymentTo: string;
};

export type SalaryPeriodInfo = {
  from?: string;
  to?: string;
  custom: boolean;
  month: string | null;
  paymentFrom: string | null;
  paymentTo: string | null;
};

export async function listPayrollPeriods() {
  const { data } = await api.get<{ periods: PayrollPeriod[] }>("/settings/payroll-periods");
  return data.periods;
}

export async function getPayrollPeriod(month: string) {
  const { data } = await api.get<{ period: PayrollPeriod | null }>(
    `/settings/payroll-periods/${month}`
  );
  return data.period;
}

export async function savePayrollPeriod(body: {
  month: string;
  paymentFrom: string;
  paymentTo: string;
}) {
  const { data } = await api.put<{ period: PayrollPeriod }>(
    `/settings/payroll-periods/${body.month}`,
    {
      paymentFrom: body.paymentFrom,
      paymentTo: body.paymentTo,
    }
  );
  return data.period;
}

export async function deletePayrollPeriod(month: string) {
  const { data } = await api.delete<{ deleted: boolean; month: string }>(
    `/settings/payroll-periods/${month}`
  );
  return data;
}
