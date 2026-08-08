"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, ChevronRight, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { apiError, formatDate, formatKg, formatMoney } from "@/lib/materials-api";
import {
  createWorker,
  deactivateWorker,
  listSalaryPayments,
  listWorkers,
  payWorker,
  updateWorker,
  type ExpenseScope,
  type Worker,
} from "@/lib/workers-api";
import { getProductionMargin } from "@/lib/finance-api";
import type { BatchExpense } from "@/types/production";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UrduPhoneticInput } from "@/components/ui/urdu-phonetic-input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { todayInput } from "@/lib/date-range";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import { DateRangeFilter } from "@/components/date-range-filter";
import { WorkerSearchSelect } from "@/components/workers/worker-search-select";
import {
  ExpenseScopeChips,
  scopeChipClass,
} from "@/components/expenses/expense-scope-chips";
import {
  matchesExpenseScope,
  usePersistedExpenseScope,
} from "@/hooks/use-persisted-expense-scope";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function displayWorkerName(
  w: { name: string; nameUr?: string } | string | null | undefined,
  isUrdu: boolean
) {
  if (!w) return "";
  if (typeof w === "string") return w;
  if (isUrdu && w.nameUr?.trim()) return w.nameUr.trim();
  return w.name;
}

function displayJob(
  job: string,
  t: (key: "sal.jobMolder" | "sal.jobHelper") => string
) {
  const key = job.trim().toLowerCase();
  if (key === "molder") return t("sal.jobMolder");
  if (key === "helper") return t("sal.jobHelper");
  return job;
}

function paymentWorkerId(e: BatchExpense) {
  if (!e.worker) return "";
  return typeof e.worker === "string" ? e.worker : e.worker._id;
}

/** Drum payroll groups: Idrees / Amin / Ashraf / Shakeel → Khrad; everyone else → Molder */
const DRUM_KHRAD_FIRST_NAMES = new Set(["idrees", "idris", "amin", "ashraf", "shakeel"]);

type DrumGroupId = "khrad" | "molder";

function isDrumKhradWorker(w: Worker) {
  const first = w.name.trim().toLowerCase().split(/\s+/)[0] || "";
  return DRUM_KHRAD_FIRST_NAMES.has(first);
}

export default function SalariesPage() {
  const { t, isUrdu } = useI18n();
  const router = useRouter();
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [payments, setPayments] = useState<BatchExpense[]>([]);
  const [hubFinishedKg, setHubFinishedKg] = useState(0);
  const [drumFinishedKg, setDrumFinishedKg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayInput());
  const [payNote, setPayNote] = useState("");

  const [search, setSearch] = useState("");
  const { scope: scopeFilter, formDefault } = usePersistedExpenseScope();
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [addPayWorkerId, setAddPayWorkerId] = useState("");
  const [newName, setNewName] = useState("");
  const [newNameUr, setNewNameUr] = useState("");
  const [newJob, setNewJob] = useState("");
  const [newUnitLabel, setNewUnitLabel] = useState("hub");
  const [newScope, setNewScope] = useState<ExpenseScope>("common");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNameUr, setEditNameUr] = useState("");
  const [editJob, setEditJob] = useState("");
  const [editUnitLabel, setEditUnitLabel] = useState("");
  const [editScope, setEditScope] = useState<ExpenseScope>("common");
  const [openDrumGroup, setOpenDrumGroup] = useState<DrumGroupId | null>(null);

  const scopeLabels = {
    hub: t("exp.scopeHub"),
    drum: t("exp.scopeDrum"),
    common: t("exp.scopeCommon"),
  };

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    try {
      const [w, p, margin] = await Promise.all([
        listWorkers({ active: "true" }),
        listSalaryPayments({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
        getProductionMargin({ dateFrom, dateTo }),
      ]);
      setWorkers(w);
      setPayments(p);
      setHubFinishedKg(margin.summary?.hubFinishedKg || 0);
      setDrumFinishedKg(margin.summary?.drumFinishedKg || 0);
    } catch (err) {
      toast.error(apiError(err, "Failed to load salaries"));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, hydrated]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 150);
    return () => clearTimeout(t);
  }, [load]);

  const periodTotal = useMemo(
    () =>
      payments
        .filter((e) => matchesExpenseScope(e.scope, scopeFilter))
        .reduce((s, e) => s + e.amount, 0),
    [payments, scopeFilter]
  );

  const paidByWorker = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of payments) {
      if (!matchesExpenseScope(e.scope, scopeFilter)) continue;
      const id = paymentWorkerId(e);
      if (!id) continue;
      map.set(id, (map.get(id) || 0) + (e.amount || 0));
    }
    return map;
  }, [payments, scopeFilter]);

  const scopedWorkers = useMemo(
    () => workers.filter((w) => matchesExpenseScope(w.scope, scopeFilter)),
    [workers, scopeFilter]
  );

  const producedKgCard = useMemo(() => {
    if (scopeFilter === "hub") {
      return { label: t("sal.hubProducedKg"), value: hubFinishedKg };
    }
    if (scopeFilter === "drum") {
      return { label: t("sal.drumProducedKg"), value: drumFinishedKg };
    }
    return {
      label: t("sal.totalProducedKg"),
      value: hubFinishedKg + drumFinishedKg,
    };
  }, [scopeFilter, hubFinishedKg, drumFinishedKg, t]);

  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedWorkers;
    return scopedWorkers.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.nameUr && w.nameUr.toLowerCase().includes(q)) ||
        (w.job && w.job.toLowerCase().includes(q))
    );
  }, [scopedWorkers, search]);

  const drumGroups = useMemo(() => {
    if (scopeFilter !== "drum") return null;
    const khrad = filteredWorkers.filter(isDrumKhradWorker);
    const molder = filteredWorkers.filter((w) => !isDrumKhradWorker(w));
    return [
      {
        id: "khrad" as const,
        label: t("sal.groupKhrad"),
        workers: khrad,
        paid: khrad.reduce((s, w) => s + (paidByWorker.get(w._id) || 0), 0),
      },
      {
        id: "molder" as const,
        label: t("sal.groupMolder"),
        workers: molder,
        paid: molder.reduce((s, w) => s + (paidByWorker.get(w._id) || 0), 0),
      },
    ];
  }, [scopeFilter, filteredWorkers, paidByWorker, t]);

  useEffect(() => {
    if (scopeFilter !== "drum") setOpenDrumGroup(null);
  }, [scopeFilter]);

  function openPay(w: Worker) {
    setEditingId(null);
    setShowAddWorker(false);
    setShowAddPayment(false);
    setPayingId(w._id);
    setPayAmount("");
    setPayDate(todayInput());
    setPayNote("");
  }

  function openEdit(w: Worker) {
    setPayingId(null);
    setShowAddWorker(false);
    setShowAddPayment(false);
    setEditingId(w._id);
    setEditName(w.name);
    setEditNameUr(w.nameUr || "");
    setEditJob(w.job || "");
    setEditUnitLabel(w.unitLabel || "piece");
    setEditScope((w.scope as ExpenseScope) || "common");
  }

  function openAddPaymentForm() {
    setPayingId(null);
    setEditingId(null);
    setShowAddWorker(false);
    setShowAddPayment(true);
    setAddPayWorkerId("");
    setPayAmount("");
    setPayDate(todayInput());
    setPayNote("");
  }

  function openAddWorkerForm() {
    setPayingId(null);
    setEditingId(null);
    setShowAddPayment(false);
    setShowAddWorker(true);
    setNewScope(formDefault);
  }

  async function onSaveEdit(w: Worker) {
    const name = editName.trim();
    if (!name) {
      toast.error("Enter worker name");
      return;
    }
    setBusyId(`edit-${w._id}`);
    try {
      await updateWorker(w._id, {
        name,
        nameUr: editNameUr.trim(),
        job: editJob.trim(),
        unitLabel: editUnitLabel.trim() || "piece",
        scope: editScope,
      });
      toast.success(t("sal.workerUpdated"));
      setEditingId(null);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Could not update worker"));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmPay(w: Worker) {
    if (!payDate) {
      toast.error("Pick the pay date");
      return;
    }
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter the amount for this pay");
      return;
    }
    setBusyId(w._id);
    try {
      await payWorker(w._id, {
        expenseDate: payDate,
        amount,
        notes: payNote.trim() || undefined,
      });
      toast.success(`Paid ${displayWorkerName(w, isUrdu)} · ${formatDate(payDate)}`);
      setPayingId(null);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Pay failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmAddPayment() {
    if (!addPayWorkerId) {
      toast.error(t("sal.pickWorker"));
      return;
    }
    const w = workers.find((row) => row._id === addPayWorkerId);
    if (!w) {
      toast.error(t("sal.pickWorker"));
      return;
    }
    if (!payDate) {
      toast.error("Pick the pay date");
      return;
    }
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter the amount for this pay");
      return;
    }
    setBusyId("add-payment");
    try {
      await payWorker(w._id, {
        expenseDate: payDate,
        amount,
        notes: payNote.trim() || undefined,
      });
      toast.success(`Paid ${displayWorkerName(w, isUrdu)} · ${formatDate(payDate)}`);
      setShowAddPayment(false);
      setAddPayWorkerId("");
      setPayAmount("");
      setPayNote("");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Pay failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function onAddWorker() {
    const name = newName.trim();
    if (!name) {
      toast.error("Enter worker name");
      return;
    }
    setBusyId("add-worker");
    try {
      await createWorker({
        name,
        nameUr: newNameUr.trim(),
        job: newJob.trim(),
        unitLabel: newUnitLabel.trim() || "piece",
        scope: newScope,
      });
      toast.success("Worker added");
      setNewName("");
      setNewNameUr("");
      setNewJob("");
      setNewScope(formDefault);
      setShowAddWorker(false);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Could not add worker"));
    } finally {
      setBusyId(null);
    }
  }

  async function onDeactivateWorker(w: Worker) {
    if (!confirm(`Remove ${displayWorkerName(w, isUrdu)} from the active list?`)) return;
    try {
      await deactivateWorker(w._id);
      toast.success("Worker removed");
      await load();
    } catch (err) {
      toast.error(apiError(err, "Could not remove worker"));
    }
  }

  function renderWorkerCard(w: Worker) {
    const isPaying = payingId === w._id;
    const isEditing = editingId === w._id;
    return (
      <Card
        key={w._id}
        className="cursor-pointer py-0 transition-colors hover:bg-muted/30"
        onClick={() => router.push(`/dashboard/expenses/salaries/${w._id}`)}
      >
        <CardContent className="flex flex-col gap-3 px-3.5 py-3.5 sm:px-4 sm:py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className="truncate text-base font-medium tracking-tight"
                  dir={isUrdu && w.nameUr?.trim() ? "rtl" : undefined}
                >
                  {displayWorkerName(w, isUrdu)}
                </p>
                <Badge
                  variant="outline"
                  className={cn("font-data text-[9px]", scopeChipClass(w.scope || "common"))}
                >
                  {scopeLabels[(w.scope as ExpenseScope) || "common"]}
                </Badge>
              </div>
              {w.job ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{displayJob(w.job, t)}</p>
              ) : null}
              <p className="font-data mt-1 text-sm font-semibold tabular-nums">
                {formatMoney(paidByWorker.get(w._id) || 0)}
                <span className="ml-1.5 text-[10px] font-normal tracking-wide text-muted-foreground uppercase">
                  {t("sal.paidPeriod")}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
              {!isPaying && !isEditing && (
                <Button type="button" size="sm" onClick={() => openPay(w)}>
                  {t("sal.payNow")}
                </Button>
              )}
              {!isEditing && (
                <Button type="button" size="sm" variant="outline" onClick={() => openEdit(w)}>
                  {t("sal.editWorker")}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={() => void onDeactivateWorker(w)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          {isEditing && (
            <div
              className="rounded-xl border border-border/80 bg-muted/30 p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="mb-3 text-sm font-medium">{t("sal.editWorker")}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.name")}</Label>
                  <Input
                    placeholder={t("sal.phName")}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.nameUr")}</Label>
                  <UrduPhoneticInput
                    placeholder={t("sal.phNameUr")}
                    value={editNameUr}
                    onChange={setEditNameUr}
                  />
                  {isUrdu && (
                    <p className="text-[11px] text-muted-foreground">{t("common.urduTypeHint")}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.job")}</Label>
                  <UrduPhoneticInput
                    placeholder={t("sal.phJob")}
                    value={editJob}
                    onChange={setEditJob}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.unitName")}</Label>
                  <Input
                    value={editUnitLabel}
                    onChange={(e) => setEditUnitLabel(e.target.value)}
                    placeholder={t("sal.phUnit")}
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
                  <Label>{t("exp.scope")}</Label>
                  <ExpenseScopeChips
                    value={editScope}
                    onChange={(next) => {
                      if (next !== "all") setEditScope(next);
                    }}
                    labels={scopeLabels}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="gap-2"
                  disabled={busyId === `edit-${w._id}`}
                  onClick={() => void onSaveEdit(w)}
                >
                  {busyId === `edit-${w._id}` && <Loader2 className="size-4 animate-spin" />}
                  {t("sal.saveChanges")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                  {t("sal.cancel")}
                </Button>
              </div>
            </div>
          )}

          {isPaying && (
            <div
              className="rounded-xl border border-border/80 bg-muted/30 p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("exp.scope")}:</span>
                <span
                  className={cn(
                    "rounded border px-2 py-0.5 text-xs font-medium",
                    scopeChipClass(w.scope || "common")
                  )}
                >
                  {scopeLabels[(w.scope as ExpenseScope) || "common"]}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.paymentAmount")}</Label>
                  <Input
                    type="number"
                    step="1"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="h-11 text-base"
                    placeholder={t("sal.phAmount")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.payDate")}</Label>
                  <Input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="h-11"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-3">
                  <Label>{t("exp.noteOptional")}</Label>
                  <UrduPhoneticInput
                    value={payNote}
                    onChange={setPayNote}
                    className="h-11"
                    placeholder={t("sal.notePh")}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="lg"
                  className="min-w-[140px] gap-2"
                  disabled={busyId === w._id}
                  onClick={() => void confirmPay(w)}
                >
                  {busyId === w._id && <Loader2 className="size-4 animate-spin" />}
                  {t("sal.confirmPay")}
                </Button>
                <Button type="button" size="lg" variant="outline" onClick={() => setPayingId(null)}>
                  {t("sal.cancel")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("sal.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("sal.title")}</h1>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">{t("sal.desc")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter />
          <Link
            href="/dashboard/expenses/salaries/calendar"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-amber-300 shadow-md transition-colors hover:bg-slate-800 hover:text-amber-200 dark:border-slate-600 dark:bg-slate-950 dark:text-amber-300 dark:hover:bg-slate-900"
          >
            <BookOpen className="size-4 text-amber-400" />
            {t("sal.openCalendar")}
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {t("sal.activeWorkers")}
            </p>
            <p className="font-data mt-1 text-xl">{scopedWorkers.length}</p>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {t("sal.totalPaid")}
            </p>
            <p className="font-data mt-1 text-xl">{formatMoney(periodTotal)}</p>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {producedKgCard.label}
            </p>
            <p className="font-data mt-1 text-xl">{formatKg(producedKgCard.value)}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      ) : (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-nameplate text-base">{t("sal.workers")}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={showAddPayment ? "outline" : "default"}
                className="gap-1.5"
                onClick={() => {
                  if (showAddPayment) {
                    setShowAddPayment(false);
                    return;
                  }
                  openAddPaymentForm();
                }}
              >
                <Plus className="size-4" />
                {showAddPayment ? t("sal.cancel") : t("sal.addPayment")}
              </Button>
              <Button
                type="button"
                variant={showAddWorker ? "outline" : "default"}
                className="gap-1.5"
                onClick={() => {
                  if (showAddWorker) {
                    setShowAddWorker(false);
                    return;
                  }
                  openAddWorkerForm();
                }}
              >
                <Plus className="size-4" />
                {showAddWorker ? t("sal.cancel") : t("sal.addWorker")}
              </Button>
            </div>
          </div>

          <div className="max-w-md">
            <Label
              htmlFor="worker-search"
              className="mb-1.5 block text-sm font-semibold text-red-700 dark:text-red-400"
            >
              {t("common.search")}
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-red-600 dark:text-red-400" />
              <Input
                id="worker-search"
                className="h-11 border-2 border-red-500 bg-red-50 pl-9 text-base text-foreground placeholder:text-red-700/60 focus-visible:border-red-600 focus-visible:ring-red-500/40 dark:border-red-500 dark:bg-red-950/40 dark:placeholder:text-red-300/60"
                placeholder={t("sal.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {showAddPayment && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-nameplate text-sm">{t("sal.addPayment")}</CardTitle>
                <CardDescription>{t("sal.pickWorker")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
                  <Label>{t("salReports.worker")}</Label>
                  <WorkerSearchSelect
                    workers={filteredWorkers}
                    value={addPayWorkerId}
                    onChange={setAddPayWorkerId}
                    placeholder={t("sal.pickWorker")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.paymentAmount")}</Label>
                  <Input
                    type="number"
                    step="1"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="h-11 text-base"
                    placeholder={t("sal.phAmount")}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.payDate")}</Label>
                  <Input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="h-11"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label>{t("exp.noteOptional")}</Label>
                  <UrduPhoneticInput
                    value={payNote}
                    onChange={setPayNote}
                    className="h-11"
                    placeholder={t("sal.notePh")}
                  />
                </div>
                <div className="flex items-end sm:col-span-2 lg:col-span-4">
                  <Button
                    type="button"
                    disabled={busyId === "add-payment"}
                    className="gap-2"
                    onClick={() => void confirmAddPayment()}
                  >
                    {busyId === "add-payment" && <Loader2 className="size-4 animate-spin" />}
                    {t("sal.confirmPay")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {showAddWorker && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-nameplate text-sm">{t("sal.newWorker")}</CardTitle>
                <CardDescription>{t("sal.newWorkerDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.name")}</Label>
                  <Input
                    placeholder={t("sal.phName")}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.nameUr")}</Label>
                  <UrduPhoneticInput
                    placeholder={t("sal.phNameUr")}
                    value={newNameUr}
                    onChange={setNewNameUr}
                  />
                  {isUrdu && (
                    <p className="text-[11px] text-muted-foreground">{t("common.urduTypeHint")}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.job")}</Label>
                  <UrduPhoneticInput
                    placeholder={t("sal.phJob")}
                    value={newJob}
                    onChange={setNewJob}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.unitName")}</Label>
                  <Input
                    value={newUnitLabel}
                    onChange={(e) => setNewUnitLabel(e.target.value)}
                    placeholder={t("sal.phUnit")}
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
                  <Label>{t("exp.scope")}</Label>
                  <ExpenseScopeChips
                    value={newScope}
                    onChange={(next) => {
                      if (next !== "all") setNewScope(next);
                    }}
                    labels={scopeLabels}
                  />
                </div>
                <div className="flex items-end sm:col-span-2 lg:col-span-4">
                  <Button
                    type="button"
                    disabled={busyId === "add-worker"}
                    className="gap-2"
                    onClick={() => void onAddWorker()}
                  >
                    {busyId === "add-worker" && <Loader2 className="size-4 animate-spin" />}
                    {t("sal.saveWorker")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {workers.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t("sal.noWorkers")}
              </CardContent>
            </Card>
          ) : filteredWorkers.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t("sal.noMatch", { query: search.trim() })}
              </CardContent>
            </Card>
          ) : drumGroups ? (
            <div className="grid gap-3">
              {drumGroups.map((group) => {
                const open = openDrumGroup === group.id;
                return (
                  <Card key={group.id} className="py-0 overflow-hidden">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40"
                      onClick={() =>
                        setOpenDrumGroup((prev) => (prev === group.id ? null : group.id))
                      }
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <ChevronRight
                          className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform",
                            open && "rotate-90"
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-nameplate text-base">{group.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t("sal.groupWorkers", { count: group.workers.length })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-data text-lg font-semibold tabular-nums">
                          {formatMoney(group.paid)}
                        </p>
                        <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                          {t("sal.paidPeriod")}
                        </p>
                      </div>
                    </button>
                    {open && (
                      <div className="border-t border-border/70 bg-muted/20 px-2 py-2 sm:px-3">
                        {group.workers.length === 0 ? (
                          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                            {t("sal.groupEmpty")}
                          </p>
                        ) : (
                          <div className="grid gap-2">{group.workers.map(renderWorkerCard)}</div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-2">{filteredWorkers.map(renderWorkerCard)}</div>
          )}
        </section>
      )}
    </div>
  );
}
