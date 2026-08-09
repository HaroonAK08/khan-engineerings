"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  getChargesCalculator,
  previewChargesCalculator,
  type ChargeCalculatorLine,
  type ChargeCalculatorRates,
  type ChargesCalculatorReport,
} from "@/lib/finance-api";
import { apiError, formatKg, formatMoney } from "@/lib/materials-api";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Mode = "actual" | "assumption";

type MaterialAssumption = {
  baseRate: number;
  wastePercent: number;
};

function moneyOrDash(n: number | null | undefined) {
  return n == null ? "—" : formatMoney(n);
}

function deltaText(assumption: number | null, actual: number | null) {
  if (assumption == null || actual == null) return null;
  const d = Math.round((assumption - actual) * 100) / 100;
  if (d === 0) return "0.00";
  return `${d > 0 ? "+" : ""}${formatMoney(d)}`;
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function effectiveMaterialRate(baseRate: number, wastePercent: number) {
  return roundMoney(baseRate * (1 + Math.max(0, wastePercent) / 100));
}

function isMaterialLine(line: ChargeCalculatorLine) {
  return line.allocation === "material_hub" || line.allocation === "material_drum";
}

export function ChargesCalculator({
  dateFrom,
  dateTo,
}: {
  dateFrom: string;
  dateTo: string;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("actual");
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [baseline, setBaseline] = useState<ChargesCalculatorReport | null>(null);
  const [draftLines, setDraftLines] = useState<ChargeCalculatorLine[]>([]);
  const [assumptionRates, setAssumptionRates] = useState<ChargeCalculatorRates | null>(null);
  const [materialAssumptions, setMaterialAssumptions] = useState<
    Record<string, MaterialAssumption>
  >({});

  function materialKgFor(line: ChargeCalculatorLine) {
    if (!baseline) return 0;
    return line.allocation === "material_drum"
      ? baseline.drumFinishedKg
      : baseline.hubFinishedKg;
  }

  function rateFromAmount(line: ChargeCalculatorLine) {
    if (!isMaterialLine(line)) return line.amount;
    const kg = materialKgFor(line);
    return kg > 0 ? roundMoney(line.amount / kg) : 0;
  }

  function amountFromEffectiveRate(line: ChargeCalculatorLine, effectiveRate: number) {
    const kg = materialKgFor(line);
    return roundMoney(Math.max(0, effectiveRate) * kg);
  }

  const applySeed = useCallback(
    (data: ChargesCalculatorReport, runServerPreview = true) => {
      const lines = data.previous.lines.map((l) => ({ ...l }));
      setDraftLines(lines);
      setAssumptionRates(data.previous.rates);
      const materials = (() => {
        const next: Record<string, MaterialAssumption> = {};
        for (const line of lines) {
          if (line.allocation !== "material_hub" && line.allocation !== "material_drum") {
            continue;
          }
          const kg =
            line.allocation === "material_drum" ? data.drumFinishedKg : data.hubFinishedKg;
          const baseRate = kg > 0 ? roundMoney(line.amount / kg) : 0;
          next[line.id] = { baseRate, wastePercent: 0 };
        }
        return next;
      })();
      setMaterialAssumptions(materials);
      if (runServerPreview) {
        void (async () => {
          setPreviewing(true);
          try {
            const withMaterial = lines.map((line) => {
              if (line.allocation !== "material_hub" && line.allocation !== "material_drum") {
                return line;
              }
              const draft = materials[line.id];
              if (!draft) return line;
              const kg =
                line.allocation === "material_drum"
                  ? data.drumFinishedKg
                  : data.hubFinishedKg;
              const effective = effectiveMaterialRate(draft.baseRate, draft.wastePercent);
              return { ...line, amount: roundMoney(effective * kg) };
            });
            const overrides = Object.fromEntries(withMaterial.map((l) => [l.id, l.amount]));
            const preview = await previewChargesCalculator({
              dateFrom,
              dateTo,
              overrides,
            });
            setAssumptionRates(preview.assumption.rates);
            setDraftLines(
              preview.assumption.lines.map((line) => {
                if (line.allocation !== "material_hub" && line.allocation !== "material_drum") {
                  return line;
                }
                const draft = materials[line.id];
                if (!draft) return line;
                const kg =
                  line.allocation === "material_drum"
                    ? data.drumFinishedKg
                    : data.hubFinishedKg;
                const effective = effectiveMaterialRate(draft.baseRate, draft.wastePercent);
                return { ...line, amount: roundMoney(effective * kg) };
              })
            );
          } catch (err) {
            toast.error(apiError(err, t("partyMargin.loadFailed")));
          } finally {
            setPreviewing(false);
          }
        })();
      }
    },
    [dateFrom, dateTo, t]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getChargesCalculator({ dateFrom, dateTo });
      setBaseline(data);
      const lines = data.previous.lines.map((l) => ({ ...l }));
      setDraftLines(lines);
      setAssumptionRates(data.previous.rates);
      const materials: Record<string, MaterialAssumption> = {};
      for (const line of lines) {
        if (line.allocation !== "material_hub" && line.allocation !== "material_drum") {
          continue;
        }
        const kg =
          line.allocation === "material_drum" ? data.drumFinishedKg : data.hubFinishedKg;
        materials[line.id] = {
          baseRate: kg > 0 ? roundMoney(line.amount / kg) : 0,
          wastePercent: 0,
        };
      }
      setMaterialAssumptions(materials);
    } catch (err) {
      toast.error(apiError(err, t("partyMargin.loadFailed")));
      setBaseline(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, t]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  const runPreview = useCallback(
    async (lines: ChargeCalculatorLine[], assumptions: Record<string, MaterialAssumption>) => {
      setPreviewing(true);
      try {
        const prepared = lines.map((line) => {
          if (!isMaterialLine(line)) return line;
          const draft = assumptions[line.id];
          if (!draft || !baseline) return line;
          const kg =
            line.allocation === "material_drum"
              ? baseline.drumFinishedKg
              : baseline.hubFinishedKg;
          const effective = effectiveMaterialRate(draft.baseRate, draft.wastePercent);
          return { ...line, amount: roundMoney(effective * kg) };
        });
        const overrides = Object.fromEntries(prepared.map((l) => [l.id, l.amount]));
        const data = await previewChargesCalculator({
          dateFrom,
          dateTo,
          overrides,
        });
        setAssumptionRates(data.assumption.rates);
        setDraftLines(
          data.assumption.lines.map((line) => {
            if (!isMaterialLine(line)) return line;
            const draft = assumptions[line.id];
            if (!draft || !baseline) return line;
            const kg =
              line.allocation === "material_drum"
                ? baseline.drumFinishedKg
                : baseline.hubFinishedKg;
            const effective = effectiveMaterialRate(draft.baseRate, draft.wastePercent);
            return { ...line, amount: roundMoney(effective * kg) };
          })
        );
      } catch (err) {
        toast.error(apiError(err, t("partyMargin.loadFailed")));
      } finally {
        setPreviewing(false);
      }
    },
    [baseline, dateFrom, dateTo, t]
  );

  function displayValueFor(line: ChargeCalculatorLine) {
    if (isMaterialLine(line)) return rateFromAmount(line);
    return line.amount;
  }

  function onAmountChange(id: string, raw: string) {
    const value = raw === "" ? 0 : Number(raw);
    const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
    setDraftLines((prev) =>
      prev.map((row) => (row.id !== id ? row : { ...row, amount: safe }))
    );
  }

  function onMaterialAssumptionChange(
    line: ChargeCalculatorLine,
    patch: Partial<MaterialAssumption>
  ) {
    setMaterialAssumptions((prev) => {
      const current = prev[line.id] || {
        baseRate: rateFromAmount(line),
        wastePercent: 0,
      };
      const next = {
        ...prev,
        [line.id]: {
          baseRate: patch.baseRate != null ? Math.max(0, patch.baseRate) : current.baseRate,
          wastePercent:
            patch.wastePercent != null
              ? Math.max(0, patch.wastePercent)
              : current.wastePercent,
        },
      };
      const draft = next[line.id];
      const effective = effectiveMaterialRate(draft.baseRate, draft.wastePercent);
      setDraftLines((rows) =>
        rows.map((row) =>
          row.id !== line.id
            ? row
            : { ...row, amount: amountFromEffectiveRate(row, effective) }
        )
      );
      return next;
    });
  }

  function switchToAssumption() {
    setMode("assumption");
    if (baseline) applySeed(baseline, true);
  }

  function resetToLastMonth() {
    if (!baseline) return;
    applySeed(baseline, true);
  }

  function onCalculate() {
    void runPreview(draftLines, materialAssumptions);
  }

  if (loading || !baseline) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("prodMargin.chargesLoading")}
        </CardContent>
      </Card>
    );
  }

  const actualRates = baseline.actual.rates;
  const showRates = mode === "actual" ? actualRates : assumptionRates || actualRates;
  const lines = (mode === "actual" ? baseline.actual.lines : draftLines).filter(
    (line) => line.allocation !== "salesman"
  );

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle className="text-nameplate text-sm font-bold">
            {t("prodMargin.chargesCalcTitle")}
          </CardTitle>
          {mode === "assumption" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {baseline.seedSource === "actual"
                ? t("prodMargin.chargesSeedFallbackHint")
                : t("prodMargin.chargesSeedHint", {
                    from: baseline.previousPeriod.dateFrom,
                    to: baseline.previousPeriod.dateTo,
                  })}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("prodMargin.chargesMaterialNote")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={mode === "actual" ? "default" : "ghost"}
              onClick={() => setMode("actual")}
            >
              {t("prodMargin.chargesActual")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "assumption" ? "default" : "ghost"}
              onClick={switchToAssumption}
            >
              {t("prodMargin.chargesAssumption")}
            </Button>
          </div>
          {mode === "assumption" ? (
            <Button type="button" size="sm" variant="outline" onClick={resetToLastMonth}>
              {t("prodMargin.chargesReset")}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                label: t("prodMargin.chargesHubKg"),
                value: showRates.factoryHubPerKg,
                actual: actualRates.factoryHubPerKg,
                fill: "hub" as const,
              },
              {
                label: t("prodMargin.chargesDrumKg"),
                value: showRates.factoryDrumPerKg,
                actual: actualRates.factoryDrumPerKg,
                fill: "drum" as const,
              },
            ] as const
          ).map((card) => {
            const isDrum = card.fill === "drum";
            const fill = isDrum
              ? "border-yellow-600/40 bg-yellow-500 text-yellow-950"
              : "border-sky-700/40 bg-sky-600 text-white";
            const valueTone = isDrum ? "text-yellow-950" : "text-white";
            const delta =
              mode === "assumption" ? deltaText(card.value, card.actual) : null;
            return (
              <div key={card.label} className={cn("rounded-md border p-3", fill)}>
                <p className={cn("text-xs font-bold uppercase tracking-wide", valueTone)}>
                  {card.label}
                </p>
                <p className={cn("font-data mt-1 text-xl font-bold", valueTone)}>
                  {moneyOrDash(card.value)}
                </p>
                {delta ? (
                  <p className={cn("mt-1 text-xs font-semibold", valueTone)}>
                    {t("prodMargin.chargesVsActual")}: {delta}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t("prodMargin.hubLine")} {formatKg(baseline.hubFinishedKg)} ·{" "}
            {t("prodMargin.drumLine")} {formatKg(baseline.drumFinishedKg)}
          </p>
          {mode === "assumption" ? (
            <Button
              type="button"
              size="sm"
              onClick={onCalculate}
              disabled={previewing}
            >
              {previewing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {t("prodMargin.chargesCalculate")}
            </Button>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[11px] font-bold tracking-wide uppercase">
                <th className="px-3 py-2">{t("prodMargin.chargesLine")}</th>
                <th className="px-3 py-2 text-right">
                  {t("prodMargin.chargesAmount")} / {t("prodMargin.chargesRateKg")}
                </th>
                <th className="px-3 py-2 text-right">{t("prodMargin.chargesHubKg")}</th>
                <th className="px-3 py-2 text-right">{t("prodMargin.chargesDrumKg")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const rateLine = showRates.breakdown.find((b) => b.id === line.id);
                const material = isMaterialLine(line);
                const shown = displayValueFor(line);
                const materialDraft = materialAssumptions[line.id] || {
                  baseRate: shown,
                  wastePercent: 0,
                };
                const withWaste = effectiveMaterialRate(
                  materialDraft.baseRate,
                  materialDraft.wastePercent
                );
                return (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-semibold">
                      {line.label}
                      {material ? (
                        <span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground">
                          {mode === "assumption"
                            ? t("prodMargin.chargesMaterialWasteHint")
                            : t("prodMargin.chargesRateKg")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {mode === "assumption" && material ? (
                        <div className="ml-auto flex w-full max-w-[280px] flex-col items-end gap-1.5">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("prodMargin.chargesBaseRate")}
                            </label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="h-8 w-24 text-right font-data font-bold"
                              value={
                                Number.isFinite(materialDraft.baseRate)
                                  ? String(materialDraft.baseRate)
                                  : ""
                              }
                              onChange={(e) =>
                                onMaterialAssumptionChange(line, {
                                  baseRate:
                                    e.target.value === "" ? 0 : Number(e.target.value),
                                })
                              }
                            />
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("prodMargin.chargesWastePercent")}
                            </label>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="h-8 w-20 text-right font-data font-bold"
                              value={
                                Number.isFinite(materialDraft.wastePercent)
                                  ? String(materialDraft.wastePercent)
                                  : ""
                              }
                              onChange={(e) =>
                                onMaterialAssumptionChange(line, {
                                  wastePercent:
                                    e.target.value === "" ? 0 : Number(e.target.value),
                                })
                              }
                            />
                          </div>
                          <p className="font-data text-xs font-bold tabular-nums">
                            {t("prodMargin.chargesWithWaste")}: {formatMoney(withWaste)} / kg
                          </p>
                        </div>
                      ) : mode === "assumption" ? (
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="ml-auto h-8 w-32 text-right font-data font-bold"
                          value={Number.isFinite(shown) ? String(shown) : ""}
                          onChange={(e) => onAmountChange(line.id, e.target.value)}
                        />
                      ) : (
                        <span className="font-data font-bold">
                          {formatMoney(shown)}
                          {material ? " / kg" : ""}
                        </span>
                      )}
                    </td>
                    <td className="font-data px-3 py-2 text-right font-bold">
                      {moneyOrDash(
                        material && mode === "assumption"
                          ? line.allocation === "material_hub"
                            ? withWaste
                            : null
                          : rateLine?.hubPerKg
                      )}
                    </td>
                    <td className="font-data px-3 py-2 text-right font-bold">
                      {moneyOrDash(
                        material && mode === "assumption"
                          ? line.allocation === "material_drum"
                            ? withWaste
                            : null
                          : rateLine?.drumPerKg
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
