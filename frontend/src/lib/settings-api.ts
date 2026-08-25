import { api } from "@/lib/api";

export type WasteHistoryRow = {
  family: "hub" | "drum";
  percent: number;
  previousPercent: number | null;
  effectiveFrom: string;
  changedAt?: string;
};

export type WasteSettings = {
  hubPercent: number;
  drumPercent: number;
  hubEffectiveFrom: string | null;
  drumEffectiveFrom: string | null;
  history: WasteHistoryRow[];
};

export async function getWasteSettings() {
  const { data } = await api.get<{ settings: WasteSettings }>("/settings/waste-percent");
  return data.settings;
}

export async function setWastePercent(body: {
  family: "hub" | "drum";
  percent: number;
  effectiveFrom: string;
}) {
  const { data } = await api.put<{
    settings: WasteSettings;
    applied: { updated: number };
  }>("/settings/waste-percent", body);
  return data;
}

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

export type TaxSplitMode = "half" | "per_kg";

export async function getTaxSplit() {
  const { data } = await api.get<{ mode: TaxSplitMode }>("/settings/tax-split");
  return data.mode === "half" ? "half" : "per_kg";
}

export async function setTaxSplit(mode: TaxSplitMode) {
  const { data } = await api.put<{ mode: TaxSplitMode }>("/settings/tax-split", { mode });
  return data.mode === "half" ? "half" : "per_kg";
}

export async function deletePayrollPeriod(month: string) {
  const { data } = await api.delete<{ deleted: boolean; month: string }>(
    `/settings/payroll-periods/${month}`
  );
  return data;
}
