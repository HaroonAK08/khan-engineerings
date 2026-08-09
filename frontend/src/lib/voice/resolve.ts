import { listCustomers, listBuilties } from "@/lib/sales-api";
import { listSuppliers } from "@/lib/materials-api";
import { listProducts } from "@/lib/production-api";
import { todayInput } from "@/lib/date-range";
import { isAlwaysCommonExpenseCategory } from "@/hooks/use-persisted-expense-scope";
import { matchVoiceRoute } from "@/lib/voice/navigate";
import type { ParsedVoiceCommand } from "@/lib/voice/types";
import type { EntityMatch, ResolvedVoiceDraft } from "@/lib/voice/types";

const HONORIFICS = new Set([
  "haji",
  "hajji",
  "mr",
  "mrs",
  "ms",
  "miss",
  "sir",
  "madam",
  "malik",
  "ch",
  "chaudhry",
  "chaudhary",
  "sheikh",
  "shaykh",
  "syed",
  "sayed",
  "mian",
  "bhai",
  "ji",
  "janab",
]);

function stripHonorifics(tokens: string[]) {
  return tokens.filter((t) => !HONORIFICS.has(t));
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/(\d)\s*kg\b/g, "$1kg")
    .replace(/(\d)\s*mm\b/g, "$1mm")
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function tokensSimilar(a: string, b: string) {
  if (a === b) return true;
  if (a.length >= 2 && b.length >= 2 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (a.length >= 3 && b.includes(a)) return true;
  if (b.length >= 3 && a.includes(b)) return true;
  // "44" ~ "44kg", "china" ~ "china44kg" chunks
  if (/\d/.test(a) || /\d/.test(b)) {
    const aNum = a.replace(/[^\d.]/g, "");
    const bNum = b.replace(/[^\d.]/g, "");
    if (aNum && bNum && aNum === bNum) return true;
  }
  const maxLen = Math.max(a.length, b.length);
  if (maxLen >= 4) {
    const dist = levenshtein(a, b);
    const allowed =
      maxLen <= 5 ? 1 : maxLen <= 8 ? 2 : maxLen <= 12 ? 3 : 4;
    if (dist <= allowed) return true;
  }
  return false;
}

function scoreName(query: string, candidate: string) {
  const qRaw = normalizeName(query);
  const cRaw = normalizeName(candidate);
  if (!qRaw || !cRaw) return 0;
  if (cRaw === qRaw) return 100;
  if (cRaw.includes(qRaw) || qRaw.includes(cRaw)) return 92;

  const qAll = qRaw.split(/\s+/).filter(Boolean);
  const cAll = cRaw.split(/\s+/).filter(Boolean);
  const qTokens = stripHonorifics(qAll);
  const cTokens = stripHonorifics(cAll);
  const qUse = qTokens.length ? qTokens : qAll;
  const cUse = cTokens.length ? cTokens : cAll;

  if (!qUse.length || !cUse.length) return 0;

  let hits = 0;
  const used = new Set<number>();
  for (const qt of qUse) {
    let bestIdx = -1;
    for (let i = 0; i < cUse.length; i++) {
      if (used.has(i)) continue;
      if (tokensSimilar(qt, cUse[i])) {
        bestIdx = i;
        break;
      }
    }
    if (bestIdx >= 0) {
      used.add(bestIdx);
      hits += 1;
    }
  }

  if (hits === 0) return 0;

  const coverageQ = hits / qUse.length;
  const coverageC = hits / cUse.length;
  const coverage = Math.max(coverageQ, coverageC * 0.9);

  let score = Math.round(coverage * 88);
  if (coverageQ >= 0.66 && hits >= 2) score = Math.max(score, 82);
  if (coverageQ === 1) score = Math.max(score, 90);
  if (hits === 1 && qUse.length === 1 && cUse.some((t) => tokensSimilar(qUse[0], t))) {
    score = Math.max(score, 70);
  }
  // First name exact + surname close (Asif waziristan ~ Asif warizistan)
  if (
    qUse.length >= 2 &&
    cUse.length >= 1 &&
    tokensSimilar(qUse[0], cUse[0]) &&
    (qUse[0] === cUse[0] || levenshtein(qUse[0], cUse[0]) <= 1)
  ) {
    score = Math.max(score, hits >= 2 ? 88 : 72);
  }

  return Math.min(100, score);
}

function toMatches(
  rows: Array<{ id: string; label: string; searchText?: string }>,
  query: string,
  limit = 8
): EntityMatch[] {
  return rows
    .map((row) => ({
      id: row.id,
      label: row.label,
      score: Math.max(
        scoreName(query, row.label),
        row.searchText ? scoreName(query, row.searchText) : 0
      ),
    }))
    .filter((m) => m.score >= 55)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function suggestBuiltyNo(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `B-${y}${m}${d}-${hh}${mm}`;
}

async function resolveSuppliers(query: string) {
  const all = await listSuppliers({ active: "true" });
  const rows = all.map((s) => ({
    id: s._id,
    label: s.nameUr ? `${s.name} (${s.nameUr})` : s.name,
    searchText: [s.name, s.nameUr].filter(Boolean).join(" "),
  }));
  return toMatches(rows, query);
}

async function resolveCustomers(query: string) {
  const all = await listCustomers({ active: "true" });
  const rows = all.map((c) => ({
    id: c._id,
    label: c.name,
    searchText: c.name,
  }));
  return toMatches(rows, query);
}

async function resolveProducts(query: string) {
  const all = await listProducts({ active: "true" });
  const variants = [
    query,
    query.replace(/\s*kg\b/gi, "kg"),
    query.replace(/\s*kg\b/gi, " kg"),
    query.replace(/\bkg\b/gi, "").replace(/\s+/g, " ").trim(),
    query.replace(/\s*\/\s*/g, " "),
    query.replace(/\s*-\s*/g, " "),
    query.replace(/\s*\/\s*/g, "/"),
    query.replace(/\s*-\s*/g, "-"),
    query.replace(/\b(\d{2})(\d{2})\s*kg\b/gi, "$1 $2 kg"),
    query.replace(/\b(\d{2})(\d{2})\s*kg\b/gi, "$1/$2 kg"),
    query.replace(/\b(\d{2})(\d{2})\s*kg\b/gi, "$1-$2 kg"),
  ].filter(Boolean);

  const rows = all.map((p) => ({
    id: p._id,
    label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
    searchText: [p.name, p.sku, p.name?.replace(/\s+/g, ""), `${p.name} ${p.family || ""}`]
      .filter(Boolean)
      .join(" "),
  }));

  const scored = new Map<string, EntityMatch>();
  for (const variant of variants) {
    for (const match of toMatches(rows, variant, 12)) {
      const prev = scored.get(match.id);
      if (!prev || match.score > prev.score) scored.set(match.id, match);
    }
  }

  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, 8);
}

function pickBest(matches: EntityMatch[]) {
  if (!matches.length) return undefined;
  const top = matches[0];
  const second = matches[1];
  // Strong enough alone, or clearly ahead of runner-up
  if (top.score >= 70 && (!second || top.score - second.score >= 8 || top.score >= 85)) {
    return top.id;
  }
  return top.id;
}

export async function resolveVoiceCommand(
  parsed: ParsedVoiceCommand
): Promise<ResolvedVoiceDraft | { error: string; transcript: string }> {
  if (!parsed.intent) {
    return {
      error: parsed.error || "Could not understand the command.",
      transcript: parsed.raw,
    };
  }

  if (parsed.error) {
    return { error: parsed.error, transcript: parsed.raw };
  }

  if (parsed.intent === "navigate") {
    return resolveNavigate(parsed);
  }

  const today = todayInput();
  const draft: ResolvedVoiceDraft = {
    intent: parsed.intent,
    transcript: parsed.raw,
    amount: parsed.amount,
    quantity: parsed.quantity,
    rate: parsed.rate,
    category: parsed.category,
    title: parsed.title,
    materialType: parsed.materialType,
    notes: parsed.notes,
    supplierMatches: [],
    customerMatches: [],
    productMatches: [],
    expenseDate: today,
    purchaseDate: today,
    builtyDate: today,
    paymentDate: today,
    productionDate: today,
    scope: isAlwaysCommonExpenseCategory(parsed.category) ? "common" : "common",
    pricingMode: parsed.rate != null ? "rate_kg" : parsed.amount != null ? "fixed" : "rate_kg",
  };

  if (parsed.supplierQuery) {
    draft.supplierMatches = await resolveSuppliers(parsed.supplierQuery);
    draft.selectedSupplierId = pickBest(draft.supplierMatches);
  }

  if (parsed.customerQuery) {
    draft.customerMatches = await resolveCustomers(parsed.customerQuery);
    draft.selectedCustomerId = pickBest(draft.customerMatches);
  }

  if (parsed.productQuery) {
    draft.productMatches = await resolveProducts(parsed.productQuery);
    draft.selectedProductId = pickBest(draft.productMatches);
  }

  if (parsed.intent === "builty") {
    draft.builtyNo = parsed.builtyNo?.trim() || suggestBuiltyNo();
    draft.amountPaid = 0;
    if (parsed.spokenDate) draft.builtyDate = parsed.spokenDate;
  }

  if (parsed.intent === "produce") {
    draft.wastePercent = 6;
    draft.materialType = parsed.materialType;
  }

  if (
    (parsed.intent === "purchase" || parsed.intent === "supplier_payment") &&
    draft.supplierMatches.length === 0
  ) {
    return {
      error: `No supplier matched "${parsed.supplierQuery || ""}". Try editing the name, then Add again.`,
      transcript: parsed.raw,
    };
  }

  if (
    (parsed.intent === "builty" || parsed.intent === "customer_payment") &&
    draft.customerMatches.length === 0
  ) {
    return {
      error: `No customer matched "${parsed.customerQuery || ""}". Try editing the name, then Add again.`,
      transcript: parsed.raw,
    };
  }

  if (
    (parsed.intent === "builty" || parsed.intent === "produce") &&
    draft.productMatches.length === 0
  ) {
    return {
      error: `No product matched "${parsed.productQuery || ""}". Try editing the name, then Add again.`,
      transcript: parsed.raw,
    };
  }

  return draft;
}

async function resolveNavigate(
  parsed: ParsedVoiceCommand
): Promise<ResolvedVoiceDraft | { error: string; transcript: string }> {
  const text = parsed.normalized || parsed.raw.toLowerCase();
  const nameQuery = (parsed.navigateQuery || "").trim();
  const builtyQuery = (parsed.builtyQuery || "").trim();
  const wantCustomer = Boolean(parsed.customerQuery) || /\b(customer|party)\b/.test(text);
  const wantSupplier = Boolean(parsed.supplierQuery) || /\b(supplier|vendor)\b/.test(text);
  const wantBuilty =
    parsed.navigateKind === "builty" ||
    Boolean(builtyQuery) ||
    (/\b(builty|bilt[iy]?|invoice)\b/.test(text) &&
      Boolean(nameQuery || builtyQuery || /\b(number|no\.?|num|#|of|for|from)\b/.test(text)));

  if (wantBuilty && (builtyQuery || nameQuery)) {
    return resolveBuiltyNavigate(parsed, builtyQuery || nameQuery);
  }

  if (nameQuery) {
    const options: EntityMatch[] = [];

    if (!wantSupplier || wantCustomer) {
      const customers = await resolveCustomers(nameQuery);
      for (const row of customers) {
        options.push({
          ...row,
          label: `Party · ${row.label}`,
          href: `/dashboard/party/customers/${row.id}`,
        });
      }
    }

    if (!wantCustomer || wantSupplier) {
      const suppliers = await resolveSuppliers(nameQuery);
      for (const row of suppliers) {
        options.push({
          ...row,
          label: `Supplier · ${row.label}`,
          href: `/dashboard/suppliers/${row.id}`,
        });
      }
    }

    options.sort((a, b) => b.score - a.score);

    if (!options.length) {
      return {
        error: `No record matched "${nameQuery}". Try another name.`,
        transcript: parsed.raw,
      };
    }

    const top = options[0];
    return {
      intent: "navigate",
      transcript: parsed.raw,
      supplierMatches: [],
      customerMatches: [],
      productMatches: [],
      navigateOptions: options,
      navigateHref: top.href,
      navigateLabel: top.label,
    };
  }

  const route = matchVoiceRoute(text);
  if (!route) {
    return {
      error:
        "Could not find that page. Try “open production”, “open builty number 12”, or “open builty of Ali”.",
      transcript: parsed.raw,
    };
  }

  return {
    intent: "navigate",
    transcript: parsed.raw,
    supplierMatches: [],
    customerMatches: [],
    productMatches: [],
    navigateHref: route.href,
    navigateLabel: route.label,
    navigateOptions: [{ id: route.href, label: route.label, score: 100, href: route.href }],
  };
}

function customerNameFromBuilty(customer: unknown) {
  if (!customer) return "";
  if (typeof customer === "string") return customer;
  if (typeof customer === "object" && customer && "name" in customer) {
    return String((customer as { name?: string }).name || "");
  }
  return "";
}

async function resolveBuiltyNavigate(
  parsed: ParsedVoiceCommand,
  query: string
): Promise<ResolvedVoiceDraft | { error: string; transcript: string }> {
  const q = query.trim();
  const looksLikeNumber = /[0-9]/.test(q) || /^[a-z]-/i.test(q);

  const options: EntityMatch[] = [];

  if (looksLikeNumber) {
    const byNo = await listBuilties({ q });
    for (const row of byNo.slice(0, 10)) {
      const party = customerNameFromBuilty(row.customer);
      options.push({
        id: row._id,
        label: `Builty ${row.builtyNo}${party ? ` · ${party}` : ""}`,
        score: scoreName(q, row.builtyNo) || scoreName(q, row.billNo || "") || 70,
        href: `/dashboard/builty/${row._id}`,
      });
    }
  }

  // Also try matching by customer name on recent/all filtered builties
  const customers = await resolveCustomers(q);
  for (const customer of customers.slice(0, 5)) {
    const rows = await listBuilties({ customer: customer.id });
    for (const row of rows.slice(0, 8)) {
      const party = customerNameFromBuilty(row.customer) || customer.label;
      options.push({
        id: row._id,
        label: `Builty ${row.builtyNo} · ${party}`,
        score: Math.max(customer.score, 60),
        href: `/dashboard/builty/${row._id}`,
      });
    }
  }

  // Fallback: scan recent builties by customer name fuzzy (when q is a name)
  if (!looksLikeNumber && options.length === 0) {
    const recent = await listBuilties({});
    for (const row of recent.slice(0, 80)) {
      const party = customerNameFromBuilty(row.customer);
      const score = scoreName(q, party);
      if (score >= 55) {
        options.push({
          id: row._id,
          label: `Builty ${row.builtyNo} · ${party}`,
          score,
          href: `/dashboard/builty/${row._id}`,
        });
      }
    }
  }

  // Dedupe by builty id, keep best score
  const byId = new Map<string, EntityMatch>();
  for (const row of options) {
    const prev = byId.get(row.id);
    if (!prev || row.score > prev.score) byId.set(row.id, row);
  }
  const unique = Array.from(byId.values()).sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label)
  );

  if (!unique.length) {
    return {
      error: `No builty matched "${q}". Try the builty number or customer name.`,
      transcript: parsed.raw,
    };
  }

  const top = unique[0];
  return {
    intent: "navigate",
    transcript: parsed.raw,
    supplierMatches: [],
    customerMatches: [],
    productMatches: [],
    navigateOptions: unique.slice(0, 12),
    navigateHref: top.href,
    navigateLabel: top.label,
  };
}
