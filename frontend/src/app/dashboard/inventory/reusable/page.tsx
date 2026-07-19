"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { InventorySubnav } from "@/components/layout/inventory-subnav";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, formatDate, formatKg } from "@/lib/materials-api";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ReusableStock = {
  availableKg: number;
  unit: string;
  movements: Array<{
    _id: string;
    direction: string;
    reason: string;
    quantity: number;
    movementDate: string;
    notes: string;
  }>;
};

export default function ReusablePage() {
  const { t } = useI18n();
  const [stock, setStock] = useState<ReusableStock | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ stock: ReusableStock }>("/inventory/reusable");
      setStock(data.stock);
    } catch (err) {
      toast.error(apiError(err, "Failed to load reusable stock"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <InventorySubnav />
      <div>
        <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          {t("reusable.eyebrow")}
        </p>
        <h1 className="text-nameplate text-xl">{t("reusable.title")}</h1>
      </div>

      <Card className="relative overflow-hidden py-0">
        <span className="absolute inset-x-0 top-0 h-1 bg-chart-1" aria-hidden />
        <CardContent className="p-5">
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("reusable.available")}
          </p>
          <p className="font-data mt-2 text-3xl font-medium">
            {stock ? `${formatKg(stock.availableKg)} kg` : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Can be charged into the next furnace batch instead of buying fresh scrap.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("reusable.recent")}</CardTitle>
          <CardDescription>Hand recovery, turning breakage, claim returns.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : !stock?.movements?.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No reusable movements yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Dir</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Kg</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.movements.map((m) => (
                  <TableRow key={m._id}>
                    <TableCell className="font-data text-xs">{formatDate(m.movementDate)}</TableCell>
                    <TableCell className="uppercase">{m.direction}</TableCell>
                    <TableCell>{m.reason}</TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatKg(m.quantity)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.notes || "—"}</TableCell>
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
