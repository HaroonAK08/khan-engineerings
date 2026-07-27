"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  downloadReportExport,
  getReceivablesReport,
  type ReceivablesReport,
} from "@/lib/reports-api";
import { currentMonthRange } from "@/lib/date-range";
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
import type { MessageKey } from "@/lib/i18n/messages";

export default function ReceivablesReportPage() {
  const { t } = useI18n();
  const defaults = currentMonthRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [report, setReport] = useState<ReceivablesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { dateFrom?: string; dateTo?: string } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      setReport(await getReceivablesReport(params));
    } catch (err) {
      toast.error(apiError(err, t("recvReports.loadFailed")));
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
      await downloadReportExport("receivables", {
        format,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      toast.success(t("common.downloaded", { format: format.toUpperCase() }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setExporting(null);
    }
  }

  function typeLabel(type: string) {
    const key = `recvReports.type.${type}` as MessageKey;
    return t(key);
  }

  function setThisMonth() {
    const range = currentMonthRange();
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
          <h1 className="text-nameplate text-xl">{t("rep.recvTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("recvReports.subtitle")}</p>
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
          {t("recvReports.allDates")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={!isAll ? "default" : "outline"}
          onClick={setThisMonth}
        >
          {t("recvReports.thisMonth")}
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

      {loading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-nameplate text-sm">{t("recvReports.overall")}</CardTitle>
              <CardDescription>
                {isAll ? t("recvReports.allDates") : `${dateFrom || "…"} → ${dateTo || "…"}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    label: t("recvReports.total"),
                    value: formatMoney(report.totals.totalReceivable),
                    emphasize: true,
                  },
                  { label: t("recvReports.parties"), value: String(report.totals.partyCount) },
                  { label: t("recvReports.records"), value: String(report.totals.recordCount) },
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

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">{t("recvReports.byParty")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("recvReports.col.party")}</TableHead>
                    <TableHead className="text-right">{t("recvReports.col.count")}</TableHead>
                    <TableHead className="text-right">{t("recvReports.partyTotal")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.byParty.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        {t("recvReports.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.byParty.map((p) => (
                      <TableRow key={p.partyId || p.name}>
                        <TableCell>
                          {p.partyId ? (
                            <Link
                              href={`/dashboard/party/customers/${p.partyId}`}
                              className="hover:underline"
                            >
                              {p.name}
                            </Link>
                          ) : (
                            p.name
                          )}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {p.recordCount}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs text-destructive">
                          {formatMoney(p.balance)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {report.byParty.length > 0 ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-medium">{t("recvReports.grandTotal")}</TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {report.totals.recordCount}
                      </TableCell>
                      <TableCell className="font-data text-right text-sm font-medium text-destructive">
                        {formatMoney(report.totals.totalReceivable)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">{t("recvReports.allRecords")}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("recvReports.col.type")}</TableHead>
                    <TableHead>{t("recvReports.col.reference")}</TableHead>
                    <TableHead>{t("recvReports.col.party")}</TableHead>
                    <TableHead className="text-right">{t("recvReports.col.total")}</TableHead>
                    <TableHead className="text-right">{t("recvReports.col.paid")}</TableHead>
                    <TableHead className="text-right">{t("recvReports.col.balance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        {t("recvReports.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.records.map((r) => (
                      <TableRow key={`${r.type}-${r.id}`}>
                        <TableCell className="font-data text-xs whitespace-nowrap">
                          {formatDate(r.date)}
                        </TableCell>
                        <TableCell className="text-sm">{typeLabel(r.type)}</TableCell>
                        <TableCell>
                          <Link href={r.href} className="font-data text-xs hover:underline">
                            {r.reference}
                          </Link>
                        </TableCell>
                        <TableCell>{r.partyName}</TableCell>
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
      )}
    </div>
  );
}
