"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedExpenseScope } from "@/hooks/use-persisted-expense-scope";
import type { ExpenseScopeFilter } from "@/stores/expense-scope-store";
import { EXPENSES_CHILDREN } from "./nav-items";

const SCOPE_TABS: Array<{
  id: ExpenseScopeFilter;
  labelKey: "prod.filter.all" | "exp.scopeHub" | "exp.scopeDrum" | "exp.scopeCommon";
}> = [
  { id: "all", labelKey: "prod.filter.all" },
  { id: "hub", labelKey: "exp.scopeHub" },
  { id: "drum", labelKey: "exp.scopeDrum" },
  { id: "common", labelKey: "exp.scopeCommon" },
];

const COMMON_ONLY_HREFS = new Set([
  "/dashboard/expenses/electricity",
  "/dashboard/expenses/taxes",
]);

export function ExpensesSubnav() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { scope, setScope } = usePersistedExpenseScope();
  const [, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const activePath = pendingHref ?? pathname;
  const lineSpecific = scope === "hub" || scope === "drum";

  const visibleLinks = useMemo(
    () =>
      EXPENSES_CHILDREN.filter(
        (link) => !lineSpecific || !COMMON_ONLY_HREFS.has(link.href)
      ),
    [lineSpecific]
  );

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    for (const link of visibleLinks) {
      router.prefetch(link.href);
    }
  }, [router, visibleLinks]);

  useEffect(() => {
    if (!lineSpecific) return;
    const onCommonOnly = [...COMMON_ONLY_HREFS].some(
      (href) => pathname === href || pathname?.startsWith(`${href}/`)
    );
    if (onCommonOnly) {
      startTransition(() => {
        router.replace("/dashboard/expenses/salaries");
      });
    }
  }, [lineSpecific, pathname, router]);

  function goTo(href: string) {
    if (href === pathname) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <nav
        className="flex flex-wrap gap-1 border-b border-border pb-3"
        aria-label={t("exp.scopeFilter")}
      >
        {SCOPE_TABS.map((tab) => {
          const active = scope === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScope(tab.id)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm",
                active
                  ? tab.id === "hub"
                    ? "bg-sky-600 text-white"
                    : tab.id === "drum"
                      ? "bg-amber-600 text-white"
                      : tab.id === "common"
                        ? "bg-slate-800 text-white"
                        : "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {t(tab.labelKey)}
            </button>
          );
        })}
      </nav>
      <nav className="flex flex-wrap gap-1 border-b border-border pb-3">
        {visibleLinks.map((link) => {
          const active =
            activePath === link.href || activePath?.startsWith(`${link.href}/`);
          return (
            <button
              key={link.href}
              type="button"
              onClick={() => goTo(link.href)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm",
                active
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {t(link.labelKey)}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
