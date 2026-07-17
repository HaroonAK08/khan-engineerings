const PRODUCTION_STAGES = [
  { id: "melting", label: "Melting", order: 1 },
  { id: "casting", label: "Casting", order: 2 },
  { id: "drilling", label: "Drilling", order: 3 },
  { id: "shaping", label: "Shaping", order: 4 },
  { id: "painting", label: "Painting", order: 5 },
  { id: "finishing", label: "Finishing", order: 6 },
];

const EXPENSE_CATEGORIES = [
  { id: "electricity", label: "Electricity" },
  { id: "fuel", label: "Fuel" },
  { id: "labor", label: "Labor" },
  { id: "paint", label: "Paint" },
  { id: "packaging", label: "Packaging" },
  { id: "maintenance", label: "Maintenance" },
  { id: "other", label: "Other" },
];

const STAGE_IDS = PRODUCTION_STAGES.map((s) => s.id);
const CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id);

module.exports = {
  PRODUCTION_STAGES,
  EXPENSE_CATEGORIES,
  STAGE_IDS,
  CATEGORY_IDS,
};
