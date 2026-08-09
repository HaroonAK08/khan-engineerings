export type VoiceIntent =
  | "expense"
  | "purchase"
  | "builty"
  | "customer_payment"
  | "supplier_payment"
  | "produce"
  | "navigate"
  | "add_supplier"
  | "add_salesman"
  | "add_worker"
  | "salary_pay";

export type ParsedBuiltyLine = {
  productQuery: string;
  quantity: number;
  rate?: number;
  amount?: number;
  materialType?: "scrap" | "daig";
  /** False when qty defaulted to 1 because only product+rate was spoken */
  quantityExplicit?: boolean;
  pricingMode?: "rate_kg" | "fixed";
};

export type ParsedVoiceCommand = {
  intent: VoiceIntent | null;
  raw: string;
  normalized: string;
  amount?: number;
  quantity?: number;
  rate?: number;
  category?: string;
  title?: string;
  materialType?: "scrap" | "daig";
  supplierQuery?: string;
  customerQuery?: string;
  productQuery?: string;
  productLines?: ParsedBuiltyLine[];
  navigateQuery?: string;
  builtyQuery?: string;
  navigateKind?: "page" | "person" | "builty";
  builtyNo?: string;
  spokenDate?: string;
  notes?: string;
  error?: string;
};

export type EntityMatch = {
  id: string;
  label: string;
  score: number;
  href?: string;
};

export type ResolvedBuiltyLine = {
  productQuery: string;
  productMatches: EntityMatch[];
  selectedProductId?: string;
  quantity: number;
  rate?: number;
  amount?: number;
  pricingMode?: "rate_kg" | "fixed";
  materialType?: "scrap" | "daig";
  quantityExplicit?: boolean;
};

export type ResolvedVoiceDraft = {
  intent: VoiceIntent;
  transcript: string;
  amount?: number;
  quantity?: number;
  rate?: number;
  category?: string;
  title?: string;
  materialType?: "scrap" | "daig";
  notes?: string;
  builtyNo?: string;
  billNo?: string;
  amountPaid?: number;
  wastePercent?: number;
  batchNo?: string;
  expenseDate?: string;
  purchaseDate?: string;
  builtyDate?: string;
  paymentDate?: string;
  productionDate?: string;
  scope?: "hub" | "drum" | "common";
  pricingMode?: "rate_kg" | "fixed";
  supplierMatches: EntityMatch[];
  customerMatches: EntityMatch[];
  productMatches: EntityMatch[];
  selectedSupplierId?: string;
  selectedCustomerId?: string;
  selectedProductId?: string;
  items?: ResolvedBuiltyLine[];
  navigateHref?: string;
  navigateLabel?: string;
  navigateOptions?: EntityMatch[];
  parseError?: string;
};
