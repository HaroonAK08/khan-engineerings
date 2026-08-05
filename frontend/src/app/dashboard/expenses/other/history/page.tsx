"use client";

import { ExpenseCalendar } from "@/components/expenses/expense-calendar";
import { useI18n, type MessageKey } from "@/hooks/use-i18n";

const OTHER_CATEGORIES: Array<{ id: string; labelKey: MessageKey }> = [
  { id: "paint", labelKey: "other.cat.paint" },
  { id: "lpg_gas", labelKey: "other.cat.lpg" },
  { id: "petrol", labelKey: "other.cat.petrol" },
  { id: "silica_sand", labelKey: "other.cat.silica" },
  { id: "silicate", labelKey: "other.cat.silicate" },
  { id: "sheera", labelKey: "other.cat.sheera" },
  { id: "chemicals", labelKey: "other.cat.chemicals" },
  { id: "tools", labelKey: "other.cat.tools" },
  { id: "machine", labelKey: "other.cat.machine" },
  { id: "repairs", labelKey: "other.cat.repairs" },
  { id: "tour_expenses", labelKey: "other.cat.tour" },
  { id: "other", labelKey: "other.cat.other" },
];

export default function OtherExpensesHistoryPage() {
  const { t } = useI18n();
  return (
    <ExpenseCalendar
      title={t("other.historyTitle")}
      description={t("other.historyDesc")}
      backHref="/dashboard/expenses/other"
      backLabel={t("exp.backToOther")}
      categories={OTHER_CATEGORIES}
      defaultCategory="paint"
      fallbackDetail={t("other.title")}
    />
  );
}
