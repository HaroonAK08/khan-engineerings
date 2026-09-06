"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  downloadReportExport,
  getMonthlyReceivablesReport,
  type MonthlyReceivablesReport,
} from "@/lib/reports-api";
import { listPartyGroups, type PartyGroup } from "@/lib/sales-api";
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

function todayInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function MonthlyReceivablesPage() {
  const { t } = useI18n();
  const [asOfDate, setAsOfDate] = useState(todayInput());
  const [groupId, setGroupId] = useState("");
  const [groups, setGroups] = useState<PartyGroup[]>([]);
  const [report, setReport] = useState<MonthlyReceivablesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  useEffect(() => {
    listPartyGroups({ active: "true" })
      .then(setGroups)
      .catch(() => setGroups([]));
  }, []);

  const groupSelectItems = useMemo(() => {
    const items: Record<string, string> = {
      __all__: t("monthlyRecv.allGroups"),
      __ungrouped__: t("recvReports.ungrouped"),
    };
    for (const g of groups) items[g._id] = g.name;
    return items;
  }, [groups, t]);

  const load = useCallback(async () => {
    if (!asOfDate) return;
    setLoading(true);
    try {
      setReport(
        await getMonthlyReceivablesReport({
          date: asOfDate,
          groupId: groupId || undefined,
        })
      );
    } catch (err) {
      toast.error(apiError(err, t("monthlyRecv.loadFailed")));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [asOfDate, groupId, t]);

  useEffect(() => {
    const timer = setTimeout(load, 150);
    return () => clearTimeout(timer);
  }, [load]);

  async function onExport(format: "pdf") {
    setExporting(format);
    try {
      await downloadReportExport("monthly-receivables", {
        format,
        date: asOfDate,
        groupId: groupId || undefined,
      });
      toast.success(t("common.downloaded", { format: format.toUpperCase() }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setExporting(null);
    }
  }

  const rowLabel =
    report?.mode === "party" ? t("monthlyRecv.col.party") : t("monthlyRecv.col.group");

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("monthlyRecv.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("monthlyRecv.subtitle")}</p>
        </div>
        <ExportButtons exporting={exporting} onExport={onExport} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="monthly-recv-date">{t("monthlyRecv.asOf")}</Label>
          <Input
            id="monthly-recv-date"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="h-10 w-[180px]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>{t("monthlyRecv.group")}</Label>
          <Select
            value={groupId || "__all__"}
            onValueChange={(v) => setGroupId(!v || v === "__all__" ? "" : v)}
            items={groupSelectItems}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("monthlyRecv.allGroups")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{groupSelectItems.__all__}</SelectItem>
              <SelectItem value="__ungrouped__">{groupSelectItems.__ungrouped__}</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g._id} value={g._id}>
                  {groupSelectItems[g._id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("monthlyRecv.total")}
                </p>
                <p className="font-data mt-1 text-xl text-destructive">
                  {formatMoney(report.totals.total)}
                </p>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("monthlyRecv.asOf")}
                </p>
                <p className="font-data mt-1 text-xl">
                  {formatDate(report.asOf || asOfDate)}
                </p>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("monthlyRecv.year")}
                </p>
                <p className="font-data mt-1 text-xl">{report.year}</p>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardContent className="p-4">
                <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                  {report.mode === "party" ? t("recvReports.parties") : t("recvReports.groups")}
                </p>
                <p className="font-data mt-1 text-xl">{report.totals.rowCount}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">
                {report.group
                  ? t("monthlyRecv.tableParty", { name: report.group.name })
                  : t("monthlyRecv.tableGroups")}
              </CardTitle>
              <CardDescription>
                {t("monthlyRecv.tableDescAsOf", {
                  date: formatDate(report.asOf || asOfDate),
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 bg-card min-w-[9rem]">
                      {rowLabel}
                    </TableHead>
                    {report.months.map((m) => (
                      <TableHead key={m.key} className="text-right whitespace-nowrap">
                        {m.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-right whitespace-nowrap">
                      {t("monthlyRecv.col.total")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={report.months.length + 2}
                        className="text-muted-foreground"
                      >
                        {t("monthlyRecv.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.rows.map((row) => (
                      <TableRow key={row.id || row.name}>
                        <TableCell className="sticky left-0 z-10 bg-card font-medium">
                          {row.name}
                        </TableCell>
                        {report.months.map((m) => {
                          const value = row.months[m.key] || 0;
                          return (
                            <TableCell
                              key={m.key}
                              className="font-data text-right text-xs whitespace-nowrap"
                            >
                              {value > 0 ? formatMoney(value) : "—"}
                            </TableCell>
                          );
                        })}
                        <TableCell className="font-data text-right text-xs font-medium text-destructive whitespace-nowrap">
                          {formatMoney(row.total)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {report.rows.length > 0 ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="sticky left-0 z-10 bg-muted/40 font-medium">
                        {t("recvReports.grandTotal")}
                      </TableCell>
                      {report.months.map((m) => {
                        const value = report.totals.months[m.key] || 0;
                        return (
                          <TableCell
                            key={m.key}
                            className="font-data text-right text-xs whitespace-nowrap"
                          >
                            {value > 0 ? formatMoney(value) : "—"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="font-data text-right text-sm font-medium text-destructive whitespace-nowrap">
                        {formatMoney(report.totals.total)}
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
