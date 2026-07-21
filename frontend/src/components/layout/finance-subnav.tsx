"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import type { MessageKey } from "@/lib/i18n/messages";

const LINKS: Array<{ href: string; labelKey: MessageKey; exact?: boolean }> = [
  { href: "/dashboard/reports/finance", labelKey: "financeSubnav.overview", exact: true },
  { href: "/dashboard/reports/finance/monthly", labelKey: "financeSubnav.monthly" },
  { href: "/dashboard/reports/finance/profit", labelKey: "financeSubnav.products" },
  { href: "/dashboard/reports/finance/expenses", labelKey: "financeSubnav.expenses" },
  { href: "/dashboard/reports/finance/entries", labelKey: "financeSubnav.entries" },
];

export function FinanceSubnav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-border/60 pb-3">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname?.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-sm px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t(link.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
