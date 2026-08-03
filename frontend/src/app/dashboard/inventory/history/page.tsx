"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  apiError,
  deletePurchase,
  formatDate,
  formatKg,
  formatMoney,
  listPurchases,
  listSuppliers,
  supplierName,
  updatePurchase,
} from "@/lib/materials-api";
import type { Purchase, Supplier } from "@/types/materials";
import { toDateInput } from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function supplierIdOf(p: Purchase) {
  if (!p.supplier) return "";
  if (typeof p.supplier === "string") return p.supplier;
  return p.supplier._id;
}

function dayKey(d: Date) {
  return toDateInput(d);
}

export default function InventoryHistoryPage() {
  const { t } = useI18n();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const {
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    setThisMonth,
    setToday,
    clearRange,
    isThisMonth,
    isToday,
    isAll,
  } = usePersistedDateRange();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [formSupplier, setFormSupplier] = useState("");
  const [formMaterial, setFormMaterial] = useState<"scrap" | "daig">("scrap");
  const [formQty, setFormQty] = useState("");
  const [formRate, setFormRate] = useState("");
  const [formDate, setFormDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const activeSuppliers = useMemo(
    () => suppliers.filter((s) => s.isActive),
    [suppliers]
  );

  const formTotal = useMemo(() => {
    const qty = Number(formQty);
    const rate = Number(formRate);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
    return roundMoney(qty * rate);
  }, [formQty, formRate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, list] = await Promise.all([listSuppliers(), listPurchases()]);
      setSuppliers(s);
      setPurchases(list);
    } catch (err) {
      toast.error(apiError(err, t("purchases.recordsLoadFailed")));
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = purchases.slice();
    if (dateFrom) {
      list = list.filter((p) => dayKey(new Date(p.purchaseDate)) >= dateFrom);
    }
    if (dateTo) {
      list = list.filter((p) => dayKey(new Date(p.purchaseDate)) <= dateTo);
    }
    return list.sort(
      (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
    );
  }, [purchases, dateFrom, dateTo]);

  const total = useMemo(
    () => filtered.reduce((s, p) => s + (p.payable ?? p.totalAmount), 0),
    [filtered]
  );

  const hasDateFilter = Boolean(dateFrom || dateTo);

  function materialLabel(type: string | undefined) {
    return type === "daig" ? t("prod.drum") : t("prod.hub");
  }

  function openEdit(p: Purchase) {
    setEditing(p);
    setFormSupplier(supplierIdOf(p));
    setFormMaterial((p.materialType || "scrap") === "daig" ? "daig" : "scrap");
    setFormQty(String(p.quantityKg));
    setFormRate(String(p.ratePerKg));
    setFormDate(dayKey(new Date(p.purchaseDate)));
    setDialogOpen(true);
  }

  async function saveEdit() {
    if (!editing) return;
    const qty = Math.round(Number(formQty));
    const rate = Number(formRate);
    if (!formSupplier) {
      toast.error(t("purchases.selectSupplier"));
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error(t("purchases.enterQty"));
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error(t("purchases.enterRate"));
      return;
    }
    if (!formDate) {
      toast.error(t("purchases.pickDate"));
      return;
    }
    setSaving(true);
    try {
      await updatePurchase(editing._id, {
        supplier: formSupplier,
        materialType: formMaterial,
        quantityKg: qty,
        ratePerKg: rate,
        totalAmount: roundMoney(qty * rate),
        purchaseDate: formDate,
      });
      toast.success(t("purchases.entryUpdated"));
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("purchases.entrySaveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function removeFromDialog() {
    if (!editing) return;
    if (!confirm(t("purchases.deleteConfirm"))) return;
    setDeleting(true);
    try {
      await deletePurchase(editing._id);
      toast.success(t("purchases.deleted"));
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("purchases.entryDeleteFailed")));
    } finally {
      setDeleting(false);
    }
  }

  async function deleteDirect(p: Purchase) {
    if (!confirm(t("purchases.deleteConfirm"))) return;
    try {
      await deletePurchase(p._id);
      toast.success(t("purchases.deleted"));
      await load();
    } catch (err) {
      toast.error(apiError(err, t("purchases.entryDeleteFailed")));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/dashboard/inventory"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t("purchases.backToInventory")}
          </Link>
          <h1 className="text-nameplate text-xl">{t("purchases.historyTitle")}</h1>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={isAll ? "default" : "outline"}
              onClick={clearRange}
            >
              {t("sal.filterAll")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isToday ? "default" : "outline"}
              onClick={setToday}
            >
              {t("sal.filterToday")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isThisMonth ? "default" : "outline"}
              onClick={setThisMonth}
            >
              {t("sal.filterThisMonth")}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>{t("common.from")}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("common.to")}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("purchases.recordsTotalLabel")}</Label>
              <div className="flex h-11 items-center rounded-md border bg-muted/30 px-3">
                <span className="font-data text-base font-semibold">{formatMoney(total)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            {hasDateFilter ? t("purchases.recordsEmptyFiltered") : t("purchases.recordsEmpty")}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("purchases.col.date")}</TableHead>
                  <TableHead>{t("purchases.col.name")}</TableHead>
                  <TableHead className="text-right">{t("purchases.col.qty")}</TableHead>
                  <TableHead className="text-right">{t("purchases.col.rate")}</TableHead>
                  <TableHead>{t("purchases.col.hubDrum")}</TableHead>
                  <TableHead className="text-end">{t("exp.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="font-data">{formatDate(p.purchaseDate)}</TableCell>
                    <TableCell className="font-medium">{supplierName(p.supplier)}</TableCell>
                    <TableCell className="font-data text-right">
                      {formatKg(p.quantityKg)} kg
                    </TableCell>
                    <TableCell className="font-data text-right">
                      {formatMoney(p.ratePerKg)}
                    </TableCell>
                    <TableCell>{materialLabel(p.materialType)}</TableCell>
                    <TableCell className="text-end">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => openEdit(p)}
                        >
                          <Pencil className="size-3.5" />
                          {t("sal.editPayment")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="gap-1"
                          onClick={() => void deleteDirect(p)}
                        >
                          <Trash2 className="size-3.5" />
                          {t("common.delete")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="font-medium">
                    {t("purchases.recordsTotalLabel")}
                  </TableCell>
                  <TableCell className="text-end font-data font-semibold">
                    {formatMoney(total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-nameplate text-base">
              {t("purchases.editEntry")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("purchases.supplier")}</Label>
              <select
                className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-base dark:bg-input/30"
                value={formSupplier}
                onChange={(e) => setFormSupplier(e.target.value)}
              >
                <option value="">{t("purchases.selectSupplier")}</option>
                {activeSuppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {supplierName(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("purchases.col.hubDrum")}</Label>
              <select
                className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-base dark:bg-input/30"
                value={formMaterial}
                onChange={(e) => setFormMaterial(e.target.value as "scrap" | "daig")}
              >
                <option value="scrap">{t("prod.hub")}</option>
                <option value="daig">{t("prod.drum")}</option>
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>{t("purchases.quantityKg")}</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={formQty}
                  onChange={(e) => setFormQty(e.target.value)}
                  className="h-11 text-base"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("purchases.ratePerKg")}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formRate}
                  onChange={(e) => setFormRate(e.target.value)}
                  className="h-11 text-base"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("purchases.totalAmount")}</Label>
              <div className="font-data flex h-11 items-center rounded-lg border border-border bg-muted/40 px-3 text-base">
                {formTotal > 0 ? formatMoney(formTotal) : "—"}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("purchases.purchaseDate")}</Label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              disabled={saving || deleting}
              onClick={() => void removeFromDialog()}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("common.delete")}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving || deleting}
                onClick={() => setDialogOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={saving || deleting}
                onClick={() => void saveEdit()}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("common.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
