"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/hooks/use-i18n";
import { NAV_ITEMS, type NavItem } from "./nav-items";

type SidebarNavProps = {
  onNavigate?: () => void;
  className?: string;
};

function isItemActive(item: NavItem, pathname: string | null) {
  if (!pathname || item.ready === false) return false;
  if (item.href === "/dashboard") return pathname === item.href;
  return pathname.startsWith(item.href);
}

function isChildActive(href: string, pathname: string | null) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ onNavigate, className }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const activePath = pendingHref ?? pathname;

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const item of NAV_ITEMS) {
      if (item.children?.length && isItemActive(item, pathname)) {
        next[item.href] = true;
      }
    }
    if (Object.keys(next).length) {
      setOpenMenus((prev) => ({ ...prev, ...next }));
    }
  }, [pathname]);

  useEffect(() => {
    for (const item of NAV_ITEMS) {
      if (item.ready === false) continue;
      if (item.children?.length) {
        for (const child of item.children) {
          router.prefetch(child.href);
        }
      }
      router.prefetch(item.href);
    }
  }, [router]);

  function toggleMenu(href: string) {
    setOpenMenus((prev) => ({ ...prev, [href]: !prev[href] }));
  }

  function goTo(href: string) {
    if (href === pathname) {
      onNavigate?.();
      return;
    }
    setPendingHref(href);
    onNavigate?.();
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <div className={cn("flex-1 overflow-y-auto px-3 py-4", className)}>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const ready = item.ready !== false;
          const active = isItemActive(item, activePath);
          const Icon = item.icon;
          const hasChildren = Boolean(item.children?.length);
          const expanded = hasChildren && (openMenus[item.href] ?? active);
          const label = t(item.labelKey);

          if (!ready) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 rounded-sm border-s-2 border-transparent px-3 py-2.5 text-base text-sidebar-foreground/35"
                title={t("common.comingSoon")}
              >
                <Icon className="size-4 shrink-0 opacity-50" />
                <span className="flex-1">{label}</span>
                <Badge
                  variant="secondary"
                  className="font-data h-4 border-0 bg-sidebar-accent/50 px-1.5 text-[9px] tracking-wider text-sidebar-foreground/40"
                >
                  {t("nav.soon")}
                </Badge>
              </div>
            );
          }

          if (hasChildren) {
            const defaultChildHref = item.children![0]?.href ?? item.href;
            return (
              <div key={item.href} className="flex flex-col gap-0.5">
                <div
                  className={cn(
                    "group flex w-full items-center gap-1 rounded-sm border-s-2 border-transparent text-base",
                    active
                      ? "border-primary bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:border-sidebar-foreground/20 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => goTo(defaultChildHref)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-start"
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active
                          ? "text-primary"
                          : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
                      )}
                    />
                    <span className="truncate">{label}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
                    onClick={() => toggleMenu(item.href)}
                    className="me-1 rounded-sm p-1.5 text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  >
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 transition-transform duration-150",
                        expanded && "rotate-180"
                      )}
                    />
                  </button>
                </div>
                {expanded && (
                  <div className="ms-4 flex flex-col gap-0.5 border-s border-sidebar-border ps-2">
                    {item.children!.map((child) => {
                      const childActive = isChildActive(child.href, activePath);
                      const ChildIcon = child.icon;
                      return (
                        <button
                          key={child.href}
                          type="button"
                          onClick={() => goTo(child.href)}
                          className={cn(
                            "flex items-center gap-2 rounded-sm px-3 py-2 text-start text-base",
                            childActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                          )}
                        >
                          {ChildIcon ? (
                            <ChildIcon
                              className={cn(
                                "size-3.5 shrink-0",
                                childActive ? "text-primary" : "opacity-60"
                              )}
                            />
                          ) : null}
                          {t(child.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={item.href}
              type="button"
              onClick={() => goTo(item.href)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-sm border-s-2 border-transparent px-3 py-2.5 text-start text-base",
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
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function SidebarBrand() {
  const { t } = useI18n();

  return (
    <div className="border-b border-sidebar-border px-5 py-5">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-2 rounded-full bg-primary animate-status-pulse" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        <span className="font-data text-[10px] tracking-[0.2em] text-sidebar-foreground/60">
          {t("brand.systemOnline")}
        </span>
      </div>
      <h1 className="text-nameplate mt-2 text-2xl leading-none text-sidebar-foreground">
        {t("brand.khan")}
        <br />
        {t("brand.engineerings")}
      </h1>
      <div className="mt-2 h-px w-10 bg-primary" />
    </div>
  );
}

export function Sidebar() {
  const { t } = useI18n();

  return (
    <aside className="hidden h-svh w-72 shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[4px_0_24px_-12px_rgba(0,0,0,0.08)] md:flex">
      <SidebarBrand />
      <SidebarNav />
      <div className="border-t border-sidebar-border px-5 py-3">
        <p className="font-data text-[10px] tracking-widest text-sidebar-foreground/40">
          {t("brand.build")}
        </p>
      </div>
    </aside>
  );
}
