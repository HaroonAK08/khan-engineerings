"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { parsePendingDetailKind } from "@/components/party/party-pending-detail-screen";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, formatMoney } from "@/lib/materials-api";
import {
  getCustomerLedger,
  getPartyGroup,
  type CustomerLedgerEntry,
  type PartyGroup,
} from "@/lib/sales-api";
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
  const { dateFrom, dateTo, setDateFrom, setDateTo } = usePersistedDateRange();
  const [group, setGroup] = useState<PartyGroup | null>(null);
  const [ledgers, setLedgers] = useState<Record<string, CustomerLedgerEntry[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const next = await getPartyGroup(id);
      setGroup(next);
      const parties = next.parties || [];
      const rows = await Promise.all(
        parties.map(async (party) => {
          try {
            const ledger = await getCustomerLedger(party._id);
            return [party._id, ledger.entries] as const;
          } catch {
            return [party._id, [] as CustomerLedgerEntry[]] as const;
          }
        })
      );
      setLedgers(Object.fromEntries(rows));
    } catch (err) {
      toast.error(apiError(err, t("pgroup.loadFailed")));
      setGroup(null);
      setLedgers({});
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
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
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("common.to")}</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 border-t pt-4">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            ) : (
              <PartyPendingByMonth snapshot={groupPending} dateFrom={dateFrom} dateTo={dateTo} />
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
                  <TableHead className="text-end">{t("pgroup.col.pending")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partySnapshots.map(({ party, snapshot }) => {
                  const balance = party.balance ?? snapshot.totalRemaining;
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
