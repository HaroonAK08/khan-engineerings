import type {
  ChannelManufactureDetailLine,
  ChannelManufactureLine,
} from "@/lib/finance-api";

type Family = "hub" | "drum";

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

/** Always 50/50 for both families. */
const SHARED_HALF_SPLIT_IDS = new Set(["taxes", "common_salaries"]);

/** Drum-only: Others salaries + Other expense split 50/50. */
const DRUM_HALF_SALARY_IDS = new Set(["others_salaries"]);
const DRUM_HALF_EXPENSE_IDS = new Set(["other"]);

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export type CastingKhradLine = ChannelManufactureDetailLine & {
  kind: "material" | "expense" | "salary";
  halfShare?: boolean;
};

export type CastingKhradSplit = {
  castingPerKg: number | null;
  khradPerKg: number | null;
  castingLines: CastingKhradLine[];
  khradLines: CastingKhradLine[];
};

function rulesFor(family: Family) {
  if (family === "drum") {
    return {
      castingExpenses: DRUM_CASTING_EXPENSE_IDS,
      castingSalaries: DRUM_CASTING_SALARY_IDS,
      halfExpenseIds: new Set([...SHARED_HALF_SPLIT_IDS, ...DRUM_HALF_EXPENSE_IDS]),
      halfSalaryIds: new Set([...SHARED_HALF_SPLIT_IDS, ...DRUM_HALF_SALARY_IDS]),
    };
  }
  return {
    castingExpenses: HUB_CASTING_EXPENSE_IDS,
    castingSalaries: HUB_CASTING_SALARY_IDS,
    halfExpenseIds: SHARED_HALF_SPLIT_IDS,
    halfSalaryIds: SHARED_HALF_SPLIT_IDS,
  };
}

function pushHalf(
  rows: { casting: CastingKhradLine[]; khrad: CastingKhradLine[] },
  totals: { casting: number; khrad: number },
  item: ChannelManufactureDetailLine,
  kind: "expense" | "salary"
) {
  const half = roundMoney(item.perKg / 2);
  const other = roundMoney(item.perKg - half);
  totals.casting = roundMoney(totals.casting + half);
  totals.khrad = roundMoney(totals.khrad + other);
  rows.casting.push({
    id: `${item.id}_casting`,
    label: item.label,
    perKg: half,
    kind,
    halfShare: true,
  });
  rows.khrad.push({
    id: `${item.id}_khrad`,
    label: item.label,
    perKg: other,
    kind,
    halfShare: true,
  });
}

export function splitCastingKhrad(
  line: ChannelManufactureLine | null | undefined,
  family: Family = "hub"
): CastingKhradSplit {
  const { castingExpenses, castingSalaries, halfExpenseIds, halfSalaryIds } = rulesFor(family);
  const castingLines: CastingKhradLine[] = [];
  const khradLines: CastingKhradLine[] = [];
  const totals = { casting: 0, khrad: 0 };
  let hasAny = false;

  if (line?.materialPerKg != null && line.materialPerKg > 0) {
    hasAny = true;
    totals.casting = roundMoney(totals.casting + line.materialPerKg);
    castingLines.push({
      id: "raw_material",
      label: "Raw material",
      perKg: line.materialPerKg,
      kind: "material",
    });
  }

  for (const e of line?.expenseLines || []) {
    if (!(e.perKg > 0)) continue;
    hasAny = true;
    if (halfExpenseIds.has(e.id)) {
      pushHalf({ casting: castingLines, khrad: khradLines }, totals, e, "expense");
      continue;
    }
    if (castingExpenses.has(e.id)) {
      totals.casting = roundMoney(totals.casting + e.perKg);
      castingLines.push({ ...e, kind: "expense" });
    } else {
      totals.khrad = roundMoney(totals.khrad + e.perKg);
      khradLines.push({ ...e, kind: "expense" });
    }
  }

  for (const s of line?.salaryLines || []) {
    if (!(s.perKg > 0)) continue;
    hasAny = true;
  if (halfSalaryIds.has(s.id)) {
      pushHalf(
        { casting: castingLines, khrad: khradLines },
        totals,
        {
          ...s,
          label: s.id === "others_salaries" ? "Other salaries" : s.label,
        },
        "salary"
      );
      continue;
    }
    if (castingSalaries.has(s.id)) {
      totals.casting = roundMoney(totals.casting + s.perKg);
      castingLines.push({
        ...s,
        label: s.id === "others_salaries" ? "Other salaries" : s.label,
        kind: "salary",
      });
    } else {
      totals.khrad = roundMoney(totals.khrad + s.perKg);
      khradLines.push({
        ...s,
        label: s.id === "others_salaries" ? "Other salaries" : s.label,
        kind: "salary",
      });
    }
  }

  if (!hasAny) {
    return {
      castingPerKg: null,
      khradPerKg: null,
      castingLines: [],
      khradLines: [],
    };
  }

  return {
    castingPerKg: totals.casting > 0 ? totals.casting : null,
    khradPerKg: totals.khrad > 0 ? totals.khrad : null,
    castingLines,
    khradLines,
  };
}
