import { api } from "@/lib/api";

export type AssetCategory = {
  _id: string;
  name: string;
  notes?: string;
  sortOrder?: number;
  itemCount?: number;
  totalValue?: number;
};

export type AssetItem = {
  _id: string;
  category: AssetCategory | string;
  name: string;
  price: number;
  quantity: number;
  details?: string;
  purchaseDate?: string | null;
  sortOrder?: number;
};

export async function listAssetCategories() {
  const { data } = await api.get<{ categories: AssetCategory[] }>("/assets/categories");
  return data.categories;
}

export async function createAssetCategory(body: {
  name: string;
  notes?: string;
}) {
  const { data } = await api.post<{ category: AssetCategory }>("/assets/categories", body);
  return data.category;
}

export async function updateAssetCategory(
  id: string,
  body: Partial<{ name: string; notes: string }>
) {
  const { data } = await api.patch<{ category: AssetCategory }>(
    `/assets/categories/${id}`,
    body
  );
  return data.category;
}

export async function deleteAssetCategory(id: string) {
  await api.delete(`/assets/categories/${id}`);
}

export async function listAssetItems(params?: { category?: string }) {
  const { data } = await api.get<{ items: AssetItem[] }>("/assets/items", { params });
  return data.items;
}

export async function createAssetItem(body: {
  category: string;
  name: string;
  price?: number;
  quantity?: number;
  details?: string;
  purchaseDate?: string;
}) {
  const { data } = await api.post<{ item: AssetItem }>("/assets/items", body);
  return data.item;
}

export async function updateAssetItem(
  id: string,
  body: Partial<{
    category: string;
    name: string;
    price: number;
    quantity: number;
    details: string;
    purchaseDate: string | null;
  }>
) {
  const { data } = await api.patch<{ item: AssetItem }>(`/assets/items/${id}`, body);
  return data.item;
}

export async function deleteAssetItem(id: string) {
  await api.delete(`/assets/items/${id}`);
}

export async function getAssetsSummary() {
  const { data } = await api.get<{
    categories: AssetCategory[];
    grandTotal: number;
    itemCount: number;
  }>("/assets/summary");
  return data;
}
