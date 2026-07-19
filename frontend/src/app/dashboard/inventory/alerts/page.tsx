"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { InventorySubnav } from "@/components/layout/inventory-subnav";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, formatKg } from "@/lib/materials-api";
import { getInventoryAlerts, type FinishedStockItem } from "@/lib/inventory-api";
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

export default function InventoryAlertsPage() {
  const { t } = useI18n();
  const [finished, setFinished] = useState<FinishedStockItem[]>([]);
  const [raw, setRaw] = useState<{ material: string; availableKg: number; message: string } | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const alerts = await getInventoryAlerts();
      setFinished(alerts.finished);
      setRaw(alerts.raw);
    } catch (err) {
      toast.error(apiError(err, "Failed to load alerts"));
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
        <h1 className="text-nameplate text-xl">{t("alerts.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("alerts.subtitle")}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {raw && (
            <Card className="border-destructive/40">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-destructive" />
                  <div>
                    <p className="font-medium">Raw scrap</p>
                    <p className="text-sm text-muted-foreground">
                      {raw.message} ({formatKg(raw.availableKg)} kg)
                    </p>
                  </div>
                </div>
                <Link href="/dashboard/inventory/purchases" className="text-sm text-primary hover:underline">
                  Buy scrap
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">{t("alerts.finished")}</CardTitle>
            </CardHeader>
            <CardContent>
              {finished.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No low-stock finished products. Set thresholds on products to enable alerts.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">On hand</TableHead>
                      <TableHead className="text-right">Threshold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {finished.map((item) => (
                      <TableRow key={`${item.productId}-${item.warehouseId}`}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.warehouseName}</TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="destructive" className="font-data text-[10px]">
                            ≤ {item.lowStockThreshold}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
