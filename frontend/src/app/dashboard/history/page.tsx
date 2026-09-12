"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { api } from "@/lib/api";
import {
  apiError,
  deletePurchase,
  formatDate,
  formatKg,
  formatMoney,
  listPurchases,
  supplierName,
} from "@/lib/materials-api";
import { customerName, deleteBuilty, listBuilties, type BuiltyRow } from "@/lib/sales-api";
import { deleteBatch, listBatches } from "@/lib/production-api";
import { deleteFactoryExpense, listFactoryExpenses } from "@/lib/expenses-api";
import { listMovements, type StockMovement } from "@/lib/inventory-api";
import type { BatchExpense, ProductionBatch } from "@/types/production";
import type { Purchase } from "@/types/materials";
import { thisMonthRange, todayInput, toDateInput } from "@/lib/date-range";
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
import type { MessageKey } from "@/lib/i18n/messages";

type Kind = "sale" | "production" | "purchase" | "claim" | "expense" | "stock";

type HistoryRow = {
  id: string;
  kind: Kind;
  date: string;
  title: string;
  detail: string;
  href: string;
  canDelete: boolean;
};

type ClaimRow = {
  _id: string;
  claimNo: string;
  claimDate: string;
  customer?: { name: string };
  builty?: { builtyNo?: string };
};

const FILTERS: Array<{ id: "all" | Kind; labelKey: MessageKey }> = [
  { id: "all", labelKey: "history.filter.all" },
  { id: "sale", labelKey: "history.filter.sale" },
  { id: "production", labelKey: "history.filter.production" },
  { id: "purchase", labelKey: "history.filter.purchase" },
  { id: "claim", labelKey: "history.filter.claim" },
  { id: "expense", labelKey: "history.filter.expense" },
  { id: "stock", labelKey: "history.filter.stock" },
];

function kindLabelKey(kind: Kind): MessageKey {
  if (kind === "sale") return "history.type.sale";
  if (kind === "production") return "history.type.production";
  if (kind === "purchase") return "history.type.purchase";
  if (kind === "claim") return "history.type.claim";
  if (kind === "expense") return "history.type.expense";
  return "history.type.stock";
}

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function productName(batch: ProductionBatch) {
  const out = batch.outputs?.[0]?.product;
  if (out && typeof out === "object") return out.name;
  if (batch.product && typeof batch.product === "object") return batch.product.name;
  return batch.batchNo;
}

function batchQty(batch: ProductionBatch) {
  const fromOut = (batch.outputs || []).reduce((sum, o) => sum + (o.quantity || 0), 0);
  return fromOut || batch.goodUnits || 0;
}

function dayKey(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return toDateInput(d);
}

function inRange(date: string, from: string, to: string) {
  const day = dayKey(date);
  if (!day) return true;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function expenseHref(category: string) {
  const c = String(category || "").toLowerCase();
  if (c.includes("electric")) return "/dashboard/expenses/electricity";
  if (c.includes("tax")) return "/dashboard/expenses/taxes";
  if (c.includes("salary") || c.includes("wage") || c.includes("labour") || c.includes("labor")) {
    return "/dashboard/expenses/salaries";
  }
  return "/dashboard/expenses/other";
}

export default function HistoryPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const month = useMemo(() => thisMonthRange(), []);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [dateFrom, setDateFrom] = useState(month.from);
  const [dateTo, setDateTo] = useState(month.to);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const rangeParams = useMemo(() => {
    const params: { dateFrom?: string; dateTo?: string } = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    return params;
  }, [dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [builties, batches, purchases, expenses, movements, claimsRes] =
        await Promise.allSettled([
          listBuilties(rangeParams),
          listBatches(rangeParams),
          listPurchases(rangeParams),
          listFactoryExpenses(rangeParams),
          listMovements({ reason: "adjustment", ...rangeParams }),
          api.get<{ claims: ClaimRow[] }>("/claims"),
        ]);

      const next: HistoryRow[] = [];

      for (const row of settled(builties, [] as BuiltyRow[])) {
        next.push({
          id: `sale-${row._id}`,
          kind: "sale",
          date: row.builtyDate,
          title: row.builtyNo,
          detail: `${customerName(row.customer)}${row.totalAmount ? ` · ${formatMoney(row.totalAmount)}` : ""}`,
          href: `/dashboard/builty/${row._id}/edit`,
          canDelete: true,
        });
      }

      for (const batch of settled(batches, [] as ProductionBatch[])) {
        next.push({
          id: `production-${batch._id}`,
          kind: "production",
          date: batch.productionDate,
          title: batch.batchNo,
          detail: `${productName(batch)} · ${batchQty(batch)} pcs`,
          href: "/dashboard/production/history",
          canDelete: true,
        });
      }

      for (const purchase of settled(purchases, [] as Purchase[])) {
        next.push({
          id: `purchase-${purchase._id}`,
          kind: "purchase",
          date: purchase.purchaseDate,
          title: purchase.invoiceNo || t("history.type.purchase"),
          detail: `${supplierName(purchase.supplier)} · ${purchase.materialType} · ${formatKg(purchase.quantityKg)} kg`,
          href: "/dashboard/inventory/history",
          canDelete: true,
        });
      }

      for (const expense of settled(expenses, [] as BatchExpense[])) {
        next.push({
          id: `expense-${expense._id}`,
          kind: "expense",
          date: expense.expenseDate,
          title: expense.title || String(expense.category),
          detail: formatMoney(expense.amount),
          href: expenseHref(String(expense.category)),
          canDelete: true,
        });
      }

      for (const movement of settled(movements, [] as StockMovement[])) {
        const name = movement.product?.name || movement.itemType;
        next.push({
          id: `stock-${movement._id}`,
          kind: "stock",
          date: movement.movementDate,
          title: `${movement.direction} ${movement.quantity} ${movement.unit}`,
          detail: name,
          href: "/dashboard/inventory/movements",
          canDelete: false,
        });
      }

      const claims =
        claimsRes.status === "fulfilled" ? claimsRes.value.data.claims || [] : [];
      for (const claim of claims) {
        next.push({
          id: `claim-${claim._id}`,
          kind: "claim",
          date: claim.claimDate,
          title: claim.claimNo,
          detail: [claim.customer?.name, claim.builty?.builtyNo].filter(Boolean).join(" · "),
          href: `/dashboard/claims?edit=${claim._id}`,
          canDelete: true,
        });
      }

      next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRows(next);
    } catch (err) {
      toast.error(apiError(err, t("history.loadFailed")));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [t, rangeParams]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "all" && row.kind !== filter) return false;
      if (!inRange(row.date, dateFrom, dateTo)) return false;
      if (!term) return true;
      return (
        row.title.toLowerCase().includes(term) ||
        row.detail.toLowerCase().includes(term) ||
        t(kindLabelKey(row.kind)).toLowerCase().includes(term)
      );
    });
  }, [rows, filter, q, t, dateFrom, dateTo]);

  async function onDelete(row: HistoryRow) {
    if (!row.canDelete) return;
    if (!confirm(t("history.confirmDelete"))) return;
    const rawId = row.id.slice(row.id.indexOf("-") + 1);
    setDeletingId(row.id);
    try {
      if (row.kind === "sale") await deleteBuilty(rawId);
      else if (row.kind === "production") await deleteBatch(rawId);
      else if (row.kind === "purchase") await deletePurchase(rawId);
      else if (row.kind === "expense") await deleteFactoryExpense(rawId);
      else if (row.kind === "claim") await api.delete(`/claims/${rawId}`);
      toast.success(t("history.deleted"));
      await load();
    } catch (err) {
      toast.error(apiError(err, t("history.deleteFailed")));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-nameplate text-xl">{t("history.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("history.subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-nameplate text-sm">{t("history.title")}</CardTitle>
          <CardDescription>{t("history.subtitle")}</CardDescription>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                size="sm"
                variant={!dateFrom && !dateTo ? "default" : "outline"}
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                {t("common.all")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={dateFrom === month.from && dateTo === month.to ? "default" : "outline"}
                onClick={() => {
                  setDateFrom(month.from);
                  setDateTo(month.to);
                }}
              >
                {t("common.thisMonth")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={dateFrom === todayInput() && dateTo === todayInput() ? "default" : "outline"}
                onClick={() => {
                  const today = todayInput();
                  setDateFrom(today);
                  setDateTo(today);
                }}
              >
                {t("common.today")}
              </Button>
              <div className="grid gap-1.5">
                <Label htmlFor="history-from">{t("common.from")}</Label>
                <Input
                  id="history-from"
                  type="date"
                  className="w-auto"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="history-to">{t("common.to")}</Label>
                <Input
                  id="history-to"
                  type="date"
                  className="w-auto"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    size="sm"
                    variant={filter === item.id ? "default" : "outline"}
                    onClick={() => setFilter(item.id)}
                  >
                    {t(item.labelKey)}
                  </Button>
                ))}
              </div>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("common.search")}
                className="lg:max-w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("history.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead>{t("common.type")}</TableHead>
                    <TableHead>{t("common.notes")}</TableHead>
                    <TableHead className="text-end">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-data whitespace-nowrap text-sm">
                        {formatDate(row.date)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{t(kindLabelKey(row.kind))}</Badge>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{row.title}</p>
                        <p className="text-sm text-muted-foreground">{row.detail}</p>
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="inline-flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => router.push(row.href)}
                            aria-label={t("common.edit")}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          {row.canDelete ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive"
                              disabled={deletingId === row.id}
                              onClick={() => void onDelete(row)}
                              aria-label={t("common.delete")}
                            >
                              {deletingId === row.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
