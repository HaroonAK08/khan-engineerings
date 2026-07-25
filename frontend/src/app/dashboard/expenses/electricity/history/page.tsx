"use client";

import { ExpenseCalendar } from "@/components/expenses/expense-calendar";
import { useI18n } from "@/hooks/use-i18n";

export default function ElectricityHistoryPage() {
  const { t } = useI18n();
  return (
    <ExpenseCalendar
      title={t("elec.historyTitle")}
      description={t("elec.historyDesc")}
      backHref="/dashboard/expenses/electricity"
      backLabel={t("exp.backToElectricity")}
      categories={["electricity"]}
      defaultCategory="electricity"
      fallbackDetail={t("elec.title")}
    />
  );
}
