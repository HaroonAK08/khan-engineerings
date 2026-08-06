"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { History, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { todayInput } from "@/lib/date-range";
import { api } from "@/lib/api";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import { listProducts } from "@/lib/production-api";
import { listCustomers, getBuilty, type Customer, type Builty } from "@/lib/sales-api";
import type { Product } from "@/types/production";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductSearchSelect } from "@/components/products/product-search-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BuiltyOption = {
  _id: string;
  builtyNo: string;
  billNo?: string;
  customer?: { _id?: string; name: string } | string;
};

type Claim = {
  _id: string;
  claimNo: string;
  claimDate: string;
  status: string;
  refundAmount?: number;
  customer?: { name: string };
  builty?: { _id?: string; builtyNo: string; billNo?: string };
  items: Array<{
    quantity: number;
    disposition: string;
    weightKg?: number | null;
    refundAmount?: number;
    unitPrice?: number | null;
    product?: { name: string };
  }>;
};

type Line = {
  product: string;
  quantity: number;
  weightKg: number;
  unitPrice: number;
  refundAmount: string;
  disposition: "returned" | "rework" | "scrap_loss";
  reason: string;
};

function emptyLine(): Line {
  return {
    product: "",
    quantity: 1,
    weightKg: 0,
    unitPrice: 0,
    refundAmount: "",
    disposition: "returned",
    reason: "",
  };
}

function customerIdOf(c: BuiltyOption["customer"]) {
  if (!c) return "";
  if (typeof c === "string") return c;
  return c._id || "";
}

function calcUnitPrice(product: Product | undefined, weightKg: number) {
  if (!product) return 0;
  const w = weightKg > 0 ? weightKg : Number(product.weightKg) || 0;
  const rate = Number(product.pricePerKg) || 0;
  if (w > 0 && rate > 0) return Math.round(w * rate * 100) / 100;
  return Math.round((Number(product.sellingPrice) || 0) * 100) / 100;
}

function lineSuggestedTotal(line: Line) {
  return Math.round((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * 100) / 100;
}

export default function ClaimsPage() {
  const { t } = useI18n();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<BuiltyOption[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [selectedBuilty, setSelectedBuilty] = useState<Builty | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [party, setParty] = useState("");
  const [builtyId, setBuiltyId] = useState("");
  const [claimDate, setClaimDate] = useState(todayInput());
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [partyPickerOpen, setPartyPickerOpen] = useState(false);
  const [partySearch, setPartySearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [claimsRes, builtyRes, productData, customerData] = await Promise.all([
        api.get<{ claims: Claim[] }>("/claims"),
        api.get<{ builties: BuiltyOption[] }>("/builty"),
        listProducts({ active: "true" }),
        listCustomers({ active: "true" }),
      ]);
      setClaims(claimsRes.data.claims);
      setOrders(builtyRes.data.builties);
      setAllProducts(productData);
      setCustomers(customerData);
    } catch (err) {
      toast.error(apiError(err, "Failed to load claims"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (!builtyId) {
      setSelectedBuilty(null);
      return;
    }
    getBuilty(builtyId)
      .then((data) => {
        if (!cancelled) setSelectedBuilty(data.builty);
      })
      .catch(() => {
        if (!cancelled) setSelectedBuilty(null);
      });
    return () => {
      cancelled = true;
    };
  }, [builtyId]);

  const partyBuilties = useMemo(() => {
    if (!party) return orders;
    return orders.filter((o) => customerIdOf(o.customer) === party);
  }, [orders, party]);

  const filteredCustomers = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.address?.toLowerCase().includes(q)
    );
  }, [customers, partySearch]);

  const selectedPartyName = useMemo(
    () => customers.find((c) => c._id === party)?.name || "",
    [customers, party]
  );

  const builtyProducts = useMemo(() => {
    if (!selectedBuilty?.items?.length) return allProducts;
    const ids = new Set(
      selectedBuilty.items.map((i) =>
        typeof i.product === "object" && i.product ? i.product._id : String(i.product)
      )
    );
    const fromBuilty = allProducts.filter((p) => ids.has(p._id));
    return fromBuilty.length > 0 ? fromBuilty : allProducts;
  }, [selectedBuilty, allProducts]);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function onSelectParty(id: string) {
    setParty(id);
    setBuiltyId("");
    setSelectedBuilty(null);
    setLines([emptyLine()]);
    setPartyPickerOpen(false);
    setPartySearch("");
  }

  function onSelectBuilty(id: string) {
    setBuiltyId(id);
    const b = orders.find((o) => o._id === id);
    if (b) {
      const cid = customerIdOf(b.customer);
      if (cid) setParty(cid);
    }
    setSelectedBuilty(null);
    setLines([emptyLine()]);
  }

  useEffect(() => {
    if (!selectedBuilty) return;
    setLines((prev) =>
      prev.map((line) => {
        if (!line.product) return line;
        const sold = selectedBuilty.items?.find((i) => {
          const pid =
            typeof i.product === "object" && i.product
              ? i.product._id
              : String(i.product);
          return pid === line.product;
        });
        if (!sold) return line;
        const weightKg =
          Number(sold.weightKg) > 0
            ? Number(sold.weightKg)
            : line.weightKg;
        const unitPrice =
          Number(sold.unitPrice) > 0 ? Number(sold.unitPrice) : line.unitPrice;
        return { ...line, weightKg, unitPrice };
      })
    );
  }, [selectedBuilty]);

  function soldPriceFromBuilty(productId: string) {
    const builtyLine = selectedBuilty?.items?.find((i) => {
      const pid =
        typeof i.product === "object" && i.product ? i.product._id : String(i.product);
      return pid === productId;
    });
    if (!builtyLine) return null;

    const weightKg =
      Number(builtyLine.weightKg) > 0 ? Number(builtyLine.weightKg) : 0;
    const unitPrice = Number(builtyLine.unitPrice) || 0;
    const ratePerKg = Number(builtyLine.ratePerKg) || 0;
    const pricingMode = builtyLine.pricingMode || "rate_kg";

    return { weightKg, unitPrice, ratePerKg, pricingMode, line: builtyLine };
  }

  function onSelectProduct(index: number, productId: string) {
    const product = allProducts.find((p) => p._id === productId);
    const sold = soldPriceFromBuilty(productId);
    const weightKg =
      sold && sold.weightKg > 0
        ? sold.weightKg
        : Number(product?.weightKg) || 0;
    const unitPrice =
      sold && sold.unitPrice > 0
        ? sold.unitPrice
        : calcUnitPrice(product, weightKg);

    updateLine(index, {
      product: productId,
      weightKg,
      unitPrice,
      quantity: 1,
    });
  }

  function onWeightChange(index: number, weightKg: number) {
    const line = lines[index];
    const product = allProducts.find((p) => p._id === line.product);
    const sold = line.product ? soldPriceFromBuilty(line.product) : null;

    let unitPrice = line.unitPrice;
    if (sold && sold.pricingMode === "rate_kg" && sold.ratePerKg > 0 && weightKg > 0) {
      unitPrice = Math.round(weightKg * sold.ratePerKg * 100) / 100;
    } else if (sold && sold.pricingMode === "fixed" && sold.unitPrice > 0) {
      unitPrice = sold.unitPrice;
    } else if (!sold) {
      unitPrice = calcUnitPrice(product, weightKg);
    }

    updateLine(index, { weightKg, unitPrice });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!builtyId) {
      toast.error(t("claims.selectBuilty"));
      return;
    }
    const validLines = lines.filter((l) => l.product && l.quantity > 0);
    if (validLines.length === 0) {
      toast.error(t("claims.addProduct"));
      return;
    }

    setSaving(true);
    try {
      await api.post("/claims", {
        builty: builtyId,
        customer: party || undefined,
        claimDate,
        items: validLines.map((l) => ({
          product: l.product,
          quantity: l.quantity,
          weightKg: l.weightKg || undefined,
          unitPrice: l.unitPrice || undefined,
          refundAmount:
            l.refundAmount.trim() === "" ? undefined : Number(l.refundAmount),
          disposition: l.disposition,
          reason: l.reason.trim() || undefined,
        })),
      });
      toast.success(t("claims.saved"));
      setLines([emptyLine()]);
      setClaimDate(todayInput());
      await load();
    } catch (err) {
      toast.error(apiError(err, t("claims.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("claims.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("claims.title")}</h1>
        </div>
        <Link
          href="#claim-history"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <History className="size-4" />
          {t("claims.history")}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("claims.record")}</CardTitle>
          <CardDescription>{t("claims.recordDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t("claims.party")}</Label>
                <div className="relative">
                  <div className="overflow-hidden rounded-lg border border-input">
                    <button
                      type="button"
                      className="flex h-8 w-full items-center px-2.5 text-left text-sm hover:bg-muted/50"
                      onClick={() => {
                        setPartyPickerOpen((prev) => !prev);
                        setPartySearch("");
                      }}
                    >
                      <span className={party ? "truncate text-foreground" : "text-muted-foreground"}>
                        {party ? selectedPartyName || t("claims.select") : t("claims.select")}
                      </span>
                    </button>
                    {partyPickerOpen && (
                      <div className="border-t border-border bg-card">
                        <div className="relative border-b border-border p-2">
                          <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            className="h-8 pl-8"
                            placeholder={t("claims.searchParty")}
                            value={partySearch}
                            onChange={(e) => setPartySearch(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {filteredCustomers.length === 0 ? (
                            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                              {t("claims.noPartyMatch")}
                            </p>
                          ) : (
                            filteredCustomers.map((c) => (
                              <button
                                key={c._id}
                                type="button"
                                className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted ${
                                  party === c._id ? "bg-muted" : ""
                                }`}
                                onClick={() => onSelectParty(c._id)}
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
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("claims.invoice")}</Label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  value={builtyId}
                  onChange={(e) => onSelectBuilty(e.target.value)}
                >
                  <option value="">{t("claims.select")}</option>
                  {partyBuilties.map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.builtyNo}
                      {typeof o.customer === "object" && o.customer?.name
                        ? ` · ${o.customer.name}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("claims.date")}</Label>
                <Input
                  type="date"
                  value={claimDate}
                  onChange={(e) => setClaimDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label>{t("claims.products")}</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setLines((prev) => [...prev, emptyLine()])}
                >
                  <Plus className="size-3.5" />
                  {t("claims.addLine")}
                </Button>
              </div>

              {lines.map((line, index) => {
                const suggested = lineSuggestedTotal(line);
                const sold = line.product ? soldPriceFromBuilty(line.product) : null;
                return (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 p-3 md:grid-cols-2 xl:grid-cols-6"
                  >
                    <div className="flex flex-col gap-1.5 xl:col-span-2">
                      <Label>{t("claims.product")}</Label>
                      <ProductSearchSelect
                        products={builtyProducts}
                        value={line.product}
                        onChange={(id) => onSelectProduct(index, id)}
                        placeholder={t("claims.select")}
                        emptyLabel={t("claims.select")}
                        showWeight
                        showFamily
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("claims.quantity")}</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(index, {
                            quantity: Math.max(1, Math.round(Number(e.target.value) || 1)),
                          })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("claims.weight")}</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.weightKg || ""}
                        onChange={(e) => onWeightChange(index, Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("claims.calcPrice")}</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.unitPrice || ""}
                        onChange={(e) =>
                          updateLine(index, {
                            unitPrice: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {sold && sold.unitPrice > 0
                          ? t("claims.soldPriceHint")
                          : `${t("claims.lineTotal")}: ${formatMoney(suggested)}`}
                        {sold && sold.unitPrice > 0
                          ? ` · ${t("claims.lineTotal")}: ${formatMoney(suggested)}`
                          : null}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("claims.refundOptional")}</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="0"
                        value={line.refundAmount}
                        onChange={(e) => updateLine(index, { refundAmount: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("claims.disposition")}</Label>
                      <select
                        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                        value={line.disposition}
                        onChange={(e) =>
                          updateLine(index, {
                            disposition: e.target.value as Line["disposition"],
                          })
                        }
                      >
                        <option value="returned">{t("claims.disp.returned")}</option>
                        <option value="rework">{t("claims.disp.rework")}</option>
                        <option value="scrap_loss">{t("claims.disp.scrap")}</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5 md:col-span-2 xl:col-span-5">
                      <Label>{t("claims.reason")}</Label>
                      <Input
                        value={line.reason}
                        onChange={(e) => updateLine(index, { reason: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={lines.length <= 1}
                        onClick={() =>
                          setLines((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("claims.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card id="claim-history">
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("claims.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : claims.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("claims.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("claims.col.claim")}</TableHead>
                  <TableHead>{t("claims.col.date")}</TableHead>
                  <TableHead>{t("claims.col.customer")}</TableHead>
                  <TableHead>{t("claims.col.invoice")}</TableHead>
                  <TableHead>{t("claims.col.items")}</TableHead>
                  <TableHead>{t("claims.col.refund")}</TableHead>
                  <TableHead>{t("claims.col.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell className="font-data text-xs">{c.claimNo}</TableCell>
                    <TableCell className="font-data text-xs">{formatDate(c.claimDate)}</TableCell>
                    <TableCell>{c.customer?.name || "—"}</TableCell>
                    <TableCell className="font-data text-xs">
                      {c.builty?._id ? (
                        <Link
                          href={`/dashboard/builty/${c.builty._id}`}
                          className="text-primary hover:underline"
                        >
                          {c.builty.builtyNo}
                        </Link>
                      ) : (
                        c.builty?.builtyNo || "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.items
                        .map(
                          (i) =>
                            `${i.quantity} ${i.product?.name || ""} (${i.disposition})`
                        )
                        .join(", ")}
                    </TableCell>
                    <TableCell className="font-data text-xs">
                      {c.refundAmount ? formatMoney(c.refundAmount) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {c.status}
                      </Badge>
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
