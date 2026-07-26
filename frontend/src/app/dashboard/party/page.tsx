"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { CustomersPanel } from "@/components/party/customers-panel";

export default function PartyPage() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-nameplate text-xl">{t("party.title")}</h1>
      </div>

      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        }
      >
        <CustomersPanel />
      </Suspense>
    </div>
  );
}
