import { api } from "@/lib/api";

export type PartyGroupRef = {
  _id: string;
  name: string;
};

export type Customer = {
  _id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  group?: PartyGroupRef | string | null;
  isActive: boolean;
};

export type PartyGroup = {
  _id: string;
  name: string;
  notes: string;
  isActive: boolean;
  partyCount?: number;
  parties?: Array<{
    _id: string;
    name: string;
    phone: string;
    isActive: boolean;
    balance?: number;
  }>;
};

export type Salesman = {
  _id: string;
  name: string;
  phone: string;
  notes: string;
  isActive: boolean;
};

export type ProductRef = {
  _id: string;
  name: string;
  sku?: string;
  unitLabel?: string;
  weightKg?: number;
};

export type PricingMode = "rate_kg" | "fixed";

export type BuiltyItem = {
  _id?: string;
  product: ProductRef | string;
  quantity: number;
  pricingMode: PricingMode;
  ratePerKg: number;
  weightKg: number;
  unitPrice: number;
  lineTotal: number;
};

export type BuiltyRow = {
  _id: string;
  builtyNo: string;
  billNo?: string;
  builtyDate: string;
  customer: Customer | string;
  itemCount: number;
  itemDetails?: string[];
  notes: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  paymentStatus: "unpaid" | "partial" | "paid";
};

export type Builty = {
  _id: string;
  builtyNo: string;
  billNo?: string;
  builtyDate: string;
  customer: Customer | string;
  warehouse?: string | null;
  items: BuiltyItem[];
  totalAmount: number;
  amountPaid: number;
  balance: number;
  paymentStatus: "unpaid" | "partial" | "paid";
  notes: string;
};

export type BuiltySummary = {
  totalAmount: number;
  amountPaid: number;
  balance: number;
  paymentStatus: "unpaid" | "partial" | "paid";
};

export type CustomerPayment = {
  _id: string;
  customer: Customer | string;
  builty: { _id: string; builtyNo: string; billNo?: string } | string | null;
  amount: number;
  paymentDate: string;
  method: string;
  reference: string;
  notes: string;
};

export type CustomerLedgerEntry = {
  _id: string;
  type: "invoice" | "payment" | "adjustment";
  amount: number;
  signedAmount?: number | null;
  builty?:
    | string
    | {
        _id: string;
        builtyNo: string;
        billNo?: string;
        totalAmount?: number;
        builtyDate?: string;
      }
    | null;
  payment?: string | { _id: string; amount: number; method?: string } | null;
  entryDate: string;
  notes: string;
};

export type SalesReport = {
  period?: { from: string | null; to: string | null };
  group?: { id: string; name: string } | null;
  party?: { id: string; name: string; phone?: string } | null;
  totals: {
    orderCount: number;
    totalSales: number;
    totalPaid: number;
    outstanding: number;
    partyCount?: number;
    groupCount?: number;
  };
  records?: Array<{
    orderId: string;
    orderNo: string;
    invoiceNo: string;
    customer: string;
    customerId?: string;
    groupId?: string;
    orderDate: string;
    dueDate?: string | null;
    totalAmount: number;
    amountPaid: number;
    balance: number;
    paymentStatus: string;
    href?: string;
  }>;
  outstanding: Array<{
    orderId: string;
    orderNo: string;
    invoiceNo: string;
    customer: string;
    customerId?: string;
    groupId?: string;
    orderDate: string;
    dueDate?: string | null;
    totalAmount: number;
    amountPaid: number;
    balance: number;
    paymentStatus: string;
    href?: string;
  }>;
  topCustomers: Array<{
    customerId: string;
    name: string;
    groupId?: string;
    orderCount: number;
    totalSales: number;
    totalPaid: number;
    outstanding: number;
  }>;
  byGroup?: Array<{
    groupId: string;
    name: string;
    partyCount: number;
    orderCount: number;
    totalSales: number;
    totalPaid: number;
    outstanding: number;
  }>;
  whoOwes: Array<{
    customerId: string;
    name: string;
    balance: number;
    invoices: number;
  }>;
};

export async function listCustomers(params?: { q?: string; active?: string; group?: string }) {
  const { data } = await api.get<{ customers: Customer[] }>("/customers", { params });
  return data.customers;
}

export async function listPartyGroups(params?: { q?: string; active?: string }) {
  const { data } = await api.get<{ groups: PartyGroup[] }>("/party-groups", { params });
  return data.groups;
}

export async function getPartyGroup(id: string) {
  const { data } = await api.get<{ group: PartyGroup }>(`/party-groups/${id}`);
  return data.group;
}

export async function createPartyGroup(body: {
  name: string;
  notes?: string;
  partyIds?: string[];
  isActive?: boolean;
}) {
  const { data } = await api.post<{ group: PartyGroup }>("/party-groups", body);
  return data.group;
}

export async function updatePartyGroup(
  id: string,
  body: {
    name?: string;
    notes?: string;
    partyIds?: string[];
    isActive?: boolean;
  }
) {
  const { data } = await api.patch<{ group: PartyGroup }>(`/party-groups/${id}`, body);
  return data.group;
}

export async function deletePartyGroup(id: string) {
  await api.delete(`/party-groups/${id}`);
}

export function customerGroupId(customer: Customer | null | undefined) {
  if (!customer?.group) return "";
  return typeof customer.group === "string" ? customer.group : customer.group._id;
}

export function customerGroupName(customer: Customer | null | undefined) {
  if (!customer?.group) return "";
  return typeof customer.group === "string" ? "" : customer.group.name;
}

export async function getCustomer(id: string) {
  const { data } = await api.get<{
    customer: Customer;
    balance: number;
    previousPending: number;
    stats: { orderCount: number; totalSales: number; totalPaid: number; totalDue?: number };
  }>(`/customers/${id}`);
  return data;
}

export type PartyProductPrice = {
  customer: string;
  product: string;
  pricingMode: PricingMode;
  ratePerKg: number;
  unitPrice: number;
  updatedAt?: string | null;
};

export async function getPartyProductPrice(customerId: string, productId: string) {
  const { data } = await api.get<{ price: PartyProductPrice | null }>(
    `/customers/${customerId}/product-prices/${productId}`
  );
  return data.price;
}

export async function listPartyProductPrices(customerId: string) {
  const { data } = await api.get<{ prices: PartyProductPrice[] }>(
    `/customers/${customerId}/product-prices`
  );
  return data.prices;
}

export async function createCustomer(body: Partial<Customer>) {
  const { data } = await api.post<{ customer: Customer }>("/customers", body);
  return data.customer;
}

export async function updateCustomer(id: string, body: Partial<Customer>) {
  const { data } = await api.patch<{ customer: Customer }>(`/customers/${id}`, body);
  return data.customer;
}

export async function deleteCustomer(id: string) {
  await api.delete(`/customers/${id}`);
}

export async function getCustomerLedger(id: string) {
  const { data } = await api.get<{ entries: CustomerLedgerEntry[]; balance: number }>(
    `/customers/${id}/ledger`
  );
  return data;
}

export async function updateCustomerLedgerEntry(
  customerId: string,
  entryId: string,
  body: { amount?: number; entryDate?: string; notes?: string }
) {
  const { data } = await api.patch<{ entry: CustomerLedgerEntry; balance: number }>(
    `/customers/${customerId}/ledger/${entryId}`,
    body
  );
  return data;
}

export async function deleteCustomerLedgerEntry(customerId: string, entryId: string) {
  const { data } = await api.delete<{ balance: number }>(
    `/customers/${customerId}/ledger/${entryId}`
  );
  return data;
}

export async function recordCustomerAdjustment(
  id: string,
  body: { amount: number; entryDate: string; notes?: string }
) {
  const { data } = await api.post<{
    entry: CustomerLedgerEntry;
    balance: number;
    previousPending: number;
    stats?: { orderCount: number; totalSales: number; totalPaid: number; totalDue?: number };
  }>(`/customers/${id}/adjustments`, body);
  return data;
}

export async function recordCustomerPayment(
  id: string,
  body: {
    amount: number;
    paymentDate: string;
    method?: string;
    notes?: string;
    reference?: string;
    confirmDuplicate?: boolean;
  }
) {
  const { data } = await api.post<{
    payment: CustomerPayment;
    balance: number;
    previousPending: number;
    stats: { orderCount: number; totalSales: number; totalPaid: number; totalDue?: number };
  }>(`/customers/${id}/payments`, body);
  return data;
}

export async function listSalesmen(params?: { q?: string; active?: string }) {
  const { data } = await api.get<{ salesmen: Salesman[] }>("/salesmen", { params });
  return data.salesmen;
}

export async function createSalesman(body: Partial<Salesman>) {
  const { data } = await api.post<{ salesman: Salesman }>("/salesmen", body);
  return data.salesman;
}

export async function updateSalesman(id: string, body: Partial<Salesman>) {
  const { data } = await api.patch<{ salesman: Salesman }>(`/salesmen/${id}`, body);
  return data.salesman;
}

export async function listBuilties(params?: {
  q?: string;
  customer?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { data } = await api.get<{ builties: BuiltyRow[] }>("/builty", { params });
  return data.builties;
}

export async function getBuilty(id: string) {
  const { data } = await api.get<{
    builty: Builty;
    summary: BuiltySummary;
    payments: CustomerPayment[];
  }>(`/builty/${id}`);
  return data;
}

export type BuiltyLineInput = {
  product: string;
  quantity: number;
  pricingMode: PricingMode;
  ratePerKg?: number;
  fixedAmount?: number;
};

export async function createBuilty(body: {
  builtyNo: string;
  billNo?: string;
  customer: string;
  builtyDate: string;
  items: BuiltyLineInput[];
  amountPaid?: number;
  method?: string;
  notes?: string;
  confirmDuplicate?: boolean;
}) {
  const { data } = await api.post<{ builty: Builty; summary: BuiltySummary }>("/builty", body);
  return data;
}

export async function updateBuilty(
  id: string,
  body: Partial<{
    builtyNo: string;
    billNo: string;
    builtyDate: string;
    notes: string;
    items: BuiltyLineInput[];
    paymentStatus: "unpaid" | "partial" | "paid";
    amountPaid: number;
    paymentGiven: number;
    method: string;
    paymentDate: string;
    paymentNotes: string;
  }>
) {
  const { data } = await api.patch<{
    builty: Builty;
    summary: BuiltySummary;
    payments: CustomerPayment[];
  }>(`/builty/${id}`, body);
  return data;
}

export async function recordBuiltyPayment(
  id: string,
  body: { amount: number; paymentDate: string; method?: string; notes?: string; reference?: string }
) {
  const { data } = await api.post<{
    builty: Builty;
    summary: BuiltySummary;
    payments: CustomerPayment[];
  }>(`/builty/${id}/payments`, body);
  return data;
}

export async function updateBuiltyPayment(
  id: string,
  paymentId: string,
  body: {
    amount?: number;
    paymentDate?: string;
    method?: string;
    notes?: string;
    reference?: string;
  }
) {
  const { data } = await api.patch<{
    builty: Builty;
    summary: BuiltySummary;
    payments: CustomerPayment[];
  }>(`/builty/${id}/payments/${paymentId}`, body);
  return data;
}

export async function deleteBuiltyPayment(id: string, paymentId: string) {
  const { data } = await api.delete<{
    builty: Builty;
    summary: BuiltySummary;
    payments: CustomerPayment[];
  }>(`/builty/${id}/payments/${paymentId}`);
  return data;
}

export async function deleteBuilty(id: string) {
  await api.delete(`/builty/${id}`);
}

export async function getSalesReport(params?: {
  dateFrom?: string;
  dateTo?: string;
  groupId?: string;
  customerId?: string;
}) {
  const { data } = await api.get<{ report: SalesReport }>("/builty/reports", { params });
  return data.report;
}

export function customerName(customer: Customer | string | null | undefined) {
  if (!customer) return "—";
  if (typeof customer === "string") return customer;
  return customer.name;
}

export function paymentStatusLabel(
  status: string | null | undefined,
  t: (key: "orders.unpaid" | "orders.partial" | "orders.paid") => string
) {
  if (status === "paid") return t("orders.paid");
  if (status === "partial") return t("orders.partial");
  return t("orders.unpaid");
}

export function productName(product: BuiltyItem["product"] | null | undefined) {
  if (!product) return "—";
  if (typeof product === "string") return product;
  return product.name;
}
