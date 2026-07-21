"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, Search } from "lucide-react";
import { apiError } from "@/lib/materials-api";
import {
  createSalesman,
  listSalesmen,
  updateSalesman,
  type Salesman,
} from "@/lib/sales-api";
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

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function SalesmenPage() {
  const { t } = useI18n();
  const [salesmen, setSalesmen] = useState<Salesman[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Salesman | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", notes: "", isActive: true },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSalesmen(await listSalesmen(q.trim() ? { q: q.trim() } : undefined));
    } catch (err) {
      toast.error(apiError(err, t("sm.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [q, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", phone: "", notes: "", isActive: true });
    setDialogOpen(true);
  }

  function openEdit(s: Salesman) {
    setEditing(s);
    form.reset({
      name: s.name,
      phone: s.phone || "",
      notes: s.notes || "",
      isActive: s.isActive,
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    try {
      if (editing) {
        await updateSalesman(editing._id, values);
        toast.success(t("sm.updated"));
      } else {
        await createSalesman(values);
        toast.success(t("sm.created"));
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("sm.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("sm.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("sm.title")}</h1>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />
          {t("sm.add")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={t("sm.search")}
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
          ) : salesmen.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("sm.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sm.col.name")}</TableHead>
                  <TableHead>{t("sm.col.phone")}</TableHead>
                  <TableHead>{t("sm.col.status")}</TableHead>
                  <TableHead className="text-right">{t("sm.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesmen.map((s) => (
                  <TableRow key={s._id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-data text-xs">{s.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={s.isActive ? "secondary" : "outline"}
                        className="font-data text-[10px]"
                      >
                        {s.isActive ? t("sm.status.active") : t("sm.status.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                        {t("sm.edit")}
                      </Button>
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
              {editing ? t("sm.dialog.edit") : t("sm.dialog.add")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("sm.col.name")}</Label>
              <Input {...form.register("name")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("sm.col.phone")}</Label>
              <Input {...form.register("phone")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("sm.notes")}</Label>
              <Input {...form.register("notes")} />
            </div>
            {editing && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...form.register("isActive")} className="size-4" />
                {t("sm.status.active")}
              </label>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("sm.cancel")}
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t("sm.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
