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

const MODULES = [
  {
    href: "/dashboard/reports/sales",
    title: "Sales reports",
    desc: "Revenue, outstanding invoices, top customers — Excel & PDF.",
  },
  {
    href: "/dashboard/reports/purchases",
    title: "Purchase reports",
    desc: "Scrap purchases by supplier, rates, and spend.",
  },
  {
    href: "/dashboard/reports/production",
    title: "Production reports",
    desc: "Yield, scrap use, good vs rejected units.",
  },
  {
    href: "/dashboard/reports/costs",
    title: "Expense reports",
    desc: "Stage and category manufacturing costs.",
  },
  {
    href: "/dashboard/reports/inventory",
    title: "Inventory reports",
    desc: "Raw scrap, finished goods, and low stock.",
  },
  {
    href: "/dashboard/reports/statements",
    title: "Statements",
    desc: "Customer and supplier ledger statements.",
  },
  {
    href: "/dashboard/reports/finance",
    title: "Finance & P&L",
    desc: "Profit, cash flow, product profitability.",
  },
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
          Phase 9 · Reports
        </p>
        <h1 className="text-nameplate text-xl">Reports & search</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Find historical records, filter by date, and export Excel or PDF.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">Advanced search</CardTitle>
          <CardDescription>
            Search customers, suppliers, orders, purchases, batches, and products.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Type at least 2 characters…"
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
                <CardTitle className="text-nameplate text-sm">{m.title}</CardTitle>
                <CardDescription>{m.desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
