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
import { listCustomers, listPartyGroups, type PartyGroup } from "@/lib/sales-api";
import {
  downloadCustomersOverviewExport,
  downloadGroupStatementExport,
  downloadStatementExport,
  getCustomerStatement,
  getCustomersOverviewStatement,
  getGroupStatement,
  getSupplierStatement,
  type GroupStatement,
  type Statement,
} from "@/lib/reports-api";
import { DateRangeFilter } from "@/components/date-range-filter";
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

export default function StatementsPage() {
  const { t } = useI18n();
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();
  const [partyType, setPartyType] = useState<"customer" | "supplier">("customer");
  const [view, setView] = useState<ReportViewMode>("party");
  const [partyId, setPartyId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [customers, setCustomers] = useState<Array<{ _id: string; name: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ _id: string; name: string }>>([]);
  const [groups, setGroups] = useState<PartyGroup[]>([]);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [groupStatement, setGroupStatement] = useState<GroupStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [c, s, g] = await Promise.all([
          listCustomers(),
          listSuppliers(),
          listPartyGroups({ active: "true" }),
        ]);
        setCustomers(c.map((x) => ({ _id: x._id, name: x.name })));
        setSuppliers(s.map((x) => ({ _id: x._id, name: x.name })));
        setGroups(g);
      } catch (err) {
        toast.error(apiError(err, t("statements.loadPartiesFailed")));
      }
    })();
  }, [t]);

  useEffect(() => {
    if (partyType === "supplier" && view === "group") setView("party");
  }, [partyType, view]);

  const load = useCallback(async () => {
    if (!hydrated) return;
    const params = {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    };

    if (partyType === "supplier") {
      if (!partyId) {
        setStatement(null);
        setGroupStatement(null);
        return;
      }
      setLoading(true);
      try {
        setStatement(await getSupplierStatement(partyId, params));
        setGroupStatement(null);
      } catch (err) {
        toast.error(apiError(err, t("statements.loadFailed")));
        setStatement(null);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (view === "whole") {
      setLoading(true);
      try {
        setGroupStatement(await getCustomersOverviewStatement(params));
        setStatement(null);
      } catch (err) {
        toast.error(apiError(err, t("statements.loadFailed")));
        setGroupStatement(null);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (view === "group") {
      if (!groupId) {
        setStatement(null);
        setGroupStatement(null);
        return;
      }
      setLoading(true);
      try {
        setGroupStatement(await getGroupStatement(groupId, params));
        setStatement(null);
      } catch (err) {
        toast.error(apiError(err, t("statements.loadFailed")));
        setGroupStatement(null);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!partyId) {
      setStatement(null);
      setGroupStatement(null);
      return;
    }
    setLoading(true);
    try {
      setStatement(await getCustomerStatement(partyId, params));
      setGroupStatement(null);
    } catch (err) {
      toast.error(apiError(err, t("statements.loadFailed")));
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [partyId, groupId, partyType, view, dateFrom, dateTo, hydrated, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function onExport(format: "pdf") {
    setExporting(format);
    try {
      const params = {
        format,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };
      if (partyType === "supplier") {
        if (!partyId) {
          toast.error(t("statements.selectFirst"));
          return;
        }
        await downloadStatementExport("suppliers", partyId, params);
      } else if (view === "whole") {
        await downloadCustomersOverviewExport(params);
      } else if (view === "group") {
        if (!groupId) {
          toast.error(t("statements.selectGroupFirst"));
          return;
        }
        await downloadGroupStatementExport(groupId, params);
      } else {
        if (!partyId) {
          toast.error(t("statements.selectFirst"));
          return;
        }
        await downloadStatementExport("customers", partyId, params);
      }
      toast.success(t("common.downloaded", { format: format.toUpperCase() }));
    } catch (err) {
      toast.error(apiError(err, t("common.exportFailed")));
    } finally {
      setExporting(null);
    }
  }

  const parties = partyType === "customer" ? customers : suppliers;
  const customerModes: ReportViewMode[] =
    partyType === "customer" ? ["whole", "party", "group"] : ["party"];

  const typeSelectItems = useMemo(
    () => ({
      customer: t("common.customer"),
      supplier: t("common.supplier"),
    }),
    [t]
  );

  const partySelectItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const p of parties) items[p._id] = p.name;
    return items;
  }, [parties]);

  const groupSelectItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const g of groups) items[g._id] = g.name;
    return items;
  }, [groups]);

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-nameplate text-xl">{t("statements.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("statements.subtitle")}</p>
        </div>
        <ExportButtons exporting={exporting} onExport={onExport} />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label>{t("common.type")}</Label>
            <Select
              value={partyType}
              onValueChange={(v) => {
                setPartyType((v as "customer" | "supplier") || "customer");
                setPartyId("");
                setGroupId("");
                setStatement(null);
                setGroupStatement(null);
                setView("party");
              }}
              items={typeSelectItems}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">{typeSelectItems.customer}</SelectItem>
                <SelectItem value="supplier">{typeSelectItems.supplier}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {partyType === "customer" && view === "group" ? (
            <div className="grid gap-1.5">
              <Label>{t("recvReports.group")}</Label>
              <Select
                value={groupId || null}
                onValueChange={(v) => setGroupId(v || "")}
                items={groupSelectItems}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("statements.selectGroup")} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g._id} value={g._id}>
                      {groupSelectItems[g._id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : partyType === "customer" && view === "whole" ? (
            <div className="grid gap-1.5">
              <Label>{t("rep.view.whole")}</Label>
              <p className="text-sm text-muted-foreground">{t("statements.overallHint")}</p>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label>{partyType === "customer" ? t("common.customer") : t("common.supplier")}</Label>
              <Select
                value={partyId || null}
                onValueChange={(v) => setPartyId(v || "")}
                items={partySelectItems}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("claims.select")} />
                </SelectTrigger>
                <SelectContent>
                  {parties.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {partySelectItems[p._id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="sm:col-span-2">
            <DateRangeFilter />
          </div>
        </CardContent>
      </Card>

      <ReportViewToggle value={view} onChange={setView} modes={customerModes} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : groupStatement ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                label: t("statements.opening"),
                value: formatMoney(groupStatement.openingBalance),
              },
              {
                label: t("statements.periodBalance"),
                value: formatMoney(groupStatement.periodBalance),
              },
              {
                label: t("statements.closingCurrent"),
                value: formatMoney(groupStatement.closingBalance),
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
              <CardTitle className="text-nameplate text-sm">
                {groupStatement.group?.name || t("rep.view.whole")}
              </CardTitle>
              <CardDescription>
                {t("statements.partiesInScope", { count: groupStatement.parties.length })}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.customer")}</TableHead>
                    <TableHead className="text-right">{t("statements.opening")}</TableHead>
                    <TableHead className="text-right">{t("statements.periodBalance")}</TableHead>
                    <TableHead className="text-right">{t("statements.closingCurrent")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupStatement.parties.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        {t("statements.noEntriesPeriod")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    groupStatement.parties.map((p) => (
                      <TableRow key={p.partyId}>
                        <TableCell>
                          <Link
                            href={`/dashboard/party/customers/${p.partyId}`}
                            className="hover:underline"
                          >
                            {p.name}
                          </Link>
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(p.openingBalance)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(p.periodBalance)}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(p.closingBalance)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {groupStatement.parties.length > 0 ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-medium">{t("recvReports.grandTotal")}</TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatMoney(groupStatement.openingBalance)}
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatMoney(groupStatement.periodBalance)}
                      </TableCell>
                      <TableCell className="font-data text-right text-sm font-medium">
                        {formatMoney(groupStatement.closingBalance)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                ) : null}
              </Table>
            </CardContent>
          </Card>
        </>
      ) : !statement ? (
        <p className="text-sm text-muted-foreground">
          {view === "group"
            ? t("statements.selectGroupPrompt")
            : t("statements.selectPartyPrompt")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: t("statements.opening"), value: formatMoney(statement.openingBalance) },
              { label: t("statements.periodBalance"), value: formatMoney(statement.periodBalance) },
              { label: t("statements.closingCurrent"), value: formatMoney(statement.closingBalance) },
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
              <CardTitle className="text-nameplate text-sm">{statement.party.name}</CardTitle>
              <CardDescription>
                {[statement.party.phone].filter(Boolean).join(" · ") ||
                  t("statements.ledgerLines")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("common.type")}</TableHead>
                    <TableHead>{t("statements.reference")}</TableHead>
                    <TableHead className="text-right">{t("statements.debit")}</TableHead>
                    <TableHead className="text-right">{t("statements.credit")}</TableHead>
                    <TableHead className="text-right">{t("common.balance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statement.lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        {t("statements.noEntriesPeriod")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    statement.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-data text-xs">{formatDate(l.date)}</TableCell>
                        <TableCell className="text-xs uppercase">{l.type}</TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs">
                          {l.reference}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {l.debit ? formatMoney(l.debit) : "—"}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {l.credit ? formatMoney(l.credit) : "—"}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(l.balance)}
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
