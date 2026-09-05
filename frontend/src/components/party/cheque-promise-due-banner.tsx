"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, formatMoney } from "@/lib/materials-api";
import { listDueCustomerInstruments, type CustomerInstrument } from "@/lib/sales-api";
import { useI18n } from "@/hooks/use-i18n";

const DISMISS_KEY = "ke-cheque-due-banner-dismissed";

function partyIdOf(instrument: CustomerInstrument) {
  if (!instrument.customer) return "";
  return typeof instrument.customer === "string" ? instrument.customer : instrument.customer._id;
}

function partyNameOf(instrument: CustomerInstrument) {
  if (!instrument.customer || typeof instrument.customer === "string") return "—";
  return instrument.customer.name || "—";
}

function partyHref(id: string) {
  return `/dashboard/party/customers/${id}#party-history`;
}

function isDismissedThisSession() {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissForSession() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore
  }
}

export function ChequePromiseDueBanner() {
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<CustomerInstrument[]>([]);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(isDismissedThisSession());
    let active = true;
    listDueCustomerInstruments()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);

  function goToParty(id: string) {
    dismissForSession();
    setDismissed(true);
    router.push(partyHref(id));
  }

  function onBannerActivate() {
    const first = items.find((item) => partyIdOf(item));
    const id = first ? partyIdOf(first) : "";
    if (!id) {
      dismissForSession();
      setDismissed(true);
      return;
    }
    goToParty(id);
  }

  if (dismissed || items.length === 0) return null;

  const total = items.reduce((s, i) => s + (i.amount || 0), 0);

  return (
    <div
      role="button"
      tabIndex={0}
      className="animate-cheque-due mb-4 cursor-pointer rounded-lg border border-amber-400/70 bg-amber-50 px-4 py-3 text-left dark:bg-amber-950/40"
      onClick={onBannerActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onBannerActivate();
        }
      }}
    >
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
        {t("dash.chequeDueTitle", { count: items.length })}
      </p>
      <p className="mt-1 text-sm text-amber-800/80 dark:text-amber-200/80">
        {t("dash.chequeDueHint")} · {formatMoney(total)}
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {items.slice(0, 8).map((item) => {
          const id = partyIdOf(item);
          return (
            <li key={item._id}>
              {id ? (
                <Link
                  href={partyHref(id)}
                  className="font-medium text-amber-900 underline-offset-2 hover:underline dark:text-amber-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissForSession();
                    setDismissed(true);
                  }}
                >
                  {partyNameOf(item)}
                </Link>
              ) : (
                <span>{partyNameOf(item)}</span>
              )}
              {" · "}
              {item.kind === "cheque" ? t("customerDetail.kindCheque") : t("customerDetail.kindPromise")}
              {" · "}
              {formatDate(item.dueDate)}
              {" · "}
              {formatMoney(item.amount)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
