"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { apiError, formatDate, formatMoney, withSameDayConfirm } from "@/lib/materials-api";
import {
  createPartyGroup,
  customerGroupId,
  deletePartyGroup,
  getPartyGroup,
  listCustomers,
  listPartyGroups,
  listSalesmen,
  listSalesmanPayments,
  paySalesman,
  updatePartyGroup,
  type Customer,
  type PartyGroup,
  type PartyGroupChannel,
  type Salesman,
} from "@/lib/sales-api";
import { createFactoryExpense, listFactoryExpenses } from "@/lib/expenses-api";
import type { BatchExpense } from "@/types/production";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UrduPhoneticInput } from "@/components/ui/urdu-phonetic-input";
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
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import { todayInput } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import { channelColors } from "@/lib/channel-colors";
import { DateRangeFilter } from "@/components/date-range-filter";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  notes: z.string().optional(),
  channel: z.enum(["power_engineering", "ik_engineering"]),
});

type FormValues = z.infer<typeof schema>;

function resolveChannel(g: PartyGroup): PartyGroupChannel {
  if (g.channel === "ik_engineering" || g.channel === "power_engineering") return g.channel;
  const key = g.name.trim().toLowerCase().replace(/\s+/g, " ");
  return key === "i k" || key === "ik" || key === "machi goth"
    ? "ik_engineering"
    : "power_engineering";
}

export function PartyGroupsPanel() {
  const { t } = useI18n();
  const router = useRouter();
  const [groups, setGroups] = useState<PartyGroup[]>([]);
  const [allParties, setAllParties] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [mainChannel, setMainChannel] = useState<PartyGroupChannel | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PartyGroup | null>(null);
  const [selectedPartyIds, setSelectedPartyIds] = useState<string[]>([]);
  const [partySearch, setPartySearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();
  const [salesmen, setSalesmen] = useState<Salesman[]>([]);
  const [tourExpenses, setTourExpenses] = useState<BatchExpense[]>([]);
  const [salesmanPays, setSalesmanPays] = useState<BatchExpense[]>([]);
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [showTourForm, setShowTourForm] = useState(false);
  const [showSalesmanForm, setShowSalesmanForm] = useState(false);
  const [tourAmount, setTourAmount] = useState("");
  const [tourDate, setTourDate] = useState(todayInput());
  const [tourNote, setTourNote] = useState("");
  const [paySalesmanId, setPaySalesmanId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayInput());
  const [payNote, setPayNote] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      notes: "",
      channel: "power_engineering",
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [groupList, partyList] = await Promise.all([
        listPartyGroups(),
        listCustomers(),
      ]);
      setGroups(groupList);
      setAllParties(partyList);
    } catch (err) {
      toast.error(apiError(err, t("pgroup.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadExpenses = useCallback(async () => {
    if (!hydrated) return;
    try {
      const [tours, pays, sm] = await Promise.all([
        listFactoryExpenses({
          category: "tour_expenses",
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
        listSalesmanPayments({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
        listSalesmen({ active: "true" }),
      ]);
      setTourExpenses(tours);
      setSalesmanPays(pays);
      setSalesmen(sm);
    } catch (err) {
      toast.error(apiError(err, t("pgroup.loadFailed")));
    }
  }, [dateFrom, dateTo, hydrated, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (mainChannel !== "power_engineering") return;
    const timer = setTimeout(() => void loadExpenses(), 200);
    return () => clearTimeout(timer);
  }, [mainChannel, loadExpenses]);

  useEffect(() => {
    if (!paySalesmanId && salesmen[0]?._id) setPaySalesmanId(salesmen[0]._id);
  }, [salesmen, paySalesmanId]);

  const expenseRows = useMemo(() => {
    const tours = tourExpenses.map((e) => ({
      _id: e._id,
      category: "tour_expenses" as const,
      amount: e.amount,
      expenseDate: e.expenseDate,
      notes: e.notes || e.title || "",
      salesmanName: null as string | null,
    }));
    const pays = salesmanPays.map((e) => ({
      _id: e._id,
      category: "salesman_commission" as const,
      amount: e.amount,
      expenseDate: e.expenseDate,
      notes: e.notes || "",
      salesmanName:
        e.salesman && typeof e.salesman === "object" && "name" in e.salesman
          ? String((e.salesman as { name?: string }).name || "")
          : null,
    }));
    return [...tours, ...pays].sort(
      (a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime()
    );
  }, [tourExpenses, salesmanPays]);

  const tourTotal = useMemo(
    () => tourExpenses.reduce((s, e) => s + (e.amount || 0), 0),
    [tourExpenses]
  );
  const salesmanPayTotal = useMemo(
    () => salesmanPays.reduce((s, e) => s + (e.amount || 0), 0),
    [salesmanPays]
  );

  async function saveTourExpense() {
    const amount = Number(tourAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("exp.enterAmount"));
      return;
    }
    if (!tourDate) {
      toast.error(t("exp.pickDate"));
      return;
    }
    setExpenseBusy(true);
    try {
      const body = {
        category: "tour_expenses",
        amount,
        expenseDate: tourDate,
        notes: tourNote.trim() || undefined,
        scope: "common" as const,
      };
      const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
        createFactoryExpense({ ...body, confirmDuplicate })
      );
      if (cancelled) return;
      toast.success(t("pgroup.tourSaved"));
      setTourAmount("");
      setTourNote("");
      setTourDate(todayInput());
      setShowTourForm(false);
      await loadExpenses();
    } catch (err) {
      toast.error(apiError(err, t("exp.entrySaveFailed")));
    } finally {
      setExpenseBusy(false);
    }
  }

  async function saveSalesmanPay() {
    const amount = Number(payAmount);
    if (!paySalesmanId) {
      toast.error(t("pgroup.pickSalesman"));
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("exp.enterAmount"));
      return;
    }
    if (!payDate) {
      toast.error(t("exp.pickDate"));
      return;
    }
    setExpenseBusy(true);
    try {
      await paySalesman(paySalesmanId, {
        expenseDate: payDate,
        amount,
        notes: payNote.trim() || undefined,
      });
      toast.success(t("pgroup.salesmanPaySaved"));
      setPayAmount("");
      setPayNote("");
      setPayDate(todayInput());
      setShowSalesmanForm(false);
      await loadExpenses();
    } catch (err) {
      toast.error(apiError(err, t("exp.entrySaveFailed")));
    } finally {
      setExpenseBusy(false);
    }
  }

  const powerGroups = useMemo(
    () => groups.filter((g) => resolveChannel(g) === "power_engineering"),
    [groups]
  );
  const ikGroups = useMemo(
    () => groups.filter((g) => resolveChannel(g) === "ik_engineering"),
    [groups]
  );

  const activeGroups = useMemo(() => {
    const list =
      mainChannel === "power_engineering"
        ? powerGroups
        : mainChannel === "ik_engineering"
          ? ikGroups
          : [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((g) => g.name.toLowerCase().includes(term));
  }, [mainChannel, powerGroups, ikGroups, q]);

  function openCreate() {
    setEditing(null);
    form.reset({
      name: "",
      notes: "",
      channel: mainChannel || "power_engineering",
    });
    setSelectedPartyIds([]);
    setPartySearch("");
    setDialogOpen(true);
  }

  async function openEdit(g: PartyGroup) {
    setEditing(g);
    form.reset({
      name: g.name,
      notes: g.notes || "",
      channel: resolveChannel(g),
    });
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
        channel: values.channel,
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

  const mainCards: Array<{
    id: PartyGroupChannel;
    title: string;
    hint: string;
    groups: PartyGroup[];
    accent: string;
  }> = [
    {
      id: "power_engineering",
      title: t("pgroup.mainPower"),
      hint: t("pgroup.mainPowerHint"),
      groups: powerGroups,
      accent: channelColors.power.hover,
    },
    {
      id: "ik_engineering",
      title: t("pgroup.mainIk"),
      hint: t("pgroup.mainIkHint"),
      groups: ikGroups,
      accent: channelColors.ik.hover,
    },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!mainChannel) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {mainCards.map((card) => {
          const partyTotal = card.groups.reduce((s, g) => s + (g.partyCount || 0), 0);
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                setMainChannel(card.id);
                setQ("");
              }}
              className={cn(
                "rounded-lg border bg-card p-5 text-left transition-colors",
                card.accent
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-nameplate text-base">{card.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{card.hint}</p>
                </div>
                <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" />
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t("pgroup.col.areas")}</p>
                  <p className="font-data text-lg">{card.groups.length}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("pgroup.col.parties")}</p>
                  <p className="font-data text-lg">{partyTotal}</p>
                </div>
              </div>
              <p className="mt-3 text-xs font-medium text-primary">{t("pgroup.openAreas")}</p>
            </button>
          );
        })}
      </div>
    );
  }

  const mainTitle =
    mainChannel === "power_engineering" ? t("pgroup.mainPower") : t("pgroup.mainIk");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          className="gap-2 px-2"
          onClick={() => {
            setMainChannel(null);
            setQ("");
            setShowTourForm(false);
            setShowSalesmanForm(false);
          }}
        >
          <ArrowLeft className="size-4" />
          {t("pgroup.backToMain")}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {mainChannel === "power_engineering" ? <DateRangeFilter /> : null}
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" />
            {t("pgroup.add")}
          </Button>
        </div>
      </div>

      {mainChannel === "power_engineering" ? (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-nameplate text-sm">{t("pgroup.expensesTitle")}</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                {t("pgroup.expensesDesc")}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={showTourForm ? "secondary" : "outline"}
                className="gap-1.5"
                onClick={() => {
                  setShowTourForm((v) => !v);
                  setShowSalesmanForm(false);
                }}
              >
                <Plus className="size-3.5" />
                {t("pgroup.addTour")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={showSalesmanForm ? "secondary" : "outline"}
                className="gap-1.5"
                onClick={() => {
                  setShowSalesmanForm((v) => !v);
                  setShowTourForm(false);
                }}
              >
                <Plus className="size-3.5" />
                {t("pgroup.addSalesmanPay")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{t("pgroup.tourTotal")}</p>
                <p className="font-data text-lg">{formatMoney(tourTotal)}</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{t("pgroup.salesmanPayTotal")}</p>
                <p className="font-data text-lg">{formatMoney(salesmanPayTotal)}</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{t("pgroup.expensesTotal")}</p>
                <p className="font-data text-lg">
                  {formatMoney(tourTotal + salesmanPayTotal)}
                </p>
              </div>
            </div>

            {showTourForm ? (
              <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("pgroup.expenseAmount")}</Label>
                  <Input
                    type="number"
                    step="1"
                    value={tourAmount}
                    onChange={(e) => setTourAmount(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("pgroup.expenseDate")}</Label>
                  <Input
                    type="date"
                    value={tourDate}
                    onChange={(e) => setTourDate(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>{t("pgroup.expenseNote")}</Label>
                  <UrduPhoneticInput
                    value={tourNote}
                    onChange={setTourNote}
                    className="h-10"
                  />
                </div>
                <div className="sm:col-span-4">
                  <Button
                    type="button"
                    disabled={expenseBusy}
                    onClick={() => void saveTourExpense()}
                    className="gap-2"
                  >
                    {expenseBusy && <Loader2 className="size-4 animate-spin" />}
                    {t("pgroup.addTour")}
                  </Button>
                </div>
              </div>
            ) : null}

            {showSalesmanForm ? (
              <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-4">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>{t("pgroup.pickSalesman")}</Label>
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={paySalesmanId}
                    onChange={(e) => setPaySalesmanId(e.target.value)}
                  >
                    {salesmen.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("pgroup.expenseAmount")}</Label>
                  <Input
                    type="number"
                    step="1"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("pgroup.expenseDate")}</Label>
                  <Input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-3">
                  <Label>{t("pgroup.expenseNote")}</Label>
                  <UrduPhoneticInput
                    value={payNote}
                    onChange={setPayNote}
                    className="h-10"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    disabled={expenseBusy || salesmen.length === 0}
                    onClick={() => void saveSalesmanPay()}
                    className="gap-2"
                  >
                    {expenseBusy && <Loader2 className="size-4 animate-spin" />}
                    {t("pgroup.addSalesmanPay")}
                  </Button>
                </div>
              </div>
            ) : null}

            {expenseRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("pgroup.expenseEmpty")}</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("pgroup.expenseDate")}</TableHead>
                      <TableHead>{t("pgroup.channel")}</TableHead>
                      <TableHead>{t("pgroup.pickSalesman")}</TableHead>
                      <TableHead>{t("pgroup.expenseNote")}</TableHead>
                      <TableHead className="text-right">{t("pgroup.expenseAmount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenseRows.map((e) => (
                      <TableRow key={e._id}>
                        <TableCell className="font-data text-xs">
                          {formatDate(e.expenseDate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-data text-[10px]">
                            {e.category === "tour_expenses"
                              ? t("pgroup.catTour")
                              : t("pgroup.catSalesman")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{e.salesmanName || "—"}</TableCell>
                        <TableCell className="max-w-[16rem] truncate text-sm text-muted-foreground">
                          {e.notes || "—"}
                        </TableCell>
                        <TableCell className="font-data text-right text-xs">
                          {formatMoney(e.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="gap-3 pb-3">
          <div>
            <CardTitle className="text-nameplate text-base">{mainTitle}</CardTitle>
            <CardDescription>
              {mainChannel === "power_engineering"
                ? t("pgroup.mainPowerHint")
                : t("pgroup.mainIkHint")}
            </CardDescription>
          </div>
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
          {activeGroups.length === 0 ? (
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
                {activeGroups.map((g) => (
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
              <Label>{t("pgroup.channel")}</Label>
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.watch("channel")}
                onChange={(e) =>
                  form.setValue("channel", e.target.value as PartyGroupChannel)
                }
              >
                <option value="power_engineering">{t("pgroup.mainPower")}</option>
                <option value="ik_engineering">{t("pgroup.mainIk")}</option>
              </select>
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
