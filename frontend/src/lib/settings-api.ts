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

export type TaxSplitMode = "half" | "per_kg" | "percent";

export type TaxSplitSettings = {
  mode: TaxSplitMode;
  hubPercent: number;
  drumPercent: number;
};

export async function getTaxSplit() {
  const { data } = await api.get<TaxSplitSettings>("/settings/tax-split");
  const mode: TaxSplitMode =
    data.mode === "half" || data.mode === "percent" ? data.mode : "per_kg";
  return {
    mode,
    hubPercent: Number(data.hubPercent) || 50,
    drumPercent: Number(data.drumPercent) || 50,
  };
}

export async function setTaxSplit(body: {
  mode: TaxSplitMode;
  hubPercent?: number;
  drumPercent?: number;
}) {
  const { data } = await api.put<TaxSplitSettings>("/settings/tax-split", body);
  const mode: TaxSplitMode =
    data.mode === "half" || data.mode === "percent" ? data.mode : "per_kg";
  return {
    mode,
    hubPercent: Number(data.hubPercent) || 50,
    drumPercent: Number(data.drumPercent) || 50,
  };
}

export type ElectricitySplitMode = "intensity" | "percent";

export type ElectricitySplitSettings = {
  mode: ElectricitySplitMode;
  hubPercent: number;
  drumPercent: number;
  hubIntensity: number;
  drumIntensity: number;
};

export async function getElectricitySplit() {
  const { data } = await api.get<ElectricitySplitSettings>("/settings/electricity-split");
  return {
    mode: data.mode === "percent" ? ("percent" as const) : ("intensity" as const),
    hubPercent: Number(data.hubPercent) || 60,
    drumPercent: Number(data.drumPercent) || 40,
    hubIntensity: Number(data.hubIntensity) || 0.6,
    drumIntensity: Number(data.drumIntensity) || 0.4,
  };
}

export async function setElectricitySplit(body: {
  mode: ElectricitySplitMode;
  hubPercent?: number;
  drumPercent?: number;
}) {
  const { data } = await api.put<ElectricitySplitSettings>(
    "/settings/electricity-split",
    body
  );
  return {
    mode: data.mode === "percent" ? ("percent" as const) : ("intensity" as const),
    hubPercent: Number(data.hubPercent) || 60,
    drumPercent: Number(data.drumPercent) || 40,
    hubIntensity: Number(data.hubIntensity) || 0.6,
    drumIntensity: Number(data.drumIntensity) || 0.4,
  };
}

export async function deletePayrollPeriod(month: string) {
  const { data } = await api.delete<{ deleted: boolean; month: string }>(
    `/settings/payroll-periods/${month}`
  );
  return data;
}
