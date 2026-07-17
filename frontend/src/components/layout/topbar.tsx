"use client";

import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "./theme-toggle";
import { NAV_ITEMS } from "./nav-items";

function currentTitle(pathname: string | null) {
  if (!pathname) return "Dashboard";
  const match = [...NAV_ITEMS].reverse().find((item) => pathname.startsWith(item.href));
  return match?.label ?? "Dashboard";
}

export function Topbar() {
  const pathname = usePathname();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-6 text-sidebar-foreground">
      <div>
        <p className="font-data text-[10px] tracking-[0.2em] text-sidebar-foreground/50">
          KHAN ENGINEERINGS / OPS
        </p>
        <h2 className="text-nameplate text-base leading-tight">{currentTitle(pathname)}</h2>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <Avatar className="size-8 border border-sidebar-border">
          <AvatarFallback className="bg-sidebar-accent font-data text-xs text-sidebar-accent-foreground">
            KE
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
