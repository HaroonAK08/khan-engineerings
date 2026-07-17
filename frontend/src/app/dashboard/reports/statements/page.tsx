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

export default function StatementsPage() {
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
        toast.error(apiError(err, "Failed to load parties"));
      }
    })();
  }, []);

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
      toast.error(apiError(err, "Failed to load statement"));
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [partyId, partyType, dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function onExport(format: "xlsx" | "pdf") {
    if (!partyId) {
      toast.error("Select a customer or supplier first");
      return;
    }
    setExporting(format);
    try {
      await downloadStatementExport(partyType === "customer" ? "customers" : "suppliers", partyId, {
        format,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (err) {
      toast.error(apiError(err, "Export failed"));
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
          <h1 className="text-nameplate text-xl">Customer & supplier statements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ledger history with opening/closing balance — export Excel or PDF.
          </p>
        </div>
        <ExportButtons exporting={exporting} onExport={onExport} />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label>Type</Label>
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
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{partyType === "customer" ? "Customer" : "Supplier"}</Label>
            <Select value={partyId || null} onValueChange={(v) => setPartyId(v || "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
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
            <Label>From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : !statement ? (
        <p className="text-sm text-muted-foreground">Select a party to view their statement.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "Opening", value: formatMoney(statement.openingBalance) },
              { label: "Period balance", value: formatMoney(statement.periodBalance) },
              { label: "Closing (current)", value: formatMoney(statement.closingBalance) },
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
                  "Ledger lines"}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statement.lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        No entries in this period
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
