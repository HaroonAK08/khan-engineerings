"use client";

import { NotebookPen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";

export function QuickNotes() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="text-sidebar-foreground"
      aria-label={t("topbar.notes")}
      title={t("topbar.notes")}
      onClick={() => router.push("/dashboard/notes")}
    >
      <NotebookPen className="size-5" />
    </Button>
  );
}
