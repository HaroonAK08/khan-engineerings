"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import { todayInput } from "@/lib/date-range";
import { apiError, formatKg } from "@/lib/materials-api";
import { getLiveInventoryReport, type InventoryReport } from "@/lib/inventory-api";
import { downloadReportExport } from "@/lib/reports-api";
import { cn } from "@/lib/utils";

const AS_OF_STORAGE_KEY = "ke-inventory-as-of";
const MODE_STORAGE_KEY = "ke-inventory-date-mode";

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

export default function InventoryReportsHubPage() {
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
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  useEffect(() => {
    setModeState(readStoredMode());
    setAsOfState(readStoredAsOf());
    setModeHydrated(true);
  }, []);

  const hydrated = rangeHydrated && modeHydrated;

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

  function setTodayAsOf() {
    setAsOf(todayInput());
  }

  const isToday = asOf === todayInput();
  const stockAsOf = mode === "asOf" ? asOf : dateTo || todayInput();

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      if (mode === "asOf") {
        setReport(
          await getLiveInventoryReport({
            asOf,
            dateFrom: asOf,
            dateTo: asOf,
          })
        );
      } else {
        setReport(
          await getLiveInventoryReport({
            asOf: dateTo || todayInput(),
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
          })
        );
      }
    } catch (err) {
      toast.error(apiError(err, t("invReportsHub.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [asOf, dateFrom, dateTo, hydrated, mode, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function onExport(format: "pdf") {
    setExporting(format);
    try {
      if (mode === "asOf") {
        await downloadReportExport("inventory", {
          format,
          asOf,
          dateFrom: asOf,
          dateTo: asOf,
        });
      } else {
        await downloadReportExport("inventory", {
          format,
          asOf: dateTo || todayInput(),
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
      }
      toast.success(t("common.downloaded", { format: format.toUpperCase() }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("rep.invTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "asOf"
              ? t("invReportsHub.subtitleAsOf")
              : t("invReportsHub.subtitleRange")}
          </p>
        </div>
        <ExportButtons exporting={exporting} onExport={onExport} />
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
              onClick={setTodayAsOf}
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
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {[
              {
                label: t("invReportsHub.rawScrap"),
                value: `${formatKg(scrapKgOf(report))} kg`,
              },
              {
                label: t("invReportsHub.rawDaig"),
                value: `${formatKg(daigKgOf(report))} kg`,
              },
              {
                label: t("invReportsHub.finishedHub"),
                value: String(Math.round(report.finishedStock?.hubUnits ?? 0)),
              },
              {
                label: t("invReportsHub.finishedDrum"),
                value: String(Math.round(report.finishedStock?.drumUnits ?? 0)),
              },
              {
                label: t("invReportsHub.finishedTotal"),
                value: String(Math.round(report.finishedStock?.totalUnits ?? 0)),
              },
              {
                label: t("invReportsHub.lowStockSkus"),
                value: String(report.lowStock?.length ?? 0),
              },
            ].map((s) => (
              <Card key={s.label} className="py-0">
                <CardContent className="p-4">
                  <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                    {s.label}
                  </p>
                  <p className="font-data mt-1 text-xl">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">{t("dash.finishedGoods")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.product")}</TableHead>
                    <TableHead>{t("invReportsHub.type")}</TableHead>
                    <TableHead className="text-right">{t("common.qty")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report.finishedStock?.items || []).map((i) => (
                    <TableRow key={`${i.productId}-${i.warehouseId}`}>
                      <TableCell>{i.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {i.family === "drum" ? t("invReportsHub.drum") : t("invReportsHub.hub")}
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">{i.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
