"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  createBuilty,
  listBuiltyPendingOrders,
  listCustomers,
  productName,
  type Customer,
  type SalesOrder,
} from "@/lib/sales-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { todayInput } from "@/lib/date-range";

function BuiltyForm() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState(searchParams.get("customer") || "");
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [builtyNo, setBuiltyNo] = useState("");
  const [billNo, setBillNo] = useState("");
  const [builtyDate, setBuiltyDate] = useState(todayInput());
  const [amountPaid, setAmountPaid] = useState(0);
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listCustomers({ active: "true" })
      .then(setCustomers)
      .catch((err) => toast.error(apiError(err, "Failed to load customers")));
  }, []);

  const loadOrders = useCallback(async () => {
    if (!customer) {
      setOrders([]);
      setSelected([]);
      return;
    }
    setLoadingOrders(true);
    try {
      const list = await listBuiltyPendingOrders(customer);
      setOrders(list);
      setSelected(list.map((o) => o._id));
    } catch (err) {
      toast.error(apiError(err, "Failed to load orders"));
      setOrders([]);
      setSelected([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [customer]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const selectedTotal = useMemo(
    () =>
      orders
        .filter((o) => selected.includes(o._id))
        .reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    [orders, selected]
  );

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit() {
    if (!builtyNo.trim()) {
      toast.error(t("builtyNew.needBuiltyNo"));
      return;
    }
    if (selected.length === 0) {
      toast.error(t("builtyNew.needOrder"));
      return;
    }

    setSaving(true);
    try {
      await createBuilty({
        builtyNo: builtyNo.trim(),
        billNo: billNo.trim() || undefined,
        customer,
        orders: selected,
        builtyDate,
        amountPaid: amountPaid > 0 ? amountPaid : undefined,
        method,
        notes: notes.trim(),
      });
      toast.success(t("builtyNew.created"));
      router.push("/dashboard/builty");
    } catch (err) {
      toast.error(apiError(err, t("builtyNew.createFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>{t("builtyNew.customer")}</Label>
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            >
              <option value="">{t("builtyNew.selectCustomer")}</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("builtyNew.builtyNo")}</Label>
            <Input
              value={builtyNo}
              onChange={(e) => setBuiltyNo(e.target.value)}
              placeholder={t("builtyNew.builtyNoHint")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("builtyNew.billNo")}</Label>
            <Input
              value={billNo}
              onChange={(e) => setBillNo(e.target.value)}
              placeholder={t("builtyNew.billNoHint")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("builtyNew.date")}</Label>
            <Input
              type="date"
              value={builtyDate}
              onChange={(e) => setBuiltyDate(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("builtyNew.orders")}</CardTitle>
          <CardDescription>{t("builtyNew.ordersHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!customer ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("builtyNew.pickCustomerFirst")}
            </p>
          ) : loadingOrders ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : orders.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("builtyNew.noOrders")}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelected(orders.map((o) => o._id))}
                >
                  {t("builtyNew.selectAll")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelected([])}>
                  {t("builtyNew.clear")}
                </Button>
                <span className="font-data text-xs text-muted-foreground">
                  {t("builtyNew.selected", {
                    count: String(selected.length),
                    total: formatMoney(selectedTotal),
                  })}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {orders.map((order) => {
                  const checked = selected.includes(order._id);
                  return (
                    <label
                      key={order._id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${
                        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-primary"
                        checked={checked}
                        onChange={() => toggle(order._id)}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-data text-xs">{order.invoiceNo}</span>
                          <span className="font-data text-[10px] text-muted-foreground">
                            {formatDate(order.orderDate)}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {order.items
                            .map((i) => `${productName(i.product)} × ${i.quantity}`)
                            .join(", ")}
                        </span>
                      </span>
                      <span className="font-data text-xs">{formatMoney(order.totalAmount)}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("builtyNew.paymentGiven")}</CardTitle>
          <CardDescription>{t("builtyNew.paymentHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t("common.amount")}</Label>
            <Input
              type="number"
              step="0.01"
              value={amountPaid}
              onChange={(e) => setAmountPaid(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("common.method")}</Label>
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="cash">{t("common.cash")}</option>
              <option value="bank">{t("common.bank")}</option>
              <option value="cheque">{t("common.cheque")}</option>
              <option value="other">{t("common.other")}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("common.notes")}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Button
        type="button"
        onClick={onSubmit}
        disabled={saving || !customer || selected.length === 0}
        className="w-fit gap-2"
      >
        {saving && <Loader2 className="size-4 animate-spin" />}
        {t("builtyNew.create")}
      </Button>
    </>
  );
}

export default function NewBuiltyPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <Link
          href="/dashboard/builty"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {t("builty.title")}
        </Link>
        <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          {t("builtyNew.eyebrow")}
        </p>
        <h1 className="text-nameplate text-xl">{t("builtyNew.title")}</h1>
      </div>

      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        }
      >
        <BuiltyForm />
      </Suspense>
    </div>
  );
}
