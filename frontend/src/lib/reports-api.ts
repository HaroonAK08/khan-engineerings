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

export type MoneyRecord = {
  id: string;
  type: string;
  date: string;
  reference: string;
  partyId: string;
  partyName: string;
  partyPhone?: string;
  materialType?: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  href: string;
};

export type MoneyPartyRollup = {
  partyId: string;
  name: string;
  phone?: string;
  balance: number;
  recordCount: number;
};

export type ReceivablesReport = {
  period: { from: string | null; to: string | null };
  totals: {
    totalReceivable: number;
    partyCount: number;
    recordCount: number;
  };
  byParty: MoneyPartyRollup[];
  records: MoneyRecord[];
};

export type PayablesReport = {
  period: { from: string | null; to: string | null };
  totals: {
    totalPayable: number;
    supplierCount: number;
    recordCount: number;
  };
  bySupplier: MoneyPartyRollup[];
  records: MoneyRecord[];
};

export async function getReceivablesReport(params?: { dateFrom?: string; dateTo?: string }) {
  const { data } = await api.get<{ report: ReceivablesReport }>("/reports/receivables", {
    params,
  });
  return data.report;
}

export async function getPayablesReport(params?: { dateFrom?: string; dateTo?: string }) {
  const { data } = await api.get<{ report: PayablesReport }>("/reports/payables", { params });
  return data.report;
}

export type ExportKind =
  | "sales"
  | "purchases"
  | "production"
  | "expenses"
  | "inventory"
  | "finance"
  | "receivables"
  | "payables";

export const COMBINED_REPORT_MODULES: Array<{ id: ExportKind; label: string }> = [
  { id: "sales", label: "Sales" },
  { id: "purchases", label: "Purchases" },
  { id: "production", label: "Production" },
  { id: "expenses", label: "Expenses" },
  { id: "inventory", label: "Inventory" },
  { id: "finance", label: "Finance" },
  { id: "receivables", label: "Receivables" },
  { id: "payables", label: "Payables" },
];

export async function downloadReportExport(
  kind: ExportKind,
  params: Record<string, string | undefined> & { format: "pdf" }
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
  triggerDownload(data as Blob, `${kind}-report.pdf`);
}

export async function downloadFullReport(params: {
  format: "pdf" | "xlsx";
  dateFrom?: string;
  dateTo?: string;
}) {
  const query: Record<string, string> = { format: params.format };
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  const { data } = await api.get("/reports/export/full", {
    params: query,
    responseType: "blob",
    timeout: 90_000,
  });
  const ext = params.format === "xlsx" ? "xlsx" : "pdf";
  triggerDownload(data as Blob, `full-report.${ext}`);
}

export async function downloadCustomReport(params: {
  format: "pdf" | "xlsx";
  modules: ExportKind[];
  dateFrom?: string;
  dateTo?: string;
}) {
  const query: Record<string, string> = {
    format: params.format,
    modules: params.modules.join(","),
  };
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  const { data } = await api.get("/reports/export/custom", {
    params: query,
    responseType: "blob",
    timeout: 90_000,
  });
  const ext = params.format === "xlsx" ? "xlsx" : "pdf";
  triggerDownload(data as Blob, `custom-report.${ext}`);
}

export type CombinedReportSection = {
  id: string;
  title: string;
  heading: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  meta: Record<string, string | number>;
};

export type CombinedReportPreview = {
  title: string;
  period: string;
  modules: string[];
  sections: CombinedReportSection[];
};

export async function getCombinedReportPreview(params: {
  modules?: ExportKind[];
  dateFrom?: string;
  dateTo?: string;
}) {
  const query: Record<string, string> = {};
  if (params.modules?.length) query.modules = params.modules.join(",");
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  const { data } = await api.get<{ report: CombinedReportPreview }>("/reports/preview", {
    params: query,
    timeout: 90_000,
  });
  return data.report;
}

export async function downloadStatementExport(
  type: "customers" | "suppliers",
  id: string,
  params: { format: "pdf"; dateFrom?: string; dateTo?: string }
) {
  const query: Record<string, string> = { format: params.format };
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  const { data } = await api.get(`/reports/export/statements/${type}/${id}`, {
    params: query,
    responseType: "blob",
  });
  triggerDownload(data as Blob, `${type}-statement.pdf`);
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
