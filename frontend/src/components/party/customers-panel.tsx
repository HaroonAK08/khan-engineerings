"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, Search } from "lucide-react";
import { apiError } from "@/lib/materials-api";
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  updateCustomer,
  type Customer,
} from "@/lib/sales-api";
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

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function CustomersPanel() {
  const { t } = useI18n();
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      notes: "",
      isActive: true,
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCustomers(await listCustomers(q.trim() ? { q: q.trim() } : undefined));
    } catch (err) {
      toast.error(apiError(err, "Failed to load customers"));
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", phone: "", address: "", notes: "", isActive: true });
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    form.reset({
      name: c.name,
      phone: c.phone || "",
      address: c.address || "",
      notes: c.notes || "",
      isActive: c.isActive,
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    try {
      if (editing) {
        await updateCustomer(editing._id, values);
        toast.success("Customer updated");
      } else {
        await createCustomer(values);
        toast.success("Customer created");
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Failed to save customer"));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(c: Customer) {
    if (!confirm(t("cus.confirmDelete"))) return;
    setDeletingId(c._id);
    try {
      await deleteCustomer(c._id);
      toast.success(t("cus.deleted"));
      await load();
    } catch (err) {
      toast.error(apiError(err, t("cus.deleteFailed")));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />
          {t("cus.add")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={t("cus.search")}
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
          ) : customers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("cus.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("cus.col.name")}</TableHead>
                  <TableHead>{t("cus.col.phone")}</TableHead>
                  <TableHead className="text-right">{t("cus.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow
                    key={c._id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/party/customers/${c._id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/dashboard/party/customers/${c._id}`);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="font-data text-xs">{c.phone || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div
                        className="inline-flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                          {t("cus.edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={deletingId === c._id}
                          onClick={() => onDelete(c)}
                        >
                          {deletingId === c._id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            t("cus.delete")
                          )}
                        </Button>
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
              {editing ? t("cus.dialog.edit") : t("cus.dialog.add")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("cus.col.name")}</Label>
              <Input {...form.register("name")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("cus.col.phone")}</Label>
              <Input {...form.register("phone")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("cus.address")}</Label>
              <Input {...form.register("address")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("cus.notes")}</Label>
              <Input {...form.register("notes")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("cus.cancel")}
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("cus.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
