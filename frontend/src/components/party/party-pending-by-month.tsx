"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/materials-api";
import { formatMonthLabel, roundMoney, type PendingCharge, type PeriodPending } from "@/lib/party-pending";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  PartyPendingDetailScreen,
  parsePendingDetailKind,
  type PendingDetailKind,
} from "@/components/party/party-pending-detail-screen";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function PartyPendingByMonth({
  snapshot,
  dateFrom,
  dateTo,
}: {
  snapshot: PeriodPending;
  dateFrom: string;
  dateTo: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [openParties, setOpenParties] = useState<Set<string>>(new Set());
  const detailKind = parsePendingDetailKind(searchParams.get("pending"));

  function openDetail(kind: PendingDetailKind) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("pending", kind);
    router.push(`${pathname}?${next.toString()}`);
  }

  function closeDetail() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("pending");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const leftoverMonths = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.months.filter((m) => {
      if (!q) return true;
      const label = formatMonthLabel(m.month, locale).toLowerCase();
      return m.month.includes(q) || label.includes(q);
    });
  }, [snapshot.months, query, locale]);

  const filteredLeftoverLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.leftoverLines.filter((line) => {
      if (!q) return true;
      const month = formatMonthLabel(line.month, locale).toLowerCase();
      return (
        line.month.includes(q) ||
        month.includes(q) ||
        line.label.toLowerCase().includes(q) ||
        line.date.includes(q) ||
        (line.partyName || "").toLowerCase().includes(q)
      );
    });
  }, [snapshot.leftoverLines, query, locale]);

  const partyGroups = useMemo(() => {
    if (!filteredLeftoverLines.some((line) => line.partyName)) return null;
    const map = new Map<
      string,
      { name: string; href?: string; lines: PendingCharge[]; total: number }
    >();
    for (const line of filteredLeftoverLines) {
      const name = line.partyName || "—";
      const row = map.get(name) || { name, href: line.partyHref, lines: [], total: 0 };
      row.lines.push(line);
      row.total = roundMoney(row.total + line.remaining);
      if (!row.href && line.partyHref) row.href = line.partyHref;
      map.set(name, row);
    }
    return [...map.values()].sort(
      (a, b) => b.total - a.total || a.name.localeCompare(b.name)
    );
  }, [filteredLeftoverLines]);

  function lineDetailLabel(line: PendingCharge) {
    const prefix = line.partyName ? `${line.partyName} · ` : "";
    return prefix && line.label.startsWith(prefix) ? line.label.slice(prefix.length) : line.label;
  }

  function toggleParty(name: string) {
    setOpenParties((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const leftoverTotal = leftoverMonths.reduce((s, m) => s + m.remaining, 0);
  const saleTotal = leftoverMonths.reduce((s, m) => s + m.sale, 0);
  const paidTotal = leftoverMonths.reduce((s, m) => s + m.paid, 0);
  const hasRange = Boolean(dateFrom || dateTo);
  const stats: Array<{
    key: PendingDetailKind;
    label: string;
    value: number;
    hint: string;
  }> = [
    {
      key: "previous",
      label: t("customerDetail.previousLeftover"),
      value: snapshot.previousRemaining,
      hint: t("customerDetail.previousLeftoverHint"),
    },
    {
      key: "sale",
      label: t("customerDetail.periodSale"),
      value: snapshot.periodSale,
      hint: t("customerDetail.periodSaleHint"),
    },
    {
      key: "paid",
      label: t("customerDetail.periodPaid"),
      value: snapshot.periodPaid,
      hint: t("customerDetail.periodPaidHint"),
    },
    {
      key: "leftover",
      label: t("customerDetail.periodLeftover"),
      value: snapshot.periodRemaining,
      hint: t("customerDetail.periodLeftoverHint"),
    },
  ];

  if (detailKind) {
    return (
      <PartyPendingDetailScreen kind={detailKind} snapshot={snapshot} onBack={closeDetail} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {hasRange ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => openDetail(s.key)}
              className="cursor-pointer rounded-lg border bg-muted/30 px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="font-data text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                {s.label}
              </p>
              <p
                className={cn(
                  "font-data mt-1 text-lg font-semibold",
                  s.key === "paid" && s.value > 0.001 && "text-emerald-700 dark:text-emerald-400",
                  (s.key === "previous" || s.key === "leftover") &&
                    s.value > 0.001 &&
                    "text-amber-700 dark:text-amber-400",
                  (s.key === "previous" || s.key === "leftover") &&
                    s.value < -0.001 &&
                    "text-emerald-700 dark:text-emerald-400"
                )}
              >
                {formatMoney(s.value)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
            </button>
          ))}
        </div>
      ) : null}

      <div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-nameplate text-sm">{t("customerDetail.pendingByMonth")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("customerDetail.pendingByMonthDesc")}
            </p>
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("customerDetail.pendingMonthSearch")}
            className="sm:max-w-56"
          />
        </div>

        {leftoverMonths.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("customerDetail.noMonthPending")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("customerDetail.colMonth")}</TableHead>
                  <TableHead className="text-right">{t("customerDetail.periodSale")}</TableHead>
                  <TableHead className="text-right">{t("customerDetail.periodPaid")}</TableHead>
                  <TableHead className="text-right">{t("customerDetail.periodLeftover")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leftoverMonths.map((m) => {
                  const inView =
                    (!dateFrom || `${m.month}-31` >= dateFrom) &&
                    (!dateTo || `${m.month}-01` <= dateTo);
                  return (
                    <TableRow key={m.month} className={inView ? "bg-primary/5" : undefined}>
                      <TableCell className="font-medium">
                        {formatMonthLabel(m.month, locale)}
                      </TableCell>
                      <TableCell className="font-data text-right text-sm">
                        {formatMoney(m.sale)}
                      </TableCell>
                      <TableCell className="font-data text-right text-sm">
                        {formatMoney(m.paid)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-data text-right text-sm font-semibold",
                          m.remaining > 0.001 && "text-amber-700 dark:text-amber-400",
                          m.remaining < -0.001 && "text-emerald-700 dark:text-emerald-400"
                        )}
                      >
                        {formatMoney(m.remaining)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>{t("common.total")}</TableCell>
                  <TableCell className="font-data text-right font-semibold">
                    {formatMoney(saleTotal)}
                  </TableCell>
                  <TableCell className="font-data text-right font-semibold">
                    {formatMoney(paidTotal)}
                  </TableCell>
                  <TableCell className="font-data text-right font-semibold">
                    {formatMoney(leftoverTotal)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </div>

      {filteredLeftoverLines.length > 0 ? (
        <div>
          <p className="mb-2 text-nameplate text-sm">{t("customerDetail.pendingLines")}</p>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.notes")}</TableHead>
                  <TableHead className="text-right">{t("customerDetail.periodLeftover")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partyGroups
                  ? partyGroups.map((party) => {
                      const open = openParties.has(party.name);
                      return (
                        <Fragment key={party.name}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => toggleParty(party.name)}
                          >
                            <TableCell className="font-data text-sm">
                              {formatDate(party.lines[0]?.date || "")}
                            </TableCell>
                            <TableCell className="text-sm">
                              <span className="inline-flex items-center gap-2 font-medium">
                                <ChevronRight
                                  className={cn(
                                    "size-4 shrink-0 text-muted-foreground transition-transform",
                                    open && "rotate-90"
                                  )}
                                />
                                {party.name}
                                <span className="font-data text-xs font-normal text-muted-foreground">
                                  {party.lines.length}
                                </span>
                              </span>
                            </TableCell>
                            <TableCell className="font-data text-right text-sm font-semibold">
                              {formatMoney(party.total)}
                            </TableCell>
                          </TableRow>
                          {open
                            ? party.lines.map((line) => (
                                <TableRow key={line.id} className="bg-muted/30">
                                  <TableCell className="font-data ps-8 text-sm">
                                    {formatDate(line.date)}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {line.href ? (
                                      <Link href={line.href} className="text-primary hover:underline">
                                        {lineDetailLabel(line)}
                                      </Link>
                                    ) : (
                                      lineDetailLabel(line)
                                    )}
                                  </TableCell>
                                  <TableCell className="font-data text-right text-sm font-medium">
                                    {formatMoney(line.remaining)}
                                  </TableCell>
                                </TableRow>
                              ))
                            : null}
                        </Fragment>
                      );
                    })
                  : filteredLeftoverLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-data text-sm">{formatDate(line.date)}</TableCell>
                        <TableCell className="text-sm">
                          {line.href ? (
                            <Link href={line.href} className="text-primary hover:underline">
                              {line.label}
                            </Link>
                          ) : (
                            line.label
                          )}
                        </TableCell>
                        <TableCell className="font-data text-right text-sm font-medium">
                          {formatMoney(line.remaining)}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
