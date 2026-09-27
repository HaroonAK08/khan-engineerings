"use client";

import { TableCell, TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type TallyCheckProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  className?: string;
};

export function TallyCheck({
  checked,
  onChange,
  label = "Tally",
  className,
}: TallyCheckProps) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-4 shrink-0 cursor-pointer accent-primary",
        className
      )}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      aria-label={label}
      title={label}
    />
  );
}

export function TallyHead({ label = "Tally" }: { label?: string }) {
  return (
    <TableHead className="w-10 px-2 text-center" aria-label={label}>
      <span className="sr-only">{label}</span>
    </TableHead>
  );
}

export function TallyCell({
  checked,
  onChange,
  label = "Tally",
}: TallyCheckProps) {
  return (
    <TableCell
      className="w-10 px-2 text-center align-middle"
      onClick={(e) => e.stopPropagation()}
    >
      <TallyCheck checked={checked} onChange={onChange} label={label} />
    </TableCell>
  );
}
