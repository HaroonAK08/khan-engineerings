"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getInitials } from "@/lib/utils-user";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/hooks/use-i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";
import { LanguageToggle } from "./language-toggle";
import { NAV_ITEMS } from "./nav-items";
import { SidebarBrand, SidebarNav } from "./sidebar";

function currentTitleKey(pathname: string | null): MessageKey {
  if (!pathname) return "nav.dashboard";

  for (const item of [...NAV_ITEMS].filter((i) => i.ready !== false).reverse()) {
    if (item.children?.length) {
      const child = [...item.children]
        .reverse()
        .find((c) => pathname === c.href || pathname.startsWith(`${c.href}/`));
      if (child) return child.labelKey;
    }
    if (item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href)) {
      return item.labelKey;
    }
  }
  return "nav.dashboard";
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t, isUrdu } = useI18n();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api.post("/auth/logout");
    } catch {
      // clear local session even if the request fails
    } finally {
      clear();
      setLoggingOut(false);
      toast.success(t("topbar.signedOut"));
      router.replace("/");
    }
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-sidebar-foreground md:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label={t("topbar.openNav")}
        >
          <Menu className="size-4" />
        </Button>
        <div className="min-w-0">
          <p className="font-data text-[10px] tracking-[0.2em] text-sidebar-foreground/50">
            {t("topbar.ops")}
          </p>
          <h2 className="text-nameplate truncate text-base leading-tight">
            {t(currentTitleKey(pathname))}
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {user && (
          <Badge
            variant="secondary"
            className="font-data hidden h-6 border-0 bg-sidebar-accent px-2 text-[10px] tracking-wider uppercase text-sidebar-accent-foreground sm:inline-flex"
          >
            {user.role}
          </Badge>
        )}
        <LanguageToggle />
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Account menu"
          >
            <Avatar className="size-8 border border-sidebar-border">
              <AvatarFallback className="bg-sidebar-accent font-data text-xs text-sidebar-accent-foreground">
                {user ? getInitials(user.name) : "—"}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.name ?? t("topbar.account")}
              </p>
              <p className="font-data truncate text-[11px] text-muted-foreground">
                {user?.email}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/dashboard/profile")}
              className="cursor-pointer gap-2"
            >
              <UserRound className="size-4" />
              {t("topbar.profile")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={loggingOut}
              variant="destructive"
              className="cursor-pointer gap-2"
            >
              <LogOut className="size-4" />
              {t("topbar.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side={isUrdu ? "right" : "left"}
          className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
          showCloseButton
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("topbar.openNav")}</SheetTitle>
          </SheetHeader>
          <SidebarBrand />
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
          <div className="border-t border-sidebar-border px-5 py-3">
            <Link
              href="/dashboard/settings"
              onClick={() => setMobileOpen(false)}
              className="font-data text-[10px] tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
            >
              {t("brand.build")}
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
