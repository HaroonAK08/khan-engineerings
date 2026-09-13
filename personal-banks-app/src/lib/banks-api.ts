import { api, setToken } from "./api";

export type AuthStatus = {
  setupRequired: boolean;
  locked: boolean;
  lockUntil?: string | null;
  token?: string;
};

export type Bank = {
  _id: string;
  name: string;
  notes?: string;
  accountCount?: number;
  totalBalance?: number;
};

export type Account = {
  _id: string;
  name: string;
  balance: number;
  notes?: string;
  bank: Bank | string;
};

export type Transaction = {
  _id: string;
  type: "deposit" | "send" | "adjust";
  amount: number;
  balanceAfter: number;
  recipient?: string;
  notes?: string;
  txnDate: string;
  account?: { _id: string; name: string };
  bank?: { _id: string; name: string };
};

export async function getAuthStatus() {
  return api<AuthStatus>("/personal-banks/auth/status", { auth: false });
}

export async function setupPin(pin: string) {
  const data = await api<AuthStatus & { token: string }>("/personal-banks/auth/setup", {
    body: { pin },
    auth: false,
  });
  await setToken(data.token);
  return data;
}

export async function unlockPin(pin: string) {
  const data = await api<AuthStatus & { token: string }>("/personal-banks/auth/unlock", {
    body: { pin },
    auth: false,
  });
  await setToken(data.token);
  return data;
}

export async function resetPin(factoryPin: string, newPin: string) {
  return api<{ ok: boolean }>("/personal-banks/auth/reset-pin", {
    body: { factoryPin, newPin },
    auth: false,
  });
}

export async function getSummary() {
  return api<{ banks: Bank[]; grandTotal: number; accountCount: number }>(
    "/personal-banks/summary"
  );
}

export async function listBanks() {
  const data = await api<{ banks: Bank[] }>("/personal-banks/banks");
  return data.banks;
}

export async function createBank(body: { name: string; notes?: string }) {
  const data = await api<{ bank: Bank }>("/personal-banks/banks", { body });
  return data.bank;
}

export async function updateBank(id: string, body: Partial<{ name: string; notes: string }>) {
  const data = await api<{ bank: Bank }>(`/personal-banks/banks/${id}`, {
    method: "PATCH",
    body,
  });
  return data.bank;
}

export async function deleteBank(id: string) {
  await api(`/personal-banks/banks/${id}`, { method: "DELETE" });
}

export async function listAccounts(bank?: string) {
  const q = bank ? `?bank=${encodeURIComponent(bank)}` : "";
  const data = await api<{ accounts: Account[] }>(`/personal-banks/accounts${q}`);
  return data.accounts;
}

export async function createAccount(body: {
  bank: string;
  name: string;
  balance?: number;
  notes?: string;
}) {
  const data = await api<{ account: Account }>("/personal-banks/accounts", { body });
  return data.account;
}

export async function updateAccount(
  id: string,
  body: Partial<{ name: string; notes: string; balance: number; adjustNotes: string }>
) {
  const data = await api<{ account: Account }>(`/personal-banks/accounts/${id}`, {
    method: "PATCH",
    body,
  });
  return data.account;
}

export async function deleteAccount(id: string) {
  await api(`/personal-banks/accounts/${id}`, { method: "DELETE" });
}

export async function deposit(body: { account: string; amount: number; notes?: string }) {
  return api<{ account: Account; transaction: Transaction }>("/personal-banks/deposit", {
    body,
  });
}

export async function sendMoney(body: {
  account: string;
  amount: number;
  recipient: string;
  notes?: string;
}) {
  return api<{ account: Account; transaction: Transaction }>("/personal-banks/send", { body });
}

export type Person = {
  name: string;
  totalSent: number;
  count: number;
  lastTxnDate: string;
};

export async function listTransactions(params?: {
  account?: string;
  bank?: string;
  type?: string;
  q?: string;
  recipient?: string;
}) {
  const sp = new URLSearchParams();
  if (params?.account) sp.set("account", params.account);
  if (params?.bank) sp.set("bank", params.bank);
  if (params?.type) sp.set("type", params.type);
  if (params?.q) sp.set("q", params.q);
  if (params?.recipient) sp.set("recipient", params.recipient);
  const q = sp.toString() ? `?${sp}` : "";
  const data = await api<{ transactions: Transaction[] }>(`/personal-banks/transactions${q}`);
  return data.transactions;
}

export async function listPeople(params?: { q?: string }) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  const q = sp.toString() ? `?${sp}` : "";
  const data = await api<{ people: Person[] }>(`/personal-banks/people${q}`);
  return data.people;
}

export async function renamePerson(name: string, newName: string) {
  return api<{ ok: boolean; name: string }>("/personal-banks/people", {
    method: "PATCH",
    body: { name, newName },
  });
}

export async function deletePerson(name: string) {
  return api<{ ok: boolean; removed: number }>(
    `/personal-banks/people?name=${encodeURIComponent(name)}`,
    { method: "DELETE" }
  );
}

export async function updateTransaction(
  id: string,
  body: Partial<{ recipient: string; notes: string; amount: number }>
) {
  const data = await api<{ transaction: Transaction }>(`/personal-banks/transactions/${id}`, {
    method: "PATCH",
    body,
  });
  return data.transaction;
}

export async function deleteTransaction(id: string) {
  return api<{ ok: boolean }>(`/personal-banks/transactions/${id}`, { method: "DELETE" });
}
