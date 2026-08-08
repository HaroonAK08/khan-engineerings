"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { History, Loader2 } from "lucide-react";
import { InventorySubnav } from "@/components/layout/inventory-subnav";
import { DateRangeFilter } from "@/components/date-range-filter";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import { todayInput } from "@/lib/date-range";
import {
  apiError,
  createPurchase,
  formatKg,
  formatMoney,
  getPurchaseReport,
  listSuppliers,
  supplierName,
  withSameDayConfirm,
} from "@/lib/materials-api";
import { getLiveInventoryReport } from "@/lib/inventory-api";
import type { PurchaseReport, StockSummary, Supplier } from "@/types/materials";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AS_OF_STORAGE_KEY = "ke-purchases-as-of";
const MODE_STORAGE_KEY = "ke-purchases-date-mode";

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

function materialTotals(report: PurchaseReport | null, type: "scrap" | "daig") {
  const row = report?.byMaterialType?.find((m) => m.materialType === type);
  return {
    totalKg: row?.totalKg ?? 0,
    totalSpend: row?.totalSpend ?? 0,
    purchaseCount: row?.purchaseCount ?? 0,
  };
}

const purchaseSchema = z.object({
  supplier: z.string().min(1, "Supplier is required"),
  materialType: z.enum(["scrap", "daig"]),
  quantityKg: z
    .number()
    .positive("Quantity must be greater than 0")
    .refine((n) => Number.isInteger(n), "Quantity must be whole kilograms (no grams)"),
  ratePerKg: z.number().positive("Rate per kg is required"),
  purchaseDate: z.string().min(1, "Date is required"),
  invoiceNo: z.string().optional(),
  notes: z.string().optional(),
});

type PurchaseForm = z.infer<typeof purchaseSchema>;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export default function InventoryPage() {
  const { t } = useI18n();
  const asOfId = useId();
  const {
    dateFrom,
    dateTo,
    hydrated: rangeHydrated,
  } = usePersistedDateRange();
  const [stock, setStock] = useState<StockSummary | null>(null);
  const [purchaseReport, setPurchaseReport] = useState<PurchaseReport | null>(null);
  const [hubUnits, setHubUnits] = useState(0);
  const [drumUnits, setDrumUnits] = useState(0);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [mode, setModeState] = useState<DateMode>("range");
  const [asOf, setAsOfState] = useState(todayInput);
  const [modeHydrated, setModeHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setModeState(readStoredMode());
    setAsOfState(readStoredAsOf());
    setModeHydrated(true);
  }, []);

  const hydrated = rangeHydrated && modeHydrated;
  const stockAsOf = mode === "asOf" ? asOf : dateTo || todayInput();

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

  const form = useForm<PurchaseForm>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      supplier: "",
      materialType: "scrap",
      quantityKg: 0,
      ratePerKg: 0,
      purchaseDate: todayInput(),
      invoiceNo: "",
      notes: "",
    },
  });

  const qty = form.watch("quantityKg");
  const rate = form.watch("ratePerKg");
  const totalAmount = useMemo(() => {
    const qn = Number(qty);
    const r = Number(rate);
    if (!Number.isFinite(qn) || qn <= 0 || !Number.isFinite(r) || r <= 0) return 0;
    return roundMoney(qn * r);
  }, [qty, rate]);

  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => s.isActive),
    [suppliers]
  );

  const scrapPurchased = useMemo(
    () => materialTotals(purchaseReport, "scrap"),
    [purchaseReport]
  );
  const daigPurchased = useMemo(
    () => materialTotals(purchaseReport, "daig"),
    [purchaseReport]
  );

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const purchaseParams =
        mode === "asOf"
          ? { dateFrom: asOf, dateTo: asOf }
          : { dateFrom, dateTo };
      const stockDate = mode === "asOf" ? asOf : dateTo || todayInput();
      const [supplierData, reportData, inventoryAsOf] = await Promise.all([
        listSuppliers(),
        getPurchaseReport(purchaseParams),
        getLiveInventoryReport({
          asOf: stockDate,
          dateFrom: stockDate,
          dateTo: stockDate,
        }),
      ]);
      setSuppliers(supplierData);
      setPurchaseReport(reportData);
      setStock({
        material: "scrap",
        unit: "kg",
        totalKg: inventoryAsOf.raw?.totalKg ?? 0,
        availableKg: inventoryAsOf.raw?.availableKg,
        purchasedKg: inventoryAsOf.raw?.purchasedKg,
        consumedKg: inventoryAsOf.raw?.consumedKg,
        totalSpend: inventoryAsOf.raw?.totalSpend ?? 0,
        purchaseCount: inventoryAsOf.raw?.purchaseCount ?? 0,
        avgRate: inventoryAsOf.raw?.avgRate ?? 0,
        byMaterial: {
          scrap: {
            material: "scrap",
            materialType: "scrap",
            unit: "kg",
            totalKg:
              inventoryAsOf.raw?.byMaterial?.scrap?.totalKg ??
              inventoryAsOf.raw?.scrapKg ??
              inventoryAsOf.raw?.totalKg ??
              0,
            availableKg:
              inventoryAsOf.raw?.byMaterial?.scrap?.availableKg ??
              inventoryAsOf.raw?.scrapKg ??
              inventoryAsOf.raw?.availableKg ??
              0,
            totalSpend: 0,
            purchaseCount: 0,
            avgRate: 0,
          },
          daig: {
            material: "daig",
            materialType: "daig",
            unit: "kg",
            totalKg:
              inventoryAsOf.raw?.byMaterial?.daig?.totalKg ??
              inventoryAsOf.raw?.daigKg ??
              0,
            availableKg:
              inventoryAsOf.raw?.byMaterial?.daig?.availableKg ??
              inventoryAsOf.raw?.daigKg ??
              0,
            totalSpend: 0,
            purchaseCount: 0,
            avgRate: 0,
          },
        },
      });
      setHubUnits(inventoryAsOf.finishedStock?.hubUnits ?? 0);
      setDrumUnits(inventoryAsOf.finishedStock?.drumUnits ?? 0);
    } catch (err) {
      toast.error(apiError(err, "Failed to load inventory"));
    } finally {
      setLoading(false);
    }
  }, [asOf, dateFrom, dateTo, hydrated, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(values: PurchaseForm) {
    setSaving(true);
    try {
      const total = roundMoney(values.quantityKg * values.ratePerKg);
      const body = {
        supplier: values.supplier,
        materialType: values.materialType,
        quantityKg: values.quantityKg,
        ratePerKg: values.ratePerKg,
        totalAmount: total,
        purchaseDate: values.purchaseDate,
        invoiceNo: values.invoiceNo,
        notes: values.notes,
        freightAmount: 0,
        amountPaid: 0,
      };
      const { result: purchase, cancelled } = await withSameDayConfirm((confirmDuplicate) =>
        createPurchase({ ...body, confirmDuplicate })
      );
      if (cancelled || !purchase) return;
      toast.success(
        purchase.invoiceNo
          ? `Purchase saved (${purchase.invoiceNo}) — due on supplier account`
          : t("purchases.saved")
      );
      form.reset({
        supplier: values.supplier,
        materialType: values.materialType,
        quantityKg: 0,
        ratePerKg: 0,
        purchaseDate: todayInput(),
        invoiceNo: "",
        notes: "",
      });
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to record purchase"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <InventorySubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("purchases.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("purchases.title")}</h1>
        </div>
        <Link
          href="/dashboard/inventory/history"
          className={buttonVariants({
            variant: "default",
            size: "lg",
            className: "gap-2 min-w-44 px-8 text-base font-semibold shadow-sm",
          })}
        >
          <History className="size-5" />
          Inventory History
        </Link>
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
          <DateRangeFilter />
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <Button
              type="button"
              size="sm"
              variant={asOf === todayInput() ? "default" : "outline"}
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

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              {
                label: t("purchases.scrapPurchased"),
                value: purchaseReport
                  ? `${formatKg(scrapPurchased.totalKg)} kg`
                  : "—",
                hint: purchaseReport
                  ? `${t("purchases.scrapHubLabel")} · ${formatMoney(scrapPurchased.totalSpend)}`
                  : "—",
                accent: "bg-chart-1",
              },
              {
                label: t("purchases.daigPurchased"),
                value: purchaseReport
                  ? `${formatKg(daigPurchased.totalKg)} kg`
                  : "—",
                hint: purchaseReport
                  ? `${t("purchases.daigDrumLabel")} · ${formatMoney(daigPurchased.totalSpend)}`
                  : "—",
                accent: "bg-chart-2",
              },
              {
                label: t("purchases.totalPurchased"),
                value: purchaseReport
                  ? `${formatKg(purchaseReport.totals.totalKg)} kg`
                  : "—",
                hint: purchaseReport
                  ? formatMoney(purchaseReport.totals.totalSpend)
                  : "—",
                accent: "bg-chart-3",
              },
            ].map((stat) => (
              <Card key={stat.label} className="relative overflow-hidden py-0">
                <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              {
                label: t("purchases.scrapSpend"),
                value: purchaseReport ? formatMoney(scrapPurchased.totalSpend) : "—",
                hint: t("purchases.scrapHubLabel"),
                accent: "bg-chart-1",
              },
              {
                label: t("purchases.daigSpend"),
                value: purchaseReport ? formatMoney(daigPurchased.totalSpend) : "—",
                hint: t("purchases.daigDrumLabel"),
                accent: "bg-chart-2",
              },
              {
                label: t("purchases.totalSpend"),
                value: purchaseReport
                  ? formatMoney(purchaseReport.totals.totalSpend)
                  : "—",
                hint: t("purchases.allRecorded"),
                accent: "bg-chart-3",
              },
            ].map((stat) => (
              <Card key={stat.label} className="relative overflow-hidden py-0">
                <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: t("purchases.availableScrap"),
                value: stock
                  ? `${formatKg(stock.byMaterial?.scrap?.availableKg ?? stock.totalKg)} kg`
                  : "—",
                hint: t("invReportsHub.stockAsOfHint", { date: stockAsOf }),
                accent: "bg-chart-1",
              },
              {
                label: t("purchases.availableDaig"),
                value: stock?.byMaterial?.daig
                  ? `${formatKg(stock.byMaterial.daig.availableKg ?? stock.byMaterial.daig.totalKg)} kg`
                  : "—",
                hint: t("invReportsHub.stockAsOfHint", { date: stockAsOf }),
                accent: "bg-chart-2",
              },
              {
                label: t("purchases.hubOnHand"),
                value: String(Math.round(hubUnits)),
                hint: t("invReportsHub.stockAsOfHint", { date: stockAsOf }),
                accent: "bg-chart-3",
              },
              {
                label: t("purchases.drumOnHand"),
                value: String(Math.round(drumUnits)),
                hint: t("invReportsHub.stockAsOfHint", { date: stockAsOf }),
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
                  <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("purchases.recordTitle")}</CardTitle>
          <CardDescription>{t("purchases.recordDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier">{t("purchases.supplier")}</Label>
              <select
                id="supplier"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("supplier")}
              >
                <option value="">{t("purchases.selectSupplier")}</option>
                {activeSuppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {supplierName(s)}
                  </option>
                ))}
              </select>
              {form.formState.errors.supplier && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.supplier.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="materialType">{t("purchases.material")}</Label>
              <select
                id="materialType"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("materialType")}
              >
                <option value="scrap">{t("purchases.scrapHubLabel")}</option>
                <option value="daig">{t("purchases.daigDrumLabel")}</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quantityKg">{t("purchases.quantityKg")}</Label>
              <Input
                id="quantityKg"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                placeholder={t("purchases.phQuantity")}
                value={Number.isFinite(qty) && qty > 0 ? qty : ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    form.setValue("quantityKg", 0, { shouldValidate: true });
                    return;
                  }
                  const v = Math.round(Number(raw));
                  form.setValue("quantityKg", Number.isFinite(v) ? v : 0, {
                    shouldValidate: true,
                  });
                }}
              />
              {form.formState.errors.quantityKg && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.quantityKg.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ratePerKg">{t("purchases.ratePerKg")}</Label>
              <Input
                id="ratePerKg"
                type="number"
                step="0.01"
                min={0}
                placeholder={t("purchases.phRate")}
                value={Number.isFinite(rate) && rate > 0 ? rate : ""}
                onChange={(e) => {
                  const v = e.target.valueAsNumber;
                  form.setValue("ratePerKg", Number.isFinite(v) ? v : 0, {
                    shouldValidate: true,
                  });
                }}
              />
              {form.formState.errors.ratePerKg && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.ratePerKg.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="totalAmount">{t("purchases.totalAmount")}</Label>
              <Input
                id="totalAmount"
                readOnly
                tabIndex={-1}
                className="bg-muted/50"
                value={totalAmount > 0 ? totalAmount : ""}
                placeholder={t("purchases.phTotal")}
              />
              <p className="text-[11px] text-muted-foreground">
                {qty > 0 && rate > 0
                  ? t("purchases.totalCalc", {
                      qty,
                      rate: formatMoney(rate),
                      total: formatMoney(totalAmount),
                    })
                  : t("purchases.totalHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="purchaseDate">{t("purchases.purchaseDate")}</Label>
              <Input id="purchaseDate" type="date" {...form.register("purchaseDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invoiceNo">{t("purchases.invoiceOptional")}</Label>
              <Input
                id="invoiceNo"
                placeholder={t("purchases.phInvoice")}
                {...form.register("invoiceNo")}
              />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-3">
              <Label htmlFor="notes">{t("common.notes")}</Label>
              <Input id="notes" {...form.register("notes")} />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-data text-sm text-muted-foreground">
                {t("purchases.amountDue")}{" "}
                <span className="text-foreground">{formatMoney(totalAmount)}</span>
                <span className="ms-2 text-xs">{t("purchases.payLater")}</span>
              </p>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("purchases.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
