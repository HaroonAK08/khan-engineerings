"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/materials-api";
import { listDueCustomerInstruments, type CustomerInstrument } from "@/lib/sales-api";
import { useI18n } from "@/hooks/use-i18n";

function partyIdOf(instrument: CustomerInstrument) {
  if (!instrument.customer) return "";
  return typeof instrument.customer === "string" ? instrument.customer : instrument.customer._id;
}

function partyNameOf(instrument: CustomerInstrument) {
  if (!instrument.customer || typeof instrument.customer === "string") return "—";
  return instrument.customer.name || "—";
}

export function ChequePromiseDueBanner() {
  const { t } = useI18n();
  const [items, setItems] = useState<CustomerInstrument[]>([]);

  useEffect(() => {
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

  if (items.length === 0) return null;

  const total = items.reduce((s, i) => s + (i.amount || 0), 0);

  return (
    <div className="animate-cheque-due mb-4 rounded-lg border border-amber-400/70 bg-amber-50 px-4 py-3 dark:bg-amber-950/40">
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
                  href={`/dashboard/party/customers/${id}`}
                  className="font-medium text-amber-900 underline-offset-2 hover:underline dark:text-amber-200"
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
