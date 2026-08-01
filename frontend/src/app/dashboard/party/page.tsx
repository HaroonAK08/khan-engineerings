"use client";

import { Suspense, useState } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { CustomersPanel } from "@/components/party/customers-panel";
import { PartyGroupsPanel } from "@/components/party/party-groups-panel";
import { Button } from "@/components/ui/button";

export default function PartyPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"parties" | "groups">("parties");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("party.title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={tab === "parties" ? "default" : "outline"}
            onClick={() => setTab("parties")}
          >
            {t("party.tab.parties")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "groups" ? "default" : "outline"}
            onClick={() => setTab("groups")}
          >
            {t("party.tab.groups")}
          </Button>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        }
      >
        {tab === "parties" ? <CustomersPanel /> : <PartyGroupsPanel />}
      </Suspense>
    </div>
  );
}
