"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  ReportViewToggle,
  type ReportViewMode,
} from "@/components/reports/report-view-toggle";
import { apiError, formatDate, formatMoney, listSuppliers } from "@/lib/materials-api";
import {
  downloadReportExport,
  getPaidReport,
  type PaidReport,
} from "@/lib/reports-api";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";

export default function PaidReportPage() {
  const { t } = useI18n();
  const { dateFrom, dateTo, hydrated, isAll } = usePersistedDateRange();
  const [supplierId, setSupplierId] = useState("");
  const [view, setView] = useState<ReportViewMode>("party");
  const [suppliers, setSuppliers] = useState<Array<{ _id: string; name: string }>>([]);
  const [report, setReport] = useState<PaidReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  useEffect(() => {
    listSuppliers({ active: "true" })
      .then((list) => setSuppliers(list.map((s) => ({ _id: s._id, name: s.name }))))
      .catch(() => setSuppliers([]));
  }, []);

  const supplierSelectItems = useMemo(() => {
    const items: Record<string, string> = {
      __all__: t("paidReports.allSuppliers"),
    };
    for (const s of suppliers) items[s._id] = s.name;
    return items;
  }, [suppliers, t]);

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const params: { dateFrom?: string; dateTo?: string; supplierId?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (supplierId) params.supplierId = supplierId;
      setReport(await getPaidReport(params));
    } catch (err) {
      toast.error(apiError(err, t("paidReports.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, hydrated, supplierId, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function onExport(format: "pdf") {
    setExporting(format);
    try {
      await downloadReportExport("paid", {
        format,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        supplierId: supplierId || undefined,
        view: supplierId ? "party" : view,
      });
      toast.success(t("common.downloaded", { format: format.toUpperCase() }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setExporting(null);
    }
  }

  function openSupplier(s: { partyId: string; name: string }) {
    if (!s.partyId) return;
    setSupplierId(s.partyId);
    setView("party");
  }

  function backToSuppliers() {
    setSupplierId("");
    setView("party");
  }

  const drilledSupplier = Boolean(supplierId);
  const leftFor = (n: number) => Math.max(0, n || 0);

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("rep.paidTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("paidReports.subtitle")}</p>
        </div>
        <ExportButtons exporting={exporting} onExport={onExport} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <DateRangeFilter showAll />
        <div className="grid gap-1.5">
          <Label className="sr-only">{t("paidReports.supplier")}</Label>
          <Select
            value={supplierId || "__all__"}
            onValueChange={(v) => {
              setSupplierId(!v || v === "__all__" ? "" : v);
            }}
            items={supplierSelectItems}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("paidReports.allSuppliers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{supplierSelectItems.__all__}</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s._id} value={s._id}>
                  {supplierSelectItems[s._id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ReportViewToggle
        value={view}
        onChange={(next) => {
          if (next !== "party") setSupplierId("");
          setView(next);
        }}
        modes={["whole", "party", "totals"]}
      />

      {drilledSupplier ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={backToSuppliers}>
            {t("paidReports.backToSuppliers")}
          </Button>
          <p className="text-sm text-muted-foreground">
            {report?.party?.name || t("paidReports.supplier")}
          </p>
          {report?.party?.id ? (
            <Link
              href={`/dashboard/suppliers/${report.party.id}`}
              className="text-sm text-primary hover:underline"
            >
              {t("paidReports.openSupplierPage")}
            </Link>
          ) : null}
        </div>
      ) : null}

      {loading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-nameplate text-sm">{t("paidReports.overall")}</CardTitle>
              <CardDescription>
                {isAll ? t("paidReports.allDates") : `${dateFrom || "…"} → ${dateTo || "…"}`}
                {report.party ? ` · ${report.party.name}` : ` · ${t("paidReports.allSuppliers")}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: t("paidReports.total"),
                    value: formatMoney(report.totals.totalPaid),
                    emphasize: true as const,
                  },
                  {
                    label: t("paidReports.left"),
                    value: formatMoney(report.totals.totalLeft),
                    left: true as const,
                  },
                  {
                    label: t("paidReports.suppliers"),
                    value: String(report.totals.supplierCount),
                  },
                  {
                    label: t("paidReports.payments"),
                    value: String(report.totals.recordCount),
                  },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-border/70 px-4 py-3">
                    <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                      {s.label}
                    </p>
                    <p
                      className={`font-data mt-1 text-xl ${
                        "emphasize" in s && s.emphasize
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "left" in s && s.left
                            ? "text-destructive"
                            : ""
                      }`}
                    >
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {view === "party" && !drilledSupplier ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">{t("paidReports.bySupplier")}</CardTitle>
                <CardDescription>{t("paidReports.clickSupplier")}</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("paidReports.supplier")}</TableHead>
                      <TableHead className="text-right">{t("paidReports.payments")}</TableHead>
                      <TableHead className="text-right">{t("paidReports.partyTotal")}</TableHead>
                      <TableHead className="text-right">{t("paidReports.partyLeft")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.bySupplier.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          {t("paidReports.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.bySupplier.map((s) => (
                        <TableRow
                          key={s.partyId || s.name}
                          tabIndex={0}
                          className="cursor-pointer"
                          onClick={() => openSupplier(s)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openSupplier(s);
                            }
                          }}
                        >
                          <TableCell className="font-medium text-primary underline-offset-2 hover:underline">
                            {s.name}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {s.recordCount}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs text-emerald-700 dark:text-emerald-400">
                            {formatMoney(s.amount)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs text-destructive">
                            {formatMoney(leftFor(s.balance))}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {report.bySupplier.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-medium">{t("paidReports.grandTotal")}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {report.totals.recordCount}
                        </TableCell>
                        <TableCell className="font-data text-right text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          {formatMoney(report.totals.totalPaid)}
                        </TableCell>
                        <TableCell className="font-data text-right text-sm font-medium text-destructive">
                          {formatMoney(report.totals.totalLeft)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {view === "totals" && !drilledSupplier ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">{t("paidReports.totalsOnly")}</CardTitle>
                <CardDescription>{t("paidReports.totalsOnlyHint")}</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("paidReports.supplier")}</TableHead>
                      <TableHead className="text-right">{t("paidReports.partyTotal")}</TableHead>
                      <TableHead className="text-right">{t("paidReports.partyLeft")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.bySupplier.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground">
                          {t("paidReports.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.bySupplier.map((s) => (
                        <TableRow key={s.partyId || s.name}>
                          <TableCell className="font-medium">
                            {s.partyId ? (
                              <Link
                                href={`/dashboard/suppliers/${s.partyId}`}
                                className="text-primary hover:underline"
                              >
                                {s.name}
                              </Link>
                            ) : (
                              s.name
                            )}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs text-emerald-700 dark:text-emerald-400">
                            {formatMoney(s.amount)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs text-destructive">
                            {formatMoney(leftFor(s.balance))}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {report.bySupplier.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-medium">{t("paidReports.grandTotal")}</TableCell>
                        <TableCell className="font-data text-right text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          {formatMoney(report.totals.totalPaid)}
                        </TableCell>
                        <TableCell className="font-data text-right text-sm font-medium text-destructive">
                          {formatMoney(report.totals.totalLeft)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {(view === "whole" && !drilledSupplier) || drilledSupplier ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">
                  {report.party
                    ? t("paidReports.partyPayments", { name: report.party.name })
                    : t("paidReports.allPayments")}
                </CardTitle>
                <CardDescription>{t("paidReports.pdfHint")}</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.date")}</TableHead>
                      {!drilledSupplier ? (
                        <TableHead>{t("paidReports.supplier")}</TableHead>
                      ) : null}
                      <TableHead>{t("paidReports.col.reference")}</TableHead>
                      <TableHead className="text-right">{t("paidReports.col.amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.records.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={drilledSupplier ? 3 : 4}
                          className="text-muted-foreground"
                        >
                          {t("paidReports.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.records.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-data text-xs whitespace-nowrap">
                            {formatDate(r.date)}
                          </TableCell>
                          {!drilledSupplier ? (
                            <TableCell>
                              <Link
                                href={r.href}
                                className="text-sm text-primary hover:underline"
                              >
                                {r.partyName}
                              </Link>
                            </TableCell>
                          ) : null}
                          <TableCell className="font-data text-xs">{r.reference}</TableCell>
                          <TableCell className="font-data text-right text-xs text-emerald-700 dark:text-emerald-400">
                            {formatMoney(r.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {report.records.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell
                          colSpan={drilledSupplier ? 2 : 3}
                          className="font-medium"
                        >
                          {t("paidReports.grandTotal")}
                        </TableCell>
                        <TableCell className="font-data text-right text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          {formatMoney(report.totals.totalPaid)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
