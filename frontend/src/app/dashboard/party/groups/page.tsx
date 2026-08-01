"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { PartyGroupsPanel } from "@/components/party/party-groups-panel";

export default function PartyGroupsPage() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-nameplate text-xl">{t("pgroup.pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("pgroup.pageSubtitle")}</p>
      </div>

      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        }
      >
        <PartyGroupsPanel />
      </Suspense>
    </div>
  );
}
