import { api } from "@/lib/api";

export type SearchHit = {
  id: string;
  label: string;
  meta: string;
  href: string;
};

export type GlobalSearchResult = {
  q: string;
  results: {
    customers: SearchHit[];
    suppliers: SearchHit[];
    orders: SearchHit[];
    purchases: SearchHit[];
    batches: SearchHit[];
    products: SearchHit[];
  };
};

export type StatementLine = {
  id: string;
  date: string;
  type: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  notes: string;
};

export type Statement = {
  party: {
    id: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    type: "customer" | "supplier";
  };
  period: { from: string | null; to: string | null };
  openingBalance: number;
  closingBalance: number;
  periodBalance: number;
  lines: StatementLine[];
};

export async function globalSearch(params: { q: string; limit?: number }) {
  const { data } = await api.get<GlobalSearchResult>("/reports/search", { params });
  return data;
}

export async function getCustomerStatement(
  id: string,
  params?: { dateFrom?: string; dateTo?: string }
) {
  const { data } = await api.get<{ statement: Statement }>(
    `/reports/statements/customers/${id}`,
    { params }
  );
  return data.statement;
}

export async function getSupplierStatement(
  id: string,
  params?: { dateFrom?: string; dateTo?: string }
) {
  const { data } = await api.get<{ statement: Statement }>(
    `/reports/statements/suppliers/${id}`,
    { params }
  );
  return data.statement;
}

export type ExportKind =
  | "sales"
  | "purchases"
  | "production"
  | "expenses"
  | "inventory"
  | "finance";

export async function downloadReportExport(
  kind: ExportKind,
  params: Record<string, string | undefined> & { format: "xlsx" | "pdf" }
) {
  const { format, ...rest } = params;
  const query: Record<string, string> = { format };
  Object.entries(rest).forEach(([k, v]) => {
    if (v) query[k] = v;
  });
  const { data } = await api.get(`/reports/export/${kind}`, {
    params: query,
    responseType: "blob",
  });
  const ext = format === "pdf" ? "pdf" : "xlsx";
  triggerDownload(data as Blob, `${kind}-report.${ext}`);
}

export async function downloadStatementExport(
  type: "customers" | "suppliers",
  id: string,
  params: { format: "xlsx" | "pdf"; dateFrom?: string; dateTo?: string }
) {
  const query: Record<string, string> = { format: params.format };
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  const { data } = await api.get(`/reports/export/statements/${type}/${id}`, {
    params: query,
    responseType: "blob",
  });
  const ext = params.format === "pdf" ? "pdf" : "xlsx";
  triggerDownload(data as Blob, `${type}-statement.${ext}`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
