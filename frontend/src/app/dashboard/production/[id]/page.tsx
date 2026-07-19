"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { apiError, formatDate, formatKg, formatMoney } from "@/lib/materials-api";
import {
  advanceBatch,
  cancelBatch,
  createBatchExpense,
  finishBatch,
  getBatch,
  getBatchCosts,
  getProductionMeta,
  listProducts,
  productId,
  productName,
  recordFurnace,
  recordTurning,
} from "@/lib/production-api";
import type { BatchCosts, Product, ProductionBatch, ProductionMeta } from "@/types/production";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

const expenseSchema = z.object({
  stage: z.string().min(1),
  category: z.string().min(1),
  amount: z.number().positive(),
  expenseDate: z.string().min(1),
  notes: z.string().optional(),
});

export default function BatchDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [batch, setBatch] = useState<ProductionBatch | null>(null);
  const [costs, setCosts] = useState<BatchCosts | null>(null);
  const [meta, setMeta] = useState<ProductionMeta | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  const [outProduct, setOutProduct] = useState("");
  const [outQty, setOutQty] = useState(0);
  const [handKg, setHandKg] = useState(5);
  const [wastePercent, setWastePercent] = useState(6);
  const [outputs, setOutputs] = useState<
    Array<{ product: string; quantity: number; name: string; weightKg: number }>
  >([]);

  const [turnLines, setTurnLines] = useState<
    Array<{ product: string; name: string; furnaceQty: number; goodUnits: number; brokenUnits: number; brokenKg: number }>
  >([]);

  const expenseForm = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      stage: "furnace",
      category: "electricity",
      amount: 0,
      expenseDate: todayInput(),
      notes: "",
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [batchData, costsData, metaData, productData] = await Promise.all([
        getBatch(id),
        getBatchCosts(id).catch(() => null),
        getProductionMeta(),
        listProducts({ active: "true" }),
      ]);
      setBatch(batchData);
      setCosts(costsData);
      setMeta(metaData);
      setProducts(productData.filter((p) => p.family === batchData.family));

      if (batchData.currentStage === "turning" && batchData.outputProgress?.length) {
        setTurnLines(
          batchData.outputProgress.map((p) => ({
            product: productId(p.product),
            name: productName(p.product as Product),
            furnaceQty: p.furnaceQty,
            goodUnits: p.goodAfterTurning || p.furnaceQty,
            brokenUnits: 0,
            brokenKg: 0,
          }))
        );
      }

      expenseForm.reset({
        stage: batchData.currentStage || metaData.stages[0]?.id || "furnace",
        category: metaData.categories[0]?.id || "electricity",
        amount: 0,
        expenseDate: todayInput(),
        notes: "",
      });
    } catch (err) {
      toast.error(apiError(err, "Failed to load batch"));
      setBatch(null);
    } finally {
      setLoading(false);
    }
  }, [id, expenseForm]);

  useEffect(() => {
    load();
  }, [load]);

  const familyProducts = useMemo(
    () => products.filter((p) => !batch || p.family === batch.family),
    [products, batch]
  );

  const metalInPiecesKg = useMemo(
    () =>
      Math.round(
        outputs.reduce((s, o) => s + o.quantity * (o.weightKg || 0), 0) * 1000
      ) / 1000,
    [outputs]
  );

  const { calcChargedKg, calcWasteKg } = useMemo(() => {
    const rate = Number(wastePercent) / 100;
    // Waste % of metal in pieces only (e.g. 120 kg × 6% = 7.2 kg)
    const waste =
      !metalInPiecesKg || metalInPiecesKg <= 0 || !Number.isFinite(rate) || rate < 0
        ? 0
        : Math.round(metalInPiecesKg * rate * 1000) / 1000;
    const charged = Math.round((metalInPiecesKg + (handKg || 0) + waste) * 1000) / 1000;
    return { calcChargedKg: charged, calcWasteKg: waste };
  }, [metalInPiecesKg, handKg, wastePercent]);

  function addOutputLine() {
    if (!outProduct || outQty <= 0) {
      toast.error("Select product and quantity");
      return;
    }
    const p = familyProducts.find((x) => x._id === outProduct);
    if (!p?.weightKg) {
      toast.error(`Set weight (kg) on product "${p?.name || ""}" in Products first`);
      return;
    }
    setOutputs((prev) => [
      ...prev.filter((o) => o.product !== outProduct),
      {
        product: outProduct,
        quantity: Math.round(outQty),
        name: p.name,
        weightKg: Number(p.weightKg),
      },
    ]);
    setOutQty(0);
  }

  async function submitFurnace() {
    if (outputs.length === 0) {
      toast.error("Add at least one output product");
      return;
    }
    setBusy(true);
    try {
      await recordFurnace(id, {
        outputs: outputs.map((o) => ({ product: o.product, quantity: o.quantity })),
        handKg: Math.max(0, Math.round(handKg)),
        wastePercent: Number(wastePercent),
      });
      toast.success("Furnace recorded — input & waste estimated, next: turning");
      setOutputs([]);
      setHandKg(5);
      setWastePercent(6);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Furnace failed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitTurning() {
    setBusy(true);
    try {
      await recordTurning(id, {
        lines: turnLines.map((l) => ({
          product: l.product,
          goodUnits: l.goodUnits,
          brokenUnits: l.brokenUnits,
          brokenKg: l.brokenKg,
        })),
      });
      toast.success("Turning recorded — next: drilling");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Turning failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onAdvance() {
    setBusy(true);
    try {
      const updated = await advanceBatch(id);
      toast.success(
        updated.status === "completed"
          ? "Batch finished — stock updated"
          : `Advanced to ${updated.currentStage}`
      );
      await load();
    } catch (err) {
      toast.error(apiError(err, "Advance failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onFinish() {
    setBusy(true);
    try {
      await finishBatch(id);
      toast.success("Batch finished — finished goods stocked");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Finish failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!confirm("Cancel this batch? Stock movements will be reversed.")) return;
    setBusy(true);
    try {
      await cancelBatch(id);
      toast.success("Batch cancelled");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Cancel failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onExpense(values: z.infer<typeof expenseSchema>) {
    setBusy(true);
    try {
      await createBatchExpense(id, values);
      toast.success("Expense added");
      expenseForm.setValue("amount", 0);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Expense failed"));
    } finally {
      setBusy(false);
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
      <p className="py-10 text-center text-sm text-muted-foreground">Batch not found</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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
          <Badge variant="outline" className="uppercase">
            {batch.family}
          </Badge>
          <Badge variant={batch.status === "in_progress" ? "secondary" : "outline"}>
            {batch.status}
          </Badge>
          <Badge className="capitalize">{batch.currentStage}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDate(batch.productionDate)} · Input{" "}
          {(batch.inputs || [])
            .map((i) => `${formatKg(i.quantityKg)} kg ${i.materialType}`)
            .join(", ") || "—"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">Stage progress</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(batch.stages || []).map((s) => (
            <Badge
              key={s.stage}
              variant={
                s.status === "completed"
                  ? "secondary"
                  : s.status === "skipped"
                    ? "outline"
                    : batch.currentStage === s.stage
                      ? "default"
                      : "outline"
              }
              className="capitalize"
            >
              {s.status === "completed" ? "✓ " : s.status === "skipped" ? "– " : ""}
              {s.stage}
            </Badge>
          ))}
        </CardContent>
      </Card>

      {batch.status === "in_progress" && batch.currentStage === "furnace" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Furnace output</CardTitle>
            <CardDescription>
              One run may make ~4 smaller pieces (~30 kg) or ~3 larger (~50–55 kg). Enter pieces.
              Hand defaults to ~5 kg and waste to 6% — both editable. Charged input is estimated
              from that — no weighing at charge time.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>Product</Label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  value={outProduct}
                  onChange={(e) => setOutProduct(e.target.value)}
                >
                  <option value="">Select…</option>
                  {familyProducts.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                      {p.weightKg ? ` (${p.weightKg} kg)` : " — set weight!"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Pieces</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={outQty || ""}
                  onChange={(e) => setOutQty(e.target.valueAsNumber || 0)}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={addOutputLine}>
                  Add line
                </Button>
              </div>
            </div>
            {outputs.length > 0 && (
              <ul className="space-y-1 text-sm">
                {outputs.map((o) => (
                  <li key={o.product}>
                    {o.name}: {o.quantity} pcs × {o.weightKg} kg ={" "}
                    <span className="font-data">{formatKg(o.quantity * o.weightKg)} kg</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Hand (reusable kg)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={handKg || ""}
                  onChange={(e) => setHandKg(e.target.valueAsNumber || 0)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Typical 5–6 kg per furnace run. Change if needed.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Furnace waste %</Label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  step={0.1}
                  value={wastePercent}
                  onChange={(e) => setWastePercent(e.target.valueAsNumber || 0)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Default 6%. Change for this batch if needed.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  Metal in pieces
                </p>
                <p className="font-data mt-1 text-lg">{formatKg(metalInPiecesKg)} kg</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  Waste (est.)
                </p>
                <p className="font-data mt-1 text-lg">{formatKg(calcWasteKg)} kg</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {wastePercent}% of metal in pieces
                </p>
              </div>
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  Charged input (est.)
                </p>
                <p className="font-data mt-1 text-lg">{formatKg(calcChargedKg)} kg</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  pieces + hand + waste
                </p>
              </div>
            </div>
            <Button disabled={busy} onClick={submitFurnace} className="w-fit gap-2">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Save furnace output
            </Button>
          </CardContent>
        </Card>
      )}

      {batch.status === "in_progress" && batch.currentStage === "turning" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Turning (Kharaad)</CardTitle>
            <CardDescription>
              Good vs broken. Broken weight (kg) goes to reusable.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {turnLines.map((line, idx) => (
              <div key={line.product} className="grid grid-cols-1 gap-2 rounded-lg border p-3 md:grid-cols-4">
                <div className="text-sm font-medium md:col-span-4">
                  {line.name}{" "}
                  <span className="text-muted-foreground">(furnace {line.furnaceQty})</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Good</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={line.goodUnits}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber || 0;
                      setTurnLines((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, goodUnits: v } : r))
                      );
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Broken pcs</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={line.brokenUnits}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber || 0;
                      setTurnLines((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, brokenUnits: v } : r))
                      );
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <Label>Broken kg</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={line.brokenKg || ""}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber || 0;
                      setTurnLines((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, brokenKg: v } : r))
                      );
                    }}
                  />
                </div>
              </div>
            ))}
            <Button disabled={busy} onClick={submitTurning} className="w-fit gap-2">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Save turning
            </Button>
          </CardContent>
        </Card>
      )}

      {batch.status === "in_progress" &&
        ["drilling", "painting", "polishing"].includes(String(batch.currentStage)) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-nameplate text-sm capitalize">
                {batch.currentStage}
              </CardTitle>
              <CardDescription>Mark this stage complete to continue.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled={busy} onClick={onAdvance} className="gap-2">
                {busy && <Loader2 className="size-4 animate-spin" />}
                Complete {batch.currentStage}
              </Button>
            </CardContent>
          </Card>
        )}

      {batch.status === "in_progress" && batch.currentStage === "finished" && (
        <Card>
          <CardContent className="flex gap-2 p-5">
            <Button disabled={busy} onClick={onFinish} className="gap-2">
              {busy && <Loader2 className="size-4 animate-spin" />}
              Post finished goods
            </Button>
          </CardContent>
        </Card>
      )}

      {batch.status === "in_progress" && (
        <Button variant="outline" disabled={busy} onClick={onCancel} className="w-fit">
          Cancel batch
        </Button>
      )}

      {costs && (
        <Card>
          <CardHeader>
            <CardTitle className="text-nameplate text-sm">Cost snapshot</CardTitle>
            <CardDescription>
              Material is estimated from scrap/daig used. Labour and other costs are optional —
              add only if you want them on this batch.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Operating (optional)</p>
              <p className="font-data">{formatMoney(costs.operatingCost)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Material est.</p>
              <p className="font-data">{formatMoney(costs.materialCost)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total</p>
              <p className="font-data">{formatMoney(costs.totalCost)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Per good unit</p>
              <p className="font-data">
                {costs.costPerGoodUnit != null ? formatMoney(costs.costPerGoodUnit) : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-nameplate text-sm">Expenses (optional)</CardTitle>
            <CardDescription>
              Not required to complete stages. Labour / furnace pay →{" "}
              <Link
                href="/dashboard/expenses/salaries"
                className="text-primary underline-offset-2 hover:underline"
              >
                Salaries
              </Link>
              ; electricity, taxes, paint →{" "}
              <Link
                href="/dashboard/expenses"
                className="text-primary underline-offset-2 hover:underline"
              >
                Expenses
              </Link>
              . Add here only if you want a cost on this specific batch.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowExpenseForm((v) => !v)}
          >
            {showExpenseForm ? "Hide" : "Add expense"}
          </Button>
        </CardHeader>
        {showExpenseForm && (
          <CardContent>
            <form
              onSubmit={expenseForm.handleSubmit(onExpense)}
              className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
            >
              <div className="flex flex-col gap-1.5">
                <Label>Stage</Label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  {...expenseForm.register("stage")}
                >
                  {(meta?.stages || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <select
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                  {...expenseForm.register("category")}
                >
                  {(meta?.categories || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.groupLabel ? `${c.groupLabel} — ${c.label}` : c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...expenseForm.register("amount", { valueAsNumber: true })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Date</Label>
                <Input type="date" {...expenseForm.register("expenseDate")} />
              </div>
              <div className="md:col-span-2 xl:col-span-4">
                <Button type="submit" disabled={busy} className="gap-2">
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  Save expense
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
