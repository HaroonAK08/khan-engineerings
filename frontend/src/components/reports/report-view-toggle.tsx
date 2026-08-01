"use client";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";

export type ReportViewMode = "whole" | "party" | "group";

type Props = {
  value: ReportViewMode;
  onChange: (view: ReportViewMode) => void;
  modes?: ReportViewMode[];
};

export function ReportViewToggle({
  value,
  onChange,
  modes = ["whole", "party", "group"],
}: Props) {
  const { t } = useI18n();
  const labels: Record<ReportViewMode, string> = {
    whole: t("rep.view.whole"),
    party: t("rep.view.party"),
    group: t("rep.view.group"),
  };

  return (
    <div className="flex flex-wrap gap-2">
      {modes.map((id) => (
        <Button
          key={id}
          type="button"
          size="sm"
          variant={value === id ? "default" : "outline"}
          onClick={() => onChange(id)}
        >
          {labels[id]}
        </Button>
      ))}
    </div>
  );
}
