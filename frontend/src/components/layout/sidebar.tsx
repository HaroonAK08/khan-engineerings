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

function isChildActive(href: string, pathname: string | null, exact?: boolean) {
  if (!pathname) return false;
  if (exact) return pathname === href;
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
    <div className={cn("flex-1 overflow-y-auto px-2 py-3", className)}>
      <nav className="flex flex-col gap-0.5">
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
                className="flex items-center gap-2.5 rounded-sm border-s-2 border-transparent px-2.5 py-2 text-sm text-sidebar-foreground/35"
                title={t("common.comingSoon")}
              >
                <Icon className="size-4 shrink-0 opacity-50" />
                <span className="flex-1 truncate">{label}</span>
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
                    "group flex w-full items-center gap-1 rounded-sm border-s-2 border-transparent text-sm",
                    active
                      ? "border-primary bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:border-sidebar-foreground/20 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => goTo(defaultChildHref)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-start"
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
                  <div className="ms-3 flex flex-col gap-0.5 border-s border-sidebar-border ps-2">
                    {item.children!.map((child) => {
                      const childActive = isChildActive(child.href, activePath, child.exact);
                      const ChildIcon = child.icon;
                      return (
                        <button
                          key={child.href}
                          type="button"
                          onClick={() => goTo(child.href)}
                          className={cn(
                            "flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-start text-sm",
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
                "group flex w-full items-center gap-2.5 rounded-sm border-s-2 border-transparent px-2.5 py-2 text-start text-sm",
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
              <span className="truncate">{label}</span>
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
    <div className="border-b border-sidebar-border px-3 py-4">
      <div className="flex items-center gap-2.5">
        <img
          src="/logo.png"
          alt={t("brand.khan")}
          className="size-9 shrink-0 rounded-lg object-contain"
        />
        <h1 className="text-nameplate text-base leading-snug text-sidebar-foreground">
          {t("brand.khan")}
          <br />
          {t("brand.engineerings")}
        </h1>
      </div>
      <div className="mt-2.5 h-px w-8 bg-primary" />
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden h-svh w-56 shrink-0 flex-col border-e border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[4px_0_24px_-12px_rgba(0,0,0,0.08)] md:flex lg:w-60">
      <SidebarBrand />
      <SidebarNav />
      <div className="border-t border-sidebar-border px-3 py-3">
      </div>
    </aside>
  );
}
