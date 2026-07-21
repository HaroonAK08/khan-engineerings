"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { ExportButtons } from "@/components/reports/export-buttons";
import { apiError, formatDate, formatMoney, listSuppliers } from "@/lib/materials-api";
import { listCustomers } from "@/lib/sales-api";
import {
  downloadStatementExport,
  getCustomerStatement,
  getSupplierStatement,
  type Statement,
} from "@/lib/reports-api";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";

export default function StatementsPage() {
  const { t } = useI18n();
  const [partyType, setPartyType] = useState<"customer" | "supplier">("customer");
  const [partyId, setPartyId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [customers, setCustomers] = useState<Array<{ _id: string; name: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ _id: string; name: string }>>([]);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [c, s] = await Promise.all([listCustomers(), listSuppliers()]);
        setCustomers(c.map((x) => ({ _id: x._id, name: x.name })));
        setSuppliers(s.map((x) => ({ _id: x._id, name: x.name })));
      } catch (err) {
        toast.error(apiError(err, t("statements.loadPartiesFailed")));
      }
    })();
  }, [t]);

  const load = useCallback(async () => {
    if (!partyId) {
      setStatement(null);
      return;
    }
    setLoading(true);
    try {
      const params = {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };
      const data =
        partyType === "customer"
          ? await getCustomerStatement(partyId, params)
          : await getSupplierStatement(partyId, params);
      setStatement(data);
    } catch (err) {
      toast.error(apiError(err, t("statements.loadFailed")));
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [partyId, partyType, dateFrom, dateTo, t]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function onExport(format: "xlsx" | "pdf") {
    if (!partyId) {
      toast.error(t("statements.selectFirst"));
      return;
    }
    setExporting(format);
    try {
      await downloadStatementExport(partyType === "customer" ? "customers" : "suppliers", partyId, {
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

  const parties = partyType === "customer" ? customers : suppliers;

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
                setStatement(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">{t("common.customer")}</SelectItem>
                <SelectItem value="supplier">{t("common.supplier")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{partyType === "customer" ? t("common.customer") : t("common.supplier")}</Label>
            <Select value={partyId || null} onValueChange={(v) => setPartyId(v || "")}>
              <SelectTrigger>
                <SelectValue placeholder={t("claims.select")} />
              </SelectTrigger>
              <SelectContent>
                {parties.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("common.from")}</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("common.to")}</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : !statement ? (
        <p className="text-sm text-muted-foreground">{t("statements.selectPartyPrompt")}</p>
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
                {[statement.party.phone, statement.party.email].filter(Boolean).join(" · ") ||
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
