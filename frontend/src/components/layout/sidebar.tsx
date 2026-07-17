"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { NAV_ITEMS } from "./nav-items";

type SidebarNavProps = {
  onNavigate?: () => void;
  className?: string;
};

export function SidebarNav({ onNavigate, className }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <ScrollArea className={cn("flex-1 px-3 py-4", className)}>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const ready = item.ready !== false;
          const active =
            ready &&
            (item.href === "/dashboard"
              ? pathname === item.href
              : pathname?.startsWith(item.href));
          const Icon = item.icon;

          if (!ready) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 rounded-sm border-l-2 border-transparent px-3 py-2 text-sm text-sidebar-foreground/35"
                title="Coming in a later phase"
              >
                <Icon className="size-4 shrink-0 opacity-50" />
                <span className="flex-1">{item.label}</span>
                <Badge
                  variant="secondary"
                  className="font-data h-4 border-0 bg-sidebar-accent/50 px-1.5 text-[9px] tracking-wider text-sidebar-foreground/40"
                >
                  SOON
                </Badge>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-sm border-l-2 border-transparent px-3 py-2 text-sm transition-colors",
                active
                  ? "border-primary bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:border-sidebar-foreground/20 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  active
                    ? "text-primary"
                    : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </ScrollArea>
  );
}

export function SidebarBrand() {
  return (
    <div className="border-b border-sidebar-border px-5 py-5">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-2 rounded-full bg-primary animate-status-pulse" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        <span className="font-data text-[10px] tracking-[0.2em] text-sidebar-foreground/60">
          SYSTEM ONLINE
        </span>
      </div>
      <h1 className="text-nameplate mt-2 text-2xl leading-none text-sidebar-foreground">
        Khan
        <br />
        Engineerings
      </h1>
      <div className="mt-2 h-px w-10 bg-primary" />
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden h-svh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[4px_0_24px_-12px_rgba(0,0,0,0.08)] md:flex">
      <SidebarBrand />
      <SidebarNav />
      <div className="border-t border-sidebar-border px-5 py-3">
        <p className="font-data text-[10px] tracking-widest text-sidebar-foreground/40">
          BUILD v0.1.0 &middot; PHASE 1
        </p>
      </div>
    </aside>
  );
}
