import { listCustomers, listBuilties } from "@/lib/sales-api";
import { listSuppliers } from "@/lib/materials-api";
import { listProducts } from "@/lib/production-api";
import { listWorkers } from "@/lib/workers-api";
import { todayInput } from "@/lib/date-range";
import { isAlwaysCommonExpenseCategory } from "@/hooks/use-persisted-expense-scope";
import { matchVoiceRoute } from "@/lib/voice/navigate";
import type { ParsedVoiceCommand } from "@/lib/voice/types";
import type { EntityMatch, ResolvedVoiceDraft } from "@/lib/voice/types";
import { getVoiceModelAliases } from "@/lib/voice/voice-model";

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

/** Common speech-to-text mishears for product / party names in this factory. */
const STT_ALIASES: Array<{ correct: string; hears: string[] }> = [
  { correct: "hino", hears: ["he know", "he knows", "he no", "he now", "heen o", "heeno", "high no", "hi no", "hyno"] },
  { correct: "china", hears: ["chyna", "cheena", "chai na", "chinaa"] },
  { correct: "nissan", hears: ["nissaan", "nison", "ni san", "nissen", "listen", "lesson"] },
  { correct: "moty", hears: ["moti", "morty", "multi", "motie", "mooty", "motive"] },
  { correct: "toyota", hears: ["toy ota", "toyoda", "to yota"] },
  { correct: "isuzu", hears: ["e suzu", "isu zu", "isuzoo"] },
  { correct: "mazda", hears: ["masda", "maz da"] },
  { correct: "mitsubishi", hears: ["mitsu bishi", "mitsubishi"] },
];

function applySttAliases(text: string) {
  let out = ` ${normalizeName(text)} `;
  const dynamic = getVoiceModelAliases();
  const rows = [...STT_ALIASES, ...dynamic];
  for (const row of rows) {
    for (const hear of row.hears) {
      const pattern = hear.replace(/\s+/g, "\\s+");
      out = out.replace(new RegExp(`\\b${pattern}\\b`, "gi"), ` ${row.correct} `);
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

function collapseSpaces(value: string) {
  return value.replace(/\s+/g, "");
}

/** Rough phonetic key: drop vowels except leading, collapse repeats. */
function phoneticKey(value: string) {
  const s = collapseSpaces(normalizeName(value));
  if (!s) return "";
  const body = s
    .replace(/[^a-z0-9\u0600-\u06ff]/g, "")
    // STT often hears v for b in names (avas ↔ abbas)
    .replace(/v/g, "b")
    .replace(/(.)\1+/g, "$1");
  if (body.length <= 1) return body;
  return body[0] + body.slice(1).replace(/[aeiou]/g, "");
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
  if (maxLen >= 3) {
    const dist = levenshtein(a, b);
    const allowed =
      maxLen <= 4 ? 1 : maxLen <= 6 ? 2 : maxLen <= 10 ? 3 : 4;
    if (dist <= allowed) return true;
  }
  const pa = phoneticKey(a);
  const pb = phoneticKey(b);
  if (pa && pb && pa === pb) return true;
  if (pa.length >= 3 && pb.length >= 3) {
    const pDist = levenshtein(pa, pb);
    if (pDist <= (Math.max(pa.length, pb.length) <= 5 ? 1 : 2)) return true;
  }
  return false;
}

/** Score multi-word STT blobs like "he know" against "hino". */
function scoreJoinedTokens(qTokens: string[], cTokens: string[]) {
  if (!qTokens.length || !cTokens.length) return 0;
  let best = 0;
  // Join 2–3 consecutive query tokens and compare to each candidate token
  for (let width = 2; width <= Math.min(3, qTokens.length); width++) {
    for (let i = 0; i <= qTokens.length - width; i++) {
      const joined = qTokens.slice(i, i + width).join("");
      const spaced = qTokens.slice(i, i + width).join(" ");
      for (const ct of cTokens) {
        if (tokensSimilar(joined, ct) || tokensSimilar(collapseSpaces(spaced), ct)) {
          best = Math.max(best, 86);
        }
        const dist = levenshtein(joined, collapseSpaces(ct));
        const maxLen = Math.max(joined.length, collapseSpaces(ct).length);
        if (maxLen >= 4 && dist <= Math.ceil(maxLen * 0.34)) {
          best = Math.max(best, 78);
        }
        if (phoneticKey(joined) && phoneticKey(joined) === phoneticKey(ct)) {
          best = Math.max(best, 84);
        }
      }
    }
  }
  return best;
}

/** Containment score scaled by length ratio so short queries don't crown long names. */
function containmentScore(shorter: string, longer: string) {
  if (!shorter || !longer || !longer.includes(shorter)) return 0;
  const ratio = shorter.length / longer.length;
  if (ratio >= 0.92) return 98;
  if (ratio >= 0.78) return 92;
  if (ratio >= 0.62) return 84;
  if (ratio >= 0.45) return 74;
  // e.g. "nissan moty pl" inside "... + band majha - 43kg"
  return Math.round(52 + ratio * 40);
}

function scoreName(query: string, candidate: string) {
  const qAliased = applySttAliases(query);
  const cRaw = normalizeName(candidate);
  const qRaw = normalizeName(qAliased);
  if (!qRaw || !cRaw) return 0;
  if (cRaw === qRaw) return 100;

  if (cRaw.includes(qRaw)) {
    const contained = containmentScore(qRaw, cRaw);
    if (contained >= 92) return contained;
    // keep going — tighter token scoring may still win for near-exact names
  } else if (qRaw.includes(cRaw)) {
    const contained = containmentScore(cRaw, qRaw);
    if (contained >= 92) return contained;
  }

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

  let score = 0;
  if (hits > 0) {
    const coverageQ = hits / qUse.length;
    const coverageC = hits / cUse.length;
    // Both sides matter: all query tokens in a much longer name is not "exact"
    const coverage = coverageQ * 0.62 + coverageC * 0.38;
    score = Math.round(coverage * 92);

    if (coverageQ >= 0.66 && hits >= 2 && coverageC >= 0.5) {
      score = Math.max(score, 82);
    }
    if (coverageQ === 1) {
      const leftover = cUse.length - hits;
      if (leftover <= 0) score = Math.max(score, 96);
      else if (leftover === 1) score = Math.max(score, 88);
      else if (leftover === 2) score = Math.max(score, 80);
      else score = Math.max(score, Math.round(68 + coverageC * 18));
    }
    if (hits === 1 && qUse.length === 1 && cUse.some((t) => tokensSimilar(qUse[0], t))) {
      score = Math.max(score, coverageC >= 0.5 ? 70 : 58);
    }
    // First name exact + surname close (Asif waziristan ~ Asif warizistan)
    if (
      qUse.length >= 2 &&
      cUse.length >= 1 &&
      tokensSimilar(qUse[0], cUse[0]) &&
      (qUse[0] === cUse[0] || levenshtein(qUse[0], cUse[0]) <= 1)
    ) {
      score = Math.max(score, hits >= 2 && coverageC >= 0.45 ? 88 : 72);
    }
  }

  score = Math.max(score, scoreJoinedTokens(qUse, cUse));

  if (cRaw.includes(qRaw)) score = Math.max(score, containmentScore(qRaw, cRaw));
  else if (qRaw.includes(cRaw)) score = Math.max(score, containmentScore(cRaw, qRaw));

  // Whole-string soft match after collapsing spaces
  const qFlat = collapseSpaces(qRaw);
  const cFlat = collapseSpaces(cRaw);
  if (qFlat && cFlat) {
    if (qFlat === cFlat) score = Math.max(score, 98);
    else if (cFlat.includes(qFlat)) score = Math.max(score, containmentScore(qFlat, cFlat));
    else if (qFlat.includes(cFlat)) score = Math.max(score, containmentScore(cFlat, qFlat));
    else {
      const dist = levenshtein(qFlat, cFlat);
      const maxLen = Math.max(qFlat.length, cFlat.length);
      if (maxLen > 0 && dist / maxLen <= 0.28) score = Math.max(score, 80);
      else if (maxLen > 0 && dist / maxLen <= 0.4) score = Math.max(score, 62);
    }
  }

  const pq = phoneticKey(qRaw);
  const pc = phoneticKey(cRaw);
  if (pq && pc && pq === pc) score = Math.max(score, 82);

  return Math.min(100, score);
}

/** Strip weight/family noise so "Nissan Moty Pl - 43kg" cores to the spoken name. */
function productCoreName(name: string) {
  return normalizeName(name)
    .replace(/\b\d+(?:\.\d+)?\s*kg\b/g, " ")
    .replace(/\b(hubs?|drums?|scrap|daig)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreProductQuery(query: string, productName: string, label: string) {
  const core = productCoreName(productName);
  const qCore = productCoreName(query);
  const nameScore = scoreName(query, productName);
  const labelScore = scoreName(query, label);
  const coreScore = core ? scoreName(qCore || query, core) : 0;

  // Exact / near-exact core name wins over longer compound SKUs
  let score = Math.max(nameScore, labelScore, coreScore);
  if (core && qCore && core === qCore) score = Math.max(score, 100);
  else if (core && qCore && core.startsWith(qCore) && qCore.length / core.length >= 0.75) {
    score = Math.max(score, 94);
  } else if (core && qCore && core.startsWith(qCore)) {
    // "nissan moty pl" vs "nissan moty pl band majha" — prefix but not tight
    score = Math.max(score, containmentScore(qCore, core));
  }

  return Math.min(100, score);
}

function toMatches(
  rows: Array<{ id: string; label: string; searchText?: string }>,
  query: string,
  limit = 8,
  minScore = 42
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
    .filter((m) => m.score >= minScore)
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

async function resolveCustomers(query: string) {
  const all = await listCustomers({ active: "true" });
  const aliased = applySttAliases(query);
  const rows = all.map((c) => ({
    id: c._id,
    label: c.name,
    searchText: c.name,
  }));
  const matches = toMatches(rows, aliased || query, 8, 35);
  if (matches.length) return matches;
  // Closest party name fallback
  let best: EntityMatch | null = null;
  for (const row of rows) {
    const score = scoreName(aliased || query, row.label);
    if (!best || score > best.score) best = { id: row.id, label: row.label, score };
  }
  return best && best.score >= 28 ? [best] : [];
}

async function resolveSuppliers(query: string) {
  const all = await listSuppliers({ active: "true" });
  const aliased = applySttAliases(query);
  const rows = all.map((s) => ({
    id: s._id,
    label: s.nameUr ? `${s.name} (${s.nameUr})` : s.name,
    searchText: [s.name, s.nameUr].filter(Boolean).join(" "),
  }));
  const matches = toMatches(rows, aliased || query, 8, 35);
  if (matches.length) return matches;
  let best: EntityMatch | null = null;
  for (const row of rows) {
    const score = Math.max(
      scoreName(aliased || query, row.label),
      scoreName(aliased || query, row.searchText || "")
    );
    if (!best || score > best.score) best = { id: row.id, label: row.label, score };
  }
  return best && best.score >= 28 ? [best] : [];
}

function materialToFamily(
  material?: "scrap" | "daig"
): "hub" | "drum" | undefined {
  if (material === "scrap") return "hub";
  if (material === "daig") return "drum";
  return undefined;
}

/** Prefer hub/drum catalog family when the spoken phrase says hub(s) or drum(s). */
function detectPreferredFamily(query: string): "hub" | "drum" | undefined {
  const q = normalizeName(query);
  const drumIdx = q.search(/\bdrums?\b/);
  const hubIdx = q.search(/\bhubs?\b/);
  if (drumIdx < 0 && hubIdx < 0) return undefined;
  if (hubIdx < 0) return "drum";
  if (drumIdx < 0) return "hub";
  return hubIdx <= drumIdx ? "hub" : "drum";
}

function stripFamilyWords(query: string) {
  return query
    .replace(/\b(drums?|hubs?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveProducts(
  query: string,
  options?: { preferredMaterial?: "scrap" | "daig" }
) {
  const all = await listProducts({ active: "true" });
  const preferredFamily =
    materialToFamily(options?.preferredMaterial) ||
    detectPreferredFamily(query);
  const familyById = new Map(all.map((p) => [p._id, p.family as "hub" | "drum"]));

  const aliased = applySttAliases(query);
  const nameOnly = stripFamilyWords(aliased || query);
  const variants = [
    query,
    aliased,
    nameOnly,
    applySttAliases(nameOnly),
    query.replace(/\s*kg\b/gi, "kg"),
    query.replace(/\s*kg\b/gi, " kg"),
    query.replace(/\bkg\b/gi, "").replace(/\s+/g, " ").trim(),
    aliased.replace(/\bkg\b/gi, "").replace(/\s+/g, " ").trim(),
    nameOnly.replace(/\bkg\b/gi, "").replace(/\s+/g, " ").trim(),
    query.replace(/\s*\/\s*/g, " "),
    query.replace(/\s*-\s*/g, " "),
    query.replace(/\s*\/\s*/g, "/"),
    query.replace(/\s*-\s*/g, "-"),
    query.replace(/\b(\d{2})(\d{2})\s*kg\b/gi, "$1 $2 kg"),
    query.replace(/\b(\d{2})(\d{2})\s*kg\b/gi, "$1/$2 kg"),
    query.replace(/\b(\d{2})(\d{2})\s*kg\b/gi, "$1-$2 kg"),
    aliased.replace(/\b(of|the|a|an|please)\b/gi, " ").replace(/\s+/g, " ").trim(),
    nameOnly.replace(/\b(of|the|a|an|please)\b/gi, " ").replace(/\s+/g, " ").trim(),
  ].filter(Boolean);

  const rows = all.map((p) => ({
    id: p._id,
    name: p.name || "",
    label: `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
    family: p.family as "hub" | "drum",
    searchText: [
      p.name,
      p.sku,
      p.name?.replace(/\s+/g, ""),
      `${p.name} ${p.family || ""}`,
      p.family === "hub" ? `hub ${p.name}` : `drum ${p.name}`,
      p.family === "hub" ? `hubs ${p.name}` : `drums ${p.name}`,
      applySttAliases(p.name || ""),
      stripFamilyWords(p.name || ""),
      productCoreName(p.name || ""),
    ]
      .filter(Boolean)
      .join(" "),
  }));

  const scoreProductRow = (q: string, row: (typeof rows)[number]) => {
    // Prefer real product name tightness; searchText only as a weak assist
    const primary = scoreProductQuery(q, row.name, row.label);
    const assist = row.searchText
      ? Math.min(scoreName(q, row.searchText), primary + 3)
      : 0;
    return Math.max(primary, assist);
  };

  const scorePool = (pool: typeof rows) => {
    const scored = new Map<string, EntityMatch>();
    for (const variant of variants) {
      const matches = pool
        .map((row) => ({
          id: row.id,
          label: row.label,
          score: scoreProductRow(variant, row),
        }))
        .filter((m) => m.score >= 35)
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.label.length - b.label.length ||
            a.label.localeCompare(b.label)
        )
        .slice(0, 16);
      for (const match of matches) {
        const prev = scored.get(match.id);
        if (!prev || match.score > prev.score) scored.set(match.id, match);
      }
    }
    if (!scored.size && pool.length) {
      let best: EntityMatch | null = null;
      const focus = nameOnly || aliased || query;
      for (const row of pool) {
        const score = Math.max(
          scoreProductRow(focus, row),
          scoreProductRow(aliased || query, row)
        );
        if (!best || score > best.score) {
          best = { id: row.id, label: row.label, score };
        }
      }
      if (best && best.score >= 28) scored.set(best.id, best);
    }
    return scored;
  };

  // When speaker said hub/drum, match that family first so "hub Bedford"
  // never loses to a drum product with the same base name.
  let scored = new Map<string, EntityMatch>();
  if (preferredFamily) {
    const preferredRows = rows.filter((r) => r.family === preferredFamily);
    scored = scorePool(preferredRows);
    const strongPreferred = Array.from(scored.values()).filter(
      (m) => m.score >= 32
    );
    if (!strongPreferred.length) {
      const allScored = scorePool(rows);
      for (const [id, match] of allScored) {
        if (!scored.has(id)) scored.set(id, match);
      }
    }
  } else {
    scored = scorePool(rows);
  }

  const FAMILY_BONUS = 32;
  const FAMILY_PENALTY = 28;

  return Array.from(scored.values())
    .map((match) => {
      const family = familyById.get(match.id);
      let score = match.score;
      if (preferredFamily && family) {
        if (family === preferredFamily) score += FAMILY_BONUS;
        else score = Math.max(0, score - FAMILY_PENALTY);
      }
      return { ...match, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.label.length - b.label.length ||
        a.label.localeCompare(b.label)
    )
    .slice(0, 8);
}

async function resolveWorkers(query: string) {
  const all = await listWorkers({ active: "true" });
  const aliased = applySttAliases(query);
  const rows = all.map((w) => ({
    id: w._id,
    label: w.nameUr ? `${w.name} (${w.nameUr})` : w.name,
    searchText: [w.name, w.nameUr, w.job].filter(Boolean).join(" "),
  }));
  const matches = toMatches(rows, aliased || query, 8, 35);
  if (matches.length) return matches;
  let best: EntityMatch | null = null;
  for (const row of rows) {
    const score = Math.max(
      scoreName(aliased || query, row.label),
      scoreName(aliased || query, row.searchText || "")
    );
    if (!best || score > best.score) best = { id: row.id, label: row.label, score };
  }
  return best && best.score >= 28 ? [best] : [];
}

function pickBest(matches: EntityMatch[]) {
  if (!matches.length) return undefined;
  const top = matches[0];
  const second = matches[1];
  if (top.score >= 55) return top.id;
  if (top.score >= 40 && (!second || top.score - second.score >= 6)) return top.id;
  if (top.score >= 28) return top.id;
  return top.id;
}

/** Prefer the tightest catalog name when several products score close. */
function pickBestProduct(matches: EntityMatch[]) {
  if (!matches.length) return undefined;
  const topScore = matches[0].score;
  const contenders = matches.filter((m) => topScore - m.score <= 10);
  contenders.sort(
    (a, b) =>
      b.score - a.score ||
      a.label.length - b.label.length ||
      a.label.localeCompare(b.label)
  );
  return contenders[0]?.id;
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

  if (parsed.supplierQuery && parsed.intent !== "add_supplier") {
    draft.supplierMatches = await resolveSuppliers(parsed.supplierQuery);
    draft.selectedSupplierId = pickBest(draft.supplierMatches);
  }

  if (parsed.intent === "salary_pay" && parsed.customerQuery) {
    draft.customerMatches = await resolveWorkers(parsed.customerQuery);
    draft.selectedCustomerId = pickBest(draft.customerMatches);
  } else if (
    parsed.customerQuery &&
    parsed.intent !== "add_worker" &&
    parsed.intent !== "add_salesman"
  ) {
    draft.customerMatches = await resolveCustomers(parsed.customerQuery);
    draft.selectedCustomerId = pickBest(draft.customerMatches);
  }

  if (
    parsed.intent === "add_supplier" ||
    parsed.intent === "add_salesman" ||
    parsed.intent === "add_worker"
  ) {
    draft.title = parsed.title || parsed.supplierQuery || parsed.customerQuery;
    return draft;
  }

  if (parsed.intent === "salary_pay") {
    if (!draft.customerMatches.length) {
      return {
        error: `No worker matched "${parsed.customerQuery || ""}". Try again.`,
        transcript: parsed.raw,
      };
    }
    return draft;
  }

  if (parsed.intent === "builty") {
    // Keep spoken number when given; otherwise suggest only if creating with content
    draft.builtyNo =
      parsed.builtyNo?.trim() ||
      (parsed.customerQuery || parsed.productLines?.length
        ? suggestBuiltyNo()
        : undefined);
    draft.amountPaid = 0;
    if (parsed.spokenDate) draft.builtyDate = parsed.spokenDate;
    // Rate-only / fixed-only command (no products) — apply to last form line later
    if (!parsed.productLines?.length && !parsed.productQuery) {
      if (parsed.amount != null) {
        draft.amount = parsed.amount;
        draft.pricingMode = "fixed";
      } else if (parsed.rate != null) {
        draft.rate = parsed.rate;
        draft.pricingMode = "rate_kg";
      }
    }

    const lines =
      parsed.productLines?.length
        ? parsed.productLines
        : parsed.productQuery && parsed.quantity
          ? [
              {
                productQuery: parsed.productQuery,
                quantity: parsed.quantity,
                rate: parsed.rate,
                amount: parsed.amount,
                materialType: parsed.materialType,
                quantityExplicit: true,
                pricingMode: parsed.amount != null && parsed.rate == null ? "fixed" as const : "rate_kg" as const,
              },
            ]
          : [];

    draft.items = [];
    for (const line of lines) {
      const productMatches = await resolveProducts(line.productQuery, {
        preferredMaterial: line.materialType,
      });
      const selectedProductId = pickBestProduct(productMatches);
      const pricingMode =
        line.pricingMode ||
        (line.amount != null && line.rate == null ? "fixed" : "rate_kg");
      draft.items.push({
        productQuery: line.productQuery,
        productMatches,
        selectedProductId,
        quantity: line.quantity,
        rate: pricingMode === "fixed" ? undefined : line.rate,
        amount: pricingMode === "fixed" ? line.amount : undefined,
        pricingMode,
        quantityExplicit: line.quantityExplicit,
      });
    }

    if (draft.items[0]) {
      draft.productMatches = draft.items[0].productMatches;
      draft.selectedProductId = draft.items[0].selectedProductId;
      draft.quantity = draft.items[0].quantity;
      draft.rate = draft.items[0].rate;
      draft.amount = draft.items[0].amount;
      draft.pricingMode = draft.items[0].pricingMode;
    }
  } else if (parsed.intent === "produce") {
    draft.wastePercent = 6;
    draft.materialType = parsed.materialType;
    if (parsed.spokenDate) draft.productionDate = parsed.spokenDate;

    const lines =
      parsed.productLines?.length
        ? parsed.productLines
        : parsed.productQuery && parsed.quantity
          ? [
              {
                productQuery: parsed.productQuery,
                quantity: parsed.quantity,
                materialType: parsed.materialType,
              },
            ]
          : [];

    draft.items = [];
    for (const line of lines) {
      const lineMaterial = line.materialType || parsed.materialType;
      const productMatches = await resolveProducts(line.productQuery, {
        preferredMaterial: lineMaterial,
      });
      draft.items.push({
        productQuery: line.productQuery,
        productMatches,
        selectedProductId: pickBestProduct(productMatches),
        quantity: line.quantity,
        materialType: lineMaterial,
      });
    }

    if (draft.items[0]) {
      draft.productMatches = draft.items[0].productMatches;
      draft.selectedProductId = draft.items[0].selectedProductId;
      draft.quantity = draft.items[0].quantity;
      draft.materialType =
        draft.items[0].materialType || draft.materialType;
    }
  } else if (parsed.productQuery) {
    draft.productMatches = await resolveProducts(parsed.productQuery, {
      preferredMaterial: parsed.materialType,
    });
    draft.selectedProductId = pickBestProduct(draft.productMatches);
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
    if (parsed.intent === "customer_payment" || parsed.customerQuery) {
      return {
        error: `No customer matched "${parsed.customerQuery || ""}". Try editing the name, then Add again.`,
        transcript: parsed.raw,
      };
    }
  }

  if (parsed.intent === "produce") {
    const hasDate = Boolean(parsed.spokenDate || draft.productionDate);
    const hasItems = Boolean(draft.items && draft.items.length);
    if (!hasItems && !hasDate) {
      return {
        error: `No product matched "${parsed.productQuery || ""}". Try editing the name, then Add again.`,
        transcript: parsed.raw,
      };
    }
    if (hasItems) {
      const missing = (draft.items || []).find((line) => !line.productMatches.length);
      if (missing) {
        return {
          error: `No product matched "${missing.productQuery || parsed.productQuery || ""}". Try editing the name, then Add again.`,
          transcript: parsed.raw,
        };
      }
    }
  }

  if (parsed.intent === "builty") {
    const hasCustomer = Boolean(draft.selectedCustomerId);
    const hasItems = Boolean(draft.items?.length);
    const hasBuiltyNo = Boolean(parsed.builtyNo?.trim());
    const hasDate = Boolean(parsed.spokenDate || draft.builtyDate);
    const hasRateOnly = parsed.rate != null && !hasItems;
    const hasFixedOnly = parsed.amount != null && !hasItems;
    if (!hasCustomer && !hasItems && !hasBuiltyNo && !hasDate && !hasRateOnly && !hasFixedOnly) {
      return {
        error:
          "Say product with rate or fixed price, builty number, set date, rate 200, or fixed 20000.",
        transcript: parsed.raw,
      };
    }
    if (hasItems) {
      const missing = (draft.items || []).find(
        (line) => !line.productMatches.length
      );
      if (missing) {
        return {
          error: `No product matched "${missing.productQuery}". Try again.`,
          transcript: parsed.raw,
        };
      }
    }
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
      Boolean(builtyQuery) &&
      /\b(number|no\.?|num|#|of|for|from)\b/.test(text));

  if (wantBuilty && (builtyQuery || (nameQuery && parsed.navigateKind === "builty"))) {
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
        href: `/dashboard/builty/${row._id}/edit`,
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
        href: `/dashboard/builty/${row._id}/edit`,
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
          href: `/dashboard/builty/${row._id}/edit`,
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
