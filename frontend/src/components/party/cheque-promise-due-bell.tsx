"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/materials-api";
import { listDueCustomerInstruments, type CustomerInstrument } from "@/lib/sales-api";
import { useI18n } from "@/hooks/use-i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function partyIdOf(instrument: CustomerInstrument) {
  if (!instrument.customer) return "";
  return typeof instrument.customer === "string" ? instrument.customer : instrument.customer._id;
}

function partyNameOf(instrument: CustomerInstrument) {
  if (!instrument.customer || typeof instrument.customer === "string") return "—";
  return instrument.customer.name || "—";
}

export function ChequePromiseDueBell() {
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

  const due = items.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={t("dash.chequeDueBell")}
      >
        <span
          className={cn(
            "relative flex size-10 items-center justify-center rounded-full",
            due && "animate-cheque-due text-amber-600 dark:text-amber-300"
          )}
        >
          <Bell className="size-5" />
          {due ? (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-amber-500 font-data text-[10px] font-bold text-amber-950">
              {items.length > 9 ? "9+" : items.length}
            </span>
          ) : null}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 py-2">
            {due
              ? t("dash.chequeDueTitle", { count: items.length })
              : t("dash.chequeDueEmpty")}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {due ? (
            <div className="max-h-80 overflow-y-auto py-1">
              {items.map((item) => {
                const id = partyIdOf(item);
                return (
                  <Link
                    key={item._id}
                    href={id ? `/dashboard/party/customers/${id}` : "/dashboard/party"}
                    className="block px-3 py-2 text-sm hover:bg-muted"
                  >
                    <p className="font-medium">{partyNameOf(item)}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.kind === "cheque"
                        ? t("customerDetail.kindCheque")
                        : t("customerDetail.kindPromise")}
                      {" · "}
                      {formatDate(item.dueDate)}
                      {" · "}
                      {formatMoney(item.amount)}
                    </p>
                  </Link>
                );
              })}
              <p className="px-3 py-2 text-xs text-muted-foreground">{t("dash.chequeDueHint")}</p>
            </div>
          ) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">{t("dash.chequeDueHint")}</p>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
