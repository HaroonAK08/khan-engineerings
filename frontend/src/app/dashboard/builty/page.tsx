"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function BuiltyPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<BuiltyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { q?: string; paymentStatus?: string } = {};
      if (q.trim()) params.q = q.trim();
      if (paymentStatus) params.paymentStatus = paymentStatus;
      setRows(await listBuilties(params));
    } catch (err) {
      toast.error(apiError(err, t("builty.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [q, paymentStatus, t]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("builty.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("builty.title")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="#builty-history"
            className="inline-flex h-12 w-fit min-w-44 items-center justify-center gap-2 rounded-lg border border-input bg-background px-8 text-base font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <History className="size-5" />
            Builty History
          </a>
          <Link
            href="/dashboard/builty/new"
            className="inline-flex h-12 w-fit min-w-44 items-center justify-center gap-2 rounded-lg bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm"
          >
            <Plus className="size-5" />
            {t("builty.new")}
          </Link>
        </div>
      </div>

      <Card id="builty-history">
        <CardHeader className="pb-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("builty.empty")}</p>
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
