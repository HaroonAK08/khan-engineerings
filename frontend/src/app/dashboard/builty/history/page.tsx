"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { thisMonthRange, toDateInput } from "@/lib/date-range";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  customerName,
  deleteBuilty,
  listBuilties,
  paymentStatusLabel,
  type BuiltyRow,
} from "@/lib/sales-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function endOfPreviousMonth(now = new Date()) {
  return toDateInput(new Date(now.getFullYear(), now.getMonth(), 0));
}

export default function BuiltyHistoryPage() {
  const { t } = useI18n();
  const router = useRouter();
  const defaults = useMemo(
    () => ({
      dateFrom: "",
      dateTo: endOfPreviousMonth(),
    }),
    []
  );
  const [rows, setRows] = useState<BuiltyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const monthStart = thisMonthRange().from;
      const params: {
        q?: string;
        paymentStatus?: string;
        dateFrom?: string;
        dateTo?: string;
      } = {};
      if (q.trim()) params.q = q.trim();
      if (paymentStatus) params.paymentStatus = paymentStatus;
      if (dateFrom) params.dateFrom = dateFrom;
      // Cap at day before this month so current-month rows stay on the main page
      const cappedTo = dateTo && dateTo < monthStart ? dateTo : endOfPreviousMonth();
      params.dateTo = cappedTo;
      setRows(await listBuilties(params));
    } catch (err) {
      toast.error(apiError(err, t("builty.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [q, paymentStatus, dateFrom, dateTo, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function onDelete(row: BuiltyRow) {
    if (!confirm(t("builty.confirmDelete"))) return;
    setDeletingId(row._id);
    try {
      await deleteBuilty(row._id);
      toast.success(t("builty.deleted"));
      await load();
    } catch (err) {
      toast.error(apiError(err, t("builty.deleteFailed")));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/builty"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t("builty.backToList")}
          </Link>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("builty.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("builty.historyTitle")}</h1>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("builty.historyTitle")}</CardTitle>
          <CardDescription>{t("builty.historyDesc")}</CardDescription>
          <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder={t("builty.search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
            >
              <option value="">{t("builty.allPayments")}</option>
              <option value="unpaid">{t("orders.unpaid")}</option>
              <option value="partial">{t("orders.partial")}</option>
              <option value="paid">{t("orders.paid")}</option>
            </select>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("builty.dateFrom")}</Label>
              <Input
                type="date"
                value={dateFrom}
                max={endOfPreviousMonth()}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("builty.dateTo")}</Label>
              <Input
                type="date"
                value={dateTo}
                max={endOfPreviousMonth()}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("builty.historyEmpty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("builty.col.date")}</TableHead>
                  <TableHead>{t("builty.col.no")}</TableHead>
                  <TableHead>{t("builty.col.billNo")}</TableHead>
                  <TableHead>{t("builty.col.customer")}</TableHead>
                  <TableHead>{t("builty.col.items")}</TableHead>
                  <TableHead className="text-right">{t("builty.col.total")}</TableHead>
                  <TableHead>{t("orders.col.payment")}</TableHead>
                  <TableHead className="text-end">{t("cus.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row._id}
                    tabIndex={0}
                    className={`cursor-pointer ${
                      row.paymentStatus === "paid"
                        ? "bg-emerald-50 hover:bg-emerald-50/90 dark:bg-emerald-950/40"
                        : ""
                    }`}
                    onClick={() => router.push(`/dashboard/builty/${row._id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/dashboard/builty/${row._id}`);
                      }
                    }}
                  >
                    <TableCell className="font-data text-xs whitespace-nowrap">
                      {formatDate(row.builtyDate)}
                    </TableCell>
                    <TableCell className="font-data text-xs">{row.builtyNo}</TableCell>
                    <TableCell className="font-data text-xs">
                      {row.billNo?.trim() || "—"}
                    </TableCell>
                    <TableCell>{customerName(row.customer)}</TableCell>
                    <TableCell className="max-w-[18rem]">
                      {row.itemDetails && row.itemDetails.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {row.itemDetails.map((detail, index) => (
                            <span key={`${row._id}-${index}`} className="text-sm leading-snug">
                              {detail}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t("builty.col.itemsCount", { count: row.itemCount })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs whitespace-nowrap">
                      {formatMoney(row.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-data">
                        {paymentStatusLabel(row.paymentStatus, t)}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="text-end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex flex-wrap justify-end gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => router.push(`/dashboard/builty/${row._id}/edit`)}
                        >
                          <Pencil className="size-3.5" />
                          {t("common.edit")}
                        </Button>
                        {row.paymentStatus === "unpaid" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="gap-1"
                            disabled={deletingId === row._id}
                            onClick={() => void onDelete(row)}
                          >
                            {deletingId === row._id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                            {t("common.delete")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
