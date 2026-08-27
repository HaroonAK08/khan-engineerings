"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { parsePendingDetailKind } from "@/components/party/party-pending-detail-screen";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, formatMoney } from "@/lib/materials-api";
import {
  getPartyGroupLedgers,
  type CustomerInstrument,
  type CustomerLedgerEntry,
  type PartyGroup,
} from "@/lib/sales-api";
import { PartyChequePromiseSummary } from "@/components/party/party-cheque-promise-summary";
import { summarizeInstruments } from "@/lib/party-instruments";
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
import { PartyPendingByMonth } from "@/components/party/party-pending-by-month";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import {
  computePeriodPending,
  mergePeriodPending,
  prefixPendingParty,
} from "@/lib/party-pending";

function formatPending(balance: number) {
  const abs = formatMoney(Math.abs(balance));
  if (balance > 0.001) return abs;
  if (balance < -0.001) return `+ ${abs}`;
  return formatMoney(0);
}

function pendingClass(balance: number) {
  if (balance > 0.001) return "text-amber-700 dark:text-amber-400";
  if (balance < -0.001) return "text-emerald-700 dark:text-emerald-400";
  return "text-muted-foreground";
}

export default function PartyGroupDetailPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const id = String(params.id || "");
  const searchParams = useSearchParams();
  const viewingDetail = Boolean(parsePendingDetailKind(searchParams.get("pending")));
  const { dateFrom, dateTo, setDateFrom, setDateTo, hydrated } = usePersistedDateRange();
  const [group, setGroup] = useState<PartyGroup | null>(null);
  const [ledgers, setLedgers] = useState<Record<string, CustomerLedgerEntry[]>>({});
  const [instruments, setInstruments] = useState<Record<string, CustomerInstrument[]>>({});
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!id) return;
      const seq = ++loadSeq.current;
      if (!opts?.silent) setLoading(true);
      try {
        const { group: next, ledgers: nextLedgers, instruments: nextInstruments } =
          await getPartyGroupLedgers(id);
        if (seq !== loadSeq.current) return;
        setGroup(next);
        setLedgers(nextLedgers);
        setInstruments(nextInstruments || {});
      } catch (err) {
        if (seq !== loadSeq.current) return;
        toast.error(apiError(err, t("pgroup.loadFailed")));
        setGroup(null);
        setLedgers({});
        setInstruments({});
      } finally {
        if (seq === loadSeq.current && !opts?.silent) setLoading(false);
      }
    },
    [id, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "visible") void load({ silent: true });
    }
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  const parties = useMemo(() => group?.parties || [], [group]);

  const partySnapshots = useMemo(
    () =>
      parties.map((party) => ({
        party,
        snapshot: prefixPendingParty(
          computePeriodPending(ledgers[party._id] || [], dateFrom, dateTo),
          party.name,
          `/dashboard/party/customers/${party._id}`
        ),
      })),
    [parties, ledgers, dateFrom, dateTo]
  );

  const groupPending = useMemo(
    () => mergePeriodPending(partySnapshots.map((row) => row.snapshot)),
    [partySnapshots]
  );

  const allInstruments = useMemo(
    () => Object.values(instruments).flat(),
    [instruments]
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/party/groups"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("pgroup.backToGroups")}
        </Link>
        <h1 className="text-nameplate text-xl">
          {loading ? t("pgroup.pageTitle") : group?.name || t("pgroup.pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("pgroup.detailSubtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">{t("pgroup.totalLeftover")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("pgroup.pendingDateDesc")}</p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>{t("common.from")}</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                onInput={(e) => setDateFrom((e.target as HTMLInputElement).value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("common.to")}</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                onInput={(e) => setDateTo((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>
          <div className="mt-4 border-t pt-4">
            {loading || !hydrated ? (
              <div className="flex justify-center py-10">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <PartyChequePromiseSummary instruments={allInstruments} />
                </div>
                <PartyPendingByMonth
                  key={`${dateFrom}|${dateTo}`}
                  snapshot={groupPending}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {viewingDetail ? null : (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("pgroup.col.parties")}</CardTitle>
          <CardDescription>
            {group ? t("pgroup.partiesInGroup", { count: parties.length }) : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : !group ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("pgroup.notFound")}</p>
          ) : parties.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("pgroup.noParties")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("cus.col.name")}</TableHead>
                  <TableHead>{t("cus.col.phone")}</TableHead>
                  <TableHead className="text-end">{t("customerDetail.previousLeftover")}</TableHead>
                  <TableHead className="text-end">{t("pgroup.col.periodLeftover")}</TableHead>
                  <TableHead className="text-end">{t("pgroup.col.chequePromise")}</TableHead>
                  <TableHead className="text-end">{t("pgroup.col.pending")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partySnapshots.map(({ party, snapshot }) => {
                  const balance = snapshot.totalRemaining;
                  const chequePending = summarizeInstruments(instruments[party._id] || []);
                  return (
                    <TableRow
                      key={party._id}
                      tabIndex={0}
                      className="cursor-pointer"
                      onClick={() => router.push(`/dashboard/party/customers/${party._id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/dashboard/party/customers/${party._id}`);
                        }
                      }}
                    >
                      <TableCell className="font-medium">{party.name}</TableCell>
                      <TableCell className="font-data text-xs">{party.phone || "—"}</TableCell>
                      <TableCell className={`font-data text-end text-sm ${pendingClass(snapshot.previousRemaining)}`}>
                        {formatPending(snapshot.previousRemaining)}
                      </TableCell>
                      <TableCell className={`font-data text-end text-sm ${pendingClass(snapshot.periodRemaining)}`}>
                        {formatPending(snapshot.periodRemaining)}
                      </TableCell>
                      <TableCell
                        className={`font-data text-end text-sm ${
                          chequePending.dueCount > 0
                            ? "animate-cheque-due font-medium text-amber-700 dark:text-amber-400"
                            : chequePending.pendingTotal > 0.001
                              ? "font-medium text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground"
                        }`}
                      >
                        {formatMoney(chequePending.pendingTotal)}
                      </TableCell>
                      <TableCell className={`font-data text-end text-sm font-medium ${pendingClass(balance)}`}>
                        {formatPending(balance)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
