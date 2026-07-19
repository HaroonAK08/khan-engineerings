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

export type MaterialType = "scrap" | "daig";

export type Purchase = {
  _id: string;
  supplier: Supplier | string;
  materialType: MaterialType;
  quantityKg: number;
  ratePerKg: number;
  totalAmount: number;
  freightAmount: number;
  amountPaid: number;
  balance: number;
  payable?: number;
  effectiveRatePerKg?: number;
  vehicleNo: string;
  purchaseDate: string;
  invoiceNo: string;
  notes: string;
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

export type MaterialStockSummary = {
  material: string;
  materialType?: MaterialType;
  unit: string;
  totalKg: number;
  availableKg?: number;
  purchasedKg?: number;
  consumedKg?: number;
  totalSpend: number;
  purchaseCount: number;
  avgRate: number;
};

export type StockSummary = MaterialStockSummary & {
  byMaterial?: {
    scrap: MaterialStockSummary;
    daig: MaterialStockSummary;
  };
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
    materialType?: MaterialType;
    name: string;
    totalKg: number;
    totalSpend: number;
    purchaseCount: number;
    avgRate: number;
    minRate: number;
    maxRate: number;
  }>;
  byMaterialType?: Array<{
    materialType: MaterialType | string;
    totalKg: number;
    totalSpend: number;
    purchaseCount: number;
    avgRate: number;
  }>;
  bestRateSupplier: {
    supplierId: string;
    name: string;
    avgRate: number;
  } | null;
};
