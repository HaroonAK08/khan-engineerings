"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Boxes,
  Factory,
  FolderKanban,
  Handshake,
  Loader2,
  Package,
  ScrollText,
  Search,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { globalSearch, type GlobalSearchResult, type SearchHit } from "@/lib/reports-api";
import { SEARCH_PAGES, scoreSearchText } from "@/lib/search-pages";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

type SearchItem = {
  id: string;
  href: string;
  title: string;
  subtitle?: string;
  groupKey: MessageKey;
  icon: LucideIcon;
  score: number;
};

const RECORD_GROUPS: Array<{
  key: keyof GlobalSearchResult["results"];
  groupKey: MessageKey;
  icon: LucideIcon;
}> = [
  { key: "customers", groupKey: "search.customers", icon: Users },
  { key: "groups", groupKey: "search.groups", icon: FolderKanban },
  { key: "suppliers", groupKey: "search.suppliers", icon: Truck },
  { key: "orders", groupKey: "search.orders", icon: ScrollText },
  { key: "products", groupKey: "search.products", icon: Package },
  { key: "batches", groupKey: "search.batches", icon: Factory },
  { key: "purchases", groupKey: "search.purchases", icon: Boxes },
  { key: "workers", groupKey: "search.workers", icon: Banknote },
  { key: "salesmen", groupKey: "search.salesmen", icon: Handshake },
];

function toItems(
  hits: SearchHit[] | undefined,
  groupKey: MessageKey,
  icon: LucideIcon
): SearchItem[] {
  return (hits || []).slice(0, 5).map((hit) => ({
    id: `${groupKey}-${hit.id}`,
    href: hit.href,
    title: hit.label,
    subtitle: hit.meta || undefined,
    groupKey,
    icon,
    score: 74,
  }));
}

export function GlobalSearch() {
  const router = useRouter();
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [remote, setRemote] = useState<GlobalSearchResult | null>(null);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setRemote(null);
      setActive(0);
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setRemote(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      globalSearch({ q, limit: 8 })
        .then((data) => {
          if (alive) setRemote(data);
        })
        .catch(() => {
          if (alive) setRemote(null);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 220);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const items = useMemo(() => {
    const q = query.trim();
    const pages: SearchItem[] = SEARCH_PAGES.map((page) => {
      const title = t(page.labelKey);
      const score = q
        ? scoreSearchText(q, [title, page.href, ...page.keywords])
        : page.featured
          ? 1
          : 0;
      return {
        id: page.href,
        href: page.href,
        title,
        groupKey: (page.group === "reports" ? "search.reports" : "search.pages") as MessageKey,
        icon: page.icon,
        score,
      };
    }).filter((item) => (q ? item.score >= 18 : item.score > 0));

    const records: SearchItem[] = [];
    if (remote?.results) {
      for (const group of RECORD_GROUPS) {
        records.push(...toItems(remote.results[group.key], group.groupKey, group.icon));
      }
    }

    return [...pages, ...records]
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, 24);
  }, [query, remote, t]);

  useEffect(() => {
    setActive(0);
  }, [query, remote]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const grouped = useMemo(() => {
    const order: MessageKey[] = [];
    const map = new Map<MessageKey, SearchItem[]>();
    for (const item of items) {
      if (!map.has(item.groupKey)) {
        map.set(item.groupKey, []);
        order.push(item.groupKey);
      }
      map.get(item.groupKey)!.push(item);
    }
    return order.map((key) => ({ key, items: map.get(key)! }));
  }, [items]);

  const shortcut = isMac ? "⌘K" : "Ctrl K";

  return (
    <div className="flex min-w-0 flex-1 justify-end sm:justify-center">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground sm:hidden"
        onClick={() => setOpen(true)}
        aria-label={t("search.open")}
      >
        <Search className="size-4" />
      </Button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-10 w-full max-w-xl items-center gap-2 rounded-lg bg-primary px-3 text-start text-sm text-primary-foreground shadow-sm hover:bg-primary/90 sm:flex"
        aria-label={t("search.open")}
      >
        <Search className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{t("search.placeholder")}</span>
        <kbd className="font-data hidden rounded border border-primary-foreground/30 bg-primary-foreground/15 px-1.5 py-0.5 text-[10px] tracking-wide text-primary-foreground/80 lg:inline">
          {shortcut}
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[18%] w-[min(92vw,36rem)] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">{t("search.open")}</DialogTitle>
          <DialogDescription className="sr-only">{t("search.hint")}</DialogDescription>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search.placeholder")}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const item = items[active];
                  if (item) go(item.href);
                }
              }}
            />
            {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          </div>
          <div className="max-h-[min(28rem,58vh)] overflow-y-auto p-2">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {query.trim() ? t("search.empty") : t("search.hint")}
              </p>
            ) : (
              grouped.map((group) => (
                <div key={group.key} className="mb-1.5">
                  <p className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {t(group.key)}
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const index = items.indexOf(item);
                      const Icon = item.icon;
                      const selected = index === active;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onMouseEnter={() => setActive(index)}
                            onClick={() => go(item.href)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-start",
                              selected ? "bg-primary/12 text-foreground" : "hover:bg-muted/70"
                            )}
                          >
                            <Icon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{item.title}</span>
                              {item.subtitle ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {item.subtitle}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
