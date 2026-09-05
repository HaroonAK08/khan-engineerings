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
import { DateRangeFilter } from "@/components/date-range-filter";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  downloadYearlyBillExport,
  getYearlyBillReport,
  type YearlyBillReport,
  type YearlyBuiltyRow,
  type YearlyMonthBlock,
  type YearlyPartyDetail,
} from "@/lib/reports-api";
import { listCustomers, listPartyGroups, type PartyGroup } from "@/lib/sales-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function currentYear() {
  return new Date().getFullYear();
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

function ItemLines({ row }: { row: YearlyBuiltyRow }) {
  const items = row.items?.length
    ? row.items
    : row.itemsLabel
      ? row.itemsLabel.split("\n").filter(Boolean).map((label) => ({ label }))
      : [];
  if (items.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, idx) => {
        const label =
          "label" in item && item.label
            ? String(item.label)
            : "name" in item
              ? `${item.name}${item.weightKg ? ` - ${item.weightKg}kg` : ""} × ${item.quantity}${
                  item.unitPrice != null
                    ? `  ·  ${item.unitPrice} × ${item.quantity} = ${item.lineTotal}`
                    : ""
                }`
              : String(item);
        const [head, ...rest] = label.split(/\s+\|\s+/);
        return (
          <li key={`${row.id}-${idx}`} className="leading-snug">
            <p className="text-xs text-foreground">{head}</p>
            {rest.length > 0 ? (
              <p className="font-data text-[11px] text-muted-foreground">
                {rest.join(" | ")}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function BuiltyTable({
  rows,
  t,
}: {
  rows: YearlyBuiltyRow[];
  t: (key: Parameters<ReturnType<typeof useI18n>["t"]>[0]) => string;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">{t("yearlyReports.empty")}</p>;
  }
  const totals = rows.reduce(
    (acc, r) => {
      acc.total += r.total;
      acc.paid += r.paid;
      acc.left += r.left;
      return acc;
    },
    { total: 0, paid: 0, left: 0 }
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("yearlyReports.col.builty")}</TableHead>
          <TableHead className="min-w-[220px]">{t("yearlyReports.col.items")}</TableHead>
          <TableHead>{t("yearlyReports.col.date")}</TableHead>
          <TableHead className="text-right">{t("yearlyReports.col.total")}</TableHead>
          <TableHead className="text-right">{t("yearlyReports.col.paid")}</TableHead>
          <TableHead className="text-right">{t("yearlyReports.col.left")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="align-top">
              <Link href={r.href} className="font-data text-xs hover:underline">
                {r.builtyNo}
              </Link>
            </TableCell>
            <TableCell className="align-top">
              <ItemLines row={r} />
            </TableCell>
            <TableCell className="align-top font-data text-xs whitespace-nowrap">
              {formatDate(r.date)}
            </TableCell>
            <TableCell className="align-top font-data text-right text-xs">
              {formatMoney(r.total)}
            </TableCell>
            <TableCell className="align-top font-data text-right text-xs">
              {formatMoney(r.paid)}
            </TableCell>
            <TableCell className="align-top font-data text-right text-xs text-destructive">
              {formatMoney(r.left)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3} className="font-medium">
            {t("yearlyReports.summary")}
          </TableCell>
          <TableCell className="font-data text-right text-xs">{formatMoney(totals.total)}</TableCell>
          <TableCell className="font-data text-right text-xs">{formatMoney(totals.paid)}</TableCell>
          <TableCell className="font-data text-right text-xs text-destructive">
            {formatMoney(totals.left)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export default function YearlyBillReportPage() {
  const { t } = useI18n();
  const [year, setYear] = useState(String(currentYear()));
  const [view, setView] = useState<ReportViewMode>("party");
  const [groupId, setGroupId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [groups, setGroups] = useState<PartyGroup[]>([]);
  const [customers, setCustomers] = useState<Array<{ _id: string; name: string }>>([]);
  const [report, setReport] = useState<YearlyBillReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [composeMonth, setComposeMonth] = useState<YearlyMonthBlock | null>(null);
  const [composeParty, setComposeParty] = useState<YearlyPartyDetail | null>(null);
  const [selectedPrevious, setSelectedPrevious] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [pageExporting, setPageExporting] = useState<"pdf" | null>(null);
  const { dateFrom, dateTo, hydrated, setRange } = usePersistedDateRange();

  useEffect(() => {
    void Promise.all([listPartyGroups({ active: "true" }), listCustomers()])
      .then(([g, c]) => {
        setGroups(g);
        setCustomers(c.map((x) => ({ _id: x._id, name: x.name })));
      })
      .catch(() => {
        setGroups([]);
        setCustomers([]);
      });
  }, []);

  const groupSelectItems = useMemo(() => {
    const items: Record<string, string> = {
      __all__: t("yearlyReports.allGroups"),
      __ungrouped__: t("yearlyReports.ungrouped"),
    };
    for (const g of groups) items[g._id] = g.name;
    return items;
  }, [groups, t]);

  function applyFullYear(nextYear: string) {
    setYear(nextYear);
    const range = yearRange(nextYear);
    setRange(range.from, range.to);
  }

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const params: {
        year: string;
        groupId?: string;
        customerId?: string;
        dateFrom?: string;
        dateTo?: string;
      } = { year };
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (partyId) params.customerId = partyId;
      else if (groupId) params.groupId = groupId;
      setReport(await getYearlyBillReport(params));
    } catch (err) {
      toast.error(apiError(err, t("yearlyReports.loadFailed")));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [year, groupId, partyId, dateFrom, dateTo, hydrated, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  const periodLabel =
    report?.period?.label ||
    (dateFrom || dateTo ? `${dateFrom || "…"} → ${dateTo || "…"}` : year);

  const exportDates = useMemo(
    () => ({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [dateFrom, dateTo]
  );

  const activeParty = useMemo(() => {
    if (!report) return null;
    if (partyId) return report.parties.find((p) => p.partyId === partyId) || null;
    if (report.parties.length === 1) return report.parties[0];
    return null;
  }, [report, partyId]);

  const byGroup = (report?.byGroup || []).filter((g) => Boolean(g.groupId));
  const drilledGroup = Boolean(groupId) && !partyId;

  function openGroup(g: { groupId: string }) {
    setPartyId("");
    setGroupId(g.groupId || "__ungrouped__");
    setView("party");
  }

  function openParty(p: { partyId: string }) {
    if (!p.partyId) return;
    setPartyId(p.partyId);
    setView("party");
  }

  function previousCandidatesFor(party: YearlyPartyDetail, month: YearlyMonthBlock) {
    return [
      ...party.openBeforeYear,
      ...party.months
        .filter((m) => m.key < month.key)
        .flatMap((m) => m.builties)
        .filter((b) => b.left > 0.001),
    ];
  }

  function openCompose(party: YearlyPartyDetail, month: YearlyMonthBlock) {
    const prev = previousCandidatesFor(party, month);
    setComposeParty(party);
    setComposeMonth(month);
    setSelectedPrevious(new Set(prev.map((b) => b.id)));
  }

  function closeCompose() {
    setComposeMonth(null);
    setComposeParty(null);
    setSelectedPrevious(new Set());
  }

  const composePreviousRows = useMemo(() => {
    if (!composeParty || !composeMonth) return [];
    return previousCandidatesFor(composeParty, composeMonth);
  }, [composeParty, composeMonth]);

  const composeTotals = useMemo(() => {
    const prev = composePreviousRows.filter((r) => selectedPrevious.has(r.id));
    const monthRows = composeMonth?.builties || [];
    const sum = (rows: YearlyBuiltyRow[]) =>
      rows.reduce(
        (acc, r) => {
          acc.billed += r.total;
          acc.paid += r.paid;
          acc.left += r.left;
          return acc;
        },
        { billed: 0, paid: 0, left: 0 }
      );
    const p = sum(prev);
    const m = sum(monthRows);
    return {
      previousLeft: p.left,
      monthBilled: m.billed,
      monthPaid: m.paid,
      monthLeft: m.left,
      amountDue: p.left + m.left,
    };
  }, [composePreviousRows, selectedPrevious, composeMonth]);

  async function onExportPdf() {
    if (!composeParty || !composeMonth) return;
    setExporting(true);
    try {
      await downloadYearlyBillExport({
        format: "pdf",
        year,
        customerId: composeParty.partyId,
        monthKey: composeMonth.key,
        previousIds: [...selectedPrevious],
        mode: "bill",
        ...exportDates,
      });
      toast.success(t("common.downloaded", { format: "PDF" }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setExporting(false);
    }
  }

  async function onPageExportPdf() {
    setPageExporting("pdf");
    try {
      await downloadYearlyBillExport({
        format: "pdf",
        year,
        customerId: partyId || undefined,
        groupId: !partyId && groupId ? groupId : undefined,
        mode: "year",
        ...exportDates,
      });
      toast.success(t("common.downloaded", { format: "PDF" }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setPageExporting(null);
    }
  }

  const summaryCards = report
    ? [
        { label: t("yearlyReports.billed"), value: formatMoney(report.totals.billed) },
        { label: t("yearlyReports.paid"), value: formatMoney(report.totals.paid) },
        {
          label: t("yearlyReports.leftover"),
          value: formatMoney(report.totals.leftover),
          emphasize: true,
        },
        { label: t("yearlyReports.builties"), value: String(report.totals.builtyCount) },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("rep.yearlyTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("rep.yearlyDesc")}</p>
        </div>
        <ExportButtons exporting={pageExporting} onExport={() => void onPageExportPdf()} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label>{t("yearlyReports.year")}</Label>
            <Select
              value={year}
              onValueChange={(v) => applyFullYear(v || String(currentYear()))}
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
          <Button type="button" size="sm" variant="outline" onClick={() => applyFullYear(year)}>
            {t("yearlyReports.fullYear")}
          </Button>
          <DateRangeFilter showAll />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label className="sr-only">{t("yearlyReports.col.group")}</Label>
            <Select
              value={groupId || "__all__"}
              onValueChange={(v) => {
                setPartyId("");
                setGroupId(!v || v === "__all__" ? "" : v);
              }}
              items={groupSelectItems}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("yearlyReports.allGroups")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{groupSelectItems.__all__}</SelectItem>
                <SelectItem value="__ungrouped__">{groupSelectItems.__ungrouped__}</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g._id} value={g._id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="sr-only">{t("yearlyReports.col.party")}</Label>
            <Select
              value={partyId || "__none__"}
              onValueChange={(v) => setPartyId(!v || v === "__none__" ? "" : v)}
              items={{
                __none__: t("yearlyReports.pickParty"),
                ...Object.fromEntries(customers.map((c) => [c._id, c.name])),
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("yearlyReports.pickParty")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("yearlyReports.pickParty")}</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <ReportViewToggle
        value={view}
        onChange={(next) => {
          if (next === "group") {
            setPartyId("");
            setGroupId("");
          }
          setView(next);
        }}
      />

      {drilledGroup && view === "party" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => { setGroupId(""); setView("group"); }}>
            {t("yearlyReports.backToGroups")}
          </Button>
          <p className="text-sm text-muted-foreground">
            {report?.group?.name || groupSelectItems[groupId] || t("yearlyReports.col.group")}
          </p>
        </div>
      ) : null}

      {partyId ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setPartyId("");
              setView(groupId ? "party" : "party");
            }}
          >
            {t("yearlyReports.backToParties")}
          </Button>
          {groupId ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => { setPartyId(""); setGroupId(""); setView("group"); }}>
              {t("yearlyReports.backToGroups")}
            </Button>
          ) : null}
          <p className="text-sm text-muted-foreground">{activeParty?.name || report?.party?.name}</p>
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
              <CardTitle className="text-nameplate text-sm">{t("yearlyReports.summary")}</CardTitle>
              <CardDescription>
                {t("yearlyReports.period")}: {periodLabel}
                {report.group ? ` · ${report.group.name}` : ""}
                {report.party ? ` · ${report.party.name}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {summaryCards.map((s) => (
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

          {view === "group" && !partyId ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">{t("yearlyReports.byGroup")}</CardTitle>
                <CardDescription>{t("yearlyReports.clickGroup")}</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("yearlyReports.col.group")}</TableHead>
                      <TableHead className="text-right">{t("yearlyReports.parties")}</TableHead>
                      <TableHead className="text-right">{t("yearlyReports.billed")}</TableHead>
                      <TableHead className="text-right">{t("yearlyReports.paid")}</TableHead>
                      <TableHead className="text-right">{t("yearlyReports.leftover")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byGroup.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          {t("yearlyReports.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      byGroup.map((g) => (
                        <TableRow
                          key={g.groupId || g.name}
                          className="cursor-pointer"
                          onClick={() => openGroup(g)}
                        >
                          <TableCell className="font-medium text-primary underline-offset-2 hover:underline">
                            {g.name}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">{g.partyCount}</TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(g.billed)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(g.paid)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs text-destructive">
                            {formatMoney(g.leftover)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {view === "party" && !partyId ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">{t("yearlyReports.byParty")}</CardTitle>
                <CardDescription>{t("yearlyReports.clickParty")}</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("yearlyReports.col.party")}</TableHead>
                      <TableHead>{t("yearlyReports.col.group")}</TableHead>
                      <TableHead className="text-right">{t("yearlyReports.builties")}</TableHead>
                      <TableHead className="text-right">{t("yearlyReports.billed")}</TableHead>
                      <TableHead className="text-right">{t("yearlyReports.paid")}</TableHead>
                      <TableHead className="text-right">{t("yearlyReports.leftover")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byParty.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-muted-foreground">
                          {t("yearlyReports.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.byParty.map((p) => (
                        <TableRow
                          key={p.partyId}
                          className="cursor-pointer"
                          onClick={() => openParty(p)}
                        >
                          <TableCell className="font-medium text-primary underline-offset-2 hover:underline">
                            {p.name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {p.groupName || t("yearlyReports.ungrouped")}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">{p.builtyCount}</TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(p.billed)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(p.paid)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs text-destructive">
                            {formatMoney(p.leftover)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {view === "whole" && !partyId ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">{t("yearlyReports.byParty")}</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("yearlyReports.col.party")}</TableHead>
                      <TableHead className="text-right">{t("yearlyReports.billed")}</TableHead>
                      <TableHead className="text-right">{t("yearlyReports.paid")}</TableHead>
                      <TableHead className="text-right">{t("yearlyReports.leftover")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.byParty.map((p) => (
                      <TableRow
                        key={p.partyId}
                        className="cursor-pointer"
                        onClick={() => openParty(p)}
                      >
                        <TableCell className="font-medium text-primary underline-offset-2 hover:underline">
                          {p.name}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(p.billed)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(p.paid)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs text-destructive">
                          {formatMoney(p.leftover)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {activeParty ? (
            <div className="flex flex-col gap-4">
              {activeParty.openBeforeYear.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-nameplate text-sm">
                      {t("yearlyReports.openBeforeYear")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-0">
                    <BuiltyTable rows={activeParty.openBeforeYear} t={t} />
                  </CardContent>
                </Card>
              ) : null}

              {activeParty.months.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    {t("yearlyReports.empty")}
                  </CardContent>
                </Card>
              ) : (
                activeParty.months.map((month) => (
                  <Card key={month.key}>
                    <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                      <div>
                        <CardTitle className="text-nameplate text-sm">{month.label}</CardTitle>
                        <CardDescription>
                          {t("yearlyReports.leftover")}: {formatMoney(month.totals.leftover)}
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pageExporting === "pdf"}
                          onClick={() => {
                            void (async () => {
                              if (!activeParty) return;
                              setPageExporting("pdf");
                              try {
                                const prev = previousCandidatesFor(activeParty, month);
                                await downloadYearlyBillExport({
                                  format: "pdf",
                                  year,
                                  customerId: activeParty.partyId,
                                  monthKey: month.key,
                                  previousIds: prev.map((b) => b.id),
                                  mode: "bill",
                                  ...exportDates,
                                });
                                toast.success(t("common.downloaded", { format: "PDF" }));
                              } catch (err) {
                                toast.error(apiError(err, t("common.exportFailed")));
                              } finally {
                                setPageExporting(null);
                              }
                            })();
                          }}
                        >
                          {t("yearlyReports.exportPdf")}
                        </Button>
                        <Button type="button" size="sm" onClick={() => openCompose(activeParty, month)}>
                          {t("yearlyReports.composeBill")}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="px-0">
                      <BuiltyTable rows={month.builties} t={t} />
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : null}
        </>
      )}

      <Dialog
        open={Boolean(composeMonth && composeParty)}
        onOpenChange={(open) => {
          if (!open) closeCompose();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("yearlyReports.composeTitle", { month: composeMonth?.label || "" })}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{t("yearlyReports.previousLeftover")}</p>
                  <p className="text-xs text-muted-foreground">{t("yearlyReports.previousHint")}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelectedPrevious(new Set(composePreviousRows.map((r) => r.id)))
                    }
                  >
                    {t("yearlyReports.selectAll")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedPrevious(new Set())}
                  >
                    {t("yearlyReports.clearAll")}
                  </Button>
                </div>
              </div>
              {composePreviousRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>{t("yearlyReports.col.builty")}</TableHead>
                        <TableHead>{t("yearlyReports.col.items")}</TableHead>
                        <TableHead>{t("yearlyReports.col.date")}</TableHead>
                        <TableHead className="text-right">{t("yearlyReports.col.left")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {composePreviousRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={selectedPrevious.has(r.id)}
                              onChange={(e) => {
                                setSelectedPrevious((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(r.id);
                                  else next.delete(r.id);
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell className="font-data text-xs">{r.builtyNo}</TableCell>
                          <TableCell className="align-top">
                            <ItemLines row={r} />
                          </TableCell>
                          <TableCell className="font-data text-xs">{formatDate(r.date)}</TableCell>
                          <TableCell className="font-data text-right text-xs text-destructive">
                            {formatMoney(r.left)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">{t("yearlyReports.thisMonth")}</p>
              <div className="overflow-hidden rounded-lg border border-border">
                <BuiltyTable rows={composeMonth?.builties || []} t={t} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/70 px-3 py-2">
                <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("yearlyReports.previousLeftover")}
                </p>
                <p className="font-data mt-1 text-lg text-destructive">
                  {formatMoney(composeTotals.previousLeft)}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 px-3 py-2">
                <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("yearlyReports.thisMonth")}
                </p>
                <p className="font-data mt-1 text-lg">{formatMoney(composeTotals.monthLeft)}</p>
              </div>
              <div className="rounded-lg border border-border/70 px-3 py-2 sm:col-span-1 col-span-2">
                <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("yearlyReports.amountDue")}
                </p>
                <p className="font-data mt-1 text-lg font-semibold text-destructive">
                  {formatMoney(composeTotals.amountDue)}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCompose}>
              {t("prod.cancel")}
            </Button>
            <Button type="button" disabled={exporting} className="gap-2" onClick={() => void onExportPdf()}>
              {exporting ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("yearlyReports.exportPdf")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
