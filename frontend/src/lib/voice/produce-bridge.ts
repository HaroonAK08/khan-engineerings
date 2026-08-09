export type VoiceProduceFormLine = {
  productId: string;
  quantity: number;
  materialType?: "scrap" | "daig";
  productionDate?: string;
};

export type VoiceProduceFormPayload = {
  productionDate?: string;
  items: VoiceProduceFormLine[];
};

export const VOICE_PRODUCE_ADD_EVENT = "voice-produce-add";
export const VOICE_PRODUCE_PENDING_KEY = "voice-produce-pending";

export type VoiceBuiltyFormLine = {
  productId: string;
  quantity: number;
  rate?: number;
  amount?: number;
  pricingMode?: "rate_kg" | "fixed";
  quantityExplicit?: boolean;
};

export type VoiceBuiltyFormPayload = {
  customerId?: string;
  customerQuery?: string;
  builtyNo?: string;
  billNo?: string;
  builtyDate?: string;
  /** Apply this rate to the last product line (rate-only voice command). */
  rateOnly?: number;
  /** Apply fixed unit price to the last product line. */
  fixedOnly?: number;
  items: VoiceBuiltyFormLine[];
};

export const VOICE_BUILTY_ADD_EVENT = "voice-builty-add";
export const VOICE_BUILTY_PENDING_KEY = "voice-builty-pending";

export type VoiceSalaryPayPayload = {
  workerId: string;
  workerName?: string;
  amount: number;
  expenseDate?: string;
  notes?: string;
};

export const VOICE_SALARY_PAY_EVENT = "voice-salary-pay";
export const VOICE_SALARY_PAY_PENDING_KEY = "voice-salary-pay-pending";

export function isSalaryPagePath(pathname: string | null) {
  if (!pathname) return false;
  return (
    pathname === "/dashboard/expenses/salaries" ||
    pathname.startsWith("/dashboard/expenses/salaries/")
  );
}
