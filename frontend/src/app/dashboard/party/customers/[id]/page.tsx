"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  getCustomer,
  listBuilties,
  type BuiltyRow,
  type Customer,
} from "@/lib/sales-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";

export default function CustomerDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [balance, setBalance] = useState(0);
  const [stats, setStats] = useState({ orderCount: 0, totalSales: 0, totalPaid: 0 });
  const [builties, setBuilties] = useState<BuiltyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, rows] = await Promise.all([
        getCustomer(id),
        listBuilties({ customer: id }),
      ]);
      setCustomer(detail.customer);
      setBalance(detail.balance);
      setStats(detail.stats);
      setBuilties(rows);
    } catch (err) {
      toast.error(apiError(err, t("customerDetail.loadFailed")));
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">{t("customerDetail.notFound")}</p>
        <Link href="/dashboard/party" className="text-sm text-primary hover:underline">
          {t("common.back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/party"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {t("party.title")}
          </Link>
          <h1 className="text-nameplate text-xl">{customer.name}</h1>
          <p className="font-data mt-1 text-xs text-muted-foreground">
            {[customer.phone].filter(Boolean).join(" · ") || t("customerDetail.noContact")}
          </p>
        </div>
        <Link
          href={`/dashboard/builty/new?customer=${id}`}
          className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-lg bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm"
        >
          <Plus className="size-5" />
          {t("builtyNew.title")}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: t("customerDetail.paymentPending"), value: formatMoney(balance) },
          { label: t("customerDetail.totalPayment"), value: formatMoney(stats.totalSales) },
          { label: t("customerDetail.paid"), value: formatMoney(stats.totalPaid) },
        ].map((s) => (
          <Card key={s.label} className="py-0">
            <CardContent className="p-4">
              <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                {s.label}
              </p>
              <p className="font-data mt-1 text-xl">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-nameplate text-sm">{t("customerDetail.builtyHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {builties.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("customerDetail.noBuilties")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("orders.col.date")}</TableHead>
                  <TableHead>{t("builty.col.no")}</TableHead>
                  <TableHead className="text-right">{t("orders.col.total")}</TableHead>
                  <TableHead className="text-right">{t("customerDetail.paid")}</TableHead>
                  <TableHead className="text-right">{t("orders.col.balance")}</TableHead>
                  <TableHead>{t("orders.col.payment")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {builties.map((b) => (
                  <TableRow
                    key={b._id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/builty/${b._id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/dashboard/builty/${b._id}`);
                      }
                    }}
                  >
                    <TableCell className="font-data text-sm">{formatDate(b.builtyDate)}</TableCell>
                    <TableCell className="font-data text-sm">{b.builtyNo}</TableCell>
                    <TableCell className="font-data text-right text-sm">
                      {formatMoney(b.totalAmount)}
                    </TableCell>
                    <TableCell className="font-data text-right text-sm">
                      {formatMoney(b.amountPaid)}
                    </TableCell>
                    <TableCell className="font-data text-right text-sm">
                      {formatMoney(b.balance)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-data uppercase">
                        {b.paymentStatus}
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
