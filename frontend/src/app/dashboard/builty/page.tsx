"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  customerName,
  deleteBuilty,
  listBuilties,
  updateBuilty,
  type BuiltyRow,
} from "@/lib/sales-api";
import { toDateInput } from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export default function BuiltyPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<BuiltyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<BuiltyRow | null>(null);
  const [formBuiltyNo, setFormBuiltyNo] = useState("");
  const [formBillNo, setFormBillNo] = useState("");
  const [formDate, setFormDate] = useState("");
  const [saving, setSaving] = useState(false);

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

  function openEdit(row: BuiltyRow) {
    setEditing(row);
    setFormBuiltyNo(row.builtyNo || "");
    setFormBillNo(row.billNo || "");
    setFormDate(toDateInput(new Date(row.builtyDate)));
    setEditOpen(true);
  }

  async function onSaveEdit() {
    if (!editing) return;
    if (!formBuiltyNo.trim()) {
      toast.error(t("builtyNew.needBuiltyNo"));
      return;
    }
    if (!formDate) {
      toast.error(t("builtyNew.date"));
      return;
    }
    setSaving(true);
    try {
      await updateBuilty(editing._id, {
        builtyNo: formBuiltyNo.trim(),
        billNo: formBillNo.trim(),
        builtyDate: formDate,
      });
      toast.success(t("builty.updated"));
      setEditOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("builty.updateFailed")));
    } finally {
      setSaving(false);
    }
  }

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
        <Link
          href="/dashboard/builty/new"
          className="inline-flex h-8 w-fit items-center gap-2 rounded-lg bg-primary px-3 text-sm text-primary-foreground"
        >
          <Plus className="size-4" />
          {t("builty.new")}
        </Link>
      </div>

      <Card>
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
                  <TableHead>{t("builty.col.orders")}</TableHead>
                  <TableHead className="text-right">{t("builty.col.given")}</TableHead>
                  <TableHead className="text-right">{t("builty.col.total")}</TableHead>
                  <TableHead className="text-right">{t("builty.col.left")}</TableHead>
                  <TableHead className="text-end">{t("cus.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row._id}
                    tabIndex={0}
                    className={`cursor-pointer ${
                      row.balance <= 0
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
                      {row.orderDetails && row.orderDetails.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {row.orderDetails.map((detail, index) => (
                            <span key={`${row._id}-${index}`} className="text-sm leading-snug">
                              {detail}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t("builty.col.ordersCount", { count: row.orderCount })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs whitespace-nowrap">
                      {formatMoney(row.amountPaid)}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs whitespace-nowrap">
                      {formatMoney(row.totalAmount)}
                    </TableCell>
                    <TableCell
                      className={`font-data text-right text-xs whitespace-nowrap ${
                        row.balance > 0 ? "text-destructive" : ""
                      }`}
                    >
                      {formatMoney(row.balance)}
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
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="size-3.5" />
                          {t("sal.editPayment")}
                        </Button>
                        {row.amountPaid === 0 && (
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-nameplate text-base">{t("builty.edit")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("builtyNew.builtyNo")}</Label>
              <Input
                value={formBuiltyNo}
                onChange={(e) => setFormBuiltyNo(e.target.value)}
                className="h-11 text-base"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("builtyNew.billNo")}</Label>
              <Input
                value={formBillNo}
                onChange={(e) => setFormBillNo(e.target.value)}
                placeholder={t("builtyNew.billNoHint")}
                className="h-11 text-base"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("builtyNew.date")}</Label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void onSaveEdit()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
