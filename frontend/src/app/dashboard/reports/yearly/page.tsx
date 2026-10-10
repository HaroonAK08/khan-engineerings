"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatMoney } from "@/lib/materials-api";
import {
  downloadYearlyCalendarExport,
  getYearlyCalendarReport,
  type YearlyCalendarMode,
  type YearlyCalendarReport,
  type YearlyDateMode,
} from "@/lib/reports-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";

function currentYear() {
  return new Date().getFullYear();
}

function todayInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yearOptions() {
  const y = currentYear();
  const list: number[] = [];
  for (let i = y; i >= y - 8; i -= 1) list.push(i);
  return list;
}

function yearRange(y: string | number) {
  const year = String(y);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function dayOrdinal(day: number) {
  const n = Math.trunc(Number(day) || 0);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

export default function YearlyCalendarReportPage() {
  const { t, isUrdu } = useI18n();
  const [mode, setMode] = useState<YearlyCalendarMode>("party");
  const [dateMode, setDateMode] = useState<YearlyDateMode>("single");
  const [year, setYear] = useState(String(currentYear()));
  const [singleDate, setSingleDate] = useState(todayInput());
  const [dateFrom, setDateFrom] = useState(yearRange(currentYear()).from);
  const [dateTo, setDateTo] = useState(yearRange(currentYear()).to);
  const [report, setReport] = useState<YearlyCalendarReport | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  function applyYear(nextYear: string) {
    setYear(nextYear);
    const range = yearRange(nextYear);
    setDateFrom(range.from);
    setDateTo(range.to);
    if (dateMode === "single") {
      const today = todayInput();
      setSingleDate(today.startsWith(nextYear) ? today : `${nextYear}-12-31`);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(
        await getYearlyCalendarReport({
          year,
          mode,
          dateMode,
          date: dateMode === "single" ? singleDate : undefined,
          dateFrom: dateMode === "range" ? dateFrom : undefined,
          dateTo: dateMode === "range" ? dateTo : undefined,
        })
      );
    } catch (err) {
      setReport(null);
      toast.error(apiError(err, t("yearlyReports.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [year, mode, dateMode, singleDate, dateFrom, dateTo, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function onExport() {
    setExporting("pdf");
    try {
      await downloadYearlyCalendarExport({
        format: "pdf",
        year,
        mode,
        dateMode,
        date: dateMode === "single" ? singleDate : undefined,
        dateFrom: dateMode === "range" ? dateFrom : undefined,
        dateTo: dateMode === "range" ? dateTo : undefined,
      });
      toast.success(t("common.downloaded", { format: "PDF" }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setExporting(null);
    }
  }

  const rowLabel =
    mode === "supplier"
      ? t("yearlyReports.col.supplier")
      : mode === "group"
        ? t("yearlyReports.col.group")
        : t("yearlyReports.col.party");
  const amountLabel =
    mode === "supplier" ? t("yearlyReports.toPay") : t("yearlyReports.toReceive");
  const searchLabel =
    mode === "supplier"
      ? t("yearlyReports.searchSupplier")
      : mode === "group"
        ? t("yearlyReports.searchGroup")
        : t("yearlyReports.searchParty");
  const searchPlaceholder =
    mode === "supplier"
      ? t("yearlyReports.searchSupplierPlaceholder")
      : mode === "group"
        ? t("yearlyReports.searchGroupPlaceholder")
        : t("yearlyReports.searchPartyPlaceholder");

  const q = searchQuery.trim().toLowerCase();
  const rows =
    report == null
      ? []
      : q
        ? report.rows.filter((row) => row.name.toLowerCase().includes(q))
        : report.rows;
  const monthKeys = report?.months.map((month) => month.key) ?? [];
  const filteredMonthTotals = Object.fromEntries(monthKeys.map((key) => [key, 0])) as Record<
    string,
    number
  >;
  let filteredTotal = 0;
  for (const row of rows) {
    filteredTotal += row.total || 0;
    for (const key of monthKeys) {
      filteredMonthTotals[key] = (filteredMonthTotals[key] || 0) + (row.months[key] || 0);
    }
  }
  const displayTotals =
    report == null
      ? null
      : q
        ? { total: filteredTotal, rowCount: rows.length, months: filteredMonthTotals }
        : report.totals;

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("rep.yearlyTitle")}</h1>
        </div>
        <ExportButtons exporting={exporting} onExport={() => void onExport()} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["party", "yearlyReports.parties"],
            ["group", "yearlyReports.groups"],
            ["supplier", "yearlyReports.suppliers"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={mode === id ? "default" : "outline"}
            onClick={() => {
              setMode(id);
              setSearchQuery("");
            }}
          >
            {t(label)}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-[14rem] flex-1 gap-1.5 sm:max-w-xs">
          <Label htmlFor="yearly-search">{searchLabel}</Label>
          <Input
            id="yearly-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-10"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>{t("yearlyReports.year")}</Label>
          <Select
            value={year}
            onValueChange={(value) => applyYear(value || String(currentYear()))}
            items={Object.fromEntries(yearOptions().map((y) => [String(y), String(y)]))}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions().map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={dateMode === "single" ? "default" : "outline"}
            onClick={() => setDateMode("single")}
          >
            {t("yearlyReports.oneDate")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={dateMode === "range" ? "default" : "outline"}
            onClick={() => setDateMode("range")}
          >
            {t("yearlyReports.dateRange")}
          </Button>
        </div>

        {dateMode === "single" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="yearly-one-date">{t("yearlyReports.oneDate")}</Label>
            <Input
              id="yearly-one-date"
              type="date"
              value={singleDate}
              onChange={(event) => {
                const next = event.target.value;
                setSingleDate(next);
                if (next) setYear(next.slice(0, 4));
              }}
              className="h-10 w-[180px]"
            />
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="yearly-from">{t("common.from")}</Label>
              <Input
                id="yearly-from"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="h-10 w-[180px]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="yearly-to">{t("common.to")}</Label>
              <Input
                id="yearly-to"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="h-10 w-[180px]"
              />
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => applyYear(year)}>
              {t("yearlyReports.fullYear")}
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : !report ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {t("yearlyReports.loadFailed")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card className="py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {amountLabel}
                </p>
                <p className="font-data mt-1 text-xl text-destructive">
                  {formatMoney(displayTotals?.total || 0)}
                </p>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("yearlyReports.year")}
                </p>
                <p className="font-data mt-1 text-xl">{report.year}</p>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {rowLabel}
                </p>
                <p className="font-data mt-1 text-xl">{displayTotals?.rowCount ?? 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">
                {t("yearlyReports.tableTitle", { year: String(report.year) })}
              </CardTitle>
              <CardDescription>
                {amountLabel}
                {report.dateMode === "single" && report.dayOfMonth
                  ? ` · ${t("yearlyReports.dayOfEachMonth", {
                      day: isUrdu
                        ? String(report.dayOfMonth)
                        : dayOrdinal(report.dayOfMonth),
                    })}`
                  : ` · ${report.period.from} → ${report.period.to}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 min-w-[10rem] bg-card">
                      {rowLabel}
                    </TableHead>
                    {report.months.map((month) => (
                      <TableHead key={month.key} className="text-right whitespace-nowrap">
                        {month.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-right whitespace-nowrap">
                      {t("yearlyReports.col.total")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={report.months.length + 2}
                        className="text-muted-foreground"
                      >
                        {q ? t("yearlyReports.searchEmpty") : t("yearlyReports.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id || row.name}>
                        <TableCell className="sticky left-0 z-10 bg-card font-medium">
                          {row.href ? (
                            <Link href={row.href} className="hover:underline">
                              {row.name}
                            </Link>
                          ) : (
                            row.name
                          )}
                        </TableCell>
                        {report.months.map((month) => {
                          const value = row.months[month.key] || 0;
                          return (
                            <TableCell
                              key={month.key}
                              className="font-data text-right text-xs whitespace-nowrap"
                            >
                              {value > 0 ? formatMoney(value) : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell
                          className={cn(
                            "font-data text-right text-xs font-medium whitespace-nowrap",
                            row.total > 0 && "text-destructive"
                          )}
                        >
                          {formatMoney(row.total)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {rows.length > 0 && displayTotals ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="sticky left-0 z-10 bg-muted/40 font-medium">
                        {t("yearlyReports.col.total")}
                      </TableCell>
                      {report.months.map((month) => {
                        const value = displayTotals.months[month.key] || 0;
                        return (
                          <TableCell
                            key={month.key}
                            className="font-data text-right text-xs whitespace-nowrap"
                          >
                            {value > 0 ? formatMoney(value) : "—"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="font-data text-right text-xs font-medium text-destructive whitespace-nowrap">
                        {formatMoney(displayTotals.total)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
