"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileText, Loader2, Settings2 } from "lucide-react";
import { apiError } from "@/lib/materials-api";
import { currentMonthRange } from "@/lib/date-range";
import {
  COMBINED_REPORT_MODULES,
  downloadCustomReport,
  downloadFullReport,
  getCombinedReportPreview,
  type CombinedReportPreview,
  type ExportKind,
} from "@/lib/reports-api";
import { Button } from "@/components/ui/button";
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
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { ReportsSubnav } from "@/components/layout/reports-subnav";

type ReportMode = "full" | "custom";

export default function ReportsHubPage() {
  const { t } = useI18n();
  const month = useMemo(() => currentMonthRange(), []);

  const [mode, setMode] = useState<ReportMode>("full");
  const [dateFrom, setDateFrom] = useState(month.from);
  const [dateTo, setDateTo] = useState(month.to);
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [exporting, setExporting] = useState(false);
  const [customModules, setCustomModules] = useState<ExportKind[]>(
    COMBINED_REPORT_MODULES.map((m) => m.id)
  );
  const [preview, setPreview] = useState<CombinedReportPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const previewModules = mode === "full" ? COMBINED_REPORT_MODULES.map((m) => m.id) : customModules;

  const loadPreview = useCallback(async () => {
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
      });
      setPreview(report);
    } catch (err) {
      setPreview(null);
      toast.error(apiError(err, "Failed to load report preview"));
    } finally {
      setLoadingPreview(false);
    }
  }, [mode, customModules, dateFrom, dateTo]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPreview();
    }, 350);
    return () => clearTimeout(timer);
  }, [loadPreview]);

  function toggleModule(id: ExportKind) {
    setCustomModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  async function onDownload() {
    if (mode === "custom" && customModules.length === 0) {
      toast.error("Select at least one module");
      return;
    }

    setExporting(true);
    try {
      if (mode === "full") {
        await downloadFullReport({
          format,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        toast.success("Full report downloaded");
      } else {
        await downloadCustomReport({
          format,
          modules: customModules,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        toast.success("Custom report downloaded");
      }
    } catch (err) {
      toast.error(
        apiError(
          err,
          mode === "full" ? "Failed to download full report" : "Failed to download custom report"
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
          Choose full report or build a custom report, then download. For Overall / Party wise /
          Group wise, open Receivables, Sales, or Statements above.
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
          <p className="mt-1 text-sm text-muted-foreground">
            All modules in one file — sales, purchases, production, expenses, inventory, finance,
            receivables, payables.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setMode("custom")}
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
          <p className="text-nameplate text-sm">Custom report</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick only the modules you need, then download as PDF or Excel.
          </p>
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-nameplate text-sm">
            {mode === "full" ? "Full report" : "Custom report"}
          </CardTitle>
          <CardDescription>
            {mode === "full"
              ? "Includes every main report section for the selected date range."
              : "Select modules, date range, and file format."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("common.from")}</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("common.to")}</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>

          {mode === "full" ? (
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
            disabled={exporting || (mode === "custom" && customModules.length === 0)}
            onClick={() => void onDownload()}
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            {mode === "full" ? "Download full report" : "Download custom report"}
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
            {previewModules.length ? ` · ${previewModules.length} sections` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {loadingPreview ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : !preview || preview.sections.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {mode === "custom" && customModules.length === 0
                ? "Select at least one module to preview."
                : "No report data for this period."}
            </p>
          ) : (
            preview.sections.map((section) => (
              <div key={section.id} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <h3 className="text-nameplate text-sm">{section.heading || section.title}</h3>
                  {Object.keys(section.meta || {}).length > 0 && (
                    <p className="font-data text-xs text-muted-foreground">
                      {Object.entries(section.meta)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
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
