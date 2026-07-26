"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";
import { listProducts } from "@/lib/production-api";
import { getFinishedStock } from "@/lib/inventory-api";
import {
  createBuilty,
  createCustomer,
  getCustomer,
  listCustomers,
  type BuiltyLineInput,
  type Customer,
  type PricingMode,
} from "@/lib/sales-api";
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
import { todayInput } from "@/lib/date-range";

type Line = {
  product: string;
  quantity: number;
  pricingMode: PricingMode;
  ratePerKg: number;
  fixedAmount: number;
};

const NEW_CUSTOMER = "__new__";

function emptyLine(): Line {
  return { product: "", quantity: 1, pricingMode: "rate_kg", ratePerKg: 0, fixedAmount: 0 };
}

function lineTotal(products: Product[], line: Line) {
  const product = products.find((p) => p._id === line.product);
  const weightKg = Number(product?.weightKg) || 0;
  const qty = Number(line.quantity) || 0;
  if (line.pricingMode === "fixed") {
    return Math.round(qty * (Number(line.fixedAmount) || 0) * 100) / 100;
  }
  const unit = weightKg * (Number(line.ratePerKg) || 0);
  return Math.round(qty * unit * 100) / 100;
}

function BuiltyForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState(searchParams.get("customer") || "");
  const [builtyNo, setBuiltyNo] = useState("");
  const [billNo, setBillNo] = useState("");
  const [builtyDate, setBuiltyDate] = useState(todayInput());
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [previousPending, setPreviousPending] = useState(0);
  const [partyBalance, setPartyBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [productPickerIndex, setProductPickerIndex] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");

  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p, stock] = await Promise.all([
        listCustomers({ active: "true" }),
        listProducts({ active: "true" }),
        getFinishedStock(),
      ]);
      setCustomers(c);
      setProducts(p);
      const map: Record<string, number> = {};
      for (const item of stock.items) {
        map[item.productId] = (map[item.productId] || 0) + item.quantity;
      }
      setStockByProduct(map);
    } catch (err) {
      toast.error(apiError(err, t("builtyNew.createFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (!customer) {
      setPartyBalance(null);
      return;
    }
    getCustomer(customer)
      .then((data) => {
        if (!cancelled) setPartyBalance(data.balance);
      })
      .catch(() => {
        if (!cancelled) setPartyBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [customer]);

  const inStockProducts = useMemo(
    () => products.filter((p) => (stockByProduct[p._id] || 0) > 0),
    [products, stockByProduct]
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return inStockProducts;
    return inStockProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.family?.toLowerCase().includes(q) ||
        String(p.weightKg ?? "").includes(q)
    );
  }, [inStockProducts, productSearch]);

  const total = useMemo(
    () => Math.round(lines.reduce((s, l) => s + lineTotal(products, l), 0) * 100) / 100,
    [lines, products]
  );

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
    if (!builtyNo.trim()) {
      toast.error(t("builtyNew.needBuiltyNo"));
      return;
    }
    if (!customer) {
      toast.error(t("builtyNew.selectParty"));
      return;
    }
    const valid = lines.filter((l) => l.product && Number(l.quantity) > 0);
    if (valid.length === 0) {
      toast.error(t("builtyNew.needItems"));
      return;
    }
    for (const l of valid) {
      if (l.pricingMode === "rate_kg" && !(Number(l.ratePerKg) > 0)) {
        toast.error(t("orderNew.rateRequired"));
        return;
      }
      if (l.pricingMode === "fixed" && !(Number(l.fixedAmount) > 0)) {
        toast.error(t("builtyNew.fixedRequired"));
        return;
      }
    }

    const items: BuiltyLineInput[] = valid.map((l) => ({
      product: l.product,
      quantity: Number(l.quantity),
      pricingMode: l.pricingMode,
      ...(l.pricingMode === "rate_kg"
        ? { ratePerKg: Number(l.ratePerKg) }
        : { fixedAmount: Number(l.fixedAmount) }),
    }));

    setSaving(true);
    try {
      const data = await createBuilty({
        builtyNo: builtyNo.trim(),
        billNo: billNo.trim() || undefined,
        customer,
        builtyDate,
        items,
        previousPending: previousPending > 0 ? previousPending : undefined,
      });
      toast.success(t("builtyNew.created"));
      router.push(`/dashboard/builty/${data.builty._id}`);
    } catch (err) {
      toast.error(apiError(err, t("builtyNew.createFailed")));
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
          href="/dashboard/builty"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {t("builty.title")}
        </Link>
        <h1 className="text-nameplate text-xl">{t("builtyNew.title")}</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("builtyNew.title")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>{t("builtyNew.party")}</Label>
              <div className="flex gap-2">
                <select
                  className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-base dark:bg-input/30"
                  value={customer}
                  onChange={(e) => onCustomerSelect(e.target.value)}
                  required
                >
                  <option value="">{t("builtyNew.selectParty")}</option>
                  <option value={NEW_CUSTOMER}>{t("builtyNew.newParty")}</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={openNewCustomer}
                  title={t("builtyNew.newParty")}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
              {customer && partyBalance !== null && (
                <p className="font-data text-xs text-muted-foreground">
                  {t("builtyNew.currentPending", { amount: formatMoney(partyBalance) })}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>{t("builtyNew.previousPending")}</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={previousPending || ""}
                onChange={(e) =>
                  setPreviousPending(e.target.value === "" ? 0 : Number(e.target.value))
                }
                placeholder="0"
                className="h-11 text-base"
              />
              <p className="text-xs text-muted-foreground">
                {t("builtyNew.previousPendingHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("builtyNew.builtyNo")}</Label>
              <Input
                value={builtyNo}
                onChange={(e) => setBuiltyNo(e.target.value)}
                placeholder={t("builtyNew.builtyNoHint")}
                className="h-11 text-base"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("builtyNew.billNo")}</Label>
              <Input
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                placeholder={t("builtyNew.billNoHint")}
                className="h-11 text-base"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("builtyNew.date")}</Label>
              <Input
                type="date"
                value={builtyDate}
                onChange={(e) => setBuiltyDate(e.target.value)}
                className="h-11"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("builtyNew.products")}</CardTitle>
            <CardDescription>{t("builtyNew.productsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const selected = products.find((p) => p._id === line.product);
              const weightKg = Number(selected?.weightKg) || 0;
              const amount = lineTotal(products, line);
              const available = selected ? stockByProduct[selected._id] || 0 : 0;
              return (
                <div
                  key={index}
                  className="flex flex-col gap-3 rounded-lg border border-border/60 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="relative min-w-0 flex-1">
                      <div className="overflow-hidden rounded-lg border border-input">
                        <button
                          type="button"
                          className="flex h-11 w-full items-center px-2.5 text-left text-base hover:bg-muted/50"
                          onClick={() => {
                            setProductPickerIndex(productPickerIndex === index ? null : index);
                            setProductSearch("");
                          }}
                        >
                          <span
                            className={selected ? "truncate text-foreground" : "text-muted-foreground"}
                          >
                            {selected
                              ? `${selected.name}${weightKg > 0 ? ` · ${formatKg(weightKg)} kg` : ""} · ${t("builtyNew.stock", { qty: available })}`
                              : t("orderNew.productPh")}
                          </span>
                        </button>
                        {productPickerIndex === index && (
                          <div className="border-t border-border bg-card">
                            <div className="relative border-b border-border p-2">
                              <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                className="h-9 pl-8"
                                placeholder={t("prod.searchProduct")}
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {filteredProducts.length === 0 ? (
                                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                                  {inStockProducts.length === 0
                                    ? t("builtyNew.noFinishedStock")
                                    : t("prod.noMatchProduct")}
                                </p>
                              ) : (
                                filteredProducts.map((p) => {
                                  const kg = Number(p.weightKg) || 0;
                                  const available = stockByProduct[p._id] || 0;
                                  return (
                                    <button
                                      key={p._id}
                                      type="button"
                                      className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted ${
                                        line.product === p._id ? "bg-muted" : ""
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
                                        {p.family}
                                        {kg > 0 ? ` · ${formatKg(kg)} kg` : ""}
                                        {` · ${t("builtyNew.stock", { qty: available })}`}
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
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">{t("orderNew.col.qty")}</Label>
                      <Input
                        type="number"
                        step="1"
                        min={1}
                        max={available > 0 ? available : undefined}
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                        className="h-11"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">{t("builtyNew.pricingMode")}</Label>
                      <div className="flex h-11 overflow-hidden rounded-lg border border-input">
                        <button
                          type="button"
                          className={`flex-1 text-sm ${
                            line.pricingMode === "rate_kg"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground"
                          }`}
                          onClick={() => updateLine(index, { pricingMode: "rate_kg" })}
                        >
                          {t("builtyNew.mode.rate")}
                        </button>
                        <button
                          type="button"
                          className={`flex-1 text-sm ${
                            line.pricingMode === "fixed"
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground"
                          }`}
                          onClick={() => updateLine(index, { pricingMode: "fixed" })}
                        >
                          {t("builtyNew.mode.fixed")}
                        </button>
                      </div>
                    </div>
                    {line.pricingMode === "rate_kg" ? (
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">{t("orderNew.col.rate")}</Label>
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
                          className="h-11"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">{t("builtyNew.fixedAmount")}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={line.fixedAmount || ""}
                          onChange={(e) =>
                            updateLine(index, {
                              fixedAmount: e.target.value === "" ? 0 : Number(e.target.value),
                            })
                          }
                          placeholder={t("builtyNew.fixedPh")}
                          className="h-11"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">{t("orderNew.col.amount")}</Label>
                      <div className="font-data flex h-11 items-center justify-end rounded-lg border border-border bg-muted/40 px-2.5 text-base">
                        {formatMoney(amount)}
                      </div>
                    </div>
                  </div>

                  {line.pricingMode === "rate_kg" && selected && weightKg > 0 && line.ratePerKg > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("orderNew.calcHint", {
                        qty: line.quantity,
                        kg: formatKg(weightKg),
                        rate: formatMoney(line.ratePerKg),
                        amount: formatMoney(amount),
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
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus className="size-4" />
              {t("orderNew.addLine")}
            </Button>
            <p className="font-data text-right text-base">
              {t("orderNew.total")} <span className="text-xl">{formatMoney(total)}</span>
            </p>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving} className="h-12 w-fit gap-2 px-8 text-base">
          {saving && <Loader2 className="size-4 animate-spin" />}
          {t("builtyNew.create")}
        </Button>
      </form>

      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-nameplate text-base">{t("builtyNew.newParty")}</DialogTitle>
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
              <Input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
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

export default function NewBuiltyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <BuiltyForm />
    </Suspense>
  );
}
