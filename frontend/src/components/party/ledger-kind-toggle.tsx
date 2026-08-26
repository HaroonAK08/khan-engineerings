"use client";

import { cn } from "@/lib/utils";

export type LedgerEntryKind = "payment" | "previous_pending";

export function LedgerKindToggle({
  value,
  onChange,
  paymentLabel,
  pendingLabel,
}: {
  value: LedgerEntryKind;
  onChange: (value: LedgerEntryKind) => void;
  paymentLabel: string;
  pendingLabel: string;
}) {
  return (
    <div className="flex h-9 overflow-hidden rounded-lg border border-input">
      <button
        type="button"
        className={cn(
          "flex-1 px-3 text-sm",
          value === "payment"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground"
        )}
        onClick={() => onChange("payment")}
      >
        {paymentLabel}
      </button>
      <button
        type="button"
        className={cn(
          "flex-1 px-3 text-sm",
          value === "previous_pending"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground"
        )}
        onClick={() => onChange("previous_pending")}
      >
        {pendingLabel}
      </button>
    </div>
  );
}
