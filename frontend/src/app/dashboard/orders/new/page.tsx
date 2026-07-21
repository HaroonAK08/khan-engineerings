"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { apiError, formatMoney } from "@/lib/materials-api";
import { listProducts } from "@/lib/production-api";
import { createCustomer, createOrder, listCustomers, listSalesmen, type Customer, type Salesman } from "@/lib/sales-api";
import type { Product } from "@/types/production";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";

type Line = { product: string; quantity: number; unitPrice: number };
type CommissionType = "amount" | "percent";

const NEW_CUSTOMER = "__new__";

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewOrderPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesmen, setSalesmen] = useState<Salesman[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customer, setCustomer] = useState("");
  const [salesmanId, setSalesmanId] = useState("");
  const [commissionType, setCommissionType] = useState<CommissionType>("amount");
  const [commissionValue, setCommissionValue] = useState(0);
  const [orderDate, setOrderDate] = useState(todayInput());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product: "", quantity: 1, unitPrice: 0 }]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p, s] = await Promise.all([
        listCustomers({ active: "true" }),
        listProducts({ active: "true" }),
        listSalesmen({ active: "true" }),
      ]);
      setCustomers(c);
      setProducts(p);
      setSalesmen(s);
      if (typeof window !== "undefined") {
        const preset = new URLSearchParams(window.location.search).get("customer");
        if (preset) setCustomer(preset);
      }
    } catch (err) {
      toast.error(apiError(err, t("orderNew.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(
    () =>
      Math.round(
        lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0) * 100
      ) / 100,
    [lines]
  );

  const commissionPreview = useMemo(() => {
    if (!salesmanId || !(Number(commissionValue) > 0)) return 0;
    if (commissionType === "percent") {
      return Math.round(((total * Number(commissionValue)) / 100) * 100) / 100;
    }
    return Math.round(Number(commissionValue) * 100) / 100;
  }, [salesmanId, commissionType, commissionValue, total]);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function openNewCustomer() {
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerAddress("");
    setNewCustomerOpen(true);
  }

  function onCustomerSelect(value: string) {
    if (value === NEW_CUSTOMER) {
      openNewCustomer();
      return;
    }
    setCustomer(value);
  }

  async function onCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    const name = newCustomerName.trim();
    if (!name) {
      toast.error(t("orderNew.customerNameRequired"));
      return;
    }
    setSavingCustomer(true);
    try {
      const created = await createCustomer({
        name,
        phone: newCustomerPhone.trim(),
        address: newCustomerAddress.trim(),
        isActive: true,
      });
      setCustomers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomer(created._id);
      setNewCustomerOpen(false);
      toast.success(t("orderNew.customerCreated"));
    } catch (err) {
      toast.error(apiError(err, t("orderNew.customerCreateFailed")));
    } finally {
      setSavingCustomer(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) {
      toast.error(t("orderNew.selectCustomerErr"));
      return;
    }
    const items = lines.filter((l) => l.product && l.quantity > 0);
    if (items.length === 0) {
      toast.error(t("orderNew.addLineErr"));
      return;
    }
    setSaving(true);
    try {
      const order = await createOrder({
        customer,
        orderDate,
        dueDate: dueDate || undefined,
        notes,
        items,
        ...(salesmanId
          ? {
              salesmanId,
              commissionType,
              commissionValue: Number(commissionValue) || 0,
            }
          : {}),
      });
      toast.success(t("orderNew.created"));
      router.push(`/dashboard/orders/${order._id}`);
    } catch (err) {
      toast.error(apiError(err, t("orderNew.createFailed")));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/dashboard/orders"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {t("orders.title")}
        </Link>
        <h1 className="text-nameplate text-xl">{t("orderNew.title")}</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("orderNew.orderDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>{t("common.customer")}</Label>
              <div className="flex gap-2">
                <select
                  className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  value={customer}
                  onChange={(e) => onCustomerSelect(e.target.value)}
                  required
                >
                  <option value="">{t("orderNew.selectCustomer")}</option>
                  <option value={NEW_CUSTOMER}>{t("orderNew.newCustomer")}</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="outline" size="icon-sm" onClick={openNewCustomer} title={t("orderNew.newCustomer")}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>{t("orderNew.salesman")}</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                value={salesmanId}
                onChange={(e) => {
                  setSalesmanId(e.target.value);
                  if (!e.target.value) setCommissionValue(0);
                }}
              >
                <option value="">{t("orderNew.salesmanNone")}</option>
                {salesmen.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {salesmanId && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("orderNew.commissionType")}</Label>
                  <select
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                    value={commissionType}
                    onChange={(e) => setCommissionType(e.target.value as CommissionType)}
                  >
                    <option value="amount">{t("orderNew.commissionAmount")}</option>
                    <option value="percent">{t("orderNew.commissionPercent")}</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>
                    {t("orderNew.commissionValue")}
                    {commissionType === "percent" ? " (%)" : ""}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={commissionType === "percent" ? 100 : undefined}
                    value={commissionValue}
                    onChange={(e) => setCommissionValue(Number(e.target.value))}
                  />
                </div>
                {commissionPreview > 0 && (
                  <p className="font-data text-xs text-muted-foreground sm:col-span-2">
                    {t("orderNew.commissionPreview", { amount: formatMoney(commissionPreview) })}
                  </p>
                )}
              </>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>{t("orderNew.orderDate")}</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("orderNew.dueDate")}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>{t("common.notes")}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("orderNew.lineItems")}</CardTitle>
            <CardDescription>{t("orderNew.lineItemsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const selected = products.find((p) => p._id === line.product);
              const normalPrice = selected?.sellingPrice;
              return (
                <div key={index} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-12">
                  <select
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm sm:col-span-5 dark:bg-input/30"
                    value={line.product}
                    onChange={(e) => updateLine(index, { product: e.target.value })}
                  >
                    <option value="">{t("orderNew.productPh")}</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step="1"
                    className="sm:col-span-2"
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                    placeholder={t("orderNew.qtyPh")}
                  />
                  <div className="flex flex-col gap-0.5 sm:col-span-3">
                    {selected && (
                      <div className="space-y-0.5 text-[11px] leading-tight text-muted-foreground">
                        <p>
                          {t("orderNew.makeCost")}:{" "}
                          <span className="font-data">
                            {formatMoney(Number(selected.standardCost) || 0)}
                          </span>
                        </p>
                        <p>
                          {t("orderNew.normalPrice")}:{" "}
                          <span className="font-data">
                            {formatMoney(Number(normalPrice) || 0)}
                          </span>
                        </p>
                      </div>
                    )}
                    <Input
                      type="number"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })}
                      placeholder={t("orderNew.unitPricePh")}
                    />
                  </div>
                  <div className="flex h-8 items-center justify-between gap-2 sm:col-span-2">
                    <span className="font-data text-xs">{formatMoney(line.quantity * line.unitPrice)}</span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              className="w-fit gap-2"
              onClick={() => setLines((prev) => [...prev, { product: "", quantity: 1, unitPrice: 0 }])}
            >
              <Plus className="size-4" />
              {t("orderNew.addLine")}
            </Button>
            <p className="font-data text-right text-sm">
              {t("orderNew.total")} <span className="text-lg">{formatMoney(total)}</span>
            </p>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving} className="w-fit gap-2">
          {saving && <Loader2 className="size-4 animate-spin" />}
          {t("orderNew.createBtn")}
        </Button>
      </form>

      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-nameplate text-base">{t("orderNew.newCustomerTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreateCustomer} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("cus.col.name")}</Label>
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("cus.col.phone")}</Label>
              <Input
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("cus.address")}</Label>
              <Input
                value={newCustomerAddress}
                onChange={(e) => setNewCustomerAddress(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewCustomerOpen(false)}>
                {t("cus.cancel")}
              </Button>
              <Button type="submit" disabled={savingCustomer} className="gap-2">
                {savingCustomer && <Loader2 className="size-4 animate-spin" />}
                {t("cus.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
