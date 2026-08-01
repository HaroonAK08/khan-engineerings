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
import { getSalesReport, listPartyGroups, type PartyGroup, type SalesReport } from "@/lib/sales-api";
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
  const [view, setView] = useState<ReportViewMode>("party");
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
        })
      );
    } catch (err) {
      toast.error(apiError(err, t("salesReportsHub.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, groupId, t]);

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
        view,
      });
      toast.success(t("common.downloaded", { format: format.toUpperCase() }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setExporting(null);
    }
  }

  function openGroup(g: { groupId: string; name: string }) {
    setGroupId(g.groupId || "__ungrouped__");
    setView("party");
  }

  function backToGroups() {
    setGroupId("");
    setView("group");
  }

  const byGroup = report?.byGroup || [];
  const drilledGroup = Boolean(groupId);

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
            onValueChange={(v) => setGroupId(!v || v === "__all__" ? "" : v)}
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

      {loading || !report ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: t("customerDetail.orders"), value: String(report.totals.orderCount) },
              { label: t("salesReports.sales"), value: formatMoney(report.totals.totalSales) },
              { label: t("salesReports.collected"), value: formatMoney(report.totals.totalPaid) },
              { label: t("dash.outstanding"), value: formatMoney(report.totals.outstanding) },
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

          {view === "group" ? (
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

          {view === "party" ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-nameplate text-sm">
                    {t("salesReportsHub.byParty")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.customer")}</TableHead>
                        <TableHead className="text-right">{t("customerDetail.orders")}</TableHead>
                        <TableHead className="text-right">{t("salesReports.sales")}</TableHead>
                        <TableHead className="text-right">{t("dash.outstanding")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.topCustomers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground">
                            {t("salesReportsHub.none")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        report.topCustomers.map((p) => (
                          <TableRow key={String(p.customerId)}>
                            <TableCell>
                              <Link
                                href={`/dashboard/party/customers/${p.customerId}`}
                                className="hover:underline"
                              >
                                {p.name}
                              </Link>
                            </TableCell>
                            <TableCell className="font-data text-right text-xs">
                              {p.orderCount}
                            </TableCell>
                            <TableCell className="font-data text-right text-xs">
                              {formatMoney(p.totalSales)}
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
                          <TableCell className="font-data text-right text-sm font-medium text-destructive">
                            {formatMoney(report.totals.outstanding)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    ) : null}
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-nameplate text-sm">
                    {t("salesReportsHub.outstandingInvoices")}
                  </CardTitle>
                  <CardDescription>{t("salesReportsHub.unpaidDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.invoice")}</TableHead>
                        <TableHead>{t("common.customer")}</TableHead>
                        <TableHead>{t("common.date")}</TableHead>
                        <TableHead className="text-right">{t("common.balance")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.outstanding.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground">
                            {t("salesReportsHub.none")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        report.outstanding.map((o) => (
                          <TableRow key={o.orderId}>
                            <TableCell>
                              <Link
                                href={`/dashboard/builty/${o.orderId}`}
                                className="font-data text-xs hover:underline"
                              >
                                {o.invoiceNo}
                              </Link>
                            </TableCell>
                            <TableCell>{o.customer}</TableCell>
                            <TableCell className="font-data text-xs">
                              {formatDate(o.orderDate)}
                            </TableCell>
                            <TableCell className="font-data text-right text-xs">
                              {formatMoney(o.balance)}
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
