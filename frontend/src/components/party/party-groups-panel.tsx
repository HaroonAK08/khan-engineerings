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
  createPartyGroup,
  customerGroupId,
  deletePartyGroup,
  getPartyGroup,
  listCustomers,
  listPartyGroups,
  updatePartyGroup,
  type Customer,
  type PartyGroup,
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
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function PartyGroupsPanel() {
  const { t } = useI18n();
  const router = useRouter();
  const [groups, setGroups] = useState<PartyGroup[]>([]);
  const [allParties, setAllParties] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PartyGroup | null>(null);
  const [selectedPartyIds, setSelectedPartyIds] = useState<string[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", notes: "" },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [groupList, partyList] = await Promise.all([
        listPartyGroups(q.trim() ? { q: q.trim() } : undefined),
        listCustomers(),
      ]);
      setGroups(groupList);
      setAllParties(partyList);
    } catch (err) {
      toast.error(apiError(err, t("pgroup.loadFailed")));
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
    form.reset({ name: "", notes: "" });
    setSelectedPartyIds([]);
    setPartySearch("");
    setDialogOpen(true);
  }

  async function openEdit(g: PartyGroup) {
    setEditing(g);
    form.reset({ name: g.name, notes: g.notes || "" });
    setPartySearch("");
    setDialogOpen(true);
    try {
      const detail = await getPartyGroup(g._id);
      setSelectedPartyIds((detail.parties || []).map((p) => p._id));
    } catch {
      setSelectedPartyIds([]);
    }
  }

  function toggleParty(id: string) {
    setSelectedPartyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    try {
      const body = {
        name: values.name,
        notes: values.notes || "",
        partyIds: selectedPartyIds,
      };
      if (editing) {
        await updatePartyGroup(editing._id, body);
        toast.success(t("pgroup.updated"));
      } else {
        await createPartyGroup(body);
        toast.success(t("pgroup.created"));
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, t("pgroup.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(g: PartyGroup) {
    if (!confirm(t("pgroup.confirmDelete"))) return;
    setDeletingId(g._id);
    try {
      await deletePartyGroup(g._id);
      toast.success(t("pgroup.deleted"));
      await load();
    } catch (err) {
      toast.error(apiError(err, t("pgroup.deleteFailed")));
    } finally {
      setDeletingId(null);
    }
  }

  const filteredParties = allParties.filter((p) => {
    const gid = customerGroupId(p);
    const available = !gid || (editing != null && gid === editing._id);
    if (!available) return false;
    if (!partySearch.trim()) return true;
    const term = partySearch.trim().toLowerCase();
    return p.name.toLowerCase().includes(term) || (p.phone || "").includes(term);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />
          {t("pgroup.add")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder={t("pgroup.search")}
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
          ) : groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("pgroup.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("pgroup.col.name")}</TableHead>
                  <TableHead>{t("pgroup.col.parties")}</TableHead>
                  <TableHead className="text-right">{t("cus.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow
                    key={g._id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dashboard/party/groups/${g._id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/dashboard/party/groups/${g._id}`);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell className="font-data text-xs">{g.partyCount ?? 0}</TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => void openEdit(g)}>
                          {t("cus.edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={deletingId === g._id}
                          onClick={() => void onDelete(g)}
                        >
                          {deletingId === g._id ? (
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-nameplate text-base">
              {editing ? t("pgroup.dialog.edit") : t("pgroup.dialog.add")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("pgroup.col.name")}</Label>
              <Input {...form.register("name")} placeholder={t("pgroup.namePh")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("cus.notes")}</Label>
              <Input {...form.register("notes")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>
                {t("pgroup.addParties")} ({selectedPartyIds.length})
              </Label>
              <Input
                placeholder={t("cus.search")}
                value={partySearch}
                onChange={(e) => setPartySearch(e.target.value)}
              />
              <div className="max-h-48 overflow-y-auto rounded-md border border-border/70">
                {filteredParties.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                    {t("pgroup.noAvailable")}
                  </p>
                ) : (
                  filteredParties.map((p) => {
                    const checked = selectedPartyIds.includes(p._id);
                    return (
                      <label
                        key={p._id}
                        className="flex cursor-pointer items-center gap-2 border-b border-border/40 px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleParty(p._id)}
                          className="size-4 accent-primary"
                        />
                        <span className="flex-1 font-medium">{p.name}</span>
                        <span className="font-data text-xs text-muted-foreground">
                          {p.phone || "—"}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
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
