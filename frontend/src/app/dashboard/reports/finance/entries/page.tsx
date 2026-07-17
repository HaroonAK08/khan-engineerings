"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { ReportsSubnav } from "@/components/layout/reports-subnav";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  createFinanceEntry,
  deleteFinanceEntry,
  listFinanceEntries,
  type FinanceEntry,
} from "@/lib/finance-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const entrySchema = z.object({
  type: z.enum(["income", "expense"]),
  category: z.string().min(1, "Category required"),
  amount: z.number().positive("Amount must be positive"),
  entryDate: z.string().min(1, "Date required"),
  notes: z.string().optional(),
  reference: z.string().optional(),
});

type EntryForm = z.infer<typeof entrySchema>;

export default function FinanceEntriesPage() {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<EntryForm>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      type: "expense",
      category: "",
      amount: 0,
      entryDate: new Date().toISOString().slice(0, 10),
      notes: "",
      reference: "",
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(
        await listFinanceEntries({
          type: typeFilter === "all" ? undefined : typeFilter,
        })
      );
    } catch (err) {
      toast.error(apiError(err, "Failed to load entries"));
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(values: EntryForm) {
    setSaving(true);
    try {
      await createFinanceEntry({
        type: values.type,
        category: values.category,
        amount: values.amount,
        entryDate: values.entryDate,
        notes: values.notes,
        reference: values.reference,
      });
      toast.success("Entry recorded");
      setOpen(false);
      form.reset({
        type: "expense",
        category: "",
        amount: 0,
        entryDate: new Date().toISOString().slice(0, 10),
        notes: "",
        reference: "",
      });
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to save entry"));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this finance entry?")) return;
    try {
      await deleteFinanceEntry(id);
      toast.success("Entry deleted");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to delete"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ReportsSubnav />
      <FinanceSubnav />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            Phase 7 · Finance
          </p>
          <h1 className="text-nameplate text-xl">Income & expense entries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manual ledger for costs and income outside purchases and sales.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v ?? "all")}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Add entry
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-nameplate">New finance entry</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <Select
                    value={form.watch("type")}
                    onValueChange={(v) =>
                      form.setValue("type", (v as "income" | "expense") || "expense")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    placeholder="e.g. rent, transport, scrap sale"
                    {...form.register("category")}
                  />
                  {form.formState.errors.category && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.category.message}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      {...form.register("amount", { valueAsNumber: true })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="entryDate">Date</Label>
                    <Input id="entryDate" type="date" {...form.register("entryDate")} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reference">Reference</Label>
                  <Input id="reference" placeholder="Optional" {...form.register("reference")} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" rows={2} {...form.register("notes")} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="size-4 animate-spin" />}
                    Save
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">Ledger</CardTitle>
          <CardDescription>
            Feeds other income / other expenses on the P&amp;L overview.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : entries.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">No manual entries yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e._id}>
                    <TableCell className="font-data text-xs">{formatDate(e.entryDate)}</TableCell>
                    <TableCell>
                      <Badge variant={e.type === "income" ? "secondary" : "outline"}>
                        {e.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{e.category}</TableCell>
                    <TableCell className="font-data text-right text-xs">
                      {formatMoney(e.amount)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {e.notes || e.reference || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        onClick={() => void onDelete(e._id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
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
