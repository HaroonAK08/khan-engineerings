"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Contact, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { CustomersPanel } from "@/components/party/customers-panel";
import { OrdersPanel } from "@/components/party/orders-panel";

type TabId = "customers" | "orders";

const TABS: { id: TabId; labelKey: MessageKey; icon: LucideIcon }[] = [
  { id: "customers", labelKey: "party.tab.customers", icon: Contact },
  { id: "orders", labelKey: "party.tab.orders", icon: ClipboardList },
];

function PartyTabs() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: TabId = searchParams.get("tab") === "orders" ? "orders" : "customers";

  function selectTab(next: TabId) {
    if (next === tab) return;
    router.replace(next === "customers" ? "/dashboard/party" : `/dashboard/party?tab=${next}`, {
      scroll: false,
    });
  }

  return (
    <>
      <nav className="flex flex-wrap gap-1 border-b border-border pb-3">
        {TABS.map((item) => {
          const active = item.id === tab;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm",
                active
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className={cn("size-3.5", active ? "text-primary" : "opacity-60")} />
              {t(item.labelKey)}
            </button>
          );
        })}
      </nav>

      {tab === "customers" ? <CustomersPanel /> : <OrdersPanel />}
    </>
  );
}

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
        <PartyTabs />
      </Suspense>
    </div>
  );
}
