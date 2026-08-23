"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/materials-api";
import type { PendingDetailLine, PeriodPending } from "@/lib/party-pending";
import { roundMoney } from "@/lib/party-pending";
import { useI18n } from "@/hooks/use-i18n";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type PendingDetailKind = "previous" | "sale" | "paid" | "leftover";

export function parsePendingDetailKind(value: string | null): PendingDetailKind | null {
  if (value === "previous" || value === "sale" || value === "paid" || value === "leftover") {
    return value;
  }
  return null;
}

type PartyRollup = {
  name: string;
  href?: string;
  sale: number;
  paid: number;
  leftover: number;
};

function matchesQuery(line: PendingDetailLine, q: string) {
  if (!q) return true;
  return (
    line.partyName.toLowerCase().includes(q) ||
    line.label.toLowerCase().includes(q) ||
    (line.notes || "").toLowerCase().includes(q) ||
    line.date.includes(q)
  );
}

export function PartyPendingDetailScreen({
  kind,
  snapshot,
  onBack,
}: {
  kind: PendingDetailKind;
  snapshot: PeriodPending;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const title =
    kind === "previous"
      ? t("customerDetail.previousLeftover")
      : kind === "sale"
        ? t("customerDetail.periodSale")
        : kind === "paid"
          ? t("customerDetail.periodPaid")
          : t("customerDetail.periodLeftover");

  const hint =
    kind === "previous"
      ? t("customerDetail.previousLeftoverHint")
      : kind === "sale"
        ? t("customerDetail.periodSaleHint")
        : kind === "paid"
          ? t("customerDetail.periodPaidHint")
          : t("customerDetail.periodLeftoverHint");

  const total =
    kind === "previous"
      ? snapshot.previousRemaining
      : kind === "sale"
        ? snapshot.periodSale
        : kind === "paid"
          ? snapshot.periodPaid
          : snapshot.periodRemaining;

  const lines = useMemo(() => {
    const q = query.trim().toLowerCase();
    const withKind = (line: PendingDetailLine, side: "sale" | "paid" | "previous") => ({
      ...line,
      side,
    });
    if (kind === "sale") {
      return snapshot.saleLines.filter((line) => matchesQuery(line, q)).map((line) => withKind(line, "sale"));
    }
    if (kind === "paid") {
      return snapshot.paidLines.filter((line) => matchesQuery(line, q)).map((line) => withKind(line, "paid"));
    }
    if (kind === "previous") {
      return snapshot.previousLines
        .filter((line) => matchesQuery(line, q))
        .map((line) => withKind(line, "previous"));
    }
    return [
      ...snapshot.saleLines.map((line) => withKind(line, "sale")),
      ...snapshot.paidLines.map((line) => withKind(line, "paid")),
    ]
      .filter((line) => matchesQuery(line, q))
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  }, [kind, snapshot, query]);

  const parties = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, PartyRollup>();
    const add = (partyName: string, href: string | undefined, patch: Partial<PartyRollup>) => {
      const key = partyName || "—";
      const row = map.get(key) || { name: key, href, sale: 0, paid: 0, leftover: 0 };
      if (href) row.href = href;
      if (patch.sale) row.sale = roundMoney(row.sale + patch.sale);
      if (patch.paid) row.paid = roundMoney(row.paid + patch.paid);
      if (patch.leftover) row.leftover = roundMoney(row.leftover + patch.leftover);
      map.set(key, row);
    };
    if (kind === "sale" || kind === "leftover") {
      for (const line of snapshot.saleLines) {
        if (!matchesQuery(line, q)) continue;
        add(line.partyName, line.partyHref, { sale: line.amount });
      }
    }
    if (kind === "paid" || kind === "leftover") {
      for (const line of snapshot.paidLines) {
        if (!matchesQuery(line, q)) continue;
        add(line.partyName, line.partyHref, { paid: line.amount });
      }
    }
    if (kind === "previous") {
      for (const line of snapshot.previousLines) {
        if (!matchesQuery(line, q)) continue;
        add(line.partyName, line.partyHref, { leftover: line.amount });
      }
    }
    return [...map.values()]
      .map((row) => ({
        ...row,
        leftover: kind === "previous" ? row.leftover : roundMoney(row.sale - row.paid),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [kind, snapshot, query]);

  const lineTotal =
    kind === "leftover" ? total : roundMoney(lines.reduce((s, line) => s + line.amount, 0));
  const showPartySalePaid = kind === "leftover";
  const showPartyTable = parties.length > 1 || kind === "leftover";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("common.back")}
        </button>
        <h2 className="text-nameplate text-lg">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {hint} · {formatMoney(total)}
        </p>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("common.search")}
        className="sm:max-w-72"
      />

      {showPartyTable && parties.length > 0 ? (
        <div>
          <p className="mb-2 text-nameplate text-sm">{t("customerDetail.detailByParty")}</p>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.party")}</TableHead>
                  {showPartySalePaid ? (
                    <>
                      <TableHead className="text-right">{t("customerDetail.periodSale")}</TableHead>
                      <TableHead className="text-right">{t("customerDetail.periodPaid")}</TableHead>
                    </>
                  ) : null}
                  <TableHead className="text-right">{t("common.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parties.map((party) => (
                  <TableRow key={party.name}>
                    <TableCell className="font-medium">
                      {party.href ? (
                        <Link href={party.href} className="text-primary hover:underline">
                          {party.name}
                        </Link>
                      ) : (
                        party.name || "—"
                      )}
                    </TableCell>
                    {showPartySalePaid ? (
                      <>
                        <TableCell className="font-data text-right text-sm">
                          {formatMoney(party.sale)}
                        </TableCell>
                        <TableCell className="font-data text-right text-sm">
                          {formatMoney(party.paid)}
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell className="font-data text-right text-sm font-medium">
                      {formatMoney(
                        kind === "sale" ? party.sale : kind === "paid" ? party.paid : party.leftover
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-nameplate text-sm">{t("customerDetail.detailEntries")}</p>
        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("customerDetail.detailEmpty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.date")}</TableHead>
                  <TableHead>{t("common.party")}</TableHead>
                  <TableHead>{t("common.type")}</TableHead>
                  <TableHead>{t("common.notes")}</TableHead>
                  <TableHead className="text-right">{t("common.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={`${line.side}-${line.id}`}>
                    <TableCell className="font-data whitespace-nowrap text-sm">
                      {formatDate(line.date)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {line.partyHref ? (
                        <Link href={line.partyHref} className="text-primary hover:underline">
                          {line.partyName || "—"}
                        </Link>
                      ) : (
                        line.partyName || "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {line.side === "paid"
                        ? t("customerDetail.payment")
                        : line.side === "sale"
                          ? t("customerDetail.periodSale")
                          : t("customerDetail.previousLeftover")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {line.href ? (
                        <Link href={line.href} className="text-primary hover:underline">
                          {line.label}
                        </Link>
                      ) : (
                        line.label
                      )}
                    </TableCell>
                    <TableCell
                      className={
                        line.side === "paid"
                          ? "font-data text-right text-sm font-medium text-emerald-700 dark:text-emerald-400"
                          : "font-data text-right text-sm font-medium"
                      }
                    >
                      {formatMoney(line.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4}>{t("common.total")}</TableCell>
                  <TableCell className="font-data text-right font-semibold">
                    {formatMoney(lineTotal)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
