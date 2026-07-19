"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { InventorySubnav } from "@/components/layout/inventory-subnav";
import { apiError } from "@/lib/materials-api";
import {
  getFinishedStock,
  listWarehouses,
  type CatalogItem,
  type FinishedStockItem,
} from "@/lib/inventory-api";
import { useI18n } from "@/hooks/use-i18n";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function FinishedGoodsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<FinishedStockItem[]>([]);
  const [totalUnits, setTotalUnits] = useState(0);
  const [warehouses, setWarehouses] = useState<CatalogItem[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { warehouse?: string; q?: string } = {};
      if (warehouse) params.warehouse = warehouse;
      if (q.trim()) params.q = q.trim();
      const [stock, wh] = await Promise.all([getFinishedStock(params), listWarehouses()]);
      setItems(stock.items);
      setTotalUnits(stock.totalUnits);
      setWarehouses(wh);
    } catch (err) {
      toast.error(apiError(err, t("finished.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [warehouse, q, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <InventorySubnav />
      <div>
        <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          {t("finished.eyebrow")}
        </p>
        <h1 className="text-nameplate text-xl">{t("finished.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("finished.summary", { units: totalUnits, lines: items.length })}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
            >
              <option value="">{t("finished.allWarehouses")}</option>
              {warehouses.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name}
                </option>
              ))}
            </select>
            <Input
              placeholder={t("finished.search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("finished.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("finished.col.product")}</TableHead>
                  <TableHead>{t("finished.col.category")}</TableHead>
                  <TableHead>{t("finished.col.size")}</TableHead>
                  <TableHead>{t("finished.col.warehouse")}</TableHead>
                  <TableHead className="text-end">{t("finished.col.qty")}</TableHead>
                  <TableHead>{t("finished.col.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={`${item.productId}-${item.warehouseId}`}>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="font-data text-[10px] text-muted-foreground">
                        {item.sku || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{item.category?.name || "—"}</TableCell>
                    <TableCell className="font-data text-xs">
                      {item.size?.code || item.size?.name || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{item.warehouseName}</TableCell>
                    <TableCell className="font-data text-end text-xs">
                      {item.quantity} {item.unitLabel}
                    </TableCell>
                    <TableCell>
                      {item.isLow ? (
                        <Badge variant="destructive" className="font-data text-[10px]">
                          {t("finished.status.low", { threshold: item.lowStockThreshold })}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="font-data text-[10px]">
                          {t("finished.status.ok")}
                        </Badge>
                      )}
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
