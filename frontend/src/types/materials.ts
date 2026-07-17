export type Supplier = {
  _id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Purchase = {
  _id: string;
  supplier: Supplier | string;
  quantityKg: number;
  ratePerKg: number;
  totalAmount: number;
  purchaseDate: string;
  invoiceNo: string;
  notes: string;
  material: string;
  createdAt?: string;
};

export type LedgerEntry = {
  _id: string;
  supplier: string;
  type: "purchase" | "payment" | "adjustment";
  amount: number;
  signedAmount?: number | null;
  purchase?: { quantityKg: number; ratePerKg: number; invoiceNo: string } | string | null;
  entryDate: string;
  notes: string;
};

export type StockSummary = {
  material: string;
  unit: string;
  /** Available scrap after production consumption */
  totalKg: number;
  availableKg?: number;
  purchasedKg?: number;
  consumedKg?: number;
  totalSpend: number;
  purchaseCount: number;
  avgRate: number;
};

export type PurchaseReport = {
  totals: {
    totalKg: number;
    totalSpend: number;
    purchaseCount: number;
    avgRate: number;
  };
  bySupplier: Array<{
    supplierId: string;
    name: string;
    totalKg: number;
    totalSpend: number;
    purchaseCount: number;
    avgRate: number;
    minRate: number;
    maxRate: number;
  }>;
  bestRateSupplier: {
    supplierId: string;
    name: string;
    avgRate: number;
  } | null;
};
