"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { EXPENSES_CHILDREN } from "./nav-items";

export function ExpensesSubnav() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const activePath = pendingHref ?? pathname;

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    for (const link of EXPENSES_CHILDREN) {
      router.prefetch(link.href);
    }
  }, [router]);

  function goTo(href: string) {
    if (href === pathname) return;
    setPendingHref(href);
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <nav className="flex flex-wrap gap-1 border-b border-border pb-3">
      {EXPENSES_CHILDREN.map((link) => {
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
  );
}
