"use client";

import { ExpenseCalendar } from "@/components/expenses/expense-calendar";
import { useI18n } from "@/hooks/use-i18n";

export default function TaxesHistoryPage() {
  const { t } = useI18n();
  return (
    <ExpenseCalendar
      title={t("tax.historyTitle")}
      description={t("tax.historyDesc")}
      backHref="/dashboard/expenses/taxes"
      backLabel={t("exp.backToTaxes")}
      categories={["taxes"]}
      defaultCategory="taxes"
      fallbackDetail={t("tax.title")}
    />
  );
}
