import type { ParsedVoiceCommand, VoiceIntent } from "@/lib/voice/types";
import type { VoicePageContext } from "@/lib/voice/page-context";
import { expenseCategoryFromPath } from "@/lib/voice/page-context";
import {
  FIXED_VALUE_PATTERNS,
  RATE_VALUE_PATTERNS,
  interpretPricing,
  isPricingOnlyUtterance,
  looksLikeProductSpeech,
  smartNormalize,
  wantsFixedPricing,
} from "@/lib/voice/smart-speech";

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
  lakh: 100000,
  lac: 100000,
  million: 1000000,
};

const CATEGORY_SYNONYMS: Array<{ id: string; words: string[] }> = [
  { id: "electricity", words: ["electricity", "electric", "bijli", "power bill", "power"] },
  { id: "taxes", words: ["taxes", "tax", "government tax"] },
  { id: "petrol", words: ["petrol", "fuel", "diesel", "gasoline"] },
  { id: "lpg_gas", words: ["lpg", "lpg gas", "gas cylinder", "cylinder gas"] },
  { id: "paint", words: ["paint", "painting"] },
  { id: "silica_sand", words: ["silica sand", "silica", "sand"] },
  { id: "silicate", words: ["silicate"] },
  { id: "sheera", words: ["sheera"] },
  { id: "chemicals", words: ["chemical", "chemicals"] },
  { id: "tools", words: ["tool", "tools"] },
  { id: "machine", words: ["machine", "machine maintenance", "maintenance"] },
  { id: "repairs", words: ["repair", "repairs"] },
  { id: "tour_expenses", words: ["tour", "tour expense", "tour expenses"] },
  { id: "salesman_commission", words: ["commission", "salesman commission"] },
  { id: "scrap", words: ["scrap expense"] },
  { id: "daig", words: ["daig expense"] },
  { id: "other", words: ["other", "misc", "miscellaneous", "kharcha"] },
];

function normalize(text: string) {
  return smartNormalize(text);
}

/** If STT merged "20 50 kg" into "2050 kg" / "2015 kg", offer a split form for matching. */
function expandMergedSizeNumbers(text: string) {
  return text.replace(/\b(\d{2})(\d{2})\s*(kg)\b/gi, "$1 $2 $3");
}

function wordsToNumber(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let saw = false;
  for (const raw of tokens) {
    const w = raw.replace(/,/g, "");
    if (/^\d+(\.\d+)?$/.test(w)) {
      current += Number(w);
      saw = true;
      continue;
    }
    if (ONES[w] != null) {
      current += ONES[w];
      saw = true;
      continue;
    }
    if (TENS[w] != null) {
      current += TENS[w];
      saw = true;
      continue;
    }
    if (w === "and") continue;
    if (SCALES[w] != null) {
      const scale = SCALES[w];
      if (current === 0) current = 1;
      current *= scale;
      if (scale >= 1000) {
        total += current;
        current = 0;
      }
      saw = true;
      continue;
    }
    if (saw) break;
  }
  const value = total + current;
  return saw && value > 0 ? value : null;
}

function extractNumberNear(
  text: string,
  patterns: RegExp[]
): number | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const raw = (m[1] || "").trim();
    if (!raw) continue;
    if (/^\d+(\.\d+)?$/.test(raw.replace(/,/g, ""))) {
      return Number(raw.replace(/,/g, ""));
    }
    const n = wordsToNumber(raw.split(/\s+/));
    if (n != null) return n;
  }
  return undefined;
}

function firstNumber(text: string): number | undefined {
  const digit = text.match(/\b(\d+(?:\.\d+)?)\b/);
  if (digit) return Number(digit[1]);
  const tokens = text.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const n = wordsToNumber(tokens.slice(i));
    if (n != null) return n;
  }
  return undefined;
}

function captureAfter(text: string, starters: string[], stoppers: string[]) {
  for (const start of starters) {
    const re = new RegExp(`\\b${start}\\s+(.+)$`, "i");
    const m = text.match(re);
    if (!m) continue;
    let rest = m[1].trim();
    for (const stop of stoppers) {
      const cut = new RegExp(`\\b${stop}\\b.*$`, "i");
      rest = rest.replace(cut, "").trim();
    }
    rest = rest.replace(/\b(add|kro|karo|please|kar|do)\b/gi, "").trim();
    if (rest) return rest;
  }
  return undefined;
}

function detectCategory(text: string): { id: string; title?: string } | null {
  for (const row of CATEGORY_SYNONYMS) {
    for (const word of row.words) {
      if (text.includes(word)) {
        if (row.id === "other") {
          const title =
            captureAfter(text, ["other", "misc", "miscellaneous", "titled", "title"], [
              "amount",
              "rupees",
              "rs",
              "expense",
              "kharcha",
              "of",
              "for",
            ]) || undefined;
          return { id: "other", title };
        }
        return { id: row.id };
      }
    }
  }
  return null;
}

function isNavigateCommand(text: string) {
  const hasNavVerb =
    /\b(open|go to|goto|go|show|take me to|navigate|kholo|khol|dikhao|dikha|jao)\b/.test(
      text
    ) || /\b(record of|records of|ledger of)\b/.test(text);

  if (!hasNavVerb) return false;

  // Creating a production batch is not navigation
  if (
    /\b(produc(?:e|ed|ing)|banaya|banao)\b/.test(text) &&
    /\b(quantity|qty|pcs|piece|\d+)\b/.test(text)
  ) {
    return false;
  }

  // Creating builty / payment / purchase should not navigate
  if (
    /\b(paid|payment|buy|purchase|kharid|quantity|qty|rate|per kg|kg from|kg by)\b/.test(
      text
    ) &&
    !/\b(open|go to|goto|go|show|kholo|khol|dikhao|record of|records of)\b/.test(text)
  ) {
    return false;
  }

  // "create/add builty ..." is an entry command, not navigation
  if (/\b(create|add|make|new)\s+(?:builty|bilt[iy]?|invoice)\b/.test(text)) {
    return false;
  }

  return true;
}

function parseNavigate(text: string): ParsedVoiceCommand {
  const base = {
    intent: "navigate" as const,
    raw: text,
    normalized: text,
  };

  // Bare "go to builty" / "open builty" → builty list page (not a record)
  if (
    /^(?:open|go to|goto|go|show|take me to|navigate|kholo|dikhao)\s+(?:the\s+)?(?:builty|bilt[iy]?|sales)(?:\s+page|\s+list)?\s*$/i.test(
      text
    )
  ) {
    return { ...base, navigateKind: "page" };
  }

  // open builty number B-123 / builty no 45 / builty 120
  const builtyNumberMatch =
    text.match(
      /\b(?:builty|bilt[iy]?|invoice)\s+(?:number|no\.?|num|#)\s*([a-z0-9][a-z0-9\-_/]*)/i
    ) ||
    text.match(
      /\b(?:builty|bilt[iy]?|invoice)\s+([a-z0-9]*\d[a-z0-9\-_/]*)\b/i
    );

  if (builtyNumberMatch?.[1]) {
    return {
      ...base,
      builtyQuery: builtyNumberMatch[1].trim(),
      navigateKind: "builty",
    };
  }

  // open builty of Hassan / go builty for Ali / show Hassan builty
  const builtyPersonMatch =
    text.match(
      /\b(?:builty|bilt[iy]?|sale|sales|invoice)\s+(?:of|for|from)\s+(.+)$/i
    ) ||
    text.match(
      /\b(?:open|go to|goto|go|show|kholo|dikhao)\s+(.+?)\s+(?:['’]?s\s+)?(?:builty|bilt[iy]?|sale|invoice)\b/i
    ) ||
    text.match(
      /\b(?:open|go to|goto|go|show|kholo|dikhao)\s+(?:builty|bilt[iy]?)\s+(?:of|for|from)\s+(.+)$/i
    ) ||
    text.match(
      /\b(?:open|go to|goto|go|show|kholo|dikhao)\s+(?:builty|bilt[iy]?)\s+([a-z\u0600-\u06ff][a-z\u0600-\u06ff\s.'-]{1,40})$/i
    );

  if (builtyPersonMatch?.[1]) {
    const person = builtyPersonMatch[1]
      .replace(
        /\b(number|no|num|record|page|please|the|list|history|to|for|of|from)\b/gi,
        ""
      )
      .replace(/\s+/g, " ")
      .trim();
    const fillerOnly =
      !person ||
      /^(to|the|a|an|my|please|page|list|new|all|sale|sales)$/i.test(person);
    if (
      person &&
      !fillerOnly &&
      !/^\d+$/.test(person) &&
      !/\b(history|new|list|page)\b/i.test(person)
    ) {
      return {
        ...base,
        builtyQuery: person,
        navigateQuery: person,
        navigateKind: "builty",
        customerQuery: person,
      };
    }
  }

  // Just "open builty" / "go sales" → page list (handled by route matcher)
  if (
    /\b(builty|bilt[iy]?|sales|sale|invoices)\b/.test(text) &&
    !/\b(of|for|from|number|no\.?|num|#)\b/.test(text)
  ) {
    const onlyPage =
      !/\b(customer|party|supplier|vendor|record of|records of)\b/.test(text);
    if (onlyPage) {
      return { ...base, navigateKind: "page" };
    }
  }

  let navigateQuery: string | undefined;

  const recordMatch = text.match(
    /\b(?:record|records|ledger|account|profile|page)\s+(?:of|for)\s+(.+)$/i
  );
  const partyMatch = text.match(
    /\b(?:customer|party|supplier|vendor)\s+(.+)$/i
  );
  const openOfMatch = text.match(
    /\b(?:open|go to|goto|go|show|kholo|dikhao)\s+(.+?)(?:\s+record|\s+page|\s+ledger)?$/i
  );

  if (recordMatch?.[1]) {
    navigateQuery = recordMatch[1]
      .replace(/\b(record|page|ledger|please|kholo|dikhao)\b/gi, "")
      .trim();
  } else if (
    partyMatch?.[1] &&
    !matchLooksLikePage(partyMatch[1]) &&
    /\b(customer|party|supplier|vendor)\b/.test(text)
  ) {
    navigateQuery = partyMatch[1]
      .replace(/\b(record|page|ledger|list|please)\b/gi, "")
      .trim();
  } else if (openOfMatch?.[1] && !matchLooksLikePage(openOfMatch[1])) {
    const candidate = openOfMatch[1]
      .replace(/\b(record|page|ledger|please)\b/gi, "")
      .trim();
    if (candidate.split(/\s+/).length >= 2 || /\b(haji|mr|malik)\b/.test(candidate)) {
      navigateQuery = candidate;
    }
  }

  return {
    ...base,
    navigateQuery: navigateQuery || undefined,
    navigateKind: navigateQuery ? "person" : "page",
    customerQuery: /\b(customer|party)\b/.test(text) ? navigateQuery : undefined,
    supplierQuery: /\b(supplier|vendor)\b/.test(text) ? navigateQuery : undefined,
  };
}

function matchLooksLikePage(text: string) {
  return /\b(production|inventory|product|products|expense|expenses|builty|sales|sale|supplier|suppliers|party|parties|claim|claims|report|reports|dashboard|salary|salaries|electricity|tax|taxes|voice)\b/.test(
    text
  );
}

function detectIntent(text: string): VoiceIntent | null {
  // Bare section names → open that page (continuous session starts there)
  if (
    /^(?:open|go to|goto|go|show|take me to)?\s*(?:the\s+)?(?:produce|production|reduce)\s*$/.test(
      text
    )
  ) {
    return "navigate";
  }
  if (
    /^(?:open|go to|goto|go|show)?\s*(?:the\s+)?(?:salaries|salary|wages|labour|labor)\s*$/.test(
      text
    )
  ) {
    return "navigate";
  }
  if (
    /^(?:open|go to|goto|go|show)?\s*(?:the\s+)?(?:suppliers?|vendors?)\s*$/.test(text)
  ) {
    return "navigate";
  }
  if (
    /^(?:open|go to|goto|go|show)?\s*(?:the\s+)?(?:salesmen|salesman|sales man)\s*$/.test(
      text
    )
  ) {
    return "navigate";
  }
  if (
    /^(?:open|go to|goto|go|show)?\s*(?:the\s+)?(?:expenses?|kharcha|electricity|taxes?|builty|bilt[iy]?|sales)\s*$/.test(
      text
    )
  ) {
    return "navigate";
  }

  if (isNavigateCommand(text)) {
    return "navigate";
  }

  if (
    /\b(add|create|new)\s+(?:a\s+)?(?:supplier|vendor)\b/.test(text) ||
    /\b(?:supplier|vendor)\s+(?:add|create|new)\b/.test(text)
  ) {
    return "add_supplier";
  }
  if (
    /\b(add|create|new)\s+(?:a\s+)?(?:salesman|sales\s*man)\b/.test(text) ||
    /\b(?:salesman|sales\s*man)\s+(?:add|create|new)\b/.test(text)
  ) {
    return "add_salesman";
  }
  if (
    /\b(add|create|new)\s+(?:a\s+)?(?:worker|employee|labour|labor)\b/.test(text)
  ) {
    return "add_worker";
  }
  if (
    /\b(pay|salary|wage)\b/.test(text) &&
    /\b(worker|employee|labour|labor|to|for)\b/.test(text)
  ) {
    return "salary_pay";
  }
  // "add 10000 to Ali" / "pay Ali 5000" / "10000 for Abbas painter"
  if (
    /\bpay\b/.test(text) &&
    !/\b(supplier|customer|party|salesman|builty|expense)\b/.test(text) &&
    /\d/.test(text)
  ) {
    return "salary_pay";
  }
  if (
    /\bpay\b/.test(text) &&
    !/\b(supplier|customer|party|salesman)\b/.test(text) &&
    /\bpay\s+[a-z\u0600-\u06ff].+\d/.test(text)
  ) {
    return "salary_pay";
  }

  // Bare create/new builty → navigate to new form
  if (
    /^(?:create|add|make|new)\s+(?:a\s+)?(?:builty|bilt[iy]?|invoice|sale)\s*$/.test(
      text
    )
  ) {
    return "navigate";
  }

  if (
    /\b(builty|bilt[iy]?|invoice|dispatch)\b/.test(text) ||
    (/\b(customer|party)\b/.test(text) &&
      /\b(product|qty|quantity|rate|pcs|piece)\b/.test(text) &&
      !/\b(paid|payment|pay)\b/.test(text))
  ) {
    return "builty";
  }
  if (
    /\b(produc(?:e|ed|ing|tion)|reduce|reduced|reducing|banaya|banao|cast|furnace batch)\b/.test(
      text
    )
  ) {
    return "produce";
  }
  if (
    /\b(pay\s+supplier|supplier\s+pay|supplier\s+payment|pay\s+to\s+supplier)\b/.test(
      text
    ) ||
    (/\bsupplier\b/.test(text) && /\b(paid|payment|pay)\b/.test(text))
  ) {
    return "supplier_payment";
  }
  if (
    /\b(customer\s+paid|party\s+paid|received\s+from|payment\s+from)\b/.test(text) ||
    (/\b(customer|party)\b/.test(text) && /\b(paid|payment|pay)\b/.test(text))
  ) {
    return "customer_payment";
  }
  if (
    /\b(buy|purchase|kharid|kharido|bought)\b/.test(text) ||
    (/\b(scrap|daig)\b/.test(text) && /\b(kg|kilo)\b/.test(text))
  ) {
    return "purchase";
  }
  if (
    /\b(expense|kharcha|kharch|bill)\b/.test(text) ||
    CATEGORY_SYNONYMS.some((c) => c.words.some((w) => text.includes(w)))
  ) {
    return "expense";
  }
  return null;
}

function parseExpense(text: string): ParsedVoiceCommand {
  const cat = detectCategory(text);
  const amount =
    extractNumberNear(text, [
      /\b(?:amount|rupees|rs|of|for)\s+([\w\s.-]+?)(?:\s+(?:add|kro|karo|rupees|rs|only|please)|$)/i,
      /\b(\d+(?:\.\d+)?)\s*(?:rupees|rs)?\b/i,
    ]) ?? firstNumber(text);

  return {
    intent: "expense",
    raw: text,
    normalized: text,
    category: cat?.id || "other",
    title: cat?.title,
    amount,
    error: amount == null ? "Could not find expense amount." : undefined,
  };
}

function parsePurchase(text: string): ParsedVoiceCommand {
  const materialType: "scrap" | "daig" = /\bdaig\b/.test(text) ? "daig" : "scrap";
  const quantity =
    extractNumberNear(text, [
      /\b(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos|kilogram|kilograms)\b/i,
      /\b(?:qty|quantity|of)\s+(\d+(?:\.\d+)?)\b/i,
    ]) ?? undefined;
  const rate =
    extractNumberNear(text, [
      /\b(?:at|rate|@)\s+(\d+(?:\.\d+)?)\s*(?:per\s*kg|\/\s*kg|rs)?/i,
      /\b(\d+(?:\.\d+)?)\s*(?:per\s*kg|\/\s*kg)\b/i,
    ]) ?? undefined;
  const amount =
    extractNumberNear(text, [
      /\b(?:total|amount|for)\s+(\d+(?:\.\d+)?)\b/i,
    ]) ?? undefined;

  let supplierQuery =
    captureAfter(
      text,
      ["from", "by", "supplier", "of supplier", "vendor"],
      [
        "at",
        "rate",
        "per",
        "kg",
        "for",
        "amount",
        "rupees",
        "total",
        "add",
        "buy",
        "purchase",
        "scrap",
        "daig",
      ]
    ) || undefined;

  if (!supplierQuery) {
    const loose = text.match(
      /\b(?:from|by)\s+([a-z\u0600-\u06ff][a-z\u0600-\u06ff\s.'-]{1,60}?)(?=\s+(?:at|rate|@|\d+)\b|$)/i
    );
    if (loose?.[1]) supplierQuery = loose[1].trim();
  }

  const qty = quantity != null ? Math.round(quantity) : undefined;
  let error: string | undefined;
  if (qty == null || qty <= 0) error = "Could not find purchase quantity in kg.";
  else if (rate == null && amount == null) error = "Could not find rate or total amount.";
  else if (!supplierQuery) error = "Could not find supplier name.";

  return {
    intent: "purchase",
    raw: text,
    normalized: text,
    materialType,
    quantity: qty,
    rate,
    amount,
    supplierQuery,
    error,
  };
}

const MONTH_NAMES =
  "january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec";

const SPOKEN_DATE_NAMED = new RegExp(
  `\\b(?:(?:set|change|update)\\s+)?(?:on|dated|date)\\s+(?:to\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})(?:\\s+(\\d{4}))?\\b`,
  "i"
);
const SPOKEN_DATE_NAMED_BARE = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})(?:\\s+(\\d{4}))?\\b`,
  "i"
);
const SPOKEN_DATE_ISO =
  /\b(?:(?:set|change|update)\s+)?(?:on|dated|date)\s+(?:to\s+)?(\d{4})-(\d{1,2})-(\d{1,2})\b/i;
const SPOKEN_DATE_DMY =
  /\b(?:(?:set|change|update)\s+)?(?:on|dated|date)\s+(?:to\s+)?(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/i;

function parseSpokenDate(text: string): string | undefined {
  const months: Record<string, number> = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sep: 9,
    sept: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
  };

  const toIso = (day: number, month: number, yearRaw?: string) => {
    if (!month || day < 1 || day > 31) return undefined;
    let year = yearRaw ? Number(yearRaw) : new Date().getFullYear();
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const relative = text.match(
    /\b(?:(?:set|change|update)\s+)?(?:(?:the\s+)?date\s+(?:to|is|=|:)?\s*)?(today|tomorrow|yesterday)\b/i
  );
  if (relative) {
    const base = new Date();
    const word = relative[1].toLowerCase();
    if (word === "tomorrow") base.setDate(base.getDate() + 1);
    if (word === "yesterday") base.setDate(base.getDate() - 1);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  }

  const named = text.match(SPOKEN_DATE_NAMED);
  if (named) {
    const iso = toIso(Number(named[1]), months[named[2].toLowerCase()], named[3]);
    if (iso) return iso;
  }

  // "set date 10 August" / "date 10 August" already covered; also bare "10 August"
  // when the phrase is clearly about setting a date
  if (/\b(set|change|update|date|dated|on)\b/i.test(text)) {
    const bare = text.match(SPOKEN_DATE_NAMED_BARE);
    if (bare) {
      const iso = toIso(Number(bare[1]), months[bare[2].toLowerCase()], bare[3]);
      if (iso) return iso;
    }
  }

  const iso = text.match(SPOKEN_DATE_ISO);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  const dmy = text.match(SPOKEN_DATE_DMY);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = dmy[3] ? Number(dmy[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return undefined;
}

function isDateOnlyUtterance(text: string) {
  if (!parseSpokenDate(text)) return false;
  const rest = text
    .replace(/\b(?:set|change|update|make|the|to|of|is|on|dated|date|today|tomorrow|yesterday)\b/gi, " ")
    .replace(SPOKEN_DATE_NAMED_BARE, " ")
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !rest || !/[a-z\u0600-\u06ff]{2,}/i.test(rest);
}

function stripSpokenDate(text: string) {
  return text
    .replace(SPOKEN_DATE_NAMED, " ")
    .replace(SPOKEN_DATE_NAMED_BARE, " ")
    .replace(SPOKEN_DATE_ISO, " ")
    .replace(SPOKEN_DATE_DMY, " ")
    .replace(/\b(?:set|change|update)\s+(?:the\s+)?date\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const QTY_WORD =
  "\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten";

const NUMBER_WORD_SET = new Set([
  ...Object.keys(ONES),
  ...Object.keys(TENS),
  ...Object.keys(SCALES),
]);

function isNumberishToken(token: string | undefined) {
  if (!token) return false;
  const w = token.toLowerCase().replace(/,/g, "");
  return NUMBER_WORD_SET.has(w) || /^\d+(\.\d+)?$/.test(w);
}

/** Split product clauses on "and", but keep "hundred and twenty". */
function splitProductSegments(text: string): string[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const parts: string[] = [];
  let current: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.toLowerCase() === "and") {
      if (isNumberishToken(tokens[i - 1]) && isNumberishToken(tokens[i + 1])) {
        current.push(token);
        continue;
      }
      if (current.length) {
        parts.push(current.join(" "));
        current = [];
      }
      continue;
    }
    current.push(token);
  }
  if (current.length) parts.push(current.join(" "));
  return parts.map((p) => p.trim()).filter(Boolean);
}

const BUILTY_RATE_PATTERNS = RATE_VALUE_PATTERNS;
const BUILTY_FIXED_PATTERNS = FIXED_VALUE_PATTERNS;

function stripBuiltyPricingWords(text: string) {
  return text
    .replace(/\bprice\s+fixed(?:\s+price)?\s*(?:of|to|=|:)?\s*\d+(?:\.\d+)?/gi, " ")
    .replace(/\bfixed(?:\s+price|\s+amount)?\s*(?:of|to|=|:)?\s*\d+(?:\.\d+)?/gi, " ")
    .replace(/\b(?:@|at|rate)\s*(?:of|to|=|:)?\s*\d+(?:\.\d+)?(?:\s*(?:per\s*kg|\/\s*kg|rs))?/gi, " ")
    .replace(/\bat\s+(?:the\s+)?rate\b.*$/i, " ")
    .replace(/\b\d+\s*per\s*kg\b/gi, " ")
    .replace(/\b(?:unit\s+)?price\s*(?:of|to|=|:)?\s*\d+(?:\.\d+)?/gi, " ")
    .replace(/\b(?:fixed|amount|total|price|per\s*kg)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBuiltyLineSegment(segment: string): {
  productQuery?: string;
  quantity?: number;
  rate?: number;
  amount?: number;
  materialType?: "scrap" | "daig";
  quantityExplicit?: boolean;
  pricingMode?: "rate_kg" | "fixed";
} {
  const cleaned = segment
    .replace(/^\b(?:product|item|also|plus|make|add)\b\s+/i, "")
    .replace(/\b(?:data|the|a|an)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const materialType = segmentMaterialType(cleaned);
  const preferFixed = wantsFixedPricing(cleaned);
  const pricing = interpretPricing(cleaned);

  const amount =
    pricing?.mode === "fixed"
      ? pricing.value
      : preferFixed
        ? extractNumberNear(cleaned, BUILTY_FIXED_PATTERNS) ?? undefined
        : extractNumberNear(cleaned, BUILTY_FIXED_PATTERNS) ?? undefined;
  const rate =
    preferFixed || pricing?.mode === "fixed"
      ? undefined
      : pricing?.mode === "rate_kg"
        ? pricing.value
        : extractNumberNear(cleaned, BUILTY_RATE_PATTERNS) ?? undefined;

  const pricingMode: "rate_kg" | "fixed" | undefined =
    preferFixed || pricing?.mode === "fixed" || (amount != null && rate == null)
      ? "fixed"
      : rate != null
        ? "rate_kg"
        : undefined;

  let productQuery: string | undefined;
  let quantity: number | undefined;
  let quantityExplicit = false;

  const withSizeAndQty = cleaned.match(
    new RegExp(
      `^(.+?\\d+\\s*kg)\\s+(${QTY_WORD})\\s*(?:grams?|gram|pcs|pieces?|drums?|hubs?|qty|quantity)?\\b`,
      "i"
    )
  );
  const qtyThenProduct = cleaned.match(
    new RegExp(
      `^(${QTY_WORD})\\s*(?:grams?|gram|pcs|pieces?|drums?|hubs?)?\\s+(?:of\\s+)?(.+?)(?=\\s+(?:@|at|rate|fixed|price)\\b|$)`,
      "i"
    )
  );
  const productThenQty = cleaned.match(
    new RegExp(
      `^(.+?)\\s+(?:qty|quantity|pcs|pieces?)\\s+(${QTY_WORD})\\b`,
      "i"
    )
  );
  const labeledProduct = captureAfter(
    cleaned,
    ["product", "item"],
    [
      "qty",
      "quantity",
      "rate",
      "amount",
      "pcs",
      "piece",
      "at",
      "for",
      "customer",
      "@",
      "fixed",
      "price",
    ]
  );

  if (withSizeAndQty) {
    productQuery = stripBuiltyPricingWords(withSizeAndQty[1]);
    quantity =
      wordsToNumber([withSizeAndQty[2].toLowerCase()]) ??
      Number(withSizeAndQty[2]);
    quantityExplicit = true;
  } else if (productThenQty) {
    productQuery = stripBuiltyPricingWords(productThenQty[1]);
    quantity =
      wordsToNumber([productThenQty[2].toLowerCase()]) ??
      Number(productThenQty[2]);
    quantityExplicit = true;
  } else if (qtyThenProduct) {
    quantity =
      wordsToNumber([qtyThenProduct[1].toLowerCase()]) ??
      Number(qtyThenProduct[1]);
    quantityExplicit = true;
    productQuery = stripBuiltyPricingWords(qtyThenProduct[2]);
  } else if (labeledProduct) {
    productQuery = stripBuiltyPricingWords(labeledProduct);
    quantity =
      extractNumberNear(cleaned, [
        /\b(?:qty|quantity|pcs|pieces?)\s+(\d+(?:\.\d+)?)\b/i,
        /\b(\d+(?:\.\d+)?)\s*(?:pcs|pieces?|grams?|gram|drums?|hubs?)\b/i,
      ]) ?? undefined;
    quantityExplicit = quantity != null;
  } else {
    productQuery = stripBuiltyPricingWords(cleaned);
    const looseQty = cleaned.match(
      /\b(\d+(?:\.\d+)?)\s*(?:pcs|pieces?|grams?|gram|drums?|hubs?)\b/i
    );
    if (looseQty) {
      quantity = Number(looseQty[1]);
      quantityExplicit = true;
      productQuery = productQuery
        .replace(looseQty[0], " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  // "China 48 kg" / "drum China 48 kg rate 200" → default qty 1 when only size spoken
  if (productQuery && (quantity == null || quantity <= 0)) {
    const looksLikeProduct =
      /[a-z\u0600-\u06ff]/i.test(productQuery) &&
      (/\b\d+\s*kg\b/i.test(productQuery) ||
        /\b(hub|drum|china|nissan|hino|toyota|moty|bedford)\b/i.test(productQuery) ||
        rate != null ||
        amount != null);
    if (looksLikeProduct) {
      quantity = 1;
      quantityExplicit = false;
    }
  }

  if (quantity != null) quantity = Math.round(Number(quantity));
  if (quantity != null && !Number.isFinite(quantity)) quantity = undefined;
  if (productQuery) {
    productQuery = productQuery
      .replace(/\b(?:please|add|kro|karo|make|data)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return {
    productQuery,
    quantity,
    rate: pricingMode === "fixed" ? undefined : rate,
    amount: pricingMode === "fixed" ? amount : undefined,
    materialType,
    quantityExplicit,
    pricingMode,
  };
}

function parseBuilty(text: string): ParsedVoiceCommand {
  const builtyNo =
    text.match(
      /\b(?:builty\s+)?(?:number|no\.?|num|#)\s*(?:is|=|:)?\s*([a-z0-9][a-z0-9\-_/]*)/i
    )?.[1] || undefined;

  const spokenDate = parseSpokenDate(text);

  // Date-only: "set date 10 August" / "date tomorrow"
  if (spokenDate && isDateOnlyUtterance(text) && !builtyNo) {
    return {
      intent: "builty",
      raw: text,
      normalized: text,
      spokenDate,
    };
  }

  // Pricing-only speech: "fixed rate 9800", "rate 200", "price 5000"
  const pricing = interpretPricing(text);
  if (pricing && isPricingOnlyUtterance(text) && !builtyNo) {
    return {
      intent: "builty",
      raw: text,
      normalized: text,
      rate: pricing.mode === "rate_kg" ? pricing.value : undefined,
      amount: pricing.mode === "fixed" ? pricing.value : undefined,
      spokenDate,
    };
  }

  // Bare number on the form → apply as rate to last product (most common)
  const bareNumber = text.match(
    /^(?:(?:set|change|update|make|add)\s+)?(?:the\s+)?(?:to\s+)?(\d+(?:\.\d+)?)\s*$/
  );
  if (bareNumber && !builtyNo) {
    return {
      intent: "builty",
      raw: text,
      normalized: text,
      rate: Number(bareNumber[1]),
      spokenDate,
    };
  }

  let customerQuery: string | undefined;
  let productsBlob = "";

  // create builty of Asif waziristan of China 44 kg 6 grams @ 250 and hub 4 quantity 10 rate 120
  const nestedOf = text.match(
    /\b(?:create|add|make|new)?\s*(?:builty|bilt[iy]?|invoice)\s+(?:of|for)\s+(.+?)\s+of\s+(.+)$/i
  );
  if (nestedOf) {
    customerQuery = nestedOf[1]
      .replace(/\b(customer|party|please)\b/gi, "")
      .trim();
    productsBlob = stripSpokenDate(
      nestedOf[2].replace(
        /\b(?:builty\s+)?(?:number|no\.?|num|#)\s*(?:is|=|:)?\s*[a-z0-9\-_/]+/gi,
        " "
      )
    );
  }

  // create builty of Ali / builty for Hassan (customer only — open form)
  if (!customerQuery) {
    const createOfParty = text.match(
      /\b(?:create|add|make|new)\s+(?:builty|bilt[iy]?|invoice)\s+(?:of|for)\s+(.+)$/i
    );
    if (createOfParty?.[1]) {
      const rest = createOfParty[1].trim();
      // If rest looks like "Ali China 44 kg..." without second "of", split on product cues
      const productCue = rest.match(
        /\s+(?=(?:hub|drum|china|nissan|hino|toyota|isuzu|mazda|product|item|\d+\s*kg)\b)/i
      );
      if (productCue && productCue.index != null && productCue.index > 0) {
        customerQuery = rest
          .slice(0, productCue.index)
          .replace(/\b(customer|party|please)\b/gi, "")
          .trim();
        productsBlob = stripSpokenDate(rest.slice(productCue.index));
      } else {
        customerQuery = rest
          .replace(/\b(customer|party|please)\b/gi, "")
          .replace(
            /\b(?:builty\s+)?(?:number|no\.?|num|#)\s*(?:is|=|:)?\s*[a-z0-9\-_/]+/gi,
            " "
          )
          .replace(/\s+/g, " ")
          .trim();
      }
    }
  }

  if (!customerQuery) {
    customerQuery =
      captureAfter(
        text,
        ["customer", "party", "for customer", "for party", "builty of", "builty for"],
        [
          "product",
          "qty",
          "quantity",
          "rate",
          "amount",
          "pcs",
          "piece",
          "of",
          "at",
          "@",
          "on",
          "builty",
          "and",
          "hub",
          "drum",
        ]
      ) || undefined;
  }

  if (!productsBlob) {
    const afterProduct = text.match(/\b(?:product|item)\s+(.+)$/i)?.[1];
    if (afterProduct) {
      productsBlob = stripSpokenDate(afterProduct);
    } else if (customerQuery) {
      const escaped = customerQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const afterCustomer =
        text.match(
          new RegExp(`\\b(?:customer|party)\\s+${escaped}\\s+(.+)$`, "i")
        )?.[1] ||
        text.match(
          new RegExp(
            `\\b(?:builty|bilt[iy]?|invoice)\\s+(?:of|for)\\s+${escaped}\\s+(.+)$`,
            "i"
          )
        )?.[1];
      productsBlob = stripSpokenDate(
        (afterCustomer || "")
          .replace(
            /\b(?:builty\s+)?(?:number|no\.?|num|#)\s*(?:is|=|:)?\s*[a-z0-9\-_/]+/gi,
            " "
          )
          .replace(/\s+/g, " ")
          .trim()
      );
    }
  }

  // Product-only utterance on the form: "China 44 kg 6 rate 250"
  if (!productsBlob && !customerQuery) {
    const stripped = stripSpokenDate(
      text
        .replace(
          /\b(?:create|add|make|new|please|builty|bilt[iy]?|invoice)\b/gi,
          " "
        )
        .replace(
          /\b(?:builty\s+)?(?:number|no\.?|num|#)\s*(?:is|=|:)?\s*[a-z0-9\-_/]+/gi,
          " "
        )
        .replace(/\s+/g, " ")
        .trim()
    );
    if (
      stripped &&
      (/\b(kg|rate|qty|quantity|pcs|hub|drum|@)\b/i.test(stripped) ||
        /\d/.test(stripped))
    ) {
      productsBlob = stripped;
    }
  }

  const segments = splitProductSegments(productsBlob);
  const parsedLines = segments
    .map((segment) => parseBuiltyLineSegment(segment))
    .filter(
      (line): line is {
        productQuery: string;
        quantity: number;
        rate?: number;
        amount?: number;
        materialType?: "scrap" | "daig";
        quantityExplicit?: boolean;
        pricingMode?: "rate_kg" | "fixed";
      } =>
        Boolean(line.productQuery) &&
        line.quantity != null &&
        line.quantity > 0
    );

  const preferFixed = wantsFixedPricing(text);
  const linePricing = interpretPricing(text);
  // One shared rate/amount for lines that omitted pricing
  const sharedAmount =
    (preferFixed || linePricing?.mode === "fixed"
      ? linePricing?.mode === "fixed"
        ? linePricing.value
        : extractNumberNear(text, BUILTY_FIXED_PATTERNS)
      : undefined) ??
    (preferFixed ? extractNumberNear(text, BUILTY_FIXED_PATTERNS) : undefined);
  const sharedRate =
    preferFixed || linePricing?.mode === "fixed"
      ? undefined
      : linePricing?.mode === "rate_kg"
        ? linePricing.value
        : extractNumberNear(text, BUILTY_RATE_PATTERNS) ?? undefined;

  const productLines = parsedLines.map((line) => {
    const amount =
      line.amount ??
      (line.pricingMode === "fixed" || preferFixed
        ? sharedAmount
        : line.rate == null && sharedRate == null
          ? sharedAmount
          : undefined);
    const rate =
      line.pricingMode === "fixed" || preferFixed
        ? undefined
        : line.rate ?? sharedRate;
    const pricingMode: "rate_kg" | "fixed" =
      line.pricingMode ||
      (preferFixed || (amount != null && rate == null) ? "fixed" : "rate_kg");
    return {
      productQuery: line.productQuery,
      quantity: line.quantity,
      rate,
      amount,
      materialType: line.materialType,
      quantityExplicit: line.quantityExplicit,
      pricingMode,
    };
  });

  const first = productLines[0];
  const productQuery = first?.productQuery;
  const quantity = first?.quantity;
  const rate = first?.rate ?? sharedRate;
  const amount = first?.amount ?? sharedAmount;

  let error: string | undefined;
  if (
    !customerQuery &&
    !productLines.length &&
    !builtyNo &&
    !spokenDate &&
    rate == null &&
    amount == null
  ) {
    error = "Could not find customer, product, builty number, rate, fixed price, or date.";
  }

  return {
    intent: "builty",
    raw: text,
    normalized: text,
    customerQuery,
    productQuery,
    productLines: productLines.length ? productLines : undefined,
    quantity,
    rate,
    amount,
    builtyNo,
    spokenDate,
    error,
  };
}

function parseCustomerPayment(text: string): ParsedVoiceCommand {
  const customerQuery =
    captureAfter(
      text,
      ["customer", "party", "from", "received from"],
      ["paid", "payment", "amount", "rupees", "rs", "of"]
    ) || undefined;
  const amount =
    extractNumberNear(text, [
      /\b(?:paid|payment|amount|of|rupees)\s+(\d+(?:\.\d+)?)\b/i,
      /\b(\d+(?:\.\d+)?)\s*(?:rupees|rs)?\b/i,
    ]) ?? firstNumber(text);

  let error: string | undefined;
  if (!customerQuery) error = "Could not find customer name.";
  else if (amount == null || amount <= 0) error = "Could not find payment amount.";

  return {
    intent: "customer_payment",
    raw: text,
    normalized: text,
    customerQuery,
    amount,
    error,
  };
}

function parseSupplierPayment(text: string): ParsedVoiceCommand {
  const supplierQuery =
    captureAfter(
      text,
      ["supplier", "to supplier", "pay supplier"],
      ["paid", "payment", "amount", "rupees", "rs", "of"]
    ) || undefined;
  const amount =
    extractNumberNear(text, [
      /\b(?:paid|payment|amount|of|rupees)\s+(\d+(?:\.\d+)?)\b/i,
      /\b(\d+(?:\.\d+)?)\s*(?:rupees|rs)?\b/i,
    ]) ?? firstNumber(text);

  let error: string | undefined;
  if (!supplierQuery) error = "Could not find supplier name.";
  else if (amount == null || amount <= 0) error = "Could not find payment amount.";

  return {
    intent: "supplier_payment",
    raw: text,
    normalized: text,
    supplierQuery,
    amount,
    error,
  };
}

const PRODUCE_NUMBER_TOKEN =
  "\\d+(?:\\.\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety";

function segmentMaterialType(segment: string): "scrap" | "daig" | undefined {
  if (/\bdrums?\b/.test(segment)) return "daig";
  if (/\bhubs?\b/.test(segment)) return "scrap";
  return undefined;
}

function parseProduceLineSegment(segment: string): {
  productQuery?: string;
  quantity?: number;
  materialType?: "scrap" | "daig";
} {
  const cleaned = segment
    .replace(/^\b(?:product|item|also|plus|for|of)\b\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return {};

  const materialType = segmentMaterialType(cleaned);
  let quantity: number | undefined;
  let productQuery: string | undefined;
  let stripFamilyWords = false;

  const familyOf = cleaned.match(
    new RegExp(
      `^(${PRODUCE_NUMBER_TOKEN})\\s+(drums?|hubs?)\\s+(?:of\\s+)?(.+)$`,
      "i"
    )
  );
  if (familyOf) {
    quantity =
      wordsToNumber([familyOf[1].toLowerCase()]) ?? Number(familyOf[1]);
    productQuery = familyOf[3].trim();
    stripFamilyWords = true;
  }

  // "hub Bedford" / "bedford hub" / "drum China 44 kg" (family word is part of the name)
  if (!productQuery) {
    const familyName = cleaned.match(
      /^(?:drums?|hubs?)\s+(.+)$/i
    ) || cleaned.match(
      /^(.+?)\s+(?:drums?|hubs?)$/i
    );
    if (familyName) {
      // Keep full phrase including hub/drum for matching "HUB Bedford"
      productQuery = cleaned
        .replace(/^\b(for|of|to|please)\b\s+/i, "")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  if (quantity == null) {
    const pcsOf = cleaned.match(
      new RegExp(
        `^(${PRODUCE_NUMBER_TOKEN})\\s+(?:pcs|pieces?)?\\s*(?:of\\s+)(.+)$`,
        "i"
      )
    );
    if (pcsOf) {
      quantity = wordsToNumber([pcsOf[1].toLowerCase()]) ?? Number(pcsOf[1]);
      productQuery = pcsOf[2].trim();
    }
  }

  if (quantity == null) {
    const explicitQty = cleaned.match(
      new RegExp(`\\b(?:qty|quantity)\\s+(${PRODUCE_NUMBER_TOKEN})\\b`, "i")
    );
    if (explicitQty) {
      quantity =
        wordsToNumber([explicitQty[1].toLowerCase()]) ??
        Number(explicitQty[1]);
      productQuery = cleaned
        .replace(explicitQty[0], " ")
        .replace(/\b(pcs|pieces?|to|of|for|product|item)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  if (quantity == null) {
    const pcsQty = cleaned.match(
      new RegExp(`\\b(${PRODUCE_NUMBER_TOKEN})\\s+(?:pcs|pieces?)\\b`, "i")
    );
    if (pcsQty) {
      quantity = wordsToNumber([pcsQty[1].toLowerCase()]) ?? Number(pcsQty[1]);
      productQuery = cleaned
        .replace(pcsQty[0], " ")
        .replace(/\b(to|of|for|product|item)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  if (quantity == null) {
    const leading = cleaned.match(
      new RegExp(`^(${PRODUCE_NUMBER_TOKEN})\\s+(.+)$`, "i")
    );
    if (leading) {
      const maybeQty =
        wordsToNumber([leading[1].toLowerCase()]) ?? Number(leading[1]);
      const after = leading[2].trim();
      if (
        maybeQty > 0 &&
        /[a-z\u0600-\u06ff]/i.test(after) &&
        !/^(?:kg|kilo)/i.test(after)
      ) {
        quantity = maybeQty;
        // "two hub Bedford" → keep "hub Bedford"; "two drums of China" already handled
        if (/^(?:drums?|hubs?)\s+/i.test(after) && !/\bof\b/i.test(after)) {
          productQuery = after;
        } else {
          productQuery = after
            .replace(/^\b(?:drums?|hubs?|pcs|pieces?|of|to)\b\s*/i, "")
            .replace(/\s+/g, " ")
            .trim();
          stripFamilyWords = true;
        }
      }
    }
  }

  if (quantity == null) {
    const nums = [...cleaned.matchAll(/\b(\d+(?:\.\d+)?)\b/g)];
    if (nums.length) {
      let chosen = nums[nums.length - 1];
      for (let i = nums.length - 1; i >= 0; i--) {
        const n = nums[i];
        const after = cleaned.slice(
          (n.index || 0) + n[0].length,
          (n.index || 0) + n[0].length + 4
        );
        if (!/^\s*kg\b/i.test(after)) {
          chosen = n;
          break;
        }
      }
      const idx = chosen.index || 0;
      const afterChosen = cleaned.slice(
        idx + chosen[0].length,
        idx + chosen[0].length + 4
      );
      if (!/^\s*kg\b/i.test(afterChosen) || nums.length === 1) {
        quantity = Math.round(Number(chosen[1]));
        productQuery = `${cleaned.slice(0, idx)} ${cleaned.slice(idx + chosen[0].length)}`
          .replace(
            /\b(pcs|pieces?|to|of|for|product|item|qty|quantity)\b/gi,
            " "
          )
          .replace(/\s+/g, " ")
          .trim();
      } else {
        productQuery = cleaned
          .replace(/\b(to|of|for|product|item)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
  }

  if (!productQuery) {
    productQuery =
      cleaned
        .replace(/^\b(for|of|to|please|add)\b\s+/i, "")
        .replace(/\b(pcs|pieces?|to|of|for|product|item|qty|quantity|please|add)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim() || undefined;
  }

  // Only strip generic family words when qty+family pattern already extracted the real name
  if (productQuery && stripFamilyWords) {
    productQuery = productQuery
      .replace(/\b(drums?|hubs?)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (productQuery) {
    productQuery = productQuery.replace(/\s+/g, " ").trim();
  }

  if (quantity != null && !Number.isFinite(quantity)) quantity = undefined;
  if (quantity != null) quantity = Math.round(quantity);
  // Name-only produce ("hub Bedford") → default 1 pc
  if (productQuery && (quantity == null || quantity <= 0)) quantity = 1;

  return { productQuery, quantity, materialType };
}

function parseProduce(text: string): ParsedVoiceCommand {
  // "produce two drum of China 44 kg and two drum of China 48 kg"
  // "reduce four drums of China 44 kg" (STT mishear of produce)
  const spokenDate = parseSpokenDate(text);

  if (spokenDate && isDateOnlyUtterance(text)) {
    return {
      intent: "produce",
      raw: text,
      normalized: text,
      spokenDate,
    };
  }

  // Prefer first spoken hub/drum so mixed lines don't all inherit the wrong family
  const globalMaterial: "scrap" | "daig" | undefined = (() => {
    const drumIdx = text.search(/\bdrums?\b/);
    const hubIdx = text.search(/\bhubs?\b/);
    if (drumIdx < 0 && hubIdx < 0) return undefined;
    if (hubIdx < 0) return "daig";
    if (drumIdx < 0) return "scrap";
    return hubIdx <= drumIdx ? "scrap" : "daig";
  })();

  const rest = stripSpokenDate(
    text
      .replace(
        /\b(produced|producing|produce|production|reduce|reduced|reducing|make|made|banaya|banao|cast)\b/gi,
        " "
      )
      .replace(/\b(please|add|kro|karo|kar do)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

  const segments = splitProductSegments(rest);
  const linesWithMaterial = segments
    .map((segment) => parseProduceLineSegment(segment))
    .filter(
      (line): line is {
        productQuery: string;
        quantity: number;
        materialType?: "scrap" | "daig";
      } =>
        Boolean(line.productQuery) &&
        line.quantity != null &&
        line.quantity > 0
    );

  const first = linesWithMaterial[0];
  let error: string | undefined;
  if (!linesWithMaterial.length) error = "Could not find product name.";

  return {
    intent: "produce",
    raw: text,
    normalized: text,
    productQuery: first?.productQuery,
    productLines: linesWithMaterial.map((line) => ({
      productQuery: line.productQuery,
      quantity: line.quantity,
      materialType: line.materialType || globalMaterial,
    })),
    quantity: first?.quantity,
    materialType: first?.materialType || globalMaterial,
    spokenDate,
    error,
  };
}

function parseAddPerson(
  text: string,
  intent: "add_supplier" | "add_salesman" | "add_worker"
): ParsedVoiceCommand {
  const name =
    captureAfter(
      text,
      [
        "supplier",
        "vendor",
        "salesman",
        "sales man",
        "worker",
        "employee",
        "add supplier",
        "add vendor",
        "add salesman",
        "add worker",
        "create supplier",
        "create salesman",
        "create worker",
        "new supplier",
        "new salesman",
        "new worker",
        "name",
      ],
      ["phone", "number", "please", "add", "kro", "karo"]
    ) ||
    text
      .replace(
        /\b(add|create|new|a|the|supplier|vendor|salesman|sales\s*man|worker|employee|please)\b/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim() ||
    undefined;

  const phone =
    text.match(/\b(?:phone|number|mobile|contact)\s*([0-9+\-\s]{7,})\b/i)?.[1]?.replace(
      /\s+/g,
      ""
    ) ||
    text.match(/\b(\+?\d{10,15})\b/)?.[1] ||
    undefined;

  let error: string | undefined;
  if (!name || name.length < 2) error = "Could not find the name.";

  return {
    intent,
    raw: text,
    normalized: text,
    supplierQuery: intent === "add_supplier" ? name : undefined,
    customerQuery: intent === "add_worker" || intent === "add_salesman" ? name : undefined,
    title: name,
    notes: phone ? `phone ${phone}` : undefined,
    error,
  };
}

function parseSalaryPay(text: string): ParsedVoiceCommand {
  const amount =
    extractNumberNear(text, [
      /\b(?:pay|paid|salary|amount|rupees|rs|of)\s+(\d+(?:\.\d+)?)\b/i,
      /\b(?:add|give|send)\s+(\d+(?:\.\d+)?)\b/i,
      /\b(\d+(?:\.\d+)?)\s*(?:rupees|rs)?\b/i,
    ]) ?? firstNumber(text);

  // "pay 10000 to Abbas painter" / "pay Abbas painter 10000"
  const payAmountToName = text.match(
    /\bpay\s+(\d+(?:\.\d+)?)\s+(?:rupees|rs)?\s*(?:to|for)\s+(.+)$/i
  );
  const payNameAmount = text.match(
    /\bpay\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(?:rupees|rs)?\s*$/i
  );
  const addAmountToName = text.match(
    /\b(?:add|give|send)\s+(\d+(?:\.\d+)?)\s+(?:pay|rupees|rs)?\s*(?:to|for)\s+(.+)$/i
  );

  let name: string | undefined;
  if (payAmountToName?.[2]) {
    name = payAmountToName[2];
  } else if (addAmountToName?.[2]) {
    name = addAmountToName[2];
  } else if (payNameAmount?.[1] && !/^\d/.test(payNameAmount[1])) {
    name = payNameAmount[1];
  } else {
    name =
      captureAfter(
        text,
        ["pay", "paid", "salary to", "wage to", "worker", "employee", "to", "for"],
        ["rupees", "rs", "amount", "please", "pay", "salary"]
      ) ||
      text
        .replace(/\b(pay|paid|salary|wage|worker|employee|to|for|please|add|give|send|kro)\b/gi, " ")
        .replace(/\b\d+(?:\.\d+)?\b/g, " ")
        .replace(/\s+/g, " ")
        .trim() ||
      undefined;
  }

  if (name) {
    name = name
      .replace(/\b(rupees|rs|amount|please|pay|salary|wage|payment)\b/gi, " ")
      .replace(/\b\d+(?:\.\d+)?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  let error: string | undefined;
  if (!name) error = "Could not find worker name.";
  else if (amount == null || amount <= 0) error = "Could not find payment amount.";

  return {
    intent: "salary_pay",
    raw: text,
    normalized: text,
    customerQuery: name || undefined,
    amount,
    error,
  };
}

export type { VoicePageContext };

export function parseVoiceCommand(
  raw: string,
  options?: { pageContext?: VoicePageContext; pathname?: string }
): ParsedVoiceCommand {
  const normalized = normalize(raw);
  if (!normalized) {
    return {
      intent: null,
      raw,
      normalized,
      error: "Empty speech. Try again.",
    };
  }

  let intent = detectIntent(normalized);
  const ctx = options?.pageContext;

  // On a work page, prefer that domain unless it's clearly navigation away
  const clearlyNavigatingAway =
    /\b(go to|goto|take me to|open|show)\b/.test(normalized) &&
    /\b(expense|salary|produc|supplier|salesman|party|inventory|dashboard|report)\b/.test(
      normalized
    ) &&
    !(ctx === "builty" && /\bbuilty\b/.test(normalized));

  if (!intent && ctx === "produce" && !clearlyNavigatingAway) {
    if (
      looksLikeProductSpeech(normalized) ||
      /\d/.test(normalized) ||
      /\b(add|make|set|date|qty|quantity|today|tomorrow|yesterday)\b/.test(normalized)
    ) {
      intent = "produce";
    }
  }

  if (!intent && ctx === "builty" && !clearlyNavigatingAway) {
    if (
      /\b(open|show|go to|goto|go)\b/.test(normalized) &&
      /\bbuilty\b/.test(normalized) &&
      /\b(of|for|from|number|no\.?|num|#)\b/.test(normalized)
    ) {
      intent = "navigate";
    } else if (
      looksLikeProductSpeech(normalized) ||
      interpretPricing(normalized) ||
      isPricingOnlyUtterance(normalized) ||
      /\b(create|add|make|new|customer|party|rate|price|fixed|qty|quantity|pcs|product|builty|date|dated|set|number|today|tomorrow|yesterday)\b/.test(
        normalized
      ) ||
      /\d/.test(normalized)
    ) {
      intent = "builty";
    }
  }

  if (!intent && ctx === "expense") {
    if (/\d/.test(normalized) || detectCategory(normalized)) intent = "expense";
  }

  if (!intent && ctx === "salary") {
    // "add 10000 to Abbas" / "add payment …" → pay, not new worker
    if (
      /\d/.test(normalized) &&
      (/\b(pay|to|for)\b/.test(normalized) || /\b(add|give|send)\b/.test(normalized))
    ) {
      intent = "salary_pay";
    } else if (/\b(add|create|new)\b/.test(normalized) && !/\b\d+\b/.test(normalized)) {
      intent = "add_worker";
    } else if (/\d/.test(normalized) || /\bpay\b/.test(normalized)) {
      intent = "salary_pay";
    } else if (/[a-z\u0600-\u06ff]{2,}/.test(normalized)) {
      intent = "add_worker";
    }
  }

  if (!intent && ctx === "supplier") {
    if (/\b(buy|purchase|kharid|scrap|daig|kg)\b/.test(normalized)) {
      intent = "purchase";
    } else if (/\b(pay|payment|paid)\b/.test(normalized)) {
      intent = "supplier_payment";
    } else if (/[a-z\u0600-\u06ff]{2,}/.test(normalized)) {
      intent = "add_supplier";
    }
  }

  if (!intent && ctx === "salesman") {
    if (/[a-z\u0600-\u06ff]{2,}/.test(normalized)) intent = "add_salesman";
  }

  // Global soft fallback: product+pricing speech → builty when not produce
  if (!intent && looksLikeProductSpeech(normalized) && interpretPricing(normalized)) {
    intent = "builty";
  }
  if (!intent && isPricingOnlyUtterance(normalized)) {
    intent = ctx === "produce" ? "produce" : "builty";
  }

  if (!intent) {
    return {
      intent: null,
      raw,
      normalized,
      error: ctx
        ? `Could not understand on this page. Try a ${ctx} command, or go to another section.`
        : "Could not understand. Try go to expenses / salaries / produce / builty / suppliers, then add there.",
    };
  }

  const forParse =
    intent === "produce" || intent === "builty"
      ? expandMergedSizeNumbers(normalized)
      : normalized;

  switch (intent) {
    case "navigate":
      return { ...parseNavigate(normalized), raw };
    case "expense": {
      const parsed = parseExpense(normalized);
      const pathCategory = expenseCategoryFromPath(options?.pathname || null);
      if (pathCategory && (!parsed.category || parsed.category === "other")) {
        return { ...parsed, category: pathCategory, raw };
      }
      return { ...parsed, raw };
    }
    case "purchase":
      return { ...parsePurchase(normalized), raw };
    case "builty":
      return { ...parseBuilty(forParse), raw };
    case "customer_payment":
      return { ...parseCustomerPayment(normalized), raw };
    case "supplier_payment":
      return { ...parseSupplierPayment(normalized), raw };
    case "produce":
      return { ...parseProduce(forParse), raw };
    case "add_supplier":
      return { ...parseAddPerson(normalized, "add_supplier"), raw };
    case "add_salesman":
      return { ...parseAddPerson(normalized, "add_salesman"), raw };
    case "add_worker":
      return { ...parseAddPerson(normalized, "add_worker"), raw };
    case "salary_pay":
      return { ...parseSalaryPay(normalized), raw };
    default:
      return { intent: null, raw, normalized, error: "Unsupported command." };
  }
}

export const VOICE_EXAMPLES = [
  "open production",
  "go sales",
  "open builty number 12",
  "open builty of Ali",
  "go to inventory",
  "open record of Ali",
  "add electricity expense five thousand",
  "petrol 2000 add kro",
  "buy scrap 500 kg from Ali at 80 per kg",
  "builty for customer Hassan product hub 4 quantity 10 rate 120",
  "create builty of Asif waziristan of China 44 kg 6 grams @ 250 per kg",
  "create builty of Ali of China 44 kg 6 @ 250 and hub 4 quantity 10 rate 120",
  "customer Ali paid 5000",
  "pay supplier Raza 10000",
  "produce hub 4 quantity 50",
  "produce four drums of China 44 kg",
  "produce two drum of China 44 kg and two drum of China 48 kg",
  "produce four drums of Nissan TK 20 slash 50 kg",
];
