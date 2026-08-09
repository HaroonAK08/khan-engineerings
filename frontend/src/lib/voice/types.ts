export type VoiceIntent =
  | "expense"
  | "purchase"
  | "builty"
  | "customer_payment"
  | "supplier_payment"
  | "produce"
  | "navigate";

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
  navigateHref?: string;
  navigateLabel?: string;
  navigateOptions?: EntityMatch[];
  parseError?: string;
};
