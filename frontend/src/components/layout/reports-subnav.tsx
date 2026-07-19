"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import type { MessageKey } from "@/hooks/use-i18n";

const LINKS: Array<{ href: string; labelKey: MessageKey; exact?: boolean }> = [
  { href: "/dashboard/reports", labelKey: "rep.nav.hub", exact: true },
  { href: "/dashboard/reports/sales", labelKey: "rep.nav.sales" },
  { href: "/dashboard/reports/purchases", labelKey: "rep.nav.purchases" },
  { href: "/dashboard/reports/production", labelKey: "rep.nav.production" },
  { href: "/dashboard/reports/costs", labelKey: "rep.nav.expenses" },
  { href: "/dashboard/reports/inventory", labelKey: "rep.nav.inventory" },
  { href: "/dashboard/reports/statements", labelKey: "rep.nav.statements" },
  { href: "/dashboard/reports/finance", labelKey: "rep.nav.finance" },
];

export function ReportsSubnav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-border pb-3">
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
