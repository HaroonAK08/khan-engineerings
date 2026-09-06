import { api } from "@/lib/api";
import { clearVaultToken, getVaultToken, setVaultToken } from "@/lib/vault-token";

export type VaultOwner = "personal" | "company";
export type VaultKind = "bank" | "cash" | "property" | "investment" | "other";

export type VaultStatus = {
  configured: boolean;
  locked: boolean;
  lockedUntil: string | null;
};

export type VaultAsset = {
  id: string;
  owner: VaultOwner;
  kind: VaultKind;
  name: string;
  institution: string;
  amount: number;
  notes: string;
  sortOrder: number;
  updatedAt?: string;
  createdAt?: string;
};

export type VaultTotals = {
  personal: number;
  company: number;
  all: number;
  count: number;
};

export type VaultYearMonth = {
  year: number;
  month: number;
  label: string;
  personal: number;
  company: number;
  all: number;
};

export type VaultYearSummary = {
  year: number;
  current: VaultTotals;
  yearEnd: { personal: number; company: number; all: number };
  months: VaultYearMonth[];
};

function vaultHeaders() {
  const token = getVaultToken();
  return token ? { "X-Vault-Token": token } : {};
}

export async function getVaultStatus() {
  const { data } = await api.get<{ status: VaultStatus }>("/vault/status");
  return data.status;
}

export async function setupVault(pin: string, confirmPin: string) {
  const { data } = await api.post<{ ok: boolean; configured: boolean }>("/vault/setup", {
    pin,
    confirmPin,
  });
  return data;
}

export async function unlockVault(pin: string) {
  const { data } = await api.post<{ vaultToken: string; expiresIn: string }>("/vault/unlock", {
    pin,
  });
  setVaultToken(data.vaultToken);
  return data;
}

export function lockVault() {
  clearVaultToken();
}

export async function changeVaultPin(currentPin: string, newPin: string, confirmPin: string) {
  const { data } = await api.post<{ ok: boolean }>("/vault/change-pin", {
    currentPin,
    newPin,
    confirmPin,
  });
  return data;
}

export async function resetVaultPin(appPin: string, newPin: string, confirmPin: string) {
  const { data } = await api.post<{ ok: boolean; configured: boolean }>("/vault/reset-pin", {
    appPin,
    newPin,
    confirmPin,
  });
  return data;
}

export async function listVaultAssets() {
  const { data } = await api.get<{ assets: VaultAsset[]; totals: VaultTotals }>("/vault/assets", {
    headers: vaultHeaders(),
  });
  return data;
}

export async function createVaultAsset(body: {
  owner: VaultOwner;
  kind: VaultKind;
  name: string;
  institution?: string;
  amount: number;
  notes?: string;
}) {
  const { data } = await api.post<{ asset: VaultAsset }>("/vault/assets", body, {
    headers: vaultHeaders(),
  });
  return data.asset;
}

export async function updateVaultAsset(
  id: string,
  body: Partial<{
    owner: VaultOwner;
    kind: VaultKind;
    name: string;
    institution: string;
    amount: number;
    notes: string;
    recordSnapshot: boolean;
  }>
) {
  const { data } = await api.patch<{ asset: VaultAsset }>(`/vault/assets/${id}`, body, {
    headers: vaultHeaders(),
  });
  return data.asset;
}

export async function deleteVaultAsset(id: string) {
  await api.delete(`/vault/assets/${id}`, { headers: vaultHeaders() });
}

export async function getVaultYearSummary(year?: number) {
  const { data } = await api.get<VaultYearSummary>("/vault/year-summary", {
    params: year ? { year } : undefined,
    headers: vaultHeaders(),
  });
  return data;
}

export function isVaultUnlocked() {
  return Boolean(getVaultToken());
}
