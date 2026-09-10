"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronsUpDown, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";
import { listProducts } from "@/lib/production-api";
import { getFinishedStock } from "@/lib/inventory-api";
import {
  createCustomer,
  customerName,
  getBuilty,
  getCustomer,
  getPartyProductPrice,
  listCustomers,
  productName,
  updateBuilty,
  type Builty,
  type BuiltyLineInput,
  type Customer,
  type PartyProductPrice,
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
import {
  familyFilterChipClass,
  familyMetaTextClass,
  familyPickerItemClass,
  familyRowClass,
} from "@/lib/product-family";
import { cn } from "@/lib/utils";
import {
  VOICE_BUILTY_ADD_EVENT,
  VOICE_BUILTY_PENDING_KEY,
  type VoiceBuiltyFormPayload,
} from "@/lib/voice/produce-bridge";

const NEW_CUSTOMER = "__new__";

type Line = {
  product: string;
  quantity: number;
  pricingMode: PricingMode;
  ratePerKg: number;
  fixedAmount: number;
  weightKg: number;
};

function emptyLine(): Line {
  return { product: "", quantity: 1, pricingMode: "rate_kg", ratePerKg: 0, fixedAmount: 0, weightKg: 0 };
}

function applyPartyPrice(
  product: Product,
  last: PartyProductPrice | null,
  current: Line
): Partial<Line> {
  if (last) {
    return {
      product: product._id,
      pricingMode: last.pricingMode,
      ratePerKg: last.pricingMode === "rate_kg" ? last.ratePerKg : 0,
      fixedAmount: last.pricingMode === "fixed" ? last.unitPrice : 0,
    };
  }
  return {
    product: product._id,
    ratePerKg:
      Number(product.pricePerKg) > 0 ? Number(product.pricePerKg) : current.ratePerKg || 0,
  };
}

function toDateInput(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function productIdOf(product: Builty["items"][number]["product"]) {
  if (!product) return "";
  if (typeof product === "string") return product;
  return product._id || "";
}

function lineWeightKg(products: Product[], line: Line) {
  if (Number(line.weightKg) > 0) return Number(line.weightKg);
  const product = products.find((p) => p._id === line.product);
  return Number(product?.weightKg) || 0;
}

function lineTotal(products: Product[], line: Line) {
  const weightKg = lineWeightKg(products, line);
  const qty = Number(line.quantity) || 0;
  if (line.pricingMode === "fixed") {
    return Math.round(qty * (Number(line.fixedAmount) || 0) * 100) / 100;
  }
  const unit = weightKg * (Number(line.ratePerKg) || 0);
  return Math.round(qty * unit * 100) / 100;
}

function EditBuiltyForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);

  const [builty, setBuilty] = useState<Builty | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  const [builtyNo, setBuiltyNo] = useState("");
  const [billNo, setBillNo] = useState("");
  const [builtyDate, setBuiltyDate] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [partyBalance, setPartyBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [productPickerIndex, setProductPickerIndex] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productFamilyFilter, setProductFamilyFilter] = useState<"all" | "hub" | "drum">("all");
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, p, stock, c] = await Promise.all([
        getBuilty(id),
        listProducts({ active: "true" }),
        getFinishedStock(),
        listCustomers({ active: "true" }),
      ]);

      const map: Record<string, number> = {};
      for (const item of stock.items) {
        map[item.productId] = (map[item.productId] || 0) + item.quantity;
      }
      for (const item of data.builty.items || []) {
        const pid = productIdOf(item.product);
        if (!pid) continue;
        map[pid] = (map[pid] || 0) + (Number(item.quantity) || 0);
      }

      const customerId =
        data.builty.customer && typeof data.builty.customer === "object"
          ? data.builty.customer._id
          : typeof data.builty.customer === "string"
            ? data.builty.customer
            : "";

      setBuilty(data.builty);
      setCustomers(c);
      setCustomer(customerId);
      setProducts(p);
      setStockByProduct(map);
      setBuiltyNo(data.builty.builtyNo || "");
      setBillNo(data.builty.billNo || "");
      setBuiltyDate(toDateInput(data.builty.builtyDate));
      setLines(
        (data.builty.items || []).length > 0
          ? data.builty.items.map((item) => {
              const mode: PricingMode = item.pricingMode === "fixed" ? "fixed" : "rate_kg";
              return {
                product: productIdOf(item.product),
                quantity: Number(item.quantity) || 1,
                pricingMode: mode,
                ratePerKg: Number(item.ratePerKg) || 0,
                fixedAmount: mode === "fixed" ? Number(item.unitPrice) || 0 : 0,
                weightKg: Number(item.weightKg) || 0,
              };
            })
          : [emptyLine()]
      );
    } catch (err) {
      toast.error(apiError(err, t("builtyDetail.loadFailed")));
      setBuilty(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!customer) {
      setPartyBalance(null);
      return;
    }
    let cancelled = false;
    getCustomer(customer)
      .then((detail) => {
        if (!cancelled) setPartyBalance(Number(detail.balance) || 0);
      })
      .catch(() => {
        if (!cancelled) setPartyBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [customer]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const applyVoiceBuilty = useCallback((payload: VoiceBuiltyFormPayload) => {
    if (payload.customerId) setCustomer(payload.customerId);
    if (payload.builtyNo) setBuiltyNo(payload.builtyNo);
    if (payload.billNo) setBillNo(payload.billNo);
    if (payload.builtyDate) setBuiltyDate(payload.builtyDate);

    if (
      (payload.rateOnly != null || payload.fixedOnly != null) &&
      !payload.items?.length
    ) {
      setLines((prev) => {
        let lastIdx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].product) {
            lastIdx = i;
            break;
          }
        }
        if (lastIdx < 0) return prev;
        return prev.map((line, i) => {
          if (i !== lastIdx) return line;
          if (payload.fixedOnly != null) {
            return {
              ...line,
              pricingMode: "fixed" as PricingMode,
              fixedAmount: Number(payload.fixedOnly) || 0,
              ratePerKg: 0,
            };
          }
          return {
            ...line,
            pricingMode: "rate_kg" as PricingMode,
            ratePerKg: Number(payload.rateOnly) || 0,
          };
        });
      });
      toast.success(
        payload.fixedOnly != null
          ? `Fixed price set to ${payload.fixedOnly}`
          : `Rate set to ${payload.rateOnly}/kg`
      );
      return;
    }

    if (payload.items?.length) {
      setLines((prev) => {
        let next = prev.filter((l) => l.product || prev.length === 1);
        if (next.length === 1 && !next[0].product) next = [];

        for (const row of payload.items) {
          const existingIdx = next.findIndex((l) => l.product === row.productId);
          const pricingMode = (row.pricingMode ||
            (row.amount != null && row.rate == null ? "fixed" : "rate_kg")) as PricingMode;
          if (existingIdx >= 0) {
            const current = next[existingIdx];
            next[existingIdx] = {
              ...current,
              pricingMode,
              ratePerKg:
                pricingMode === "rate_kg"
                  ? row.rate != null
                    ? Number(row.rate) || 0
                    : current.ratePerKg
                  : 0,
              fixedAmount:
                pricingMode === "fixed"
                  ? row.amount != null
                    ? Number(row.amount) || 0
                    : current.fixedAmount
                  : 0,
              quantity:
                row.quantityExplicit === false
                  ? current.quantity
                  : Math.max(1, Math.round(Number(row.quantity) || 1)),
            };
          } else {
            next.push({
              product: row.productId,
              quantity: Math.max(1, Math.round(Number(row.quantity) || 1)),
              pricingMode,
              ratePerKg: pricingMode === "rate_kg" ? Number(row.rate) || 0 : 0,
              fixedAmount: pricingMode === "fixed" ? Number(row.amount) || 0 : 0,
              weightKg: 0,
            });
          }
        }
        return next.length ? next : [emptyLine()];
      });
      toast.success(`Updated ${payload.items.length} product(s) by voice`);
    }
  }, []);

  useEffect(() => {
    const onVoiceAdd = (event: Event) => {
      const detail = (event as CustomEvent<VoiceBuiltyFormPayload>).detail;
      if (detail) applyVoiceBuilty(detail);
    };
    window.addEventListener(VOICE_BUILTY_ADD_EVENT, onVoiceAdd);
    try {
      const raw = sessionStorage.getItem(VOICE_BUILTY_PENDING_KEY);
      if (raw) {
        sessionStorage.removeItem(VOICE_BUILTY_PENDING_KEY);
        const pending = JSON.parse(raw) as VoiceBuiltyFormPayload;
        applyVoiceBuilty(pending);
      }
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener(VOICE_BUILTY_ADD_EVENT, onVoiceAdd);
  }, [applyVoiceBuilty]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    let list = products;
    if (productFamilyFilter !== "all") {
      list = list.filter((p) => p.family === productFamilyFilter);
    }
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.family?.toLowerCase().includes(q) ||
        String(p.weightKg ?? "").includes(q)
    );
  }, [products, productSearch, productFamilyFilter]);

  const total = useMemo(
    () => Math.round(lines.reduce((s, l) => s + lineTotal(products, l), 0) * 100) / 100,
    [lines, products]
  );

  const existingDiscount = Math.max(0, Number(builty?.discountAmount) || 0);
  const netTotal = Math.round(Math.max(0, total - existingDiscount) * 100) / 100;

  const familySummary = useMemo(() => {
    const hub = { qty: 0, amount: 0 };
    const drum = { qty: 0, amount: 0 };
    for (const line of lines) {
      if (!line.product || !(Number(line.quantity) > 0)) continue;
      const product = products.find((p) => p._id === line.product);
      if (!product) continue;
      const qty = Number(line.quantity) || 0;
      const amount = lineTotal(products, line);
      if (product.family === "drum") {
        drum.qty += qty;
        drum.amount += amount;
      } else {
        hub.qty += qty;
        hub.amount += amount;
      }
    }
    return {
      hub: {
        qty: hub.qty,
        amount: Math.round(hub.amount * 100) / 100,
      },
      drum: {
        qty: drum.qty,
        amount: Math.round(drum.amount * 100) / 100,
      },
      totalQty: hub.qty + drum.qty,
    };
  }, [lines, products]);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function selectProduct(index: number, product: Product) {
    let last: PartyProductPrice | null = null;
    if (customer) {
      try {
        last = await getPartyProductPrice(customer, product._id);
      } catch {
        last = null;
      }
    }
    updateLine(index, {
      ...applyPartyPrice(product, last, lines[index] || emptyLine()),
      weightKg: Number(product.weightKg) || 0,
    });
    setProductPickerIndex(null);
    setProductSearch("");
    setProductFamilyFilter("all");
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function onCustomerSelect(value: string) {
    setCustomerPickerOpen(false);
    setCustomerSearch("");
    if (value === NEW_CUSTOMER) {
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerAddress("");
      setNewCustomerOpen(true);
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
      weightKg: Number(l.weightKg) || undefined,
      ...(l.pricingMode === "rate_kg"
        ? { ratePerKg: Number(l.ratePerKg) }
        : { fixedAmount: Number(l.fixedAmount) }),
    }));

    setSaving(true);
    try {
      await updateBuilty(id, {
        builtyNo: builtyNo.trim(),
        billNo: billNo.trim(),
        customer,
        builtyDate,
        items,
      });
      toast.success(t("builty.updated"));
      router.push(`/dashboard/builty/${id}`);
    } catch (err) {
      toast.error(apiError(err, t("builty.updateFailed")));
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

  if (!builty) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">{t("builtyDetail.loadFailed")}</p>
        <Link href="/dashboard/builty" className="text-sm text-primary hover:underline">
          {t("builty.title")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/builty/${id}`}
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {t("builty.title")}
        </Link>
        <h1 className="text-nameplate text-xl">{t("builty.edit")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("builtyEdit.subtitle")}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("builty.edit")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">{t("builtyEdit.partyLabel")}</Label>
                <span className="text-xs font-medium text-primary">{t("builtyEdit.changeParty")}</span>
              </div>
              <div className="relative">
                <div className="overflow-hidden rounded-lg border border-primary/40 bg-background">
                  <button
                    type="button"
                    className="flex h-11 w-full items-center gap-2 px-2.5 text-left text-base hover:bg-muted/50"
                    onClick={() => {
                      setCustomerPickerOpen((prev) => !prev);
                      setCustomerSearch("");
                    }}
                  >
                    <span className={`min-w-0 flex-1 truncate ${customer ? "text-foreground" : "text-muted-foreground"}`}>
                      {customer
                        ? customers.find((c) => c._id === customer)?.name ||
                          customerName(builty.customer)
                        : t("builtyNew.selectParty")}
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 text-primary" />
                  </button>
                  {customerPickerOpen && (
                    <div className="border-t border-border bg-card">
                      <div className="relative border-b border-border p-2">
                        <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="h-9 pl-8"
                          placeholder={t("builtyNew.selectParty")}
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        <button
                          type="button"
                          className="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                          onClick={() => onCustomerSelect(NEW_CUSTOMER)}
                        >
                          <Plus className="mr-2 size-4" />
                          {t("builtyNew.addNewParty")}
                        </button>
                        {filteredCustomers.length === 0 ? (
                          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                            {t("prod.noMatchProduct")}
                          </p>
                        ) : (
                          filteredCustomers.map((c) => (
                            <button
                              key={c._id}
                              type="button"
                              className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted ${
                                customer === c._id ? "bg-muted" : ""
                              }`}
                              onClick={() => onCustomerSelect(c._id)}
                            >
                              <span className="font-medium">{c.name}</span>
                              {(c.phone || c.address) && (
                                <span className="text-xs text-muted-foreground">
                                  {[c.phone, c.address].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("builtyEdit.partyHint")}</p>
              {customer && partyBalance !== null && (
                <p className="font-data text-xs text-muted-foreground">
                  {t("builtyNew.currentPending", { amount: formatMoney(partyBalance) })}
                </p>
              )}
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
            <CardDescription>{t("builtyEdit.productsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {lines.map((line, index) => {
              const selected = products.find((p) => p._id === line.product);
              const weightKg = lineWeightKg(products, line);
              const amount = lineTotal(products, line);
              const available = line.product ? stockByProduct[line.product] || 0 : 0;
              const originalItem = builty.items.find(
                (item) => productIdOf(item.product) === line.product
              );
              const displayName = selected
                ? `${selected.name}${weightKg > 0 ? ` · ${formatKg(weightKg)} kg` : ""} · ${t("builtyNew.stock", { qty: available })}`
                : line.product
                  ? `${productName(originalItem?.product || line.product)} · ${t("builtyNew.stock", { qty: available })}`
                  : t("orderNew.productPh");
              return (
                <div
                  key={index}
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border border-border/60 p-3",
                    selected && familyRowClass(selected.family)
                  )}
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
                            setProductFamilyFilter("all");
                          }}
                        >
                          <span
                            className={cn(
                              line.product ? "truncate text-foreground" : "text-muted-foreground",
                              line.product && available < 0 && "text-amber-700 dark:text-amber-400"
                            )}
                          >
                            {displayName}
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
                            <div className="flex gap-2 border-b border-border px-2 py-2">
                              {(
                                [
                                  { value: "all", label: t("prod.filter.all") },
                                  { value: "hub", label: t("prod.hub") },
                                  { value: "drum", label: t("prod.drum") },
                                ] as const
                              ).map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={cn(
                                    "rounded-md border px-3 py-1 text-xs font-medium",
                                    familyFilterChipClass(
                                      option.value,
                                      productFamilyFilter === option.value
                                    )
                                  )}
                                  onClick={() => setProductFamilyFilter(option.value)}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {filteredProducts.length === 0 ? (
                                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                                  {products.length === 0
                                    ? t("builtyNew.noFinishedStock")
                                    : t("prod.noMatchProduct")}
                                </p>
                              ) : (
                                filteredProducts.map((p) => {
                                  const kg = Number(p.weightKg) || 0;
                                  const avail = stockByProduct[p._id] || 0;
                                  return (
                                    <button
                                      key={p._id}
                                      type="button"
                                      className={cn(
                                        "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm",
                                        familyPickerItemClass(p.family, line.product === p._id)
                                      )}
                                      onClick={() => void selectProduct(index, p)}
                                    >
                                      <span className="font-medium">{p.name}</span>
                                      <span
                                        className={cn(
                                          "text-[10px]",
                                          familyMetaTextClass(p.family),
                                          avail <= 0 && "text-amber-700 dark:text-amber-400"
                                        )}
                                      >
                                        {p.family}
                                        {kg > 0 ? ` · ${formatKg(kg)} kg` : ""}
                                        {` · ${t("builtyNew.stock", { qty: avail })}`}
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
                      onClick={() => removeLine(index)}
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
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                        className="h-11"
                      />
                      {line.product && available < line.quantity && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">
                          Stock {available} — will go negative
                        </p>
                      )}
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
              {t("builtyNew.addMore")}
            </Button>
            <div className="font-data ms-auto space-y-1 text-right text-base">
              {existingDiscount > 0 ? (
                <>
                  <p>
                    {t("builtyNew.subtotal")}{" "}
                    <span className="text-muted-foreground">{formatMoney(total)}</span>
                  </p>
                  <p>
                    {t("builtyNew.discount")}{" "}
                    <span className="text-muted-foreground">−{formatMoney(existingDiscount)}</span>
                  </p>
                </>
              ) : null}
              <p>
                {t("builtyNew.netTotal")} <span className="text-xl">{formatMoney(netTotal)}</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">{t("builtyNew.summary")}</CardTitle>
            <CardDescription>{t("builtyNew.summaryDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{t("builtyNew.totalQty")}</p>
              <p className="font-data mt-1 text-xl">{familySummary.totalQty}</p>
              <p className="font-data mt-1 text-sm text-muted-foreground">
                {formatMoney(netTotal)}
              </p>
            </div>
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
              <p className="text-xs text-sky-700 dark:text-sky-300">{t("prod.hub")}</p>
              <p className="font-data mt-1 text-xl">{familySummary.hub.qty}</p>
              <p className="font-data mt-1 text-sm text-muted-foreground">
                {formatMoney(familySummary.hub.amount)}
              </p>
            </div>
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-400/10 p-3">
              <p className="text-xs text-yellow-800 dark:text-yellow-300">{t("prod.drum")}</p>
              <p className="font-data mt-1 text-xl">{familySummary.drum.qty}</p>
              <p className="font-data mt-1 text-sm text-muted-foreground">
                {formatMoney(familySummary.drum.amount)}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving} className="h-12 w-fit gap-2 px-8 text-base">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("cus.save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 px-8 text-base"
            onClick={() => router.push(`/dashboard/builty/${id}`)}
          >
            {t("cus.cancel")}
          </Button>
        </div>
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

export default function EditBuiltyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <EditBuiltyForm />
    </Suspense>
  );
}
