"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";
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

type Line = { product: string; quantity: number; ratePerKg: number };
type CommissionType = "amount" | "percent";

function lineUnitPrice(products: Product[], line: Line) {
  const product = products.find((p) => p._id === line.product);
  const weightKg = Number(product?.weightKg) || 0;
  return weightKg * (Number(line.ratePerKg) || 0);
}

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
  const [lines, setLines] = useState<Line[]>([{ product: "", quantity: 1, ratePerKg: 0 }]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [productPickerIndex, setProductPickerIndex] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    let list = products.filter((p) => Number(p.weightKg) > 0);
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.family?.toLowerCase().includes(q) ||
          String(p.weightKg).includes(q)
      );
    }
    return list;
  }, [products, productSearch]);

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
        lines.reduce((s, l) => s + (Number(l.quantity) || 0) * lineUnitPrice(products, l), 0) * 100
      ) / 100,
    [lines, products]
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
    if (items.some((l) => !(Number(l.ratePerKg) > 0))) {
      toast.error(t("orderNew.rateRequired"));
      return;
    }
    const missingWeight = items.some((l) => {
      const p = products.find((x) => x._id === l.product);
      return !(Number(p?.weightKg) > 0);
    });
    if (missingWeight) {
      toast.error(t("orderNew.noWeight"));
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
                    step={commissionType === "percent" ? "1" : "0.01"}
                    min={0}
                    max={commissionType === "percent" ? 100 : undefined}
                    value={commissionValue === 0 ? "" : commissionValue}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setCommissionValue(0);
                        return;
                      }
                      const n = Number(raw);
                      if (!Number.isFinite(n) || n < 0) return;
                      setCommissionValue(
                        commissionType === "percent" ? Math.min(100, Math.round(n)) : n
                      );
                    }}
                    placeholder="0"
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
            <div className="hidden grid-cols-12 gap-2 text-xs font-medium text-muted-foreground sm:grid">
              <span className="col-span-4">{t("orderNew.col.product")}</span>
              <span className="col-span-2">{t("orderNew.col.qty")}</span>
              <span className="col-span-2">{t("orderNew.col.weight")}</span>
              <span className="col-span-2">{t("orderNew.col.rate")}</span>
              <span className="col-span-2 text-end">{t("orderNew.col.amount")}</span>
            </div>
            {lines.map((line, index) => {
              const selected = products.find((p) => p._id === line.product);
              const weightKg = Number(selected?.weightKg) || 0;
              const unitPrice = lineUnitPrice(products, line);
              const lineAmount =
                Math.round((Number(line.quantity) || 0) * unitPrice * 100) / 100;
              return (
                <div
                  key={index}
                  className="grid grid-cols-1 items-end gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-12 sm:border-0 sm:p-0"
                >
                  <div className="relative flex flex-col gap-1 sm:col-span-4">
                    <Label className="sm:hidden">{t("orderNew.col.product")}</Label>
                    <div className="overflow-hidden rounded-lg border border-input">
                      <button
                        type="button"
                        className="flex h-8 w-full items-center px-2.5 text-left text-sm hover:bg-muted/50"
                        onClick={() => {
                          const open = productPickerIndex === index ? null : index;
                          setProductPickerIndex(open);
                          setProductSearch("");
                        }}
                      >
                        <span
                          className={
                            selected ? "truncate text-foreground" : "text-muted-foreground"
                          }
                        >
                          {selected
                            ? `${selected.name} · ${formatKg(weightKg)} kg`
                            : t("orderNew.productPh")}
                        </span>
                      </button>
                      {productPickerIndex === index && (
                        <div className="border-t border-border bg-card">
                          <div className="relative border-b border-border p-2">
                            <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              className="h-8 pl-8"
                              placeholder={t("prod.searchProduct")}
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              autoFocus
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredProducts.length === 0 ? (
                              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                                {t("prod.noMatchProduct")}
                              </p>
                            ) : (
                              filteredProducts.map((p) => {
                                const kg = Number(p.weightKg) || 0;
                                const active = line.product === p._id;
                                return (
                                  <button
                                    key={p._id}
                                    type="button"
                                    className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted ${
                                      active ? "bg-muted" : ""
                                    }`}
                                    onClick={() => {
                                      updateLine(index, {
                                        product: p._id,
                                        ratePerKg:
                                          Number(p.pricePerKg) > 0
                                            ? Number(p.pricePerKg)
                                            : line.ratePerKg || 0,
                                      });
                                      setProductPickerIndex(null);
                                      setProductSearch("");
                                    }}
                                  >
                                    <span className="font-medium">{p.name}</span>
                                    <span className="font-data text-[10px] text-muted-foreground uppercase">
                                      {p.family} · {formatKg(kg)} kg
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <Label className="sm:hidden">{t("orderNew.col.qty")}</Label>
                    <Input
                      type="number"
                      step="1"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                      placeholder={t("orderNew.qtyPh")}
                    />
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <Label className="sm:hidden">{t("orderNew.col.weight")}</Label>
                    <div className="font-data flex h-8 items-center rounded-lg border border-border bg-muted/40 px-2.5 text-sm">
                      {selected
                        ? weightKg > 0
                          ? t("orderNew.weightLabel", { kg: formatKg(weightKg) })
                          : t("orderNew.noWeight")
                        : "—"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <Label className="sm:hidden">{t("orderNew.col.rate")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={line.ratePerKg || ""}
                      onChange={(e) =>
                        updateLine(index, {
                          ratePerKg: e.target.value === "" ? 0 : Number(e.target.value),
                        })
                      }
                      placeholder={t("orderNew.ratePerKgPh")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:col-span-2">
                    <div className="min-w-0 text-end sm:flex-1">
                      <p className="font-data text-sm font-medium">{formatMoney(lineAmount)}</p>
                      {selected && weightKg > 0 && line.ratePerKg > 0 && (
                        <p className="truncate text-[10px] text-muted-foreground">
                          {t("orderNew.unitPriceComputed")}: {formatMoney(unitPrice)}
                        </p>
                      )}
                    </div>
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
                  {selected && weightKg > 0 && line.ratePerKg > 0 && line.quantity > 0 && (
                    <p className="text-xs text-muted-foreground sm:col-span-12">
                      {t("orderNew.calcHint", {
                        qty: line.quantity,
                        kg: formatKg(weightKg),
                        rate: formatMoney(line.ratePerKg),
                        amount: formatMoney(lineAmount),
                      })}
                    </p>
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              className="w-fit gap-2"
              onClick={() => setLines((prev) => [...prev, { product: "", quantity: 1, ratePerKg: 0 }])}
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
