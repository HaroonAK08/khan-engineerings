"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { apiError } from "@/lib/materials-api";
import { globalSearch, type GlobalSearchResult } from "@/lib/reports-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import type { MessageKey } from "@/hooks/use-i18n";

const MODULES: Array<{ href: string; titleKey: MessageKey; descKey: MessageKey }> = [
  { href: "/dashboard/reports/sales", titleKey: "rep.salesTitle", descKey: "rep.salesDesc" },
  {
    href: "/dashboard/reports/purchases",
    titleKey: "rep.purchaseTitle",
    descKey: "rep.purchaseDesc",
  },
  {
    href: "/dashboard/reports/production",
    titleKey: "rep.prodTitle",
    descKey: "rep.prodDesc",
  },
  { href: "/dashboard/reports/costs", titleKey: "rep.expTitle", descKey: "rep.expDesc" },
  { href: "/dashboard/reports/inventory", titleKey: "rep.invTitle", descKey: "rep.invDesc" },
  { href: "/dashboard/reports/statements", titleKey: "rep.stmtTitle", descKey: "rep.stmtDesc" },
  { href: "/dashboard/reports/finance", titleKey: "rep.finTitle", descKey: "rep.finDesc" },
];

const GROUPS: Array<{ key: keyof GlobalSearchResult["results"]; label: string }> = [
  { key: "customers", label: "Customers" },
  { key: "suppliers", label: "Suppliers" },
  { key: "orders", label: "Orders" },
  { key: "purchases", label: "Purchases" },
  { key: "batches", label: "Batches" },
  { key: "products", label: "Products" },
];

export default function ReportsHubPage() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<GlobalSearchResult | null>(null);

  const runSearch = useCallback(async () => {
    if (q.trim().length < 2) {
      setResult(null);
      return;
    }
    setSearching(true);
    try {
      setResult(await globalSearch({ q: q.trim(), limit: 8 }));
    } catch (err) {
      toast.error(apiError(err, "Search failed"));
    } finally {
      setSearching(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(runSearch, 280);
    return () => clearTimeout(t);
  }, [runSearch]);

  const hitCount = result
    ? Object.values(result.results).reduce((n, arr) => n + arr.length, 0)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />

      <div>
        <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          {t("rep.eyebrow")}
        </p>
        <h1 className="text-nameplate text-xl">{t("rep.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("rep.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("rep.advanced")}</CardTitle>
          <CardDescription>{t("rep.searchPh")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("rep.typeHint")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {searching && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </div>
          )}
          {result && !searching && (
            <div className="flex flex-col gap-4">
              {hitCount === 0 ? (
                <p className="text-sm text-muted-foreground">No matches for “{result.q}”</p>
              ) : (
                GROUPS.map((g) => {
                  const items = result.results[g.key];
                  if (!items.length) return null;
                  return (
                    <div key={g.key}>
                      <p className="font-data mb-2 text-[10px] tracking-wider text-muted-foreground uppercase">
                        {g.label}
                      </p>
                      <ul className="flex flex-col gap-1">
                        {items.map((hit) => (
                          <li key={hit.id}>
                            <Link
                              href={hit.href}
                              className="flex flex-col rounded-sm border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                            >
                              <span className="font-medium">{hit.label}</span>
                              {hit.meta && (
                                <span className="font-data text-xs text-muted-foreground">
                                  {hit.meta}
                                </span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">{t(m.titleKey)}</CardTitle>
                <CardDescription>{t(m.descKey)}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
