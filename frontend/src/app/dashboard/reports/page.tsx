"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileText, Loader2, Settings2 } from "lucide-react";
import { apiError, formatDate, formatMoney, listSuppliers } from "@/lib/materials-api";
import {
  listBuilties,
  listCustomers,
  listPartyGroups,
  paymentStatusLabel,
  type BuiltyRow,
  type PartyGroup,
} from "@/lib/sales-api";
import {
  COMBINED_REPORT_MODULES,
  downloadCustomReport,
  downloadFullReport,
  downloadHandout,
  getCombinedReportPreview,
  getHandoutPreview,
  type CombinedReportPreview,
  type ExportKind,
  type HandoutAudience,
} from "@/lib/reports-api";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/hooks/use-i18n";
import { usePersistedDateRange } from "@/hooks/use-persisted-date-range";
import { cn } from "@/lib/utils";
import { ReportsSubnav } from "@/components/layout/reports-subnav";

type ReportMode = "full" | "custom";
type Audience = "company" | HandoutAudience;

export default function ReportsHubPage() {
  const { t } = useI18n();
  const { dateFrom, dateTo, hydrated } = usePersistedDateRange();

  const [mode, setMode] = useState<ReportMode>("full");
  const [audience, setAudience] = useState<Audience>("party");
  const [partyId, setPartyId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [builtyId, setBuiltyId] = useState("");
  const [partyQuery, setPartyQuery] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [builtyQuery, setBuiltyQuery] = useState("");
  const [partyBuilties, setPartyBuilties] = useState<BuiltyRow[]>([]);
  const [loadingPartyBuilties, setLoadingPartyBuilties] = useState(false);
  const [customers, setCustomers] = useState<Array<{ _id: string; name: string }>>([]);
  const [groups, setGroups] = useState<PartyGroup[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ _id: string; name: string }>>([]);
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [summaryOnly, setSummaryOnly] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [customModules, setCustomModules] = useState<ExportKind[]>(
    COMBINED_REPORT_MODULES.map((m) => m.id)
  );
  const [preview, setPreview] = useState<CombinedReportPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const previewModules = mode === "full" ? COMBINED_REPORT_MODULES.map((m) => m.id) : customModules;
  const handout = mode === "custom" && audience !== "company";
  const handoutId =
    audience === "party"
      ? partyId
      : audience === "group"
        ? groupId
        : audience === "supplier"
          ? supplierId
          : audience === "builty"
            ? builtyId
            : "";

  const loadPreview = useCallback(async () => {
    if (!hydrated) return;
    if (handout) {
      if (!handoutId) {
        setPreview(null);
        return;
      }
      setLoadingPreview(true);
      try {
        setPreview(
          await getHandoutPreview({
            audience: audience as HandoutAudience,
            id: handoutId,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
          })
        );
      } catch (err) {
        setPreview(null);
        toast.error(apiError(err, "Failed to load report preview"));
      } finally {
        setLoadingPreview(false);
      }
      return;
    }
    if (mode === "custom" && customModules.length === 0) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    try {
      const report = await getCombinedReportPreview({
        modules: mode === "full" ? undefined : customModules,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        summaryOnly,
      });
      setPreview(report);
    } catch (err) {
      setPreview(null);
      toast.error(apiError(err, "Failed to load report preview"));
    } finally {
      setLoadingPreview(false);
    }
  }, [mode, customModules, dateFrom, dateTo, hydrated, summaryOnly, handout, handoutId, audience]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPreview();
    }, 350);
    return () => clearTimeout(timer);
  }, [loadPreview]);

  useEffect(() => {
    void (async () => {
      try {
        const [partyRows, groupRows, supplierRows] = await Promise.all([
          listCustomers({ active: "true" }),
          listPartyGroups({ active: "true" }),
          listSuppliers(),
        ]);
        setCustomers(partyRows.map((row) => ({ _id: row._id, name: row.name })));
        setGroups(groupRows);
        setSuppliers(supplierRows.map((row) => ({ _id: row._id, name: row.name })));
      } catch (err) {
        toast.error(apiError(err, t("statements.loadPartiesFailed")));
      }
    })();
  }, [t]);

  useEffect(() => {
    if (audience !== "builty" || !partyId) {
      setPartyBuilties([]);
      setLoadingPartyBuilties(false);
      return;
    }
    let cancelled = false;
    setBuiltyId("");
    setBuiltyQuery("");
    setLoadingPartyBuilties(true);
    void listBuilties({ customer: partyId })
      .then((rows) => {
        if (!cancelled) setPartyBuilties(rows);
      })
      .catch(() => {
        if (!cancelled) setPartyBuilties([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPartyBuilties(false);
      });
    return () => {
      cancelled = true;
    };
  }, [audience, partyId]);

  const filteredPartyBuilties = useMemo(() => {
    const q = builtyQuery.trim().toLowerCase();
    if (!q) return partyBuilties;
    return partyBuilties.filter((row) => row.builtyNo.toLowerCase().includes(q));
  }, [partyBuilties, builtyQuery]);

  const filteredCustomers = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((row) => row.name.toLowerCase().includes(q));
  }, [customers, partyQuery]);
  const filteredGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((row) => row.name.toLowerCase().includes(q));
  }, [groups, groupQuery]);
  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((row) => row.name.toLowerCase().includes(q));
  }, [suppliers, supplierQuery]);

  const partyItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const row of filteredCustomers) items[row._id] = row.name;
    if (partyId && customers.find((row) => row._id === partyId)) {
      const selected = customers.find((row) => row._id === partyId)!;
      items[selected._id] = selected.name;
    }
    return items;
  }, [filteredCustomers, customers, partyId]);
  const groupItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const row of filteredGroups) items[row._id] = row.name;
    if (groupId && groups.find((row) => row._id === groupId)) {
      const selected = groups.find((row) => row._id === groupId)!;
      items[selected._id] = selected.name;
    }
    return items;
  }, [filteredGroups, groups, groupId]);
  const supplierItems = useMemo(() => {
    const items: Record<string, string> = {};
    for (const row of filteredSuppliers) items[row._id] = row.name;
    if (supplierId && suppliers.find((row) => row._id === supplierId)) {
      const selected = suppliers.find((row) => row._id === supplierId)!;
      items[selected._id] = selected.name;
    }
    return items;
  }, [filteredSuppliers, suppliers, supplierId]);

  function openCustom(next: Audience = "party") {
    setMode("custom");
    setAudience(next);
    setFormat("pdf");
  }

  function toggleModule(id: ExportKind) {
    setCustomModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  async function onDownload() {
    if (handout && !handoutId) {
      toast.error(t("handout.needSelection"));
      return;
    }
    if (mode === "custom" && !handout && customModules.length === 0) {
      toast.error("Select at least one module");
      return;
    }

    const handoutName =
      audience === "party"
        ? customers.find((row) => row._id === partyId)?.name || "party"
        : audience === "group"
          ? groups.find((row) => row._id === groupId)?.name || "group"
          : audience === "supplier"
            ? suppliers.find((row) => row._id === supplierId)?.name || "supplier"
            : partyBuilties.find((row) => row._id === builtyId)?.builtyNo || "builty";

    setExporting(true);
    try {
      if (handout) {
        await downloadHandout({
          audience: audience as HandoutAudience,
          id: handoutId,
          format,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          filename: handoutName,
        });
        toast.success(t("handout.download"));
      } else if (mode === "full") {
        await downloadFullReport({
          format,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          summaryOnly,
        });
        toast.success(summaryOnly ? "Totals report downloaded" : "Full report downloaded");
      } else {
        await downloadCustomReport({
          format,
          modules: customModules,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          summaryOnly,
        });
        toast.success(summaryOnly ? "Totals report downloaded" : "Custom report downloaded");
      }
    } catch (err) {
      toast.error(
        apiError(
          err,
          handout
            ? "Failed to download statement"
            : mode === "full"
              ? "Failed to download full report"
              : "Failed to download custom report"
        )
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <ReportsSubnav />
      <div>
        <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
          {t("rep.eyebrow")}
        </p>
        <h1 className="text-nameplate text-xl">Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Full report is for the company. Custom report is how you make a PDF for a party,
          group, supplier, or one builty to send them.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("full")}
          className={cn(
            "rounded-xl border p-4 text-left transition-colors",
            mode === "full"
              ? "border-primary bg-primary/10 ring-2 ring-primary/30"
              : "border-border hover:bg-muted/40"
          )}
        >
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300">
            <FileText className="size-5" />
          </div>
          <p className="text-nameplate text-sm">Full report</p>
        </button>

        <button
          type="button"
          onClick={() => openCustom("party")}
          className={cn(
            "rounded-xl border p-4 text-left transition-colors",
            mode === "custom"
              ? "border-primary bg-primary/10 ring-2 ring-primary/30"
              : "border-border hover:bg-muted/40"
          )}
        >
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300">
            <Settings2 className="size-5" />
          </div>
          <p className="text-nameplate text-sm">{t("handout.customTitle")}</p>
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">
            {mode === "full" ? "Full report" : t("handout.customTitle")}
          </CardTitle>
          <CardDescription>
            {mode === "full"
              ? "Includes every main report section for the selected date range. Choose full detail or totals / conclusion only."
              : handout
                ? t(
                    audience === "party"
                      ? "handout.partyHint"
                      : audience === "group"
                        ? "handout.groupHint"
                        : audience === "supplier"
                          ? "handout.supplierHint"
                          : "handout.builtyHint"
                  )
                : t("handout.companyHint")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {mode === "custom" ? (
            <div className="flex flex-col gap-4">
              <div>
                <Label className="mb-2 block">{t("handout.who")}</Label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      ["party", "handout.party", "handout.partyHint"],
                      ["group", "handout.group", "handout.groupHint"],
                      ["supplier", "handout.supplier", "handout.supplierHint"],
                      ["builty", "handout.builty", "handout.builtyHint"],
                    ] as const
                  ).map(([id, label, hint]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setAudience(id);
                        setFormat("pdf");
                      }}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        audience === id
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : "border-border hover:bg-muted/40"
                      )}
                    >
                      <p className="text-sm font-semibold">{t(label)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t(hint)}</p>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setAudience("company")}
                  className={cn(
                    "mt-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    audience === "company"
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-border text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  {t("handout.company")}
                </button>
              </div>

              {audience === "party" ? (
                <div className="flex flex-col gap-2">
                  <Input
                    value={partyQuery}
                    placeholder={t("handout.searchParty")}
                    onChange={(event) => setPartyQuery(event.target.value)}
                  />
                  <Select
                    value={partyId || null}
                    onValueChange={(value) => setPartyId(value || "")}
                    items={partyItems}
                  >
                    <SelectTrigger className="w-full max-w-md">
                      <SelectValue placeholder={t("handout.selectParty")} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCustomers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          {t("handout.noMatch")}
                        </div>
                      ) : (
                        filteredCustomers.map((row) => (
                          <SelectItem key={row._id} value={row._id}>
                            {row.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {audience === "group" ? (
                <div className="flex flex-col gap-2">
                  <Input
                    value={groupQuery}
                    placeholder={t("handout.searchGroup")}
                    onChange={(event) => setGroupQuery(event.target.value)}
                  />
                  <Select
                    value={groupId || null}
                    onValueChange={(value) => setGroupId(value || "")}
                    items={groupItems}
                  >
                    <SelectTrigger className="w-full max-w-md">
                      <SelectValue placeholder={t("handout.selectGroup")} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredGroups.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          {t("handout.noMatch")}
                        </div>
                      ) : (
                        filteredGroups.map((row) => (
                          <SelectItem key={row._id} value={row._id}>
                            {row.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {audience === "supplier" ? (
                <div className="flex flex-col gap-2">
                  <Input
                    value={supplierQuery}
                    placeholder={t("handout.searchSupplier")}
                    onChange={(event) => setSupplierQuery(event.target.value)}
                  />
                  <Select
                    value={supplierId || null}
                    onValueChange={(value) => setSupplierId(value || "")}
                    items={supplierItems}
                  >
                    <SelectTrigger className="w-full max-w-md">
                      <SelectValue placeholder={t("handout.selectSupplier")} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSuppliers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          {t("handout.noMatch")}
                        </div>
                      ) : (
                        filteredSuppliers.map((row) => (
                          <SelectItem key={row._id} value={row._id}>
                            {row.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {audience === "builty" ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">{t("handout.pickPartyFirst")}</p>
                  <div className="flex flex-col gap-2">
                    <Input
                      value={partyQuery}
                      placeholder={t("handout.searchParty")}
                      onChange={(event) => setPartyQuery(event.target.value)}
                    />
                    <Select
                      value={partyId || null}
                      onValueChange={(value) => setPartyId(value || "")}
                      items={partyItems}
                    >
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue placeholder={t("handout.selectParty")} />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredCustomers.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            {t("handout.noMatch")}
                          </div>
                        ) : (
                          filteredCustomers.map((row) => (
                            <SelectItem key={row._id} value={row._id}>
                              {row.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {!partyId ? null : loadingPartyBuilties ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : partyBuilties.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("handout.noBuilty")}</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Label>{t("handout.partyBuilties")}</Label>
                      <Input
                        value={builtyQuery}
                        placeholder={t("handout.searchBuilty")}
                        onChange={(event) => setBuiltyQuery(event.target.value)}
                      />
                      {filteredPartyBuilties.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("handout.noBuiltyFilter")}</p>
                      ) : (
                        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                          {filteredPartyBuilties.map((row) => {
                            const active = builtyId === row._id;
                            return (
                              <button
                                key={row._id}
                                type="button"
                                onClick={() => setBuiltyId(row._id)}
                                className={cn(
                                  "rounded-lg border px-3 py-2 text-left text-sm",
                                  active
                                    ? "border-primary bg-primary/10 font-medium"
                                    : "border-border hover:bg-muted/40"
                                )}
                              >
                                <span className="font-medium">{row.builtyNo}</span>
                                <span className="text-muted-foreground">
                                  {` · ${formatDate(row.builtyDate)} · ${formatMoney(row.totalAmount)} · ${paymentStatusLabel(row.paymentStatus, t)}`}
                                </span>
                                {row.balance > 0 ? (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {`${t("handout.remaining")} ${formatMoney(row.balance)}`}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {audience === "builty" && handout ? null : <DateRangeFilter />}

          {handout ? null : (
          <div>
            <Label className="mb-2 block">Report content</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSummaryOnly(false)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition-colors",
                  !summaryOnly
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border hover:bg-muted/40"
                )}
              >
                <p className="text-sm font-medium">Full detail</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  All rows for each selected module.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSummaryOnly(true)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition-colors",
                  summaryOnly
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border hover:bg-muted/40"
                )}
              >
                <p className="text-sm font-medium">Totals only</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Conclusion of selected modules — totals like sales, spend, receivable.
                </p>
              </button>
            </div>
          </div>
          )}

          {handout ? null : mode === "full" ? (
            <div>
              <Label className="mb-2 block">Included modules</Label>
              <div className="flex flex-wrap gap-2">
                {COMBINED_REPORT_MODULES.map((m) => (
                  <span
                    key={m.id}
                    className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium"
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <Label className="mb-2 block">Modules</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {COMBINED_REPORT_MODULES.map((m) => {
                  const active = customModules.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        active
                          ? "border-primary bg-primary/10 font-medium"
                          : "border-border text-muted-foreground hover:bg-muted/50"
                      )}
                      onClick={() => toggleModule(m.id)}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCustomModules(COMBINED_REPORT_MODULES.map((m) => m.id))}
                >
                  Select all
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCustomModules([])}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          {handout ? (
            <p className="text-sm text-muted-foreground">
              PDF is ready to send. Excel is also available if you need the numbers in a sheet.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {(["pdf", "xlsx"] as const).map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={format === f ? "default" : "outline"}
                onClick={() => setFormat(f)}
              >
                {f.toUpperCase()}
              </Button>
            ))}
          </div>

          <Button
            type="button"
            className="w-fit gap-2"
            disabled={exporting || (handout ? !handoutId : mode === "custom" && customModules.length === 0)}
            onClick={() => void onDownload()}
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            {handout
              ? t("handout.download")
              : summaryOnly
                ? "Download totals report"
                : mode === "full"
                  ? "Download full report"
                  : "Download custom report"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">
            {preview?.title || (mode === "full" ? "Full report preview" : "Custom report preview")}
          </CardTitle>
          <CardDescription>
            Same data that will be downloaded
            {preview?.period ? ` · ${preview.period}` : ""}
            {handout
              ? ""
              : summaryOnly
                ? " · totals / conclusion only"
                : previewModules.length
                  ? ` · ${previewModules.length} sections`
                  : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {loadingPreview ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : !preview || preview.sections.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {handout && !handoutId
                ? t("handout.needSelection")
                : mode === "custom" && !handout && customModules.length === 0
                  ? "Select at least one module to preview."
                  : "No report data for this period."}
            </p>
          ) : (
            preview.sections.map((section) => (
              <div key={section.id} className="flex flex-col gap-3">
                <h3 className="text-nameplate text-sm">{section.heading || section.title}</h3>
                {Object.keys(section.meta || {}).length > 0 && (
                  <div className="overflow-hidden rounded-lg border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(section.meta).map(([k, v]) => (
                          <TableRow key={`${section.id}-meta-${k}`}>
                            <TableCell className="text-sm">{k}</TableCell>
                            <TableCell className="font-data text-right text-xs">
                              {v == null || v === "" ? "—" : String(v)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {section.subsections && section.subsections.length > 0 ? (
                  section.subsections.map((sub) => (
                    <div key={`${section.id}-${sub.heading}`} className="flex flex-col gap-2">
                      <h4 className="text-sm font-medium">{sub.heading}</h4>
                      {sub.rows.length === 0 ? (
                        <p className="rounded-lg border border-border/60 px-3 py-4 text-sm text-muted-foreground">
                          No rows in this section.
                        </p>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-border/60">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {sub.columns.map((col) => (
                                  <TableHead key={col}>{col}</TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sub.rows.map((row, rowIndex) => (
                                <TableRow key={`${section.id}-${sub.heading}-${rowIndex}`}>
                                  {row.map((cell, cellIndex) => (
                                    <TableCell
                                      key={`${section.id}-${sub.heading}-${rowIndex}-${cellIndex}`}
                                      className="font-data text-xs"
                                    >
                                      {cell == null || cell === "" ? "—" : String(cell)}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  ))
                ) : section.rows.length === 0 ? (
                  <p className="rounded-lg border border-border/60 px-3 py-4 text-sm text-muted-foreground">
                    No rows in this section.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {section.columns.map((col) => (
                            <TableHead key={col}>{col}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {section.rows.map((row, rowIndex) => (
                          <TableRow key={`${section.id}-${rowIndex}`}>
                            {row.map((cell, cellIndex) => (
                              <TableCell
                                key={`${section.id}-${rowIndex}-${cellIndex}`}
                                className="font-data text-xs"
                              >
                                {cell == null || cell === "" ? "—" : String(cell)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
