"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard/reports/finance", label: "Overview", exact: true },
  { href: "/dashboard/reports/finance/monthly", label: "Monthly" },
  { href: "/dashboard/reports/finance/profit", label: "Products" },
  { href: "/dashboard/reports/finance/expenses", label: "Expenses" },
  { href: "/dashboard/reports/finance/entries", label: "Entries" },
];

export function FinanceSubnav() {
  const pathname = usePathname();

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
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
