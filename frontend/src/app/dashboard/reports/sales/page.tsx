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
  getSalesReport,
  listPartyGroups,
  paymentStatusLabel,
  type PartyGroup,
  type SalesReport,
} from "@/lib/sales-api";
import { downloadReportExport } from "@/lib/reports-api";
import { currentMonthRange } from "@/lib/date-range";
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

export default function SalesReportsHubPage() {
  const { t } = useI18n();
  const defaults = currentMonthRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [groupId, setGroupId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [view, setView] = useState<ReportViewMode>("whole");
  const [groups, setGroups] = useState<PartyGroup[]>([]);
  const [report, setReport] = useState<SalesReport | null>(null);
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
      setReport(
        await getSalesReport({
          dateFrom,
          dateTo,
          groupId: groupId || undefined,
          customerId: partyId || undefined,
        })
      );
    } catch (err) {
      toast.error(apiError(err, t("salesReportsHub.loadFailed")));
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
      await downloadReportExport("sales", {
        format,
        dateFrom,
        dateTo,
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

  function openGroup(g: { groupId: string; name: string }) {
    setPartyId("");
    setGroupId(g.groupId || "__ungrouped__");
    setView("party");
  }

  function openParty(p: { customerId: string; name: string }) {
    if (!p.customerId) return;
    setPartyId(p.customerId);
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

  const byGroup = report?.byGroup || [];
  const records = report?.records || [];
  const drilledGroup = Boolean(groupId) && !partyId;
  const drilledParty = Boolean(partyId);

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("rep.salesTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("salesReportsHub.subtitle")}</p>
        </div>
        <ExportButtons exporting={exporting} onExport={onExport} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: t("salesReports.sales"), value: formatMoney(report.totals.totalSales) },
              {
                label: t("salesReportsHub.hubSales"),
                value: formatMoney(report.totals.hubSales ?? 0),
              },
              {
                label: t("salesReportsHub.drumSales"),
                value: formatMoney(report.totals.drumSales ?? 0),
              },
              { label: t("salesReports.collected"), value: formatMoney(report.totals.totalPaid) },
              { label: t("dash.outstanding"), value: formatMoney(report.totals.outstanding) },
              {
                label: t("salesReportsHub.hubUnits"),
                value: String(Math.round(report.totals.hubUnits ?? 0)),
              },
              {
                label: t("salesReportsHub.drumUnits"),
                value: String(Math.round(report.totals.drumUnits ?? 0)),
              },
              {
                label: t("salesReportsHub.totalUnits"),
                value: String(Math.round(report.totals.totalUnits ?? 0)),
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

          {view === "group" && !drilledParty ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">{t("salesReportsHub.byGroup")}</CardTitle>
                <CardDescription>{t("recvReports.clickGroup")}</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("recvReports.col.group")}</TableHead>
                      <TableHead className="text-right">{t("recvReports.parties")}</TableHead>
                      <TableHead className="text-right">{t("customerDetail.orders")}</TableHead>
                      <TableHead className="text-right">{t("salesReports.sales")}</TableHead>
                      <TableHead className="text-right">{t("dash.outstanding")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byGroup.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          {t("salesReportsHub.none")}
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
                            {g.orderCount}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(g.totalSales)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs text-destructive">
                            {formatMoney(g.outstanding)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {view === "party" && !drilledParty ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">
                  {t("salesReportsHub.byParty")}
                </CardTitle>
                <CardDescription>{t("salesReportsHub.clickParty")}</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.customer")}</TableHead>
                      <TableHead className="text-right">{t("customerDetail.orders")}</TableHead>
                      <TableHead className="text-right">{t("salesReports.sales")}</TableHead>
                      <TableHead className="text-right">{t("salesReports.collected")}</TableHead>
                      <TableHead className="text-right">{t("dash.outstanding")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.topCustomers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          {t("salesReportsHub.none")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.topCustomers.map((p) => (
                        <TableRow
                          key={String(p.customerId)}
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
                            {p.orderCount}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(p.totalSales)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(p.totalPaid)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs text-destructive">
                            {formatMoney(p.outstanding)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {report.topCustomers.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-medium">{t("recvReports.grandTotal")}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {report.totals.orderCount}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.totals.totalSales)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.totals.totalPaid)}
                        </TableCell>
                        <TableCell className="font-data text-right text-sm font-medium text-destructive">
                          {formatMoney(report.totals.outstanding)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {(view === "whole" || drilledParty) && !loading ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-nameplate text-sm">
                  {drilledParty
                    ? t("salesReportsHub.partyRecords", {
                        name: report.party?.name || t("recvReports.col.party"),
                      })
                    : t("salesReportsHub.allRecords")}
                </CardTitle>
                <CardDescription>
                  {drilledParty
                    ? t("salesReportsHub.partyPdfHint")
                    : t("salesReportsHub.allRecordsDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.date")}</TableHead>
                      <TableHead>{t("builty.col.no")}</TableHead>
                      {!drilledParty ? (
                        <TableHead>{t("common.customer")}</TableHead>
                      ) : null}
                      <TableHead className="text-right">{t("orders.col.total")}</TableHead>
                      <TableHead className="text-right">{t("salesReports.collected")}</TableHead>
                      <TableHead className="text-right">{t("common.balance")}</TableHead>
                      <TableHead>{t("orders.col.payment")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={drilledParty ? 6 : 7}
                          className="text-muted-foreground"
                        >
                          {t("salesReportsHub.none")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      records.map((r) => (
                        <TableRow key={r.orderId}>
                          <TableCell className="font-data text-xs whitespace-nowrap">
                            {formatDate(r.orderDate)}
                          </TableCell>
                          <TableCell>
                            <Link
                              href={r.href || `/dashboard/builty/${r.orderId}`}
                              className="font-data text-xs text-primary hover:underline"
                            >
                              {r.orderNo || r.invoiceNo}
                            </Link>
                          </TableCell>
                          {!drilledParty ? (
                            <TableCell className="text-sm">{r.customer}</TableCell>
                          ) : null}
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(r.totalAmount)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs">
                            {formatMoney(r.amountPaid)}
                          </TableCell>
                          <TableCell className="font-data text-right text-xs text-destructive">
                            {formatMoney(r.balance)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {paymentStatusLabel(r.paymentStatus, t)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  {records.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell
                          colSpan={drilledParty ? 3 : 4}
                          className="font-medium"
                        >
                          {t("recvReports.grandTotal")}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.totals.totalSales)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(report.totals.totalPaid)}
                        </TableCell>
                        <TableCell className="font-data text-right text-sm font-medium text-destructive">
                          {formatMoney(report.totals.outstanding)}
                        </TableCell>
                        <TableCell />
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
