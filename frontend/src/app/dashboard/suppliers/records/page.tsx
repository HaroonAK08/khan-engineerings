"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SupplierHistoryCalendar } from "@/components/suppliers/supplier-history-calendar";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, getAllSupplierLedger } from "@/lib/materials-api";
import type { LedgerEntry } from "@/types/materials";

export default function AllSuppliersRecordsPage() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setEntries(await getAllSupplierLedger());
    } catch (err) {
      toast.error(apiError(err, t("supplierDetail.loadFailed")));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/suppliers"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          {t("supplierDetail.backToSuppliers")}
        </Link>
        <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          {t("sup.allRecordsEyebrow")}
        </p>
        <h1 className="text-nameplate text-xl">{t("sup.allRecords")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("sup.allRecordsDesc")}</p>
      </div>

      <SupplierHistoryCalendar
        entries={entries}
        showSupplierNames
        onChanged={() => load(true)}
      />
    </div>
  );
}
