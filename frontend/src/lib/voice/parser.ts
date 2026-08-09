import type { ParsedVoiceCommand, VoiceIntent } from "@/lib/voice/types";

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
  return text
    .toLowerCase()
    .replace(/@/g, " at ")
    // Spoken separators so "tk 20 slash 50 kg" keeps a clear gap
    .replace(/\b(slash|slashes|forward slash)\b/g, " / ")
    .replace(/\b(dash|hyphen|minus)\b/g, " - ")
    .replace(/\bthen\b/g, " ")
    .replace(/[₹$]/g, " ")
    .replace(/\brs\.?\b/g, " rupees ")
    .replace(/\brupee\b/g, " rupees ")
    .replace(/[^\p{L}\p{N}\s./-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      /\b(?:open|go to|goto|go|show|kholo|dikhao)\s+(?:builty|bilt[iy]?)\s+([a-z\u0600-\u06ff][a-z\u0600-\u06ff\s.'-]{1,40})$/i
    );

  if (builtyPersonMatch?.[1]) {
    const person = builtyPersonMatch[1]
      .replace(/\b(number|no|num|record|page|please|the|list|history)\b/gi, "")
      .trim();
    if (
      person &&
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
  if (isNavigateCommand(text)) {
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
    /\b(produc(?:e|ed|ing|tion)|banaya|banao|cast|furnace batch)\b/.test(text)
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
  `\\b(?:on|dated|date)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})\\b`,
  "i"
);
const SPOKEN_DATE_ISO =
  /\b(?:on|dated|date)\s+(\d{4})-(\d{1,2})-(\d{1,2})\b/i;
const SPOKEN_DATE_DMY =
  /\b(?:on|dated|date)\s+(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/i;

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
  const named = text.match(SPOKEN_DATE_NAMED);
  if (named) {
    const day = Number(named[1]);
    const month = months[named[2].toLowerCase()];
    if (month && day >= 1 && day <= 31) {
      const year = new Date().getFullYear();
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

function stripSpokenDate(text: string) {
  return text
    .replace(SPOKEN_DATE_NAMED, " ")
    .replace(SPOKEN_DATE_ISO, " ")
    .replace(SPOKEN_DATE_DMY, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBuilty(text: string): ParsedVoiceCommand {
  const builtyNo =
    text.match(
      /\b(?:builty\s+)?(?:number|no\.?|num|#)\s*(?:is|=|:)?\s*([a-z0-9][a-z0-9\-_/]*)/i
    )?.[1] || undefined;

  const rate =
    extractNumberNear(text, [
      /\b(?:@|at|rate)\s+(\d+(?:\.\d+)?)\s*(?:per\s*kg|\/\s*kg|rs)?/i,
      /\b(\d+(?:\.\d+)?)\s*(?:per\s*kg|\/\s*kg)\b/i,
    ]) ?? undefined;

  const amount =
    extractNumberNear(text, [
      /\b(?:fixed|amount|total)\s+(\d+(?:\.\d+)?)\b/i,
    ]) ?? undefined;

  const spokenDate = parseSpokenDate(text);

  let customerQuery: string | undefined;
  let productQuery: string | undefined;
  let quantity: number | undefined;

  // create builty of Asif waziristan of China 44 kg 6 grams @ 250 ...
  const nestedOf = text.match(
    /\b(?:create|add|make|new)?\s*(?:builty|bilt[iy]?|invoice)\s+(?:of|for)\s+(.+?)\s+of\s+(.+)$/i
  );
  if (nestedOf) {
    customerQuery = nestedOf[1]
      .replace(/\b(customer|party|please)\b/gi, "")
      .trim();
    let rest = stripSpokenDate(
      nestedOf[2].replace(
        /\b(?:builty\s+)?(?:number|no\.?|num|#)\s*(?:is|=|:)?\s*[a-z0-9\-_/]+/gi,
        " "
      )
    );

    // China 44 kg 6 grams @ 250  OR  China 44 kg quantity 6 @ 250
    const withSizeAndQty = rest.match(
      /^(.+?\d+\s*kg)\s+(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:grams?|gram|pcs|pieces?|drums?|hubs?|qty|quantity)?\b/i
    );
    const qtyThenProduct = rest.match(
      /^(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:grams?|gram|pcs|pieces?|drums?|hubs?)?\s+(?:of\s+)?(.+?)(?=\s+(?:@|at|rate)\b|$)/i
    );
    const productThenQty = rest.match(
      /^(.+?)\s+(?:qty|quantity|pcs|pieces?)\s+(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\b/i
    );

    if (withSizeAndQty) {
      productQuery = withSizeAndQty[1].trim();
      quantity =
        wordsToNumber([withSizeAndQty[2].toLowerCase()]) ??
        Number(withSizeAndQty[2]);
    } else if (productThenQty) {
      productQuery = productThenQty[1]
        .replace(/\b(?:@|at|rate)\s+\d+(?:\.\d+)?.*$/i, "")
        .trim();
      quantity =
        wordsToNumber([productThenQty[2].toLowerCase()]) ??
        Number(productThenQty[2]);
    } else if (qtyThenProduct) {
      quantity =
        wordsToNumber([qtyThenProduct[1].toLowerCase()]) ??
        Number(qtyThenProduct[1]);
      productQuery = qtyThenProduct[2]
        .replace(/\b(?:@|at|rate)\s+\d+(?:\.\d+)?.*$/i, "")
        .replace(/\b\d+\s*per\s*kg\b/gi, "")
        .trim();
    } else {
      productQuery = rest
        .replace(/\b(?:@|at|rate)\s+\d+(?:\.\d+)?.*$/i, "")
        .replace(/\b\d+\s*per\s*kg\b/gi, "")
        .replace(/\b(?:grams?|gram|pcs|pieces?)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      const looseQty = rest.match(
        /\b(\d+(?:\.\d+)?)\s*(?:grams?|gram|pcs|pieces?|drums?|hubs?)\b/i
      );
      if (looseQty) {
        quantity = Number(looseQty[1]);
        productQuery = productQuery
          .replace(looseQty[0], " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
  }

  if (!customerQuery) {
    customerQuery =
      captureAfter(
        text,
        ["customer", "party", "for customer", "for party", "builty of", "builty for", "to"],
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
        ]
      ) || undefined;
  }

  if (!productQuery) {
    productQuery =
      captureAfter(
        text,
        ["product", "item"],
        ["qty", "quantity", "rate", "amount", "pcs", "piece", "at", "for", "customer", "@"]
      ) || undefined;
  }

  if (quantity == null) {
    quantity =
      extractNumberNear(text, [
        /\b(?:qty|quantity|pcs|pieces?)\s+(\d+(?:\.\d+)?)\b/i,
        /\b(\d+(?:\.\d+)?)\s*(?:pcs|pieces?|grams?|gram|drums?|hubs?)\b/i,
      ]) ?? undefined;
  }

  if (quantity != null) quantity = Math.round(Number(quantity));
  if (quantity != null && !Number.isFinite(quantity)) quantity = undefined;

  let error: string | undefined;
  if (!customerQuery) error = "Could not find customer name.";
  else if (!productQuery) error = "Could not find product name.";
  else if (quantity == null || quantity <= 0) error = "Could not find quantity.";
  else if (rate == null && amount == null) error = "Could not find rate or fixed amount.";

  return {
    intent: "builty",
    raw: text,
    normalized: text,
    customerQuery,
    productQuery,
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

function parseProduce(text: string): ParsedVoiceCommand {
  // "produce four drums of China 44 kg" → qty 4, product "china 44 kg"
  // "produce hub 4 quantity 50" → qty 50, product "hub 4"
  // "produce four drums of China 44 kg on 6 August" → also sets spokenDate
  const spokenDate = parseSpokenDate(text);
  const materialType: "scrap" | "daig" | undefined = /\bdrums?\b/.test(text)
    ? "daig"
    : /\bhubs?\b/.test(text)
      ? "scrap"
      : undefined;

  let rest = stripSpokenDate(
    text
      .replace(
        /\b(produced|producing|produce|production|make|made|banaya|banao|cast)\b/gi,
        " "
      )
      .replace(/\b(please|add|kro|karo|kar do)\b/gi, " ")
  );

  const numberToken =
    "\\d+(?:\\.\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety";

  let quantity: number | undefined;
  let productQuery: string | undefined;

  // 1) "four drums of China 44 kg" / "4 hub of X"
  const familyOf = rest.match(
    new RegExp(
      `^(${numberToken})\\s+(drums?|hubs?)\\s+(?:of\\s+)?(.+)$`,
      "i"
    )
  );
  if (familyOf) {
    quantity = wordsToNumber([familyOf[1].toLowerCase()]) ?? Number(familyOf[1]);
    productQuery = familyOf[3].trim();
  }

  // 2) "4 pcs of China 44 kg" / "four of China 44 kg"
  if (quantity == null) {
    const pcsOf = rest.match(
      new RegExp(
        `^(${numberToken})\\s+(?:pcs|pieces?)?\\s*(?:of\\s+)(.+)$`,
        "i"
      )
    );
    if (pcsOf) {
      quantity = wordsToNumber([pcsOf[1].toLowerCase()]) ?? Number(pcsOf[1]);
      productQuery = pcsOf[2].trim();
    }
  }

  // 3) Explicit "quantity 50" / "qty 50"
  if (quantity == null) {
    const explicitQty = rest.match(
      new RegExp(`\\b(?:qty|quantity)\\s+(${numberToken})\\b`, "i")
    );
    if (explicitQty) {
      quantity =
        wordsToNumber([explicitQty[1].toLowerCase()]) ?? Number(explicitQty[1]);
      productQuery = rest
        .replace(explicitQty[0], " ")
        .replace(/\b(drums?|hubs?|pcs|pieces?|to|of|for|product|item)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  // 4) "50 pcs" / "50 pieces" as quantity (not "44 kg" in a product name)
  if (quantity == null) {
    const pcsQty = rest.match(
      new RegExp(`\\b(${numberToken})\\s+(?:pcs|pieces?)\\b`, "i")
    );
    if (pcsQty) {
      quantity = wordsToNumber([pcsQty[1].toLowerCase()]) ?? Number(pcsQty[1]);
      productQuery = rest
        .replace(pcsQty[0], " ")
        .replace(/\b(drums?|hubs?|to|of|for|product|item)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  // 5) Leading word/digit quantity then product: "four China 44 kg"
  if (quantity == null) {
    const leading = rest.match(new RegExp(`^(${numberToken})\\s+(.+)$`, "i"));
    if (leading) {
      const maybeQty =
        wordsToNumber([leading[1].toLowerCase()]) ?? Number(leading[1]);
      const after = leading[2].trim();
      // Prefer this when remainder looks like a named product (has letters)
      if (
        maybeQty > 0 &&
        /[a-z\u0600-\u06ff]/i.test(after) &&
        !/^(?:kg|kilo)/i.test(after)
      ) {
        quantity = maybeQty;
        productQuery = after
          .replace(/^\b(?:drums?|hubs?|pcs|pieces?|of|to)\b\s*/i, "")
          .replace(/\b(drums?|hubs?)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
  }

  // 6) Fallback: last standalone number that is NOT glued to kg in a product-like phrase
  if (quantity == null) {
    const nums = [...rest.matchAll(/\b(\d+(?:\.\d+)?)\b/g)];
    if (nums.length) {
      // Prefer a number not immediately before kg (those are often product size names)
      let chosen = nums[nums.length - 1];
      for (let i = nums.length - 1; i >= 0; i--) {
        const n = nums[i];
        const after = rest.slice((n.index || 0) + n[0].length, (n.index || 0) + n[0].length + 4);
        if (!/^\s*kg\b/i.test(after)) {
          chosen = n;
          break;
        }
      }
      const idx = chosen.index || 0;
      const afterChosen = rest.slice(idx + chosen[0].length, idx + chosen[0].length + 4);
      if (!/^\s*kg\b/i.test(afterChosen) || nums.length === 1) {
        quantity = Math.round(Number(chosen[1]));
        productQuery = `${rest.slice(0, idx)} ${rest.slice(idx + chosen[0].length)}`
          .replace(/\b(drums?|hubs?|pcs|pieces?|to|of|for|product|item|qty|quantity)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
      } else {
        // All numbers look like "44 kg" size labels — no clear qty
        productQuery = rest
          .replace(/\b(drums?|hubs?|to|of|for|product|item)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
  }

  if (!productQuery) {
    productQuery = rest
      .replace(/\b(drums?|hubs?|pcs|pieces?|to|of|for|product|item|qty|quantity)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim() || undefined;
  }

  // Clean product: keep "china 44 kg" intact; drop leftover family words only if not the whole name
  if (productQuery) {
    productQuery = productQuery
      .replace(/\b(drums?|hubs?)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (quantity != null && !Number.isFinite(quantity)) quantity = undefined;
  if (quantity != null) quantity = Math.round(quantity);

  let error: string | undefined;
  if (!productQuery) error = "Could not find product name.";
  else if (quantity == null || quantity <= 0) error = "Could not find quantity.";

  return {
    intent: "produce",
    raw: text,
    normalized: text,
    productQuery,
    quantity,
    materialType,
    spokenDate,
    error,
  };
}

export function parseVoiceCommand(raw: string): ParsedVoiceCommand {
  const normalized = normalize(raw);
  if (!normalized) {
    return {
      intent: null,
      raw,
      normalized,
      error: "Empty speech. Try again.",
    };
  }

  const intent = detectIntent(normalized);
  if (!intent) {
    return {
      intent: null,
      raw,
      normalized,
      error: "Could not understand. Try produce, purchase, builty, payment, expense, or open/go commands.",
    };
  }

  // For produce/builty product phrases, also try un-merging "2050 kg" → "20 50 kg"
  const forParse =
    intent === "produce" || intent === "builty"
      ? expandMergedSizeNumbers(normalized)
      : normalized;

  switch (intent) {
    case "navigate":
      return { ...parseNavigate(normalized), raw };
    case "expense":
      return { ...parseExpense(normalized), raw };
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
  "customer Ali paid 5000",
  "pay supplier Raza 10000",
  "produce hub 4 quantity 50",
  "produce four drums of China 44 kg",
  "produce four drums of Nissan TK 20 slash 50 kg",
];
