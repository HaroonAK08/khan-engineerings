"use client";

import { formatMoney } from "@/lib/materials-api";
import { summarizeInstruments } from "@/lib/party-instruments";
import type { CustomerInstrument } from "@/lib/sales-api";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

export function PartyChequePromiseSummary({
  instruments,
}: {
  instruments: CustomerInstrument[];
}) {
  const { t } = useI18n();
  const summary = summarizeInstruments(instruments);
  if (summary.pendingTotal <= 0.001) return null;
  const due = summary.dueCount > 0;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-3",
        due ? "animate-cheque-due border-amber-400/70" : "bg-muted/30"
      )}
    >
      <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {t("customerDetail.chequePromisePending")}
      </p>
      <p className="font-data mt-1 text-lg font-semibold text-amber-700 dark:text-amber-400">
        {formatMoney(summary.pendingTotal)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {due ? t("customerDetail.chequePromiseDue") : t("customerDetail.chequePromisePendingHint")}
      </p>
    </div>
  );
}
