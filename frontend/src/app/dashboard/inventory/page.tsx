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
import { useI18n } from "@/hooks/use-i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function InventoryOverviewPage() {
  const { t } = useI18n();
  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await getInventoryOverview());
    } catch (err) {
      toast.error(apiError(err, t("inventory.page.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSync() {
    setSyncing(true);
    try {
      const result = await syncInventoryHistory();
      toast.success(
        t("inventory.page.synced", {
          purchases: result.purchaseSynced,
          batches: result.batchSynced,
        })
      );
      await load();
    } catch (err) {
      toast.error(apiError(err, t("inventory.page.syncFailed")));
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
            {t("inventory.page.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("inventory.page.title")}</h1>
        </div>
        <Button variant="outline" onClick={onSync} disabled={syncing} className="gap-2">
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {t("inventory.page.sync")}
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
                    {overview.alerts.count === 1
                      ? t("inventory.page.lowStockAlert", { count: overview.alerts.count })
                      : t("inventory.page.lowStockAlerts", { count: overview.alerts.count })}
                  </p>
                </div>
                <Link
                  href="/dashboard/inventory/finished"
                  className="text-sm text-primary hover:underline"
                >
                  {t("inventory.finished")}
                </Link>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                key: "raw",
                label: t("inventory.page.rawAvailable"),
                value: `${formatKg(overview.raw.availableKg ?? overview.raw.totalKg)} kg`,
                hint: overview.raw.consumedKg
                  ? t("inventory.page.rawHintUsed", {
                      in: formatKg(overview.raw.purchasedKg ?? 0),
                      used: formatKg(overview.raw.consumedKg),
                    })
                  : t("inventory.page.readyMelting"),
                href: "/dashboard/inventory/purchases",
                accent: "bg-chart-1",
              },
              {
                key: "finished",
                label: t("inventory.page.finishedGoods"),
                value: t("inventory.page.pcs", { count: overview.finished.totalUnits }),
                hint: t("inventory.page.productLines", { count: overview.finished.skuCount }),
                href: "/dashboard/inventory/finished",
                accent: "bg-chart-3",
              },
              {
                key: "spend",
                label: t("inventory.page.scrapSpend"),
                value: formatMoney(overview.raw.totalSpend),
                hint: t("inventory.page.purchasesCount", { count: overview.raw.purchaseCount }),
                href: "/dashboard/inventory/purchases",
                accent: "bg-chart-4",
              },
            ].map((stat) => (
              <Link key={stat.key} href={stat.href}>
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
                <CardTitle className="text-nameplate text-sm">
                  {t("inventory.page.rawMaterial")}
                </CardTitle>
                <CardDescription>{t("inventory.page.rawDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("inventory.page.purchased")}</span>
                  <span className="font-data">{formatKg(overview.raw.purchasedKg ?? 0)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("inventory.page.consumed")}</span>
                  <span className="font-data">{formatKg(overview.raw.consumedKg ?? 0)} kg</span>
                </div>
                <div className="flex justify-between border-t border-border pt-3 font-medium">
                  <span>{t("inventory.page.available")}</span>
                  <span className="font-data">
                    {formatKg(overview.raw.availableKg ?? overview.raw.totalKg)} kg
                  </span>
                </div>
                <Link
                  href="/dashboard/inventory/purchases"
                  className="text-sm text-primary hover:underline"
                >
                  {t("inventory.page.recordPurchase")}
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">
                  {t("inventory.page.finishedTitle")}
                </CardTitle>
                <CardDescription>{t("inventory.page.finishedDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("inventory.page.unitsOnHand")}</span>
                  <span className="font-data">{overview.finished.totalUnits}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("inventory.page.skus")}</span>
                  <span className="font-data">{overview.finished.skuCount}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-muted-foreground">{t("inventory.page.alertsLabel")}</span>
                  <Badge variant={overview.alerts.count ? "destructive" : "secondary"}>
                    {overview.alerts.count}
                  </Badge>
                </div>
                <Link
                  href="/dashboard/inventory/finished"
                  className="text-sm text-primary hover:underline"
                >
                  {t("inventory.page.viewFinished")}
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
