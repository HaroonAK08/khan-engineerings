"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/date-range-filter";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import {
  getPartySalesMargin,
  getProductionMargin,
  type PartySalesMarginParty,
  type ProductionMarginProduct,
} from "@/lib/finance-api";
import { apiError, formatMoney } from "@/lib/materials-api";
import { useTaxSplitStore } from "@/stores/tax-split-store";
import { cn } from "@/lib/utils";

type View = "parties" | "products";
type Family = "hub" | "drum" | "all";
type PartySort = "pct" | "profit" | "sale";
type ProductSort = "pct" | "profit" | "qty";

type PartyRow = {
  id: string;
  name: string;
  group: string;
  pct: number | null;
  profit: number;
  sale: number;
};

type ProductRow = {
  id: string;
  name: string;
  family: string;
  pct: number | null;
  profit: number;
  sale: number;
  qty: number;
};

function formatPct(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function partyPct(profit: number, sale: number) {
  if (!(sale > 0)) return null;
  return Math.round((profit / sale) * 10000) / 100;
}

function sortBy<T>(
  rows: T[],
  value: (row: T) => number | null,
  name: (row: T) => string
) {
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av == null && bv == null) return name(a).localeCompare(name(b));
    if (av == null) return 1;
    if (bv == null) return -1;
    if (bv !== av) return bv - av;
    return name(a).localeCompare(name(b));
  });
}

function toPartyRow(party: PartySalesMarginParty): PartyRow {
  const sale = party.totalSale || 0;
  const profit = party.profit || 0;
  return {
    id: party.partyId,
    name: party.partyName,
    group: party.groupName,
    pct: partyPct(profit, sale),
    profit,
    sale,
  };
}

function toProductRow(product: ProductionMarginProduct): ProductRow {
  return {
    id: product.productId,
    name: product.name,
    family: product.family === "drum" ? "drum" : "hub",
    pct: product.marginPct ?? null,
    profit: product.profit || 0,
    sale: product.sellValue || 0,
    qty: product.unitsSoldPeriod || 0,
  };
}

function sumTotals(rows: Array<{ profit: number; sale: number }>) {
  const profit = rows.reduce((sum, row) => sum + row.profit, 0);
  const sale = rows.reduce((sum, row) => sum + row.sale, 0);
  return { profit, sale, pct: partyPct(profit, sale) };
}

function moneyClass(amount: number, active: boolean) {
  return cn(
    "font-data text-right tabular-nums",
    active && "bg-primary/10 font-semibold",
    amount < 0 && "text-destructive"
  );
}

export default function RankingReportPage() {
  const { t } = useI18n();
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();
  const taxMode = useTaxSplitStore((s) => s.mode);
  const [view, setView] = useState<View>("parties");
  const [family, setFamily] = useState<Family>("all");
  const [partySort, setPartySort] = useState<PartySort>("pct");
  const [productSort, setProductSort] = useState<ProductSort>("pct");
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const [partyReport, productReport] = await Promise.all([
        getPartySalesMargin({ dateFrom, dateTo, taxSplit: taxMode }),
        getProductionMargin({ dateFrom, dateTo, taxSplit: taxMode }),
      ]);
      setParties(
        (partyReport.parties || [])
          .map(toPartyRow)
          .filter((row) => row.sale !== 0 || row.profit !== 0)
      );
      setProducts(
        (productReport.products || [])
          .map(toProductRow)
          .filter((row) => row.qty !== 0 || row.sale !== 0 || row.profit !== 0)
      );
    } catch (err) {
      setParties([]);
      setProducts([]);
      toast.error(apiError(err, t("ranking.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, hydrated, taxMode, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 300);
    return () => clearTimeout(timer);
  }, [load]);

  const rankedParties = useMemo(() => {
    const value =
      partySort === "pct"
        ? (row: PartyRow) => row.pct
        : partySort === "sale"
          ? (row: PartyRow) => row.sale
          : (row: PartyRow) => row.profit;
    return sortBy(parties, value, (row) => row.name);
  }, [parties, partySort]);

  const familyProducts = useMemo(
    () => (family === "all" ? products : products.filter((row) => row.family === family)),
    [products, family]
  );

  const rankedProducts = useMemo(() => {
    const value =
      productSort === "pct"
        ? (row: ProductRow) => row.pct
        : productSort === "qty"
          ? (row: ProductRow) => row.qty
          : (row: ProductRow) => row.profit;
    return sortBy(familyProducts, value, (row) => row.name);
  }, [familyProducts, productSort]);

  const partyTotals = useMemo(() => sumTotals(parties), [parties]);
  const productTotals = useMemo(() => sumTotals(familyProducts), [familyProducts]);

  const totals = view === "parties" ? partyTotals : productTotals;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <ReportsSubnav />
      <div>
        <h1 className="text-nameplate text-xl">{t("ranking.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("ranking.subtitle")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ChoiceButtons
          value={view}
          onChange={setView}
          options={[
            { id: "parties", label: t("ranking.parties") },
            { id: "products", label: t("ranking.products") },
          ]}
        />
        {view === "products" ? (
          <ChoiceButtons
            value={family}
            onChange={setFamily}
            options={[
              { id: "hub", label: t("ranking.hubOnly") },
              { id: "drum", label: t("ranking.drumOnly") },
              { id: "all", label: t("ranking.total") },
            ]}
          />
        ) : null}
      </div>
      <DateRangeFilter />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TotalCard label={t("ranking.totalProfit")} amount={totals.profit} />
            <TotalCard label={t("ranking.totalSale")} amount={totals.sale} />
          </div>

          {view === "parties" ? (
            <Card>
              <CardHeader>
                <CardDescription>{t("ranking.partiesHint")}</CardDescription>
                <ChoiceButtons
                  value={partySort}
                  onChange={setPartySort}
                  options={[
                    { id: "pct", label: t("ranking.byProfitPct") },
                    { id: "profit", label: t("ranking.byProfitAmt") },
                    { id: "sale", label: t("ranking.bySaleAmt") },
                  ]}
                />
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.party")}</TableHead>
                      <MetricHead active={partySort === "pct"} label={t("ranking.profitPct")} />
                      <MetricHead active={partySort === "profit"} label={t("ranking.profitAmt")} />
                      <MetricHead active={partySort === "sale"} label={t("ranking.saleAmt")} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankedParties.length === 0 ? (
                      <EmptyRow label={t("ranking.empty")} />
                    ) : (
                      rankedParties.map((row, index) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Link
                              href={`/dashboard/party/customers/${row.id}`}
                              className="font-medium hover:underline"
                            >
                              <span className="font-data me-2 text-muted-foreground">
                                {index + 1}
                              </span>
                              {row.name}
                            </Link>
                            {row.group ? (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {row.group}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className={moneyClass(row.pct ?? 0, partySort === "pct")}>
                            {formatPct(row.pct)}
                          </TableCell>
                          <TableCell className={moneyClass(row.profit, partySort === "profit")}>
                            {formatMoney(row.profit)}
                          </TableCell>
                          <TableCell className={moneyClass(row.sale, partySort === "sale")}>
                            {formatMoney(row.sale)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardDescription>{t("ranking.productsHint")}</CardDescription>
                <ChoiceButtons
                  value={productSort}
                  onChange={setProductSort}
                  options={[
                    { id: "pct", label: t("ranking.byProfitPct") },
                    { id: "profit", label: t("ranking.byProfitAmt") },
                    { id: "qty", label: t("ranking.byQty") },
                  ]}
                />
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.product")}</TableHead>
                      <MetricHead active={productSort === "pct"} label={t("ranking.profitPct")} />
                      <MetricHead
                        active={productSort === "profit"}
                        label={t("ranking.profitAmt")}
                      />
                      <MetricHead active={productSort === "qty"} label={t("ranking.qty")} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankedProducts.length === 0 ? (
                      <EmptyRow label={t("ranking.empty")} />
                    ) : (
                      rankedProducts.map((row, index) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Link
                              href={`/dashboard/reports/production/${row.id}?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`}
                              className="font-medium hover:underline"
                            >
                              <span className="font-data me-2 text-muted-foreground">
                                {index + 1}
                              </span>
                              {row.name}
                            </Link>
                            {family === "all" ? (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {row.family === "drum" ? t("prod.drum") : t("prod.hub")}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className={moneyClass(row.pct ?? 0, productSort === "pct")}>
                            {formatPct(row.pct)}
                          </TableCell>
                          <TableCell className={moneyClass(row.profit, productSort === "profit")}>
                            {formatMoney(row.profit)}
                          </TableCell>
                          <TableCell className={moneyClass(0, productSort === "qty")}>
                            {row.qty.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function MetricHead({ active, label }: { active: boolean; label: string }) {
  return (
    <TableHead className={cn("text-right", active && "bg-primary/10 text-foreground")}>
      {label}
    </TableHead>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  );
}

function ChoiceButtons<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ id: T; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          size="sm"
          variant={value === option.id ? "default" : "outline"}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function TotalCard({ label, amount }: { label: string; amount: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("font-data text-2xl", amount < 0 && "text-destructive")}>
          {formatMoney(amount)}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
