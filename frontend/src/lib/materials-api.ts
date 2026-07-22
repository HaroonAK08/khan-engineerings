import { api } from "@/lib/api";
import { useLocaleStore } from "@/stores/locale-store";
import type { LedgerEntry, Purchase, PurchaseReport, StockSummary, Supplier } from "@/types/materials";

export function apiError(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: { message?: string } } }).response?.data;
    return data?.message ?? fallback;
  }
  return fallback;
}

export async function listSuppliers(params?: { q?: string; active?: string }) {
  const { data } = await api.get<{ suppliers: Supplier[] }>("/suppliers", { params });
  return data.suppliers;
}

export async function getSupplier(id: string) {
  const { data } = await api.get<{ supplier: Supplier; balance: number }>(`/suppliers/${id}`);
  return data;
}

export async function createSupplier(body: Partial<Supplier>) {
  const { data } = await api.post<{ supplier: Supplier }>("/suppliers", body);
  return data.supplier;
}

export async function updateSupplier(id: string, body: Partial<Supplier>) {
  const { data } = await api.patch<{ supplier: Supplier }>(`/suppliers/${id}`, body);
  return data.supplier;
}

export async function deleteSupplier(id: string) {
  await api.delete(`/suppliers/${id}`);
}

export async function listPurchases(params?: {
  supplier?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}) {
  const { data } = await api.get<{ purchases: Purchase[] }>("/purchases", { params });
  return data.purchases;
}

export async function createPurchase(body: {
  supplier: string;
  materialType?: "scrap" | "daig";
  quantityKg: number;
  ratePerKg?: number;
  totalAmount?: number;
  freightAmount?: number;
  amountPaid?: number;
  vehicleNo?: string;
  purchaseDate: string;
  invoiceNo?: string;
  notes?: string;
}) {
  const { data } = await api.post<{ purchase: Purchase }>("/purchases", body);
  return data.purchase;
}

export async function deletePurchase(id: string) {
  await api.delete(`/purchases/${id}`);
}

export async function getStock() {
  const { data } = await api.get<{ stock: StockSummary }>("/inventory/stock");
  return data.stock;
}

export async function getPurchaseReport(params?: {
  dateFrom?: string;
  dateTo?: string;
  supplier?: string;
}) {
  const { data } = await api.get<{ report: PurchaseReport }>("/purchases/reports", { params });
  return data.report;
}

export async function getLedger(supplierId: string) {
  const { data } = await api.get<{ entries: LedgerEntry[]; balance: number }>(
    `/suppliers/${supplierId}/ledger`
  );
  return data;
}

export async function recordPayment(
  supplierId: string,
  body: { amount: number; entryDate?: string; notes?: string }
) {
  const { data } = await api.post<{ entry: LedgerEntry; balance: number }>(
    `/suppliers/${supplierId}/ledger/payments`,
    body
  );
  return data;
}

export async function recordAdjustment(
  supplierId: string,
  body: { amount: number; entryDate?: string; notes?: string }
) {
  const { data } = await api.post<{ entry: LedgerEntry; balance: number }>(
    `/suppliers/${supplierId}/ledger/adjustments`,
    body
  );
  return data;
}

export function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatKg(n: number) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n);
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function supplierName(supplier: Purchase["supplier"]) {
  if (!supplier) return "—";
  if (typeof supplier === "string") return supplier;
  const isUrdu = useLocaleStore.getState().locale === "ur";
  if (isUrdu && supplier.nameUr?.trim()) return supplier.nameUr.trim();
  return supplier.name;
}
