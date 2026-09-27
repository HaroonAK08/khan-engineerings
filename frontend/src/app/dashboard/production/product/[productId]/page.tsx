"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, formatDate, formatKg } from "@/lib/materials-api";
import { getFinishedStock } from "@/lib/inventory-api";
import {
  getProductProductionReport,
  type ProductProductionReport,
} from "@/lib/production-api";
import { familyBadgeClass } from "@/lib/product-family";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ProductProductionDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ productId: string }>();
  const productId = params.productId;

  const [report, setReport] = useState<ProductProductionReport | null>(null);
  const [onHand, setOnHand] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const [nextReport, finished] = await Promise.all([
        getProductProductionReport(productId),
        getFinishedStock().catch(() => null),
      ]);
      setReport(nextReport);
      const qty =
        finished?.items
          ?.filter((item) => item.productId === productId)
          .reduce((sum, item) => sum + (item.quantity || 0), 0) ?? 0;
      setOnHand(qty);
    } catch (err) {
      toast.error(apiError(err, t("prodProductReport.loadFailed")));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [productId, t]);

  useEffect(() => {
    const timer = setTimeout(load, 150);
    return () => clearTimeout(timer);
  }, [load]);

  const byDate = useMemo(() => {
    if (!report) return [];
    return [...report.byDate].sort((a, b) => b.date.localeCompare(a.date));
  }, [report]);

  const runs = useMemo(() => {
    if (!report) return [];
    return [...report.runs].sort((a, b) =>
      String(b.productionDate || b.date).localeCompare(String(a.productionDate || a.date))
    );
  }, [report]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/dashboard/production"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t("prod.title")}
          </Link>
          <h1 className="text-nameplate text-xl">
            {report?.product.name || t("prodProductReport.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("prod.stockDetailDesc")}</p>
          {report?.product ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={familyBadgeClass(report.product.family)}>
                {report.product.family}
              </Badge>
              {report.product.weightKg != null && Number(report.product.weightKg) > 0 ? (
                <span className="font-data text-xs text-muted-foreground">
                  {formatKg(Number(report.product.weightKg))} kg
                </span>
              ) : null}
              <span className="font-data text-xs text-muted-foreground">
                {t("prod.col.onHand")}: {onHand}
              </span>
            </div>
          ) : null}
        </div>
        {productId ? (
          <Link
            href={`/dashboard/production/new?product=${encodeURIComponent(productId)}`}
            className={cn(buttonVariants({ variant: "default" }), "gap-2")}
          >
            <Plus className="size-4" />
            {t("prod.produceBtn")}
          </Link>
        ) : null}
      </div>

      {loading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : byDate.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <p className="text-center text-sm text-muted-foreground">{t("prod.stockDetailEmpty")}</p>
            <Link
              href={`/dashboard/production/new?product=${encodeURIComponent(productId || "")}`}
              className={cn(buttonVariants({ variant: "default" }), "gap-2")}
            >
              <Plus className="size-4" />
              {t("prod.produceBtn")}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {[
              { label: t("prodReports.runs"), value: String(report.totals.runCount) },
              { label: t("prodReports.pieces"), value: String(report.totals.pieces) },
              {
                label: t("prodReports.materialUsed"),
                value: `${formatKg(report.totals.usedKg)} kg`,
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
              <CardTitle className="text-nameplate text-sm">{t("prodProductReport.byDate")}</CardTitle>
              <CardDescription>{t("prod.stockDetailDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("prod.col.date")}</TableHead>
                    <TableHead className="text-right">{t("prodReports.runs")}</TableHead>
                    <TableHead className="text-right">{t("prod.col.qty")}</TableHead>
                    <TableHead className="text-right">{t("prod.col.usedKg")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byDate.map((row) => (
                    <TableRow key={row.date}>
                      <TableCell className="font-data text-xs">{formatDate(row.date)}</TableCell>
                      <TableCell className="font-data text-right text-xs">{row.runs}</TableCell>
                      <TableCell className="font-data text-right text-xs">{row.quantity}</TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatKg(row.usedKg)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">
                {t("prodProductReport.runDetails")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("prod.col.date")}</TableHead>
                    <TableHead className="text-right">{t("prod.col.qty")}</TableHead>
                    <TableHead className="text-right">{t("prod.col.usedKg")}</TableHead>
                    <TableHead className="text-right">{t("prod.wastePercent")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-data text-xs">
                        {formatDate(run.productionDate || run.date)}
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">{run.quantity}</TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatKg(run.usedKg)}
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {run.wastePercent}%
                      </TableCell>
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
