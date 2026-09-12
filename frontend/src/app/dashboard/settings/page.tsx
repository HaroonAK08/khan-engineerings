"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Monitor, Moon, Sun, Shield, Database, Scale, Loader2, Zap } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useI18n } from "@/hooks/use-i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useTaxSplitStore } from "@/stores/tax-split-store";
import {
  getElectricitySplit,
  setElectricitySplit,
  type ElectricitySplitMode,
  type ElectricitySplitSettings,
  type TaxSplitMode,
} from "@/lib/settings-api";
import { apiError } from "@/lib/materials-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const taxMode = useTaxSplitStore((s) => s.mode);
  const taxHub = useTaxSplitStore((s) => s.hubPercent);
  const taxDrum = useTaxSplitStore((s) => s.drumPercent);
  const taxSaving = useTaxSplitStore((s) => s.saving);
  const hydrateTax = useTaxSplitStore((s) => s.hydrate);
  const setTaxMode = useTaxSplitStore((s) => s.setMode);
  const setTaxPercents = useTaxSplitStore((s) => s.setPercents);

  const [taxHubInput, setTaxHubInput] = useState("50");
  const [taxDrumInput, setTaxDrumInput] = useState("50");

  const [elec, setElec] = useState<ElectricitySplitSettings>({
    mode: "intensity",
    hubPercent: 60,
    drumPercent: 40,
    hubIntensity: 0.6,
    drumIntensity: 0.4,
  });
  const [elecHubInput, setElecHubInput] = useState("60");
  const [elecDrumInput, setElecDrumInput] = useState("40");
  const [elecSaving, setElecSaving] = useState(false);
  const [elecLoaded, setElecLoaded] = useState(false);

  useEffect(() => {
    void hydrateTax();
  }, [hydrateTax]);

  useEffect(() => {
    setTaxHubInput(String(taxHub));
    setTaxDrumInput(String(taxDrum));
  }, [taxHub, taxDrum]);

  useEffect(() => {
    let cancelled = false;
    getElectricitySplit()
      .then((settings) => {
        if (cancelled) return;
        setElec(settings);
        setElecHubInput(String(settings.hubPercent));
        setElecDrumInput(String(settings.drumPercent));
        setElecLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setElecLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onTaxMode(mode: TaxSplitMode) {
    if (mode === taxMode || taxSaving) return;
    try {
      await setTaxMode(mode);
      toast.success(t("settings.taxSplitSaved"));
    } catch (err) {
      toast.error(apiError(err, t("settings.taxSplitFailed")));
    }
  }

  async function onSaveTaxPercents() {
    const hub = Number(taxHubInput);
    const drum = Number(taxDrumInput);
    if (!Number.isFinite(hub) || !Number.isFinite(drum)) {
      toast.error(t("settings.percentInvalid"));
      return;
    }
    if (Math.abs(hub + drum - 100) > 0.05) {
      toast.error(t("settings.percentSum"));
      return;
    }
    try {
      await setTaxPercents(hub, drum);
      toast.success(t("settings.taxSplitSaved"));
    } catch (err) {
      toast.error(apiError(err, t("settings.taxSplitFailed")));
    }
  }

  async function onElecMode(mode: ElectricitySplitMode) {
    if (mode === elec.mode || elecSaving) return;
    setElecSaving(true);
    try {
      const saved = await setElectricitySplit({
        mode,
        hubPercent: Number(elecHubInput) || elec.hubPercent,
        drumPercent: Number(elecDrumInput) || elec.drumPercent,
      });
      setElec(saved);
      setElecHubInput(String(saved.hubPercent));
      setElecDrumInput(String(saved.drumPercent));
      toast.success(t("settings.elecSplitSaved"));
    } catch (err) {
      toast.error(apiError(err, t("settings.elecSplitFailed")));
    } finally {
      setElecSaving(false);
    }
  }

  async function onSaveElecPercents() {
    const hub = Number(elecHubInput);
    const drum = Number(elecDrumInput);
    if (!Number.isFinite(hub) || !Number.isFinite(drum)) {
      toast.error(t("settings.percentInvalid"));
      return;
    }
    if (Math.abs(hub + drum - 100) > 0.05) {
      toast.error(t("settings.percentSum"));
      return;
    }
    setElecSaving(true);
    try {
      const saved = await setElectricitySplit({
        mode: "percent",
        hubPercent: hub,
        drumPercent: drum,
      });
      setElec(saved);
      setElecHubInput(String(saved.hubPercent));
      setElecDrumInput(String(saved.drumPercent));
      toast.success(t("settings.elecSplitSaved"));
    } catch (err) {
      toast.error(apiError(err, t("settings.elecSplitFailed")));
    } finally {
      setElecSaving(false);
    }
  }

  const themeOptions = [
    { value: "light" as const, label: t("settings.light"), icon: Sun },
    { value: "dark" as const, label: t("settings.dark"), icon: Moon },
  ];

  const taxOptions = [
    { value: "per_kg" as const, label: t("settings.taxSplitPerKg") },
    { value: "half" as const, label: t("settings.taxSplitHalf") },
    { value: "percent" as const, label: t("settings.taxSplitPercent") },
  ];

  const elecOptions = [
    { value: "intensity" as const, label: t("settings.elecSplitDefault") },
    { value: "percent" as const, label: t("settings.elecSplitPercent") },
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-primary" />
            <CardTitle className="text-nameplate text-sm">{t("settings.taxSplit")}</CardTitle>
          </div>
          <CardDescription>{t("settings.taxSplitDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {taxOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={taxMode === option.value ? "default" : "outline"}
                className="gap-2"
                disabled={taxSaving}
                onClick={() => void onTaxMode(option.value)}
              >
                {taxSaving && taxMode === option.value ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {option.label}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {taxMode === "half"
              ? t("settings.taxSplitHalfHint")
              : taxMode === "percent"
                ? t("settings.taxSplitPercentHint")
                : t("settings.taxSplitPerKgHint")}
          </p>
          {taxMode === "percent" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("settings.hubPercent")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={taxHubInput}
                    onChange={(e) => {
                      setTaxHubInput(e.target.value);
                      const hub = Number(e.target.value);
                      if (Number.isFinite(hub)) {
                        setTaxDrumInput(String(Math.round((100 - hub) * 100) / 100));
                      }
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("settings.drumPercent")}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={taxDrumInput}
                    onChange={(e) => {
                      setTaxDrumInput(e.target.value);
                      const drum = Number(e.target.value);
                      if (Number.isFinite(drum)) {
                        setTaxHubInput(String(Math.round((100 - drum) * 100) / 100));
                      }
                    }}
                  />
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                className="w-fit gap-2"
                disabled={taxSaving}
                onClick={() => void onSaveTaxPercents()}
              >
                {taxSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                {t("settings.savePercents")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-primary" />
            <CardTitle className="text-nameplate text-sm">{t("settings.elecSplit")}</CardTitle>
          </div>
          <CardDescription>{t("settings.elecSplitDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!elecLoaded ? (
            <div className="flex justify-center py-4">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {elecOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={elec.mode === option.value ? "default" : "outline"}
                    className="gap-2"
                    disabled={elecSaving}
                    onClick={() => void onElecMode(option.value)}
                  >
                    {elecSaving && elec.mode === option.value ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    {option.label}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {elec.mode === "percent"
                  ? t("settings.elecSplitPercentHint")
                  : t("settings.elecSplitDefaultHint")}
              </p>
              {elec.mode === "percent" ? (
                <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("settings.hubPercent")}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={elecHubInput}
                        onChange={(e) => {
                          setElecHubInput(e.target.value);
                          const hub = Number(e.target.value);
                          if (Number.isFinite(hub)) {
                            setElecDrumInput(String(Math.round((100 - hub) * 100) / 100));
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("settings.drumPercent")}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={elecDrumInput}
                        onChange={(e) => {
                          setElecDrumInput(e.target.value);
                          const drum = Number(e.target.value);
                          if (Number.isFinite(drum)) {
                            setElecHubInput(String(Math.round((100 - drum) * 100) / 100));
                          }
                        }}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-fit gap-2"
                    disabled={elecSaving}
                    onClick={() => void onSaveElecPercents()}
                  >
                    {elecSaving ? <Loader2 className="size-4 animate-spin" /> : null}
                    {t("settings.savePercents")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Monitor className="size-4 text-primary" />
            <CardTitle className="text-nameplate text-sm">{t("settings.appearance")}</CardTitle>
          </div>
          <CardDescription>{t("settings.appearanceDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const active = theme === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setTheme(option.value)}
                >
                  <Icon className="size-4" />
                  {option.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <CardTitle className="text-nameplate text-sm">{t("settings.access")}</CardTitle>
          </div>
          <CardDescription>{t("settings.accessDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{t("settings.signedInAs")}</p>
              <p className="font-data text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Badge variant="secondary" className="font-data uppercase">
              {user?.role ?? "—"}
            </Badge>
          </div>
          <Separator />
          <ul className="font-data flex flex-col gap-2 text-xs text-muted-foreground">
            <li>{t("settings.role.admin")}</li>
            <li>{t("settings.role.manager")}</li>
            <li>{t("settings.role.staff")}</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <CardTitle className="text-nameplate text-sm">{t("settings.system")}</CardTitle>
          </div>
          <CardDescription>{t("settings.systemDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="font-data grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            <div className="border border-border/60 p-3">
              <dt className="text-muted-foreground">{t("settings.build")}</dt>
              <dd className="mt-1 text-foreground">{t("settings.buildValue")}</dd>
            </div>
            <div className="border border-border/60 p-3">
              <dt className="text-muted-foreground">{t("settings.api")}</dt>
              <dd className="mt-1 break-all text-foreground">
                {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api"}
              </dd>
            </div>
            <div className="border border-border/60 p-3">
              <dt className="text-muted-foreground">{t("settings.auth")}</dt>
              <dd className="mt-1 text-foreground">{t("settings.authValue")}</dd>
            </div>
            <div className="border border-border/60 p-3">
              <dt className="text-muted-foreground">{t("settings.company")}</dt>
              <dd className="mt-1 text-muted-foreground">{t("settings.companyValue")}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
