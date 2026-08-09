"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiError, formatKg } from "@/lib/materials-api";
import { getProductionReport, listProducts } from "@/lib/production-api";
import type { Product, ProductionReport } from "@/types/production";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductSearchSelect } from "@/components/products/product-search-select";
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

export default function ProductionReportsPage() {
  const { t } = useI18n();
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();
  const [report, setReport] = useState<ProductionReport | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState("");

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const params: { dateFrom?: string; dateTo?: string; product?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (product) params.product = product;
      const [reportData, productData] = await Promise.all([
        getProductionReport(params),
        listProducts(),
      ]);
      setReport(reportData);
      setProducts(productData);
    } catch (err) {
      toast.error(apiError(err, t("prodReports.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, hydrated, product, t]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const hubProducts = useMemo(
    () => (report?.byProduct || []).filter((p) => (p.family || "hub") === "hub"),
    [report]
  );
  const drumProducts = useMemo(
    () => (report?.byProduct || []).filter((p) => p.family === "drum"),
    [report]
  );

  function renderFamilyTable(
    family: "hub" | "drum",
    rows: NonNullable<ProductionReport["byProduct"]>
  ) {
    const title = family === "hub" ? t("prod.hub") : t("prod.drum");
    const accent =
      family === "hub"
        ? "border-sky-500/30 bg-sky-500/5"
        : "border-yellow-500/30 bg-yellow-400/10";

    return (
      <Card className={accent}>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{title}</CardTitle>
          <CardDescription>{t("prodReports.byProductDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("prodReports.noProdRange")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.product")}</TableHead>
                  <TableHead className="text-right">{t("prodReports.runs")}</TableHead>
                  <TableHead className="text-right">{t("prod.scrap")}</TableHead>
                  <TableHead className="text-right">{t("prod.daig")}</TableHead>
                  <TableHead className="text-right">{t("prodReports.pieces")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.productId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {row.batchCount}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatKg(row.scrapKg ?? 0)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatKg(row.daigKg ?? 0)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {row.goodUnits}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/production"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {t("prod.title")}
        </Link>
        <h1 className="text-nameplate text-xl">{t("prodReports.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("prodReports.subtitle")}</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 p-4">
          <DateRangeFilter />
          <ProductSearchSelect
            products={products}
            value={product}
            onChange={setProduct}
            placeholder={t("prodReports.allProducts")}
            emptyLabel={t("prodReports.allProducts")}
            showWeight
            showFamily
          />
        </CardContent>
      </Card>

      {loading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              {
                label: t("prodReports.materialUsed"),
                value: `${formatKg(report.totals.netConsumedKg ?? report.totals.totalInputKg ?? 0)} kg`,
                hint: t("prodReports.scrapDaigHint"),
                accent: "bg-chart-5",
              },
              {
                label: t("prod.scrap"),
                value: `${formatKg(report.totals.byMaterial?.scrap ?? report.totals.scrapKg ?? 0)} kg`,
                hint: t("prodReports.materialUsed").toLowerCase(),
                accent: "bg-chart-1",
              },
              {
                label: t("prod.daig"),
                value: `${formatKg(report.totals.byMaterial?.daig ?? report.totals.daigKg ?? 0)} kg`,
                hint: t("prodReports.materialUsed").toLowerCase(),
                accent: "bg-chart-2",
              },
              {
                label: t("prod.calcWaste"),
                value: `${formatKg(report.totals.materialLossKg ?? report.totals.wasteKg)} kg`,
                hint: t("prodReports.ofInput", { pct: report.totals.lossRate ?? 0 }),
                accent: "bg-chart-4",
              },
              {
                label: t("prodReports.piecesProduced"),
                value: String(report.totals.finishedUnits ?? report.totals.goodUnits),
                hint: t("prodReports.runsHint", { count: report.totals.batchCount }),
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

          {renderFamilyTable("hub", hubProducts)}
          {renderFamilyTable("drum", drumProducts)}
        </>
      )}
    </div>
  );
}
