"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Monitor, Moon, Sun, Shield, Database, Scale, Loader2 } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useI18n } from "@/hooks/use-i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useTaxSplitStore } from "@/stores/tax-split-store";
import type { TaxSplitMode } from "@/lib/settings-api";
import { apiError } from "@/lib/materials-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const taxMode = useTaxSplitStore((s) => s.mode);
  const taxSaving = useTaxSplitStore((s) => s.saving);
  const hydrateTax = useTaxSplitStore((s) => s.hydrate);
  const setTaxMode = useTaxSplitStore((s) => s.setMode);

  useEffect(() => {
    void hydrateTax();
  }, [hydrateTax]);

  async function onTaxMode(mode: TaxSplitMode) {
    if (mode === taxMode || taxSaving) return;
    try {
      await setTaxMode(mode);
      toast.success(t("settings.taxSplitSaved"));
    } catch (err) {
      toast.error(apiError(err, t("settings.taxSplitFailed")));
    }
  }

  const themeOptions = [
    { value: "light" as const, label: t("settings.light"), icon: Sun },
    { value: "dark" as const, label: t("settings.dark"), icon: Moon },
  ];

  const taxOptions = [
    { value: "per_kg" as const, label: t("settings.taxSplitPerKg") },
    { value: "half" as const, label: t("settings.taxSplitHalf") },
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
              : t("settings.taxSplitPerKgHint")}
          </p>
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
