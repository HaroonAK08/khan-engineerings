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
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  downloadReportExport,
  getReceivablesReport,
  type ReceivablesReport,
} from "@/lib/reports-api";
import { listPartyGroups, type PartyGroup } from "@/lib/sales-api";
import { thisMonthRange } from "@/lib/date-range";
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
import type { MessageKey } from "@/lib/i18n/messages";

export default function ReceivablesReportPage() {
  const { t } = useI18n();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [groupId, setGroupId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [view, setView] = useState<ReportViewMode>("party");
  const [groups, setGroups] = useState<PartyGroup[]>([]);
  const [report, setReport] = useState<ReceivablesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  useEffect(() => {
    listPartyGroups({ active: "true" })
      .then(setGroups)
      .catch(() => setGroups([]));
  }, []);

  const groupSelectItems = useMemo(() => {
    const items: Record<string, string> = {
      __all__: t("recvReports.allGroups"),
      __ungrouped__: t("recvReports.ungrouped"),
    };
    for (const g of groups) items[g._id] = g.name;
    return items;
  }, [groups, t]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: {
        dateFrom?: string;
        dateTo?: string;
        groupId?: string;
        customerId?: string;
      } = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (groupId) params.groupId = groupId;
      if (partyId) params.customerId = partyId;
      setReport(await getReceivablesReport(params));
    } catch (err) {
      toast.error(apiError(err, t("recvReports.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, groupId, partyId, t]);

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
        groupId: groupId || undefined,
        customerId: partyId || undefined,
        view: partyId ? "party" : view,
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
    const range = thisMonthRange();
    setDateFrom(range.from);
    setDateTo(range.to);
  }

  function setAllDates() {
    setDateFrom("");
    setDateTo("");
  }

  function openGroup(g: { groupId: string; name: string }) {
    setPartyId("");
    setGroupId(g.groupId || "__ungrouped__");
    setView("party");
  }

  function openParty(p: { partyId: string; name: string }) {
    if (!p.partyId) return;
    setPartyId(p.partyId);
    setView("party");
  }

  function backToGroups() {
    setPartyId("");
    setGroupId("");
    setView("group");
  }

  function backToParties() {
    setPartyId("");
    setView("party");
  }

  const isAll = !dateFrom && !dateTo;
  const byGroup = (report?.byGroup || []).filter((g) => Boolean(g.groupId));
  const groupViewTotals = {
    totalReceivable: byGroup.reduce((s, g) => s + (g.balance || 0), 0),
    partyCount: byGroup.reduce((s, g) => s + (g.partyCount || 0), 0),
    recordCount: byGroup.reduce((s, g) => s + (g.recordCount || 0), 0),
    groupCount: byGroup.length,
  };
  const drilledGroup = Boolean(groupId) && !partyId;
  const drilledParty = Boolean(partyId);

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
        <div className="grid gap-1.5">
          <Label className="sr-only">{t("recvReports.group")}</Label>
          <Select
            value={groupId || "__all__"}
            onValueChange={(v) => {
              setPartyId("");
              setGroupId(!v || v === "__all__" ? "" : v);
            }}
            items={groupSelectItems}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("recvReports.allGroups")} />
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

      <ReportViewToggle
        value={view}
        onChange={(next) => {
          setPartyId("");
          if (next === "group") setGroupId("");
          setView(next);
        }}
      />

      {drilledGroup && view === "party" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={backToGroups}>
            {t("recvReports.backToGroups")}
          </Button>
          <p className="text-sm text-muted-foreground">
            {report?.group?.name ||
              (groupId === "__ungrouped__"
                ? t("recvReports.ungrouped")
                : groupSelectItems[groupId]) ||
              t("recvReports.group")}
          </p>
        </div>
      ) : null}

      {drilledParty ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={backToParties}>
            {t("recvReports.backToParties")}
          </Button>
          {groupId ? (
            <Button type="button" size="sm" variant="ghost" onClick={backToGroups}>
              {t("recvReports.backToGroups")}
            </Button>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {report?.party?.name || t("recvReports.col.party")}
          </p>
          {report?.party?.id ? (
            <Link
              href={`/dashboard/party/customers/${report.party.id}`}
              className="text-sm text-primary hover:underline"
            >
              {t("recvReports.openPartyPage")}
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
              <CardTitle className="text-nameplate text-sm">{t("recvReports.overall")}</CardTitle>
              <CardDescription>
                {isAll ? t("recvReports.allDates") : `${dateFrom || "…"} → ${dateTo || "…"}`}
                {report.group ? ` · ${report.group.name}` : ` · ${t("recvReports.allGroups")}`}
                {report.party ? ` · ${report.party.name}` : ""}
                {` · ${t(`rep.view.${view}` as MessageKey)}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: t("recvReports.total"),
                    value: formatMoney(
                      view === "group" && !drilledParty && !drilledGroup
                        ? groupViewTotals.totalReceivable
                        : report.totals.totalReceivable
                    ),
                    emphasize: true,
                  },
                  {
                    label: t("recvReports.groups"),
                    value: String(
                      view === "group" && !drilledParty && !drilledGroup
                        ? groupViewTotals.groupCount
                        : (report.totals.groupCount ?? byGroup.length)
                    ),
                  },
                  {
                    label: t("recvReports.parties"),
                    value: String(
                      view === "group" && !drilledParty && !drilledGroup
                        ? groupViewTotals.partyCount
                        : report.totals.partyCount
                    ),
                  },
                  {
                    label: t("recvReports.records"),
                    value: String(
                      view === "group" && !drilledParty && !drilledGroup
                        ? groupViewTotals.recordCount
                        : report.totals.recordCount
                    ),
                  },
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

          {view === "group" && !drilledParty ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">{t("recvReports.byGroup")}</CardTitle>
                <CardDescription>{t("recvReports.clickGroup")}</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("recvReports.col.group")}</TableHead>
                      <TableHead className="text-right">{t("recvReports.parties")}</TableHead>
                      <TableHead className="text-right">{t("recvReports.col.count")}</TableHead>
                      <TableHead className="text-right">{t("recvReports.groupTotal")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byGroup.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          {t("recvReports.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      byGroup.map((g) => (
                        <TableRow
                          key={g.groupId || g.name}
                          tabIndex={0}
                          className="cursor-pointer"
                          onClick={() => openGroup(g)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openGroup(g);
                            }
                          }}
                        >
                          <TableCell className="font-medium text-primary underline-offset-2 hover:underline">
                            {g.name}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {g.partyCount}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {g.recordCount}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs text-destructive">
                            {formatMoney(g.balance)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {byGroup.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-medium">{t("recvReports.grandTotal")}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {groupViewTotals.partyCount}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {groupViewTotals.recordCount}
                        </TableCell>
                        <TableCell className="font-data text-right text-sm font-medium text-destructive">
                          {formatMoney(groupViewTotals.totalReceivable)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {view === "party" && !drilledParty ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">{t("recvReports.byParty")}</CardTitle>
                <CardDescription>{t("recvReports.clickParty")}</CardDescription>
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
                        <TableRow
                          key={p.partyId || p.name}
                          tabIndex={0}
                          className="cursor-pointer"
                          onClick={() => openParty(p)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openParty(p);
                            }
                          }}
                        >
                          <TableCell className="font-medium text-primary underline-offset-2 hover:underline">
                            {p.name}
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
          ) : null}

          {view === "party" && drilledParty ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">
                  {report.party
                    ? t("recvReports.partyRecords", { name: report.party.name })
                    : t("recvReports.allRecords")}
                </CardTitle>
                <CardDescription>{t("recvReports.partyPdfHint")}</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.date")}</TableHead>
                      <TableHead>{t("recvReports.col.type")}</TableHead>
                      <TableHead>{t("recvReports.col.reference")}</TableHead>
                      <TableHead>{t("recvReports.col.products")}</TableHead>
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
                          <TableCell className="max-w-[16rem]">
                            {r.products && r.products.length > 0 ? (
                              <div className="flex flex-col gap-0.5">
                                {r.products.map((line, index) => (
                                  <span
                                    key={`${r.id}-p-${index}`}
                                    className="text-sm leading-snug"
                                  >
                                    {line}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
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
                  {report.records.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={6} className="font-medium">
                          {t("recvReports.grandTotal")}
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
          ) : null}
        </>
      )}
    </div>
  );
}
