"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  ReportViewToggle,
  type ReportViewMode,
} from "@/components/reports/report-view-toggle";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  downloadReportExport,
  getPayablesReport,
  type PayablesReport,
} from "@/lib/reports-api";
import { thisMonthRange } from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

export default function PayablesReportPage() {
  const { t } = useI18n();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<ReportViewMode>("party");
  const [report, setReport] = useState<PayablesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      setReport(await getPayablesReport(params));
    } catch (err) {
      toast.error(apiError(err, t("payReports.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function onExport(format: "pdf") {
    setExporting(format);
    try {
      await downloadReportExport("payables", {
        format,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        view,
      });
      toast.success(t("common.downloaded", { format: format.toUpperCase() }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setExporting(null);
    }
  }

  function setThisMonth() {
    const range = thisMonthRange();
    setDateFrom(range.from);
    setDateTo(range.to);
  }

  function setAllDates() {
    setDateFrom("");
    setDateTo("");
  }

  const isAll = !dateFrom && !dateTo;

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("rep.payTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("payReports.subtitle")}</p>
        </div>
        <ExportButtons exporting={exporting} onExport={onExport} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Button
          type="button"
          size="sm"
          variant={isAll ? "default" : "outline"}
          onClick={setAllDates}
        >
          {t("payReports.allDates")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={!isAll ? "default" : "outline"}
          onClick={setThisMonth}
        >
          {t("payReports.thisMonth")}
        </Button>
        <Input
          type="date"
          className="w-auto"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <Input
          type="date"
          className="w-auto"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>

      <ReportViewToggle value={view} onChange={setView} modes={["whole", "party"]} />

      {loading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-nameplate text-sm">{t("payReports.overall")}</CardTitle>
              <CardDescription>
                {isAll ? t("payReports.allDates") : `${dateFrom || "…"} → ${dateTo || "…"}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    label: t("payReports.total"),
                    value: formatMoney(report.totals.totalPayable),
                    emphasize: true,
                  },
                  {
                    label: t("payReports.suppliers"),
                    value: String(report.totals.supplierCount),
                  },
                  { label: t("payReports.records"), value: String(report.totals.recordCount) },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-border/70 px-4 py-3">
                    <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                      {s.label}
                    </p>
                    <p
                      className={`font-data mt-1 text-xl ${
                        "emphasize" in s && s.emphasize ? "text-destructive" : ""
                      }`}
                    >
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {view === "party" ? (
            <>
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">{t("payReports.bySupplier")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("payReports.col.supplier")}</TableHead>
                    <TableHead className="text-right">{t("payReports.col.count")}</TableHead>
                    <TableHead className="text-right">{t("payReports.partyTotal")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.bySupplier.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        {t("payReports.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.bySupplier.map((s) => (
                      <TableRow key={s.partyId || s.name}>
                        <TableCell>
                          {s.partyId ? (
                            <Link
                              href={`/dashboard/suppliers/${s.partyId}`}
                              className="hover:underline"
                            >
                              {s.name}
                            </Link>
                          ) : (
                            s.name
                          )}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {s.recordCount}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs text-destructive">
                          {formatMoney(s.balance)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {report.bySupplier.length > 0 ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-medium">{t("payReports.grandTotal")}</TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {report.totals.recordCount}
                      </TableCell>
                      <TableCell className="font-data text-right text-sm font-medium text-destructive">
                        {formatMoney(report.totals.totalPayable)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">{t("payReports.allRecords")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("payReports.col.reference")}</TableHead>
                    <TableHead>{t("payReports.col.supplier")}</TableHead>
                    <TableHead>{t("payReports.col.material")}</TableHead>
                    <TableHead className="text-right">{t("payReports.col.total")}</TableHead>
                    <TableHead className="text-right">{t("payReports.col.paid")}</TableHead>
                    <TableHead className="text-right">{t("payReports.col.balance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        {t("payReports.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.records.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-data text-xs whitespace-nowrap">
                          {formatDate(r.date)}
                        </TableCell>
                        <TableCell>
                          <Link href={r.href} className="font-data text-xs hover:underline">
                            {r.reference}
                          </Link>
                        </TableCell>
                        <TableCell>{r.partyName}</TableCell>
                        <TableCell className="capitalize text-muted-foreground">
                          {r.materialType || "scrap"}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(r.totalAmount)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(r.amountPaid)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs text-destructive">
                          {formatMoney(r.balance)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
