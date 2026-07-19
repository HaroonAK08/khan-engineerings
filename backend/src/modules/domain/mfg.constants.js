/**
 * Manufacturing ERP domain constants (Phase A+).
 * Single source of truth for materials, families, stages, expenses, stock types.
 */

const MATERIAL_TYPES = [
  { id: "scrap", label: "Scrap", typicalOutput: "hub" },
  { id: "daig", label: "Daig", typicalOutput: "drum" },
];

/** Furnace / production input materials (includes reusable pool). */
const INPUT_MATERIAL_TYPES = [
  ...MATERIAL_TYPES,
  { id: "reusable", label: "Reusable" },
];

const PRODUCT_FAMILIES = [
  {
    id: "hub",
    label: "Hub",
    stages: ["furnace", "turning", "drilling", "painting", "polishing", "finished"],
  },
  {
    id: "drum",
    label: "Drum",
    stages: ["furnace", "turning", "drilling", "painting", "finished"],
  },
];

const PRODUCTION_STAGES = [
  { id: "furnace", label: "Furnace", order: 1 },
  { id: "turning", label: "Turning (Kharaad)", order: 2 },
  { id: "drilling", label: "Drilling", order: 3 },
  { id: "painting", label: "Painting", order: 4 },
  { id: "polishing", label: "Polishing", order: 5 },
  { id: "finished", label: "Finished", order: 6 },
];

/** Hierarchical expense taxonomy; leaf `id` is stored on BatchExpense.category */
const EXPENSE_CATEGORY_GROUPS = [
  {
    id: "raw_material",
    label: "Raw Material",
    items: [
      { id: "scrap", label: "Scrap" },
      { id: "daig", label: "Daig" },
    ],
  },
  {
    id: "utilities",
    label: "Utilities",
    items: [
      { id: "electricity", label: "Electricity" },
      { id: "lpg_gas", label: "LPG Gas" },
    ],
  },
  {
    id: "labour",
    label: "Labour",
    items: [
      /** All stage labour is paid via Salaries (workers), not as separate expense picks */
      { id: "fixed_salary", label: "Salaries / Labour" },
    ],
  },
  {
    id: "consumables",
    label: "Production Consumables",
    items: [
      { id: "paint", label: "Paint" },
      { id: "silica_sand", label: "Silica Sand" },
      { id: "sheera", label: "Sheera" },
      { id: "tools", label: "Tools" },
    ],
  },
  {
    id: "maintenance",
    label: "Machine Maintenance",
    items: [{ id: "machine", label: "Machine Maintenance" }],
  },
  {
    id: "government",
    label: "Government",
    items: [{ id: "taxes", label: "Taxes" }],
  },
  {
    id: "misc",
    label: "Miscellaneous",
    items: [
      { id: "repairs", label: "Repairs" },
      { id: "other", label: "Other" },
    ],
  },
];

/** Kept valid on existing docs / reports — not offered as new Other picks */
const LEGACY_EXPENSE_CATEGORY_IDS = [
  "furnace",
  "turning",
  "drilling",
  "painting",
  "polishing",
  "packing",
  "fees",
  "transport",
];

const EXPENSE_CATEGORIES = EXPENSE_CATEGORY_GROUPS.flatMap((g) =>
  g.items.map((item) => ({
    id: item.id,
    label: item.label,
    group: g.id,
    groupLabel: g.label,
  }))
);

const STOCK_ITEM_TYPES = [
  { id: "raw_scrap", label: "Scrap", unit: "kg" },
  { id: "raw_daig", label: "Daig", unit: "kg" },
  { id: "reusable", label: "Reusable", unit: "kg" },
  { id: "finished_good", label: "Finished Good", unit: "pcs" },
];

const STOCK_REASONS = [
  "purchase",
  "production_consume",
  "production_return",
  "production_output",
  "adjustment",
  "sale",
  "transfer_in",
  "transfer_out",
  "hand_recovery",
  "turning_breakage",
  "claim_return",
  "rework_consume",
];

const MATERIAL_TYPE_IDS = MATERIAL_TYPES.map((m) => m.id);
const INPUT_MATERIAL_TYPE_IDS = INPUT_MATERIAL_TYPES.map((m) => m.id);
const PRODUCT_FAMILY_IDS = PRODUCT_FAMILIES.map((f) => f.id);
const STAGE_IDS = PRODUCTION_STAGES.map((s) => s.id);
const CATEGORY_IDS = [
  ...EXPENSE_CATEGORIES.map((c) => c.id),
  ...LEGACY_EXPENSE_CATEGORY_IDS,
];
const STOCK_ITEM_TYPE_IDS = STOCK_ITEM_TYPES.map((t) => t.id);

/** Map purchase materialType → stock itemType */
function materialTypeToItemType(materialType) {
  if (materialType === "daig") return "raw_daig";
  if (materialType === "reusable") return "reusable";
  return "raw_scrap";
}

/** Legacy stage → new stage (Phase A migration) */
const LEGACY_STAGE_MAP = {
  melting: "furnace",
  casting: "furnace",
  drilling: "drilling",
  shaping: "turning",
  painting: "painting",
  finishing: "polishing",
};

/** Legacy expense category → new leaf id */
const LEGACY_CATEGORY_MAP = {
  electricity: "electricity",
  fuel: "lpg_gas",
  labor: "furnace",
  paint: "paint",
  packaging: "packing",
  maintenance: "machine",
  other: "other",
};

function stagesForFamily(family) {
  const row = PRODUCT_FAMILIES.find((f) => f.id === family);
  return row ? [...row.stages] : STAGE_IDS;
}

module.exports = {
  MATERIAL_TYPES,
  INPUT_MATERIAL_TYPES,
  PRODUCT_FAMILIES,
  PRODUCTION_STAGES,
  EXPENSE_CATEGORY_GROUPS,
  EXPENSE_CATEGORIES,
  STOCK_ITEM_TYPES,
  STOCK_REASONS,
  MATERIAL_TYPE_IDS,
  INPUT_MATERIAL_TYPE_IDS,
  PRODUCT_FAMILY_IDS,
  STAGE_IDS,
  CATEGORY_IDS,
  STOCK_ITEM_TYPE_IDS,
  LEGACY_STAGE_MAP,
  LEGACY_CATEGORY_MAP,
  LEGACY_EXPENSE_CATEGORY_IDS,
  materialTypeToItemType,
  stagesForFamily,
};
