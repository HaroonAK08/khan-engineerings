import { api } from "@/lib/api";

export type Customer = {
  _id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
};

export type OrderItem = {
  _id?: string;
  product: { _id: string; name: string; sku?: string; unitLabel?: string } | string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  dispatchedQty?: number;
};

export type SalesOrder = {
  _id: string;
  orderNo: string;
  invoiceNo: string;
  customer: Customer | string;
  orderDate: string;
  dueDate?: string | null;
  items: OrderItem[];
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: string;
  paymentStatus: "unpaid" | "partial" | "paid";
  dispatchStatus: "pending" | "partial" | "dispatched";
  notes: string;
};

export type CustomerPayment = {
  _id: string;
  customer: Customer | string;
  order: { _id: string; orderNo: string; invoiceNo: string } | string;
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
  order?: { orderNo: string; invoiceNo: string } | null;
  entryDate: string;
  notes: string;
};

export type Dispatch = {
  _id: string;
  dispatchNo: string;
  order: { _id: string; orderNo: string; invoiceNo: string } | string;
  customer: Customer | string;
  warehouse?: { name: string } | string | null;
  items: Array<{ product: { name: string } | string; quantity: number }>;
  dispatchDate: string;
  notes: string;
};

export type SalesReport = {
  totals: {
    orderCount: number;
    totalSales: number;
    totalPaid: number;
    outstanding: number;
  };
  outstanding: Array<{
    orderId: string;
    orderNo: string;
    invoiceNo: string;
    customer: string;
    customerId?: string;
    orderDate: string;
    dueDate?: string | null;
    totalAmount: number;
    amountPaid: number;
    balance: number;
    paymentStatus: string;
  }>;
  topCustomers: Array<{
    customerId: string;
    name: string;
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

export async function listCustomers(params?: { q?: string; active?: string }) {
  const { data } = await api.get<{ customers: Customer[] }>("/customers", { params });
  return data.customers;
}

export async function getCustomer(id: string) {
  const { data } = await api.get<{
    customer: Customer;
    balance: number;
    stats: { orderCount: number; totalSales: number; totalPaid: number };
  }>(`/customers/${id}`);
  return data;
}

export async function createCustomer(body: Partial<Customer>) {
  const { data } = await api.post<{ customer: Customer }>("/customers", body);
  return data.customer;
}

export async function updateCustomer(id: string, body: Partial<Customer>) {
  const { data } = await api.patch<{ customer: Customer }>(`/customers/${id}`, body);
  return data.customer;
}

export async function getCustomerLedger(id: string) {
  const { data } = await api.get<{ entries: CustomerLedgerEntry[]; balance: number }>(
    `/customers/${id}/ledger`
  );
  return data;
}

export async function listOrders(params?: {
  customer?: string;
  paymentStatus?: string;
  dispatchStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}) {
  const { data } = await api.get<{ orders: SalesOrder[] }>("/orders", { params });
  return data.orders;
}

export async function getOrder(id: string) {
  const { data } = await api.get<{ order: SalesOrder }>(`/orders/${id}`);
  return data.order;
}

export async function createOrder(body: {
  customer: string;
  orderDate: string;
  dueDate?: string;
  notes?: string;
  items: Array<{ product: string; quantity: number; unitPrice: number }>;
}) {
  const { data } = await api.post<{ order: SalesOrder }>("/orders", body);
  return data.order;
}

export async function cancelOrder(id: string) {
  const { data } = await api.post<{ order: SalesOrder }>(`/orders/${id}/cancel`);
  return data.order;
}

export async function recordOrderPayment(
  orderId: string,
  body: { amount: number; paymentDate: string; method?: string; notes?: string; reference?: string }
) {
  const { data } = await api.post<{
    payment: CustomerPayment;
    order: SalesOrder;
    balance: number;
  }>(`/orders/${orderId}/payments`, body);
  return data;
}

export async function listPayments(params?: { customer?: string; order?: string }) {
  const { data } = await api.get<{ payments: CustomerPayment[] }>("/orders/payments", { params });
  return data.payments;
}

export async function createDispatch(
  orderId: string,
  body: {
    items: Array<{ itemId?: string; product?: string; quantity: number }>;
    warehouse?: string;
    dispatchDate: string;
    notes?: string;
  }
) {
  const { data } = await api.post<{ dispatch: Dispatch; order: SalesOrder }>(
    `/orders/${orderId}/dispatch`,
    body
  );
  return data;
}

export async function listDispatches(params?: { order?: string; customer?: string }) {
  const { data } = await api.get<{ dispatches: Dispatch[] }>("/orders/dispatches", { params });
  return data.dispatches;
}

export async function getSalesReport(params?: { dateFrom?: string; dateTo?: string }) {
  const { data } = await api.get<{ report: SalesReport }>("/orders/reports", { params });
  return data.report;
}

export function customerName(customer: SalesOrder["customer"]) {
  if (!customer) return "—";
  if (typeof customer === "string") return customer;
  return customer.name;
}

export function productName(product: OrderItem["product"]) {
  if (!product) return "—";
  if (typeof product === "string") return product;
  return product.name;
}
