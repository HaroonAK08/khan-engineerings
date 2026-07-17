"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, UserRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getInitials } from "@/lib/utils-user";
import { useAuthStore } from "@/stores/auth-store";
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
import { NAV_ITEMS } from "./nav-items";
import { SidebarBrand, SidebarNav } from "./sidebar";

function currentTitle(pathname: string | null) {
  if (!pathname) return "Dashboard";
  const match = [...NAV_ITEMS]
    .filter((item) => item.ready !== false)
    .reverse()
    .find((item) => pathname.startsWith(item.href));
  return match?.label ?? "Dashboard";
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
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
      toast.success("Signed out");
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
          aria-label="Open navigation"
        >
          <Menu className="size-4" />
        </Button>
        <div className="min-w-0">
          <p className="font-data text-[10px] tracking-[0.2em] text-sidebar-foreground/50">
            KHAN ENGINEERINGS / OPS
          </p>
          <h2 className="text-nameplate truncate text-base leading-tight">
            {currentTitle(pathname)}
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
                {user?.name ?? "Account"}
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
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={loggingOut}
              variant="destructive"
              className="cursor-pointer gap-2"
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
          showCloseButton
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarBrand />
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
          <div className="border-t border-sidebar-border px-5 py-3">
            <Link
              href="/dashboard/settings"
              onClick={() => setMobileOpen(false)}
              className="font-data text-[10px] tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
            >
              BUILD v0.1.0 · PHASE 1
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
