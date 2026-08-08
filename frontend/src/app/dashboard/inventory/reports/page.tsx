"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { InventorySubnav } from "@/components/layout/inventory-subnav";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, formatDate, formatKg, formatMoney, getPurchaseReport } from "@/lib/materials-api";
import { getLiveInventoryReport, type InventoryReport } from "@/lib/inventory-api";
import type { PurchaseReport } from "@/types/materials";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import { todayInput } from "@/lib/date-range";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const AS_OF_STORAGE_KEY = "ke-inv-module-as-of";
const MODE_STORAGE_KEY = "ke-inv-module-date-mode";

type DateMode = "range" | "asOf";

function readStoredAsOf() {
  if (typeof window === "undefined") return todayInput();
  try {
    const stored = localStorage.getItem(AS_OF_STORAGE_KEY);
    if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  } catch {
    // ignore
  }
  return todayInput();
}

function readStoredMode(): DateMode {
  if (typeof window === "undefined") return "range";
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    if (stored === "asOf" || stored === "range") return stored;
  } catch {
    // ignore
  }
  return "range";
}

function scrapKgOf(report: InventoryReport) {
  return (
    report.raw?.scrapKg ??
    report.raw?.byMaterial?.scrap?.availableKg ??
    report.raw?.availableKg ??
    report.raw?.totalKg ??
    0
  );
}

function daigKgOf(report: InventoryReport) {
  return report.raw?.daigKg ?? report.raw?.byMaterial?.daig?.availableKg ?? 0;
}

function materialRow(report: PurchaseReport | null, type: "scrap" | "daig") {
  return report?.byMaterialType?.find((m) => m.materialType === type);
}

export default function InventoryReportsPage() {
  const { t } = useI18n();
  const id = useId();
  const fromId = `${id}-from`;
  const toId = `${id}-to`;
  const asOfId = `${id}-asof`;

  const {
    dateFrom,
    dateTo,
    hydrated: rangeHydrated,
    setDateFrom,
    setDateTo,
    setThisMonth,
    isThisMonth,
  } = usePersistedDateRange();

  const [mode, setModeState] = useState<DateMode>("range");
  const [asOf, setAsOfState] = useState(todayInput);
  const [modeHydrated, setModeHydrated] = useState(false);
  const [report, setReport] = useState<InventoryReport | null>(null);
  const [purchaseReport, setPurchaseReport] = useState<PurchaseReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setModeState(readStoredMode());
    setAsOfState(readStoredAsOf());
    setModeHydrated(true);
  }, []);

  const hydrated = rangeHydrated && modeHydrated;
  const stockAsOf = mode === "asOf" ? asOf : dateTo || todayInput();
  const isToday = asOf === todayInput();

  function setMode(next: DateMode) {
    setModeState(next);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  function setAsOf(value: string) {
    setAsOfState(value);
    try {
      localStorage.setItem(AS_OF_STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const purchaseParams =
        mode === "asOf"
          ? { dateFrom: asOf, dateTo: asOf }
          : {
              ...(dateFrom ? { dateFrom } : {}),
              ...(dateTo ? { dateTo } : {}),
            };
      const liveParams =
        mode === "asOf"
          ? { asOf, dateFrom: asOf, dateTo: asOf }
          : {
              asOf: dateTo || todayInput(),
              ...(dateFrom ? { dateFrom } : {}),
              ...(dateTo ? { dateTo } : {}),
            };
      const [live, purchases] = await Promise.all([
        getLiveInventoryReport(liveParams),
        getPurchaseReport(purchaseParams),
      ]);
      setReport(live);
      setPurchaseReport(purchases);
    } catch (err) {
      toast.error(apiError(err, "Failed to load reports"));
    } finally {
      setLoading(false);
    }
  }, [asOf, dateFrom, dateTo, hydrated, mode]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  const scrapPurchased = materialRow(purchaseReport, "scrap");
  const daigPurchased = materialRow(purchaseReport, "daig");

  return (
    <div className="flex flex-col gap-6">
      <InventorySubnav />
      <div>
        <h1 className="text-nameplate text-xl">{t("invReports.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "asOf"
            ? t("invReportsHub.subtitleAsOf")
            : t("invReportsHub.subtitleRange")}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "range" ? "default" : "outline"}
            onClick={() => setMode("range")}
          >
            {t("invReportsHub.modeRange")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "asOf" ? "default" : "outline"}
            onClick={() => setMode("asOf")}
          >
            {t("invReportsHub.modeAsOf")}
          </Button>
        </div>

        {mode === "range" ? (
          <div className="flex flex-wrap items-end gap-2">
            <Button
              type="button"
              size="sm"
              variant={isThisMonth ? "default" : "outline"}
              onClick={setThisMonth}
            >
              {t("common.thisMonth")}
            </Button>
            <div className="grid gap-1.5">
              <Label htmlFor={fromId}>{t("common.from")}</Label>
              <Input
                id={fromId}
                type="date"
                className="w-auto"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={toId}>{t("common.to")}</Label>
              <Input
                id={toId}
                type="date"
                className="w-auto"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <p className={cn("pb-2 text-xs text-muted-foreground")}>
              {t("invReportsHub.stockAsOfHint", { date: stockAsOf })}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <Button
              type="button"
              size="sm"
              variant={isToday ? "default" : "outline"}
              onClick={() => setAsOf(todayInput())}
            >
              {t("common.today")}
            </Button>
            <div className="grid gap-1.5">
              <Label htmlFor={asOfId}>{t("invReportsHub.asOf")}</Label>
              <Input
                id={asOfId}
                type="date"
                className="w-auto"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {loading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: t("invReportsHub.rawScrap"),
                value: `${formatKg(scrapKgOf(report))} kg`,
                accent: "bg-chart-1",
              },
              {
                label: t("invReportsHub.rawDaig"),
                value: `${formatKg(daigKgOf(report))} kg`,
                accent: "bg-chart-2",
              },
              {
                label: t("invReportsHub.finishedHub"),
                value: `${Math.round(report.finishedStock.hubUnits ?? 0)} pcs`,
                accent: "bg-chart-3",
              },
              {
                label: t("invReportsHub.finishedDrum"),
                value: `${Math.round(report.finishedStock.drumUnits ?? 0)} pcs`,
                accent: "bg-chart-4",
              },
            ].map((stat) => (
              <Card key={stat.label} className="relative overflow-hidden py-0">
                <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
                <CardContent className="p-5">
                  <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="font-data mt-2 text-2xl font-medium">{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: t("purchases.scrapPurchased"),
                value: `${formatKg(scrapPurchased?.totalKg ?? 0)} kg`,
                hint: formatMoney(scrapPurchased?.totalSpend ?? 0),
              },
              {
                label: t("purchases.daigPurchased"),
                value: `${formatKg(daigPurchased?.totalKg ?? 0)} kg`,
                hint: formatMoney(daigPurchased?.totalSpend ?? 0),
              },
              {
                label: t("purchases.totalPurchased"),
                value: `${formatKg(purchaseReport?.totals.totalKg ?? 0)} kg`,
                hint: formatMoney(purchaseReport?.totals.totalSpend ?? 0),
              },
              {
                label: t("invReportsHub.finishedTotal"),
                value: `${report.finishedStock.totalUnits} pcs`,
                hint: `${report.lowStock.length} low SKUs`,
              },
            ].map((stat) => (
              <Card key={stat.label} className="py-0">
                <CardContent className="p-5">
                  <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="font-data mt-2 text-2xl font-medium">{stat.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Produced this period</CardTitle>
              <CardDescription>
                {formatDate(report.period.from)} → {formatDate(report.period.to)} ·{" "}
                {report.producedThisPeriod.totals.batchCount} batches
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.producedThisPeriod.byProduct.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No production in this period
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Batches</TableHead>
                      <TableHead className="text-right">Good</TableHead>
                      <TableHead className="text-right">Reject</TableHead>
                      <TableHead className="text-right">Scrap used</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.producedThisPeriod.byProduct.map((row) => (
                      <TableRow key={String(row.productId)}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.batchCount}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.goodUnits}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {row.rejectedUnits}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatKg(row.netConsumedKg)} kg
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {report.lowStock.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Running low</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {report.lowStock.map((item) => (
                  <Badge key={`${item.productId}-${item.warehouseId}`} variant="destructive">
                    {item.name}: {item.quantity}/{item.lowStockThreshold}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          {purchaseReport && (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">Purchases (period)</CardTitle>
                <CardDescription>
                  Scrap {formatKg(scrapPurchased?.totalKg ?? 0)} kg ·{" "}
                  {formatMoney(scrapPurchased?.totalSpend ?? 0)} · Daig{" "}
                  {formatKg(daigPurchased?.totalKg ?? 0)} kg ·{" "}
                  {formatMoney(daigPurchased?.totalSpend ?? 0)} · Total{" "}
                  {formatKg(purchaseReport.totals.totalKg)} kg ·{" "}
                  {formatMoney(purchaseReport.totals.totalSpend)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/dashboard/inventory" className="text-sm text-primary hover:underline">
                  Open purchases →
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
