"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard/inventory", label: "Overview", exact: true },
  { href: "/dashboard/inventory/purchases", label: "Purchases" },
  { href: "/dashboard/inventory/finished", label: "Finished goods" },
  { href: "/dashboard/inventory/movements", label: "Movements" },
  { href: "/dashboard/inventory/alerts", label: "Alerts" },
  { href: "/dashboard/inventory/settings", label: "Settings" },
  { href: "/dashboard/inventory/reports", label: "Reports" },
];

export function InventorySubnav() {
  const pathname = usePathname();

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
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
