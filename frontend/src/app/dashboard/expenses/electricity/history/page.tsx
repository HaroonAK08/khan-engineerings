"use client";

import { ExpenseCalendar } from "@/components/expenses/expense-calendar";
import { ElectricityAccrualStatus } from "@/components/expenses/electricity-accrual-status";
import { useI18n } from "@/hooks/use-i18n";

export default function ElectricityHistoryPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      <ElectricityAccrualStatus />
      <ExpenseCalendar
        title={t("elec.historyTitle")}
        description={t("elec.historyDesc")}
        backHref="/dashboard/expenses/electricity"
        backLabel={t("exp.backToElectricity")}
        categories={["electricity"]}
        defaultCategory="electricity"
        fallbackDetail={t("elec.title")}
        trackUnits
      />
    </div>
  );
}
