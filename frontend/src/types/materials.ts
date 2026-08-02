export type Supplier = {
  _id: string;
  name: string;
  /** Urdu display name when UI is in Urdu */
  nameUr?: string;
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
  supplier: string | { _id: string; name: string; nameUr?: string };
  type: "purchase" | "payment" | "adjustment";
  amount: number;
  signedAmount?: number | null;
  appliesTo?: string | null;
  purchase?:
    | string
    | null
    | {
        _id: string;
        quantityKg: number;
        ratePerKg: number;
        invoiceNo: string;
        materialType?: MaterialType;
        totalAmount?: number;
        freightAmount?: number;
        amountPaid?: number;
        balance?: number;
        purchaseDate?: string;
        notes?: string;
      };
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
  period?: { from: string | null; to: string | null };
  party?: { id: string; name: string; phone?: string } | null;
  totals: {
    totalKg: number;
    totalSpend: number;
    purchaseCount: number;
    avgRate: number;
    supplierCount?: number;
  };
  records?: Array<{
    id: string;
    date: string;
    invoiceNo: string;
    supplierId: string;
    supplierName: string;
    materialType: MaterialType | string;
    quantityKg: number;
    ratePerKg: number;
    totalAmount: number;
    freightAmount: number;
    spend: number;
    amountPaid: number;
    balance: number;
    href?: string;
  }>;
  byParty?: Array<{
    supplierId: string;
    name: string;
    totalKg: number;
    totalSpend: number;
    purchaseCount: number;
    avgRate: number;
  }>;
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
