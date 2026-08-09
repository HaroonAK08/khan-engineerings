/**
 * Shared speech understanding helpers: STT repairs, synonyms, pricing intent.
 * Keep parsers flexible — speakers won't use exact scripted phrases.
 */

export type PricingIntent = {
  mode: "rate_kg" | "fixed";
  value: number;
};

/** Phrase → canonical token (applied early on all voice text). */
const PHRASE_REWRITES: Array<{ hear: RegExp; to: string }> = [
  // Builty (STT often hears "building")
  { hear: /\b(buildings?|builtly|biltys?|bultys?|beltys?|boltys?|bilties)\b/gi, to: "builty" },
  { hear: /\bbuilt\s+e\b/gi, to: "builty" },
  { hear: /\bbill\s+t(?:ea|y)?\b/gi, to: "builty" },
  { hear: /\bbilty\b/gi, to: "builty" },
  { hear: /\bbill\s*tee\b/gi, to: "builty" },
  // Produce
  { hear: /\b(reduce|reduced|reducing|reduces)\b/gi, to: "produce" },
  { hear: /\b(production\s+entry|factory\s+produce)\b/gi, to: "produce" },
  // Product brands (STT)
  { hear: /\bhe\s+knows?\b/gi, to: "hino" },
  { hear: /\bhe\s+no\b/gi, to: "hino" },
  { hear: /\bhe\s+now\b/gi, to: "hino" },
  { hear: /\bhigh\s+no\b/gi, to: "hino" },
  { hear: /\bhi\s+no\b/gi, to: "hino" },
  { hear: /\bni\s+san\b/gi, to: "nissan" },
  { hear: /\bnees[oa]n\b/gi, to: "nissan" },
  { hear: /\bchai\s+na\b/gi, to: "china" },
  { hear: /\bchee\s+na\b/gi, to: "china" },
  { hear: /\btoy\s+ota\b/gi, to: "toyota" },
  { hear: /\bisu\s+zu\b/gi, to: "isuzu" },
  { hear: /\bbed\s+ford\b/gi, to: "bedford" },
  { hear: /\bmo\s+ty\b/gi, to: "moty" },
  { hear: /\bmoti\b/gi, to: "moty" },
  // Quantities / units
  { hear: /\b(to|too)\s+(drums?|hubs?|pcs|pieces?)\b/gi, to: "two $2" },
  { hear: /\b(for|four)\s+(drums?|hubs?)\b/gi, to: "four $2" },
  { hear: /\b(kilos?|kilograms?)\b/gi, to: "kg" },
  { hear: /\bper\s+kilo(?:gram)?\b/gi, to: "per kg" },
  { hear: /\b\/\s*kilo(?:gram)?\b/gi, to: "/kg" },
  { hear: /\bpieces?\b/gi, to: "pcs" },
  // Pricing language → canonical
  { hear: /\bfixed\s+rate\b/gi, to: "fixed price" },
  { hear: /\bfix\s+rate\b/gi, to: "fixed price" },
  { hear: /\bfix(?:ed)?\s+price\b/gi, to: "fixed price" },
  { hear: /\bflat\s+(?:rate|price|amount)\b/gi, to: "fixed price" },
  { hear: /\blump\s+sum\b/gi, to: "fixed price" },
  { hear: /\bunit\s+price\b/gi, to: "fixed price" },
  { hear: /\bprice\s+fixed\b/gi, to: "fixed price" },
  { hear: /\bfull\s+price\b/gi, to: "fixed price" },
  { hear: /\btotal\s+price\b/gi, to: "fixed price" },
  { hear: /\brate\s+per\s*kg\b/gi, to: "rate" },
  { hear: /\bprice\s+per\s*kg\b/gi, to: "rate" },
  { hear: /\bper\s+kilo\s+rate\b/gi, to: "rate" },
  // Actions (avoid rewriting bare "type" — conflicts with product speech)
  { hear: /\b(put|enter|write)\s+(?:in\s+)?(?:the\s+)?/gi, to: "set " },
  { hear: /\b(change|update|modify)\s+(?:the\s+)?(?:to\s+)?/gi, to: "set " },
  { hear: /\b(banao|bana|daldo|daalo|dal\s+do)\b/gi, to: "add" },
  { hear: /\b(kholo|khole|dikhao)\b/gi, to: "open" },
  // Party
  { hear: /\b(customer|client|buyer)\b/gi, to: "party" },
  // Salary / payment phrasing
  { hear: /\b(payments?|paying|paid)\b/gi, to: "pay" },
  { hear: /\b(wages?|salary)\s+(?:payment|pay)\b/gi, to: "pay" },
  { hear: /\badd\s+(\d+(?:\.\d+)?)\s+(?:pay|rupees|rs)?\s*(?:to|for)\b/gi, to: "pay $1 to" },
  { hear: /\b(?:give|send)\s+(\d+(?:\.\d+)?)\s+(?:to|for)\b/gi, to: "pay $1 to" },
  // Navigation softeners
  { hear: /\btake\s+me\s+to\b/gi, to: "go to" },
  { hear: /\bnavigate\s+to\b/gi, to: "go to" },
];

export function applySpeechRewrites(text: string) {
  let out = text;
  for (const row of PHRASE_REWRITES) {
    out = out.replace(row.hear, row.to);
  }
  return out.replace(/\s+/g, " ").trim();
}

export function smartNormalize(text: string) {
  let out = text
    .toLowerCase()
    .replace(/@/g, " at ")
    .replace(/\b(slash|slashes|forward slash)\b/g, " / ")
    .replace(/\b(dash|hyphen|minus)\b/g, " - ")
    .replace(/\bthen\b/g, " ");

  out = applySpeechRewrites(out);

  out = out
    .replace(/[₹$]/g, " ")
    .replace(/\brs\.?\b/g, " rupees ")
    .replace(/\brupee\b/g, " rupees ")
    .replace(/[^\p{L}\p{N}\s./-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return out;
}

/** True when speaker clearly wants fixed unit price (not per-kg). */
export function wantsFixedPricing(text: string) {
  return (
    /\bfixed\b/i.test(text) ||
    /\bflat\b/i.test(text) ||
    /\blump\s+sum\b/i.test(text) ||
    /\bunit\s+price\b/i.test(text) ||
    /\bfixed\s+(?:price|amount|rate)\b/i.test(text) ||
    /\bprice\s+fixed\b/i.test(text) ||
    /\bfull\s+price\b/i.test(text)
  );
}

/** True when speaker wants per-kg rate. */
export function wantsRatePricing(text: string) {
  if (wantsFixedPricing(text)) return false;
  return (
    /\brate\b/i.test(text) ||
    /\bper\s*kg\b/i.test(text) ||
    /\/\s*kg\b/i.test(text) ||
    /\b@\b/.test(text)
  );
}

const FIXED_VALUE_PATTERNS = [
  /\bfixed\s+(?:price|amount|rate)\s*(?:of|to|=|:)?\s*(\d+(?:\.\d+)?)/i,
  /\b(?:flat|unit|full|total)\s+(?:price|amount|rate)\s*(?:of|to|=|:)?\s*(\d+(?:\.\d+)?)/i,
  /\bprice\s+fixed(?:\s+price)?\s*(?:of|to|=|:)?\s*(\d+(?:\.\d+)?)/i,
  /\bfixed(?:\s+price|\s+amount|\s+rate)?\s*(?:of|to|=|:)?\s*(\d+(?:\.\d+)?)/i,
  /\b(?:amount|total)\s*(?:of|to|=|:)?\s*(\d+(?:\.\d+)?)/i,
  /\b(?:unit\s+)?price\s*(?:of|to|=|:)?\s*(\d+(?:\.\d+)?)(?!\s*per\s*kg)/i,
];

const RATE_VALUE_PATTERNS = [
  /\b(?:@|rate)(?:\s*(?:of|to|=|:))?\s*(\d+(?:\.\d+)?)\s*(?:per\s*kg|\/\s*kg|rs|rupees)?/i,
  /\bat\s+(?:the\s+)?rate\s*(?:of|to|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:per\s*kg|\/\s*kg|rs|rupees)?/i,
  /\bat\s+(\d+(?:\.\d+)?)\s*(?:per\s*kg|\/\s*kg|rs|rupees)\b/i,
  /\b(\d+(?:\.\d+)?)\s*(?:per\s*kg|\/\s*kg)\b/i,
  /\bprice\s*(?:of|to|=|:)?\s*(\d+(?:\.\d+)?)\s*per\s*kg\b/i,
];

function firstMatchNumber(text: string, patterns: RegExp[]) {
  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const n = Number(String(m[1]).replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

/**
 * Understand pricing from free speech.
 * "fixed rate 9800", "rate 200", "price 5000", "@ 250 per kg"
 */
export function interpretPricing(text: string): PricingIntent | null {
  const fixed = wantsFixedPricing(text);
  if (fixed) {
    const value =
      firstMatchNumber(text, FIXED_VALUE_PATTERNS) ??
      // "fixed 9800" / trailing number after fixed
      text.match(/\bfixed\b(?:\s+\w+){0,3}\s+(\d+(?:\.\d+)?)\b/i)?.[1];
    const n = value != null ? Number(value) : undefined;
    if (n != null && Number.isFinite(n)) return { mode: "fixed", value: n };
  }

  if (wantsRatePricing(text)) {
    const n = firstMatchNumber(text, RATE_VALUE_PATTERNS);
    if (n != null) return { mode: "rate_kg", value: n };
  }

  // Bare "price 9800" on a form → treat as fixed unit price (common speech)
  const barePrice = text.match(
    /^(?:(?:set|change|update|make|add)\s+)?(?:the\s+)?price\s*(?:of|to|is|=|:)?\s*(\d+(?:\.\d+)?)\s*$/i
  );
  if (barePrice) {
    return { mode: "fixed", value: Number(barePrice[1]) };
  }

  // Bare "9800" alone is too ambiguous — caller may use context
  return null;
}

export function isPricingOnlyUtterance(text: string) {
  const pricing = interpretPricing(text);
  if (!pricing) {
    return /^(?:(?:set|change|update|make|add)\s+)?(?:the\s+)?(?:rate|price|amount|fixed)?\s*(?:of|to|is|=|:)?\s*\d+(?:\.\d+)?\s*(?:per\s*kg|\/\s*kg|rs|rupees)?\s*$/i.test(
      text
    );
  }
  // Strip pricing words/numbers; if nothing product-like remains, it's pricing-only
  const rest = text
    .replace(/\bfixed(?:\s+(?:price|amount|rate))?\b/gi, " ")
    .replace(/\b(?:flat|unit|full|total)\s+(?:price|amount|rate)\b/gi, " ")
    .replace(/\b(?:rate|price|amount|total)\b/gi, " ")
    .replace(/\bper\s*kg\b/gi, " ")
    .replace(/\/\s*kg\b/gi, " ")
    .replace(/\b(?:set|change|update|make|add|the|to|of|is|at|rs|rupees)\b/gi, " ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !rest || !/[a-z\u0600-\u06ff]{2,}/i.test(rest);
}

export function looksLikeProductSpeech(text: string) {
  // Ignore "per kg" / "/kg" so pricing speech isn't mistaken for a product size
  const body = text
    .replace(/\bper\s*kg\b/gi, " ")
    .replace(/\/\s*kg\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    /\b(hub|hubs|drum|drums|pcs|pieces?|china|nissan|hino|toyota|isuzu|mazda|moty|bedford|product|item|scrap|daig)\b/i.test(
      body
    ) || /\b\d+\s*kg\b/i.test(body)
  );
}

export { FIXED_VALUE_PATTERNS, RATE_VALUE_PATTERNS };
