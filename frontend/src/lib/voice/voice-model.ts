import { listCustomers } from "@/lib/sales-api";
import { listSuppliers } from "@/lib/materials-api";
import { listProducts } from "@/lib/production-api";
import { listWorkers } from "@/lib/workers-api";

const STORAGE_KEY = "ke-voice-model-v1";
const EVENT_NAME = "ke-voice-model-updated";

export type VoiceModelAlias = { correct: string; hears: string[] };

export type VoiceModel = {
  version: 1;
  trainedAt: string;
  fingerprint: string;
  productCount: number;
  partyCount: number;
  phrases: string[];
  aliases: VoiceModelAlias[];
  productNames: string[];
};

type TrainProgress = {
  stage: string;
  done: boolean;
  model?: VoiceModel;
};

let memoryCache: VoiceModel | null = null;
let trainInFlight: Promise<VoiceModel> | null = null;

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productPhrases(name: string, family?: string, sku?: string) {
  const raw = normalizeToken(name);
  if (!raw) return [] as string[];
  const noKg = raw.replace(/\b\d+(?:\.\d+)?\s*kg\b/g, " ").replace(/\s+/g, " ").trim();
  const collapsed = raw.replace(/\s+/g, "");
  const familyWord = family === "drum" ? "drum" : family === "hub" ? "hub" : "";
  const out = new Set<string>(
    [
      raw,
      noKg,
      collapsed,
      familyWord ? `${familyWord} ${raw}` : "",
      familyWord ? `${familyWord} ${noKg}` : "",
      sku ? normalizeToken(sku) : "",
    ].filter(Boolean)
  );
  return Array.from(out);
}

/** Cheap STT-style splits for catalog tokens (hino → he no, china → chai na). */
function autoHearsForToken(token: string): string[] {
  const t = normalizeToken(token).replace(/\s+/g, "");
  if (t.length < 4 || t.length > 14 || /^\d/.test(t)) return [];
  const hears = new Set<string>();

  // Split after 2–3 letters: "hino" → "hi no", "he no"
  for (const cut of [2, 3]) {
    if (t.length - cut >= 2) {
      hears.add(`${t.slice(0, cut)} ${t.slice(cut)}`);
    }
  }

  // Vowel-ish expansions for short brands
  if (t.length <= 6) {
    hears.add(t.split("").join(" "));
  }

  // Common consonant confusions
  const soft = t
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/tion/g, "shun");
  if (soft !== t) hears.add(soft);

  return Array.from(hears).filter((h) => h !== t && h.length >= 3).slice(0, 6);
}

function buildAliasesFromNames(names: string[]): VoiceModelAlias[] {
  const tokenHits = new Map<string, number>();
  for (const name of names) {
    const tokens = normalizeToken(name).split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
      if (tok.length < 4 || /^\d/.test(tok) || tok === "kg") continue;
      tokenHits.set(tok, (tokenHits.get(tok) || 0) + 1);
    }
  }

  const aliases: VoiceModelAlias[] = [];
  for (const [token, count] of tokenHits) {
    if (count < 1) continue;
    const hears = autoHearsForToken(token);
    if (!hears.length) continue;
    aliases.push({ correct: token, hears });
  }

  // Prefer frequent brand-like tokens first; cap size for performance
  return aliases
    .sort(
      (a, b) =>
        (tokenHits.get(b.correct) || 0) - (tokenHits.get(a.correct) || 0) ||
        a.correct.localeCompare(b.correct)
    )
    .slice(0, 120);
}

function fingerprintFrom(parts: string[]) {
  return parts.sort().join("|");
}

export function loadVoiceModel(): VoiceModel | null {
  if (memoryCache) return memoryCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VoiceModel;
    if (!parsed || parsed.version !== 1) return null;
    memoryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function saveVoiceModel(model: VoiceModel) {
  memoryCache = model;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: model }));
}

export function getVoiceModelAliases(): VoiceModelAlias[] {
  return loadVoiceModel()?.aliases || [];
}

export function getVoiceGrammarPhrases(): string[] {
  return loadVoiceModel()?.phrases || [];
}

export function subscribeVoiceModel(
  listener: (model: VoiceModel | null) => void
) {
  if (typeof window === "undefined") return () => undefined;
  const onUpdate = (ev: Event) => {
    const detail = (ev as CustomEvent<VoiceModel>).detail;
    listener(detail || loadVoiceModel());
  };
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === STORAGE_KEY) {
      memoryCache = null;
      listener(loadVoiceModel());
    }
  };
  window.addEventListener(EVENT_NAME, onUpdate);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onUpdate);
    window.removeEventListener("storage", onStorage);
  };
}

export async function computeCatalogFingerprint(): Promise<string> {
  const [products, customers, suppliers, workers] = await Promise.all([
    listProducts({ active: "true" }),
    listCustomers({ active: "true" }),
    listSuppliers({ active: "true" }),
    listWorkers({ active: "true" }),
  ]);
  return fingerprintFrom([
    ...products.map(
      (p) => `p:${p._id}:${p.name}:${p.family || ""}:${p.sku || ""}:${p.isActive}`
    ),
    ...customers.map((c) => `c:${c._id}:${c.name}`),
    ...suppliers.map((s) => `s:${s._id}:${s.name}:${s.nameUr || ""}`),
    ...workers.map((w) => `w:${w._id}:${w.name}:${w.nameUr || ""}`),
  ]);
}

export async function trainVoiceModel(
  onProgress?: (progress: TrainProgress) => void
): Promise<VoiceModel> {
  if (trainInFlight) return trainInFlight;

  trainInFlight = (async () => {
    onProgress?.({ stage: "Loading products…", done: false });
    const [products, customers, suppliers, workers] = await Promise.all([
      listProducts({ active: "true" }),
      listCustomers({ active: "true" }),
      listSuppliers({ active: "true" }),
      listWorkers({ active: "true" }),
    ]);

    onProgress?.({ stage: "Building vocabulary…", done: false });

    const phraseSet = new Set<string>();
    const productNames: string[] = [];

    for (const p of products) {
      if (!p.name) continue;
      productNames.push(p.name);
      for (const phrase of productPhrases(p.name, p.family, p.sku)) {
        phraseSet.add(phrase);
      }
    }

    for (const c of customers) {
      const n = normalizeToken(c.name || "");
      if (n) phraseSet.add(n);
    }
    for (const s of suppliers) {
      const n = normalizeToken(s.name || "");
      const ur = normalizeToken(s.nameUr || "");
      if (n) phraseSet.add(n);
      if (ur) phraseSet.add(ur);
    }
    for (const w of workers) {
      const n = normalizeToken(w.name || "");
      const ur = normalizeToken(w.nameUr || "");
      if (n) phraseSet.add(n);
      if (ur) phraseSet.add(ur);
    }

    // Bias STT toward factory ops words
    for (const w of [
      "produce",
      "builty",
      "building",
      "bilt",
      "hub",
      "hubs",
      "drum",
      "drums",
      "quantity",
      "rate",
      "scrap",
      "daig",
    ]) {
      phraseSet.add(w);
    }

    const phrases = Array.from(phraseSet)
      .filter((p) => p.length >= 2 && p.length <= 80)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 400);

    const aliases = buildAliasesFromNames([
      ...productNames,
      ...customers.map((c) => c.name || ""),
      ...suppliers.map((s) => s.name || ""),
      ...workers.map((w) => w.name || ""),
    ]);

    const fingerprint = fingerprintFrom([
      ...products.map(
        (p) =>
          `p:${p._id}:${p.name}:${p.family || ""}:${p.sku || ""}:${p.isActive}`
      ),
      ...customers.map((c) => `c:${c._id}:${c.name}`),
      ...suppliers.map((s) => `s:${s._id}:${s.name}:${s.nameUr || ""}`),
      ...workers.map((w) => `w:${w._id}:${w.name}:${w.nameUr || ""}`),
    ]);

    const model: VoiceModel = {
      version: 1,
      trainedAt: new Date().toISOString(),
      fingerprint,
      productCount: products.length,
      partyCount: customers.length + suppliers.length + workers.length,
      phrases,
      aliases,
      productNames: productNames.slice(0, 500),
    };

    onProgress?.({ stage: "Saving model…", done: false });
    saveVoiceModel(model);
    onProgress?.({ stage: "Done", done: true, model });
    return model;
  })();

  try {
    return await trainInFlight;
  } finally {
    trainInFlight = null;
  }
}

/** Retrain if missing or catalog changed. Returns model (existing or new). */
export async function ensureVoiceModelFresh(
  onProgress?: (progress: TrainProgress) => void
): Promise<VoiceModel> {
  const existing = loadVoiceModel();
  onProgress?.({ stage: "Checking catalog…", done: false });
  try {
    const fingerprint = await computeCatalogFingerprint();
    if (existing && existing.fingerprint === fingerprint) {
      onProgress?.({ stage: "Already up to date", done: true, model: existing });
      return existing;
    }
  } catch {
    if (existing) {
      onProgress?.({ stage: "Using cached model", done: true, model: existing });
      return existing;
    }
  }
  return trainVoiceModel(onProgress);
}

/** Fire-and-forget retrain after product/party changes. */
export function scheduleVoiceModelRetrain() {
  if (typeof window === "undefined") return;
  void trainVoiceModel().catch(() => undefined);
}
