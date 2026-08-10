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

export type GroupStatementParty = {
  partyId: string;
  name: string;
  phone: string;
  openingBalance: number;
  closingBalance: number;
  periodBalance: number;
  lineCount: number;
};

export type GroupStatement = {
  group: { id: string; name: string } | null;
  period: { from: string | null; to: string | null };
  openingBalance: number;
  closingBalance: number;
  periodBalance: number;
  parties: GroupStatementParty[];
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

export async function getGroupStatement(
  id: string,
  params?: { dateFrom?: string; dateTo?: string }
) {
  const { data } = await api.get<{ statement: GroupStatement }>(
    `/reports/statements/groups/${id}`,
    { params }
  );
  return data.statement;
}

export async function getCustomersOverviewStatement(params?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  const { data } = await api.get<{ statement: GroupStatement }>(
    "/reports/statements/customers-overview",
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
  products?: string[];
  totalAmount: number;
  amountPaid: number;
  balance: number;
  href: string;
};

export type MoneyPartyRollup = {
  partyId: string;
  name: string;
  phone?: string;
  groupId?: string;
  balance: number;
  recordCount: number;
};

export type MoneyGroupRollup = {
  groupId: string;
  name: string;
  balance: number;
  recordCount: number;
  partyCount: number;
};

export type ReceivablesReport = {
  period: { from: string | null; to: string | null };
  group?: { id: string; name: string } | null;
  party?: { id: string; name: string } | null;
  totals: {
    totalReceivable: number;
    partyCount: number;
    groupCount?: number;
    recordCount: number;
  };
  byParty: MoneyPartyRollup[];
  byGroup?: MoneyGroupRollup[];
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

export async function getReceivablesReport(params?: {
  dateFrom?: string;
  dateTo?: string;
  groupId?: string;
  customerId?: string;
}) {
  const { data } = await api.get<{ report: ReceivablesReport }>("/reports/receivables", {
    params,
  });
  return data.report;
}

export type ReceivedRecord = {
  id: string;
  type: string;
  date: string;
  reference: string;
  method: string;
  notes?: string;
  partyId: string;
  partyName: string;
  partyPhone?: string;
  groupId?: string;
  builtyId?: string;
  amount: number;
  href: string;
};

export type ReceivedPartyRollup = {
  partyId: string;
  name: string;
  phone?: string;
  groupId?: string;
  amount: number;
  recordCount: number;
};

export type ReceivedGroupRollup = {
  groupId: string;
  name: string;
  amount: number;
  recordCount: number;
  partyCount: number;
};

export type ReceivedReport = {
  period: { from: string | null; to: string | null };
  group?: { id: string; name: string } | null;
  party?: { id: string; name: string } | null;
  totals: {
    totalReceived: number;
    partyCount: number;
    groupCount?: number;
    recordCount: number;
  };
  byParty: ReceivedPartyRollup[];
  byGroup?: ReceivedGroupRollup[];
  records: ReceivedRecord[];
};

export async function getReceivedReport(params?: {
  dateFrom?: string;
  dateTo?: string;
  groupId?: string;
  customerId?: string;
}) {
  const { data } = await api.get<{ report: ReceivedReport }>("/reports/received", {
    params,
  });
  return data.report;
}

export type PaidRecord = {
  id: string;
  type: string;
  date: string;
  reference: string;
  notes?: string;
  partyId: string;
  partyName: string;
  partyPhone?: string;
  amount: number;
  href: string;
};

export type PaidSupplierRollup = {
  partyId: string;
  name: string;
  phone?: string;
  amount: number;
  balance: number;
  recordCount: number;
};

export type PaidReport = {
  period: { from: string | null; to: string | null };
  party?: { id: string; name: string } | null;
  totals: {
    totalPaid: number;
    totalLeft: number;
    supplierCount: number;
    recordCount: number;
  };
  bySupplier: PaidSupplierRollup[];
  records: PaidRecord[];
};

export async function getPaidReport(params?: {
  dateFrom?: string;
  dateTo?: string;
  supplierId?: string;
}) {
  const { data } = await api.get<{ report: PaidReport }>("/reports/paid", { params });
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
  | "received"
  | "paid"
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
  summaryOnly?: boolean;
}) {
  const query: Record<string, string> = { format: params.format };
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  if (params.summaryOnly) query.summaryOnly = "1";
  const { data } = await api.get("/reports/export/full", {
    params: query,
    responseType: "blob",
    timeout: 90_000,
  });
  const ext = params.format === "xlsx" ? "xlsx" : "pdf";
  const base = params.summaryOnly ? "full-report-totals" : "full-report";
  triggerDownload(data as Blob, `${base}.${ext}`);
}

export async function downloadCustomReport(params: {
  format: "pdf" | "xlsx";
  modules: ExportKind[];
  dateFrom?: string;
  dateTo?: string;
  summaryOnly?: boolean;
}) {
  const query: Record<string, string> = {
    format: params.format,
    modules: params.modules.join(","),
  };
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  if (params.summaryOnly) query.summaryOnly = "1";
  const { data } = await api.get("/reports/export/custom", {
    params: query,
    responseType: "blob",
    timeout: 90_000,
  });
  const ext = params.format === "xlsx" ? "xlsx" : "pdf";
  const base = params.summaryOnly ? "custom-report-totals" : "custom-report";
  triggerDownload(data as Blob, `${base}.${ext}`);
}

export type CombinedReportSection = {
  id: string;
  title: string;
  heading: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  subsections?: Array<{
    heading: string;
    columns: string[];
    rows: Array<Array<string | number>>;
  }> | null;
  meta: Record<string, string | number>;
};

export type CombinedReportPreview = {
  title: string;
  period: string;
  modules: string[];
  summaryOnly?: boolean;
  sections: CombinedReportSection[];
};

export async function getCombinedReportPreview(params: {
  modules?: ExportKind[];
  dateFrom?: string;
  dateTo?: string;
  summaryOnly?: boolean;
}) {
  const query: Record<string, string> = {};
  if (params.modules?.length) query.modules = params.modules.join(",");
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  if (params.summaryOnly) query.summaryOnly = "1";
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

export async function downloadGroupStatementExport(
  id: string,
  params: { format: "pdf"; dateFrom?: string; dateTo?: string }
) {
  const query: Record<string, string> = { format: params.format };
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  const { data } = await api.get(`/reports/export/statements/groups/${id}`, {
    params: query,
    responseType: "blob",
  });
  triggerDownload(data as Blob, "group-statement.pdf");
}

export async function downloadCustomersOverviewExport(params: {
  format: "pdf";
  dateFrom?: string;
  dateTo?: string;
}) {
  const query: Record<string, string> = { format: params.format };
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  const { data } = await api.get("/reports/export/statements/customers-overview", {
    params: query,
    responseType: "blob",
  });
  triggerDownload(data as Blob, "customers-overview-statement.pdf");
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
