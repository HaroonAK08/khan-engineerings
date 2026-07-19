"use client";

import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";

export function LanguageToggle() {
  const { locale, toggleLocale, t } = useI18n();
  const hint = locale === "en" ? t("topbar.switchToUrdu") : t("topbar.switchToEnglish");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLocale}
            aria-label={t("topbar.toggleLanguage")}
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Globe className="size-4" />
            <span className="sr-only">{hint}</span>
          </Button>
        }
      />
      <TooltipContent>
        <span className="inline-flex items-center gap-1.5">
          {hint}
          <span className="font-data text-[10px] opacity-70">
            {locale === "en" ? "UR" : "EN"}
          </span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
