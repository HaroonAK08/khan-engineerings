"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { apiError, formatDate, formatMoney } from "@/lib/materials-api";
import {
  createWorker,
  deactivateWorker,
  listSalaryPayments,
  listWorkers,
  payWorker,
  updateWorker,
  type Worker,
} from "@/lib/workers-api";
import type { BatchExpense } from "@/types/production";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

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

export default function SalariesPage() {
  const { t, isUrdu } = useI18n();
  const router = useRouter();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [payments, setPayments] = useState<BatchExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayInput());
  const [payNote, setPayNote] = useState("");

  const [search, setSearch] = useState("");
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNameUr, setNewNameUr] = useState("");
  const [newJob, setNewJob] = useState("");
  const [newUnitLabel, setNewUnitLabel] = useState("hub");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNameUr, setEditNameUr] = useState("");
  const [editJob, setEditJob] = useState("");
  const [editUnitLabel, setEditUnitLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, p] = await Promise.all([
        listWorkers({ active: "true" }),
        listSalaryPayments(),
      ]);
      setWorkers(w);
      setPayments(p);
    } catch (err) {
      toast.error(apiError(err, "Failed to load salaries"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 150);
    return () => clearTimeout(t);
  }, [load]);

  const periodTotal = useMemo(
    () => payments.reduce((s, e) => s + e.amount, 0),
    [payments]
  );

  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.nameUr && w.nameUr.toLowerCase().includes(q)) ||
        (w.job && w.job.toLowerCase().includes(q))
    );
  }, [workers, search]);

  function openPay(w: Worker) {
    setEditingId(null);
    setPayingId(w._id);
    setPayAmount("");
    setPayDate(todayInput());
    setPayNote("");
  }

  function openEdit(w: Worker) {
    setPayingId(null);
    setEditingId(w._id);
    setEditName(w.name);
    setEditNameUr(w.nameUr || "");
    setEditJob(w.job || "");
    setEditUnitLabel(w.unitLabel || "piece");
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
      });
      toast.success("Worker added");
      setNewName("");
      setNewNameUr("");
      setNewJob("");
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
          <Link
            href="/dashboard/expenses/salaries/calendar"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-amber-300 shadow-md transition-colors hover:bg-slate-800 hover:text-amber-200 dark:border-slate-600 dark:bg-slate-950 dark:text-amber-300 dark:hover:bg-slate-900"
          >
            <CalendarDays className="size-4 text-amber-400" />
            {t("sal.openCalendar")}
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="py-0">
          <CardContent className="p-4">
            <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {t("sal.activeWorkers")}
            </p>
            <p className="font-data mt-1 text-xl">{workers.length}</p>
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
              {/* <p className="mt-1 text-sm text-muted-foreground">{t("sal.workersDesc")}</p> */}
            </div>
            <Button
              type="button"
              variant={showAddWorker ? "outline" : "default"}
              onClick={() => setShowAddWorker((v) => !v)}
            >
              <Plus className="size-4" />
              {showAddWorker ? t("sal.cancel") : t("sal.addWorker")}
            </Button>
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
                  <Input
                    placeholder={t("sal.phNameUr")}
                    value={newNameUr}
                    onChange={(e) => setNewNameUr(e.target.value)}
                    dir="rtl"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("sal.job")}</Label>
                  <Input
                    placeholder={t("sal.phJob")}
                    value={newJob}
                    onChange={(e) => setNewJob(e.target.value)}
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
          ) : (
            <div className="grid gap-2">
              {filteredWorkers.map((w) => {
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
                          <p
                            className="truncate text-base font-medium tracking-tight"
                            dir={isUrdu && w.nameUr?.trim() ? "rtl" : undefined}
                          >
                            {displayWorkerName(w, isUrdu)}
                          </p>
                          {w.job ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {displayJob(w.job, t)}
                            </p>
                          ) : null}
                        </div>
                        <div
                          className="flex flex-wrap gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!isPaying && !isEditing && (
                            <Button type="button" size="sm" onClick={() => openPay(w)}>
                              {t("sal.payNow")}
                            </Button>
                          )}
                          {!isEditing && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(w)}
                            >
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
                              <Input
                                placeholder={t("sal.phNameUr")}
                                value={editNameUr}
                                onChange={(e) => setEditNameUr(e.target.value)}
                                dir="rtl"
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <Label>{t("sal.job")}</Label>
                              <Input
                                placeholder={t("sal.phJob")}
                                value={editJob}
                                onChange={(e) => setEditJob(e.target.value)}
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
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              className="gap-2"
                              disabled={busyId === `edit-${w._id}`}
                              onClick={() => void onSaveEdit(w)}
                            >
                              {busyId === `edit-${w._id}` && (
                                <Loader2 className="size-4 animate-spin" />
                              )}
                              {t("sal.saveChanges")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                            >
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
                              <Input
                                value={payNote}
                                onChange={(e) => setPayNote(e.target.value)}
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
                            <Button
                              type="button"
                              size="lg"
                              variant="outline"
                              onClick={() => setPayingId(null)}
                            >
                              {t("sal.cancel")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
