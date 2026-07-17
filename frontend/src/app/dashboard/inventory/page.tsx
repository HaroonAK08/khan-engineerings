"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { InventorySubnav } from "@/components/layout/inventory-subnav";
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";
import {
  getInventoryOverview,
  syncInventoryHistory,
  type InventoryOverview,
} from "@/lib/inventory-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function InventoryOverviewPage() {
  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await getInventoryOverview());
    } catch (err) {
      toast.error(apiError(err, "Failed to load inventory"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onSync() {
    setSyncing(true);
    try {
      const result = await syncInventoryHistory();
      toast.success(
        `Synced ${result.purchaseSynced} purchases, ${result.batchSynced} batches`
      );
      await load();
    } catch (err) {
      toast.error(apiError(err, "Sync failed"));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <InventorySubnav />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            Live stock · Phase 5
          </p>
          <h1 className="text-nameplate text-xl">Inventory</h1>
        </div>
        <Button variant="outline" onClick={onSync} disabled={syncing} className="gap-2">
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Sync history
        </Button>
      </div>

      {loading || !overview ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {overview.alerts.count > 0 && (
            <Card className="border-destructive/40">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-destructive" />
                  <p className="text-sm">
                    <span className="font-medium">{overview.alerts.count}</span> low stock alert
                    {overview.alerts.count === 1 ? "" : "s"}
                  </p>
                </div>
                <Link
                  href="/dashboard/inventory/alerts"
                  className="text-sm text-primary hover:underline"
                >
                  View alerts
                </Link>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Raw scrap available",
                value: `${formatKg(overview.raw.availableKg ?? overview.raw.totalKg)} kg`,
                hint: overview.raw.consumedKg
                  ? `${formatKg(overview.raw.purchasedKg ?? 0)} in − ${formatKg(overview.raw.consumedKg)} used`
                  : "ready for melting",
                href: "/dashboard/inventory/purchases",
                accent: "bg-chart-1",
              },
              {
                label: "Finished goods",
                value: `${overview.finished.totalUnits} pcs`,
                hint: `${overview.finished.skuCount} product lines`,
                href: "/dashboard/inventory/finished",
                accent: "bg-chart-3",
              },
              {
                label: "Stock movements",
                value: String(overview.movementCount),
                hint: "in / out ledger",
                href: "/dashboard/inventory/movements",
                accent: "bg-chart-2",
              },
              {
                label: "Scrap spend",
                value: formatMoney(overview.raw.totalSpend),
                hint: `${overview.raw.purchaseCount} purchases`,
                href: "/dashboard/inventory/purchases",
                accent: "bg-chart-4",
              },
            ].map((stat) => (
              <Link key={stat.label} href={stat.href}>
                <Card className="relative h-full overflow-hidden py-0 transition-colors hover:border-primary/40">
                  <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
                  <CardContent className="p-5">
                    <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                      {stat.label}
                    </p>
                    <p className="font-data mt-2 text-2xl font-medium">{stat.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Raw material</CardTitle>
                <CardDescription>Scrap stock tracks purchases minus production use.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Purchased</span>
                  <span className="font-data">{formatKg(overview.raw.purchasedKg ?? 0)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Consumed</span>
                  <span className="font-data">{formatKg(overview.raw.consumedKg ?? 0)} kg</span>
                </div>
                <div className="flex justify-between border-t border-border pt-3 font-medium">
                  <span>Available</span>
                  <span className="font-data">
                    {formatKg(overview.raw.availableKg ?? overview.raw.totalKg)} kg
                  </span>
                </div>
                <Link
                  href="/dashboard/inventory/purchases"
                  className="text-sm text-primary hover:underline"
                >
                  Record purchase →
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Finished goods</CardTitle>
                <CardDescription>
                  Good units from production land in warehouse stock automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Units on hand</span>
                  <span className="font-data">{overview.finished.totalUnits}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SKUs</span>
                  <span className="font-data">{overview.finished.skuCount}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-muted-foreground">Alerts</span>
                  <Badge variant={overview.alerts.count ? "destructive" : "secondary"}>
                    {overview.alerts.count}
                  </Badge>
                </div>
                <Link
                  href="/dashboard/inventory/finished"
                  className="text-sm text-primary hover:underline"
                >
                  View finished stock →
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
