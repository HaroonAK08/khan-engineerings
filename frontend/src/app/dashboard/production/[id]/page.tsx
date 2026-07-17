"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { apiError, formatDate, formatKg, formatMoney } from "@/lib/materials-api";
import {
  createBatchExpense,
  deleteBatchExpense,
  getBatch,
  getBatchCosts,
  getProductionMeta,
  productName,
} from "@/lib/production-api";
import type { BatchCosts, ProductionBatch, ProductionMeta } from "@/types/production";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const expenseSchema = z.object({
  stage: z.string().min(1, "Stage is required"),
  category: z.string().min(1, "Category is required"),
  amount: z.number().positive("Amount must be greater than 0"),
  expenseDate: z.string().min(1, "Date is required"),
  notes: z.string().optional(),
});

type ExpenseForm = z.infer<typeof expenseSchema>;

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function BatchDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [batch, setBatch] = useState<ProductionBatch | null>(null);
  const [costs, setCosts] = useState<BatchCosts | null>(null);
  const [meta, setMeta] = useState<ProductionMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      stage: "melting",
      category: "electricity",
      amount: 0,
      expenseDate: todayInput(),
      notes: "",
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [batchData, costsData, metaData] = await Promise.all([
        getBatch(id),
        getBatchCosts(id),
        getProductionMeta(),
      ]);
      setBatch(batchData);
      setCosts(costsData);
      setMeta(metaData);
      form.reset({
        stage: metaData.stages[0]?.id ?? "melting",
        category: metaData.categories[0]?.id ?? "electricity",
        amount: 0,
        expenseDate: todayInput(),
        notes: "",
      });
    } catch (err) {
      toast.error(apiError(err, "Failed to load batch"));
      setBatch(null);
      setCosts(null);
    } finally {
      setLoading(false);
    }
  }, [id, form]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit(values: ExpenseForm) {
    setSaving(true);
    try {
      await createBatchExpense(id, values);
      toast.success("Expense recorded");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to save expense"));
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteExpense(expenseId: string) {
    if (!confirm("Delete this expense?")) return;
    try {
      await deleteBatchExpense(id, expenseId);
      toast.success("Expense deleted");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to delete expense"));
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">Batch not found</p>
        <Link
          href="/dashboard/production"
          className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted"
        >
          Back to production
        </Link>
      </div>
    );
  }

  const net = batch.netConsumedKg ?? batch.inputScrapKg - batch.returnedScrapKg;
  const stageLabel = Object.fromEntries((meta?.stages || []).map((s) => [s.id, s.label]));
  const categoryLabel = Object.fromEntries((meta?.categories || []).map((c) => [c.id, c.label]));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <Link
          href="/dashboard/production"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Production
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-nameplate text-xl">{batch.batchNo}</h1>
          <Badge variant="secondary" className="font-data text-[10px] uppercase">
            {batch.status}
          </Badge>
        </div>
        <p className="font-data mt-1 text-xs text-muted-foreground">
          {formatDate(batch.productionDate)} · {productName(batch.product)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Input scrap", value: `${formatKg(batch.inputScrapKg)} kg` },
          { label: "Net consumed", value: `${formatKg(net)} kg` },
          { label: "Good units", value: String(batch.goodUnits) },
          { label: "Rejected", value: String(batch.rejectedUnits) },
        ].map((stat) => (
          <Card key={stat.label} className="py-0">
            <CardContent className="p-4">
              <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                {stat.label}
              </p>
              <p className="font-data mt-1 text-lg">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {costs && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Batch total cost",
              value: formatMoney(costs.totalCost),
              hint: "operating + material estimate",
              accent: "bg-chart-1",
            },
            {
              label: "Operating expenses",
              value: formatMoney(costs.operatingCost),
              hint: `${costs.expenseCount} entries`,
              accent: "bg-chart-2",
            },
            {
              label: "Material estimate",
              value: formatMoney(costs.materialCost),
              hint: `${formatKg(costs.netConsumedKg)} kg × ${formatMoney(costs.avgRatePerKg)}`,
              accent: "bg-chart-3",
            },
            {
              label: "Cost / good unit",
              value: costs.costPerGoodUnit != null ? formatMoney(costs.costPerGoodUnit) : "—",
              hint: costs.mostExpensiveStage
                ? `Costliest stage: ${costs.mostExpensiveStage.label}`
                : "no stage expenses yet",
              accent: "bg-chart-4",
            },
          ].map((stat) => (
            <Card key={stat.label} className="relative overflow-hidden py-0">
              <span className={`absolute inset-x-0 top-0 h-1 ${stat.accent}`} aria-hidden />
              <CardContent className="p-5">
                <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
                  {stat.label}
                </p>
                <p className="font-data mt-2 text-2xl font-medium">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {costs && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Cost by stage</CardTitle>
              <CardDescription>Melting through finishing.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.byStage.map((row) => (
                    <TableRow key={row.stage}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          {row.label}
                          {costs.mostExpensiveStage?.stage === row.stage && row.amount > 0 && (
                            <Badge variant="secondary" className="font-data text-[9px]">
                              HIGHEST
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatMoney(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm">Cost by category</CardTitle>
              <CardDescription>Electricity, labor, fuel, and more.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.byCategory.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="font-data text-right text-xs">
                        {formatMoney(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">Add batch expense</CardTitle>
          <CardDescription>Assign cost to a production stage and category.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stage">Stage</Label>
              <select
                id="stage"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("stage")}
              >
                {(meta?.stages || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                {...form.register("category")}
              >
                {(meta?.categories || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                {...form.register("amount", { valueAsNumber: true })}
              />
              {form.formState.errors.amount && (
                <p className="text-xs text-destructive">{form.formState.errors.amount.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expenseDate">Date</Label>
              <Input id="expenseDate" type="date" {...form.register("expenseDate")} />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" {...form.register("notes")} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                Add expense
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">Expense log</CardTitle>
        </CardHeader>
        <CardContent>
          {!costs?.expenses?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No expenses yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.expenses.map((e) => (
                  <TableRow key={e._id}>
                    <TableCell className="font-data text-xs">{formatDate(e.expenseDate)}</TableCell>
                    <TableCell>{stageLabel[e.stage] || e.stage}</TableCell>
                    <TableCell>{categoryLabel[e.category] || e.category}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">
                      {e.notes || "—"}
                    </TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(e.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onDeleteExpense(e._id)}
                        aria-label="Delete expense"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {batch.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Batch notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{batch.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}
