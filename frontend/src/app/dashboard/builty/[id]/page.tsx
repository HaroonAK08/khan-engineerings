"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  customerName,
  getBuilty,
  paymentStatusLabel,
  productName,
  updateBuilty,
  type Builty,
  type BuiltySummary,
} from "@/lib/sales-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useI18n } from "@/hooks/use-i18n";

export default function BuiltyDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const id = String(params.id);
  const [builty, setBuilty] = useState<Builty | null>(null);
  const [summary, setSummary] = useState<BuiltySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [billNo, setBillNo] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBuilty(id);
      setBuilty(data.builty);
      setSummary(data.summary);
      setBillNo(data.builty.billNo || "");
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

  async function onSaveMeta() {
    if (!builty) return;
    setSaving(true);
    try {
      const data = await updateBuilty(id, {
        billNo: billNo.trim(),
      });
      setBuilty(data.builty);
      setSummary(data.summary);
      toast.success(t("builty.updated"));
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

  if (!builty || !summary) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">{t("builtyDetail.notFound")}</p>
        <Link href="/dashboard/builty" className="text-sm text-primary hover:underline">
          {t("common.back")}
        </Link>
      </div>
    );
  }

  const partyId =
    typeof builty.customer === "object" && builty.customer ? builty.customer._id : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/builty"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t("builty.title")}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-nameplate text-xl">{builty.builtyNo}</h1>
            <Badge variant="secondary" className="font-data text-[10px]">
              {paymentStatusLabel(summary.paymentStatus, t)}
            </Badge>
          </div>
          <p className="font-data mt-1 text-xs text-muted-foreground">
            {formatDate(builty.builtyDate)} · {customerName(builty.customer)}
          </p>
          {partyId ? (
            <Link
              href={`/dashboard/party/customers/${partyId}`}
              className="mt-2 inline-block text-sm text-primary hover:underline"
            >
              {t("builtyDetail.managePartyMoney")}
            </Link>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-data text-[10px] text-muted-foreground uppercase">
            {t("builtyDetail.totalAmount")}
          </p>
          <p className="font-data text-2xl">{formatMoney(summary.totalAmount)}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("builtyDetail.details")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 sm:max-w-sm">
            <Label>{t("builtyNew.billNo")}</Label>
            <Input
              value={billNo}
              onChange={(e) => setBillNo(e.target.value)}
              placeholder={t("builtyNew.billNoHint")}
              className="h-11"
            />
          </div>
          <Button
            type="button"
            className="w-fit gap-2"
            disabled={saving}
            onClick={() => void onSaveMeta()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("common.save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("builtyDetail.items")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("orderNew.col.product")}</TableHead>
                <TableHead className="text-right">{t("orderNew.col.qty")}</TableHead>
                <TableHead>{t("builtyNew.pricingMode")}</TableHead>
                <TableHead className="text-right">{t("orderNew.col.rate")}</TableHead>
                <TableHead className="text-right">{t("orderNew.col.amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {builty.items.map((item, index) => (
                <TableRow key={item._id || index}>
                  <TableCell>{productName(item.product)}</TableCell>
                  <TableCell className="font-data text-right text-xs">{item.quantity}</TableCell>
                  <TableCell className="font-data text-xs">
                    {item.pricingMode === "fixed"
                      ? t("builtyNew.mode.fixed")
                      : t("builtyNew.mode.rate")}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {item.pricingMode === "fixed" ? "—" : formatMoney(item.ratePerKg)}
                  </TableCell>
                  <TableCell className="font-data text-right text-xs">
                    {formatMoney(item.lineTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
