"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, Search, Truck } from "lucide-react";
import {
  apiError,
  createSupplier,
  listSuppliers,
  updateSupplier,
} from "@/lib/materials-api";
import type { Supplier } from "@/types/materials";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";

const supplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean(),
});

type SupplierForm = z.infer<typeof supplierSchema>;

export default function SuppliersPage() {
  const { t } = useI18n();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
      isActive: true,
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { q?: string; active?: string } = {};
      if (q.trim()) params.q = q.trim();
      if (activeFilter !== "all") params.active = activeFilter;
      setSuppliers(await listSuppliers(params));
    } catch (err) {
      toast.error(apiError(err, "Failed to load suppliers"));
    } finally {
      setLoading(false);
    }
  }, [q, activeFilter]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function openCreate() {
    setEditing(null);
    form.reset({
      name: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
      isActive: true,
    });
    setDialogOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier);
    form.reset({
      name: supplier.name,
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
      isActive: supplier.isActive,
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: SupplierForm) {
    setSaving(true);
    try {
      if (editing) {
        await updateSupplier(editing._id, values);
        toast.success("Supplier updated");
      } else {
        await createSupplier(values);
        toast.success("Supplier created");
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to save supplier"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(supplier: Supplier) {
    try {
      await updateSupplier(supplier._id, { isActive: !supplier.isActive });
      toast.success(supplier.isActive ? "Supplier deactivated" : "Supplier activated");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to update supplier"));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("sup.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("sup.title")}</h1>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />
          {t("sup.add")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder={t("sup.search")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {(
                [
                  ["all", "sup.all"],
                  ["true", "sup.active"],
                  ["false", "sup.inactive"],
                ] as const
              ).map(([value, labelKey]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={activeFilter === value ? "default" : "outline"}
                  onClick={() => setActiveFilter(value)}
                >
                  {t(labelKey)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : suppliers.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Truck className="size-8 opacity-40" />
              <p className="text-sm">{t("sup.empty")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sup.col.name")}</TableHead>
                  <TableHead>{t("sup.col.phone")}</TableHead>
                  <TableHead>{t("sup.col.email")}</TableHead>
                  <TableHead>{t("sup.col.status")}</TableHead>
                  <TableHead className="text-right">{t("sup.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s._id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/suppliers/${s._id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-data text-xs">{s.phone || "—"}</TableCell>
                    <TableCell className="font-data text-xs">{s.email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={s.isActive ? "secondary" : "outline"} className="font-data text-[10px]">
                        {s.isActive ? t("sup.status.active") : t("sup.status.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                          {t("sup.edit")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(s)}>
                          {s.isActive ? t("sup.deactivate") : t("sup.activate")}
                        </Button>
                        <Link
                          href={`/dashboard/suppliers/${s._id}`}
                          className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem] hover:bg-muted"
                        >
                          {t("sup.ledger")}
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-nameplate text-base">
              {editing ? t("sup.dialog.edit") : t("sup.dialog.add")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">{t("sup.col.name")}</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">{t("sup.col.phone")}</Label>
              <Input id="phone" {...form.register("phone")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t("sup.col.email")}</Label>
              <Input id="email" type="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">{t("sup.address")}</Label>
              <Input id="address" {...form.register("address")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">{t("sup.notes")}</Label>
              <Input id="notes" {...form.register("notes")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("sup.cancel")}
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("sup.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
