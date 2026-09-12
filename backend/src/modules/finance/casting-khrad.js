const HUB_CASTING_EXPENSE_IDS = new Set([
  "chemicals",
  "electricity",
  "lpg_gas",
  "silica_sand",
  "other",
]);

const DRUM_CASTING_EXPENSE_IDS = new Set([
  "chemicals",
  "electricity",
  "lpg_gas",
  "sheera",
]);

const HUB_CASTING_SALARY_IDS = new Set(["casting_labour", "others_salaries"]);
const DRUM_CASTING_SALARY_IDS = new Set(["casting_labour"]);
const SHARED_HALF_SPLIT_IDS = new Set(["common_salaries", "taxes"]);
const DRUM_HALF_SALARY_IDS = new Set(["others_salaries"]);
const DRUM_HALF_EXPENSE_IDS = new Set(["other"]);

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function rulesFor(family) {
  const halfExpenseIds =
    family === "drum"
      ? new Set([...SHARED_HALF_SPLIT_IDS, ...DRUM_HALF_EXPENSE_IDS])
      : new Set(SHARED_HALF_SPLIT_IDS);
  const halfSalaryIds =
    family === "drum"
      ? new Set([...SHARED_HALF_SPLIT_IDS, ...DRUM_HALF_SALARY_IDS])
      : new Set(SHARED_HALF_SPLIT_IDS);
  if (family === "drum") {
    return {
      castingExpenses: DRUM_CASTING_EXPENSE_IDS,
      castingSalaries: DRUM_CASTING_SALARY_IDS,
      halfExpenseIds,
      halfSalaryIds,
    };
  }
  return {
    castingExpenses: HUB_CASTING_EXPENSE_IDS,
    castingSalaries: HUB_CASTING_SALARY_IDS,
    halfExpenseIds,
    halfSalaryIds,
  };
}

function pushHalf(totals, item) {
  const half = roundMoney(item.perKg / 2);
  const other = roundMoney(item.perKg - half);
  totals.casting = roundMoney(totals.casting + half);
  totals.khrad = roundMoney(totals.khrad + other);
}

function splitCastingKhrad(line, family = "hub") {
  const { castingExpenses, castingSalaries, halfExpenseIds, halfSalaryIds } = rulesFor(family);
  const totals = { casting: 0, khrad: 0 };
  let hasAny = false;

  if (line?.materialPerKg != null && line.materialPerKg > 0) {
    hasAny = true;
    totals.casting = roundMoney(totals.casting + line.materialPerKg);
  }

  for (const e of line?.expenseLines || []) {
    if (!(e.perKg > 0)) continue;
    hasAny = true;
    if (halfExpenseIds.has(e.id)) {
      pushHalf(totals, e);
      continue;
    }
    if (castingExpenses.has(e.id)) {
      totals.casting = roundMoney(totals.casting + e.perKg);
    } else {
      totals.khrad = roundMoney(totals.khrad + e.perKg);
    }
  }

  for (const s of line?.salaryLines || []) {
    if (!(s.perKg > 0)) continue;
    hasAny = true;
    if (halfSalaryIds.has(s.id)) {
      pushHalf(totals, s);
      continue;
    }
    if (castingSalaries.has(s.id)) {
      totals.casting = roundMoney(totals.casting + s.perKg);
    } else {
      totals.khrad = roundMoney(totals.khrad + s.perKg);
    }
  }

  if (!hasAny) {
    return { castingPerKg: null, khradPerKg: null };
  }

  return {
    castingPerKg: totals.casting > 0 ? totals.casting : null,
    khradPerKg: totals.khrad > 0 ? totals.khrad : null,
  };
}

module.exports = { splitCastingKhrad };
