"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Delete,
  Loader2,
  Lock,
  LockKeyhole,
  Pencil,
  Plus,
  Shield,
  Trash2,
} from "lucide-react";
import { FinanceSubnav } from "@/components/layout/finance-subnav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/hooks/use-i18n";
import { apiError, formatMoney } from "@/lib/materials-api";
import {
  changeVaultPin,
  createVaultAsset,
  deleteVaultAsset,
  getVaultStatus,
  getVaultYearSummary,
  isVaultUnlocked,
  listVaultAssets,
  lockVault,
  resetVaultPin,
  setupVault,
  unlockVault,
  updateVaultAsset,
  type VaultAsset,
  type VaultKind,
  type VaultOwner,
  type VaultTotals,
  type VaultYearSummary,
} from "@/lib/vault-api";

const KIND_OPTIONS: VaultKind[] = ["bank", "cash", "property", "investment", "other"];
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type AssetForm = {
  owner: VaultOwner;
  kind: VaultKind;
  name: string;
  institution: string;
  amount: string;
  notes: string;
};

const emptyForm = (): AssetForm => ({
  owner: "personal",
  kind: "bank",
  name: "",
  institution: "",
  amount: "",
  notes: "",
});

function PinPad({
  value,
  onChange,
  disabled,
  maxLen = 6,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  maxLen?: number;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function press(digit: string) {
    if (disabled || value.length >= maxLen) return;
    onChange(value + digit);
    inputRef.current?.focus();
  }
  function backspace() {
    if (disabled) return;
    onChange(value.slice(0, -1));
    inputRef.current?.focus();
  }

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto w-full max-w-xs space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="vault-pin-input" className="sr-only">
          {label}
        </Label>
        <Input
          ref={inputRef}
          id="vault-pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          disabled={disabled}
          maxLength={maxLen}
          value={value}
          placeholder="••••••"
          className="font-data h-12 text-center text-2xl tracking-[0.4em]"
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, maxLen);
            onChange(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onChange("");
            }
          }}
        />
      </div>
      <div className="flex justify-center gap-2" aria-hidden>
        {Array.from({ length: maxLen }).map((_, i) => (
          <span
            key={i}
            className={`size-3 rounded-full border ${
              i < value.length ? "border-primary bg-primary" : "border-muted-foreground/40"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((key) => {
          if (key === "") return <span key="empty" />;
          if (key === "back") {
            return (
              <Button
                key="back"
                type="button"
                variant="outline"
                className="h-12"
                disabled={disabled}
                onClick={backspace}
              >
                <Delete className="size-4" />
              </Button>
            );
          }
          return (
            <Button
              key={key}
              type="button"
              variant="outline"
              className="font-data h-12 text-lg"
              disabled={disabled}
              onClick={() => press(key)}
            >
              {key}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export default function VaultPage() {
  const { t } = useI18n();
  const [booting, setBooting] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [vaultLockedOut, setVaultLockedOut] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const [pin, setPin] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [setupStep, setSetupStep] = useState<"create" | "confirm">("create");

  const [assets, setAssets] = useState<VaultAsset[]>([]);
  const [totals, setTotals] = useState<VaultTotals | null>(null);
  const [yearSummary, setYearSummary] = useState<VaultYearSummary | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VaultAsset | null>(null);
  const [form, setForm] = useState<AssetForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");

  const [resetOpen, setResetOpen] = useState(false);
  const [factoryPin, setFactoryPin] = useState("");
  const [resetNewPin, setResetNewPin] = useState("");
  const [resetConfirmPin, setResetConfirmPin] = useState("");

  const unlockInFlight = useRef(false);
  const setupInFlight = useRef(false);

  const yearItems = useMemo(() => {
    const y = new Date().getFullYear();
    return Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(y - i), String(y - i)]));
  }, []);

  const refreshStatus = useCallback(async () => {
    const status = await getVaultStatus();
    setConfigured(status.configured);
    setVaultLockedOut(status.locked);
    return status;
  }, []);

  const loadUnlocked = useCallback(async () => {
    const [list, summary] = await Promise.all([
      listVaultAssets(),
      getVaultYearSummary(Number(year)),
    ]);
    setAssets(list.assets);
    setTotals(list.totals);
    setYearSummary(summary);
    setUnlocked(true);
  }, [year]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await refreshStatus();
        if (cancelled) return;
        if (status.configured && isVaultUnlocked()) {
          try {
            await loadUnlocked();
          } catch {
            lockVault();
            if (!cancelled) setUnlocked(false);
          }
        }
      } catch (err) {
        toast.error(apiError(err, t("vault.loadFailed")));
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadUnlocked, refreshStatus, t]);

  useEffect(() => {
    if (!unlocked) return;
    void getVaultYearSummary(Number(year))
      .then(setYearSummary)
      .catch(() => undefined);
  }, [year, unlocked]);

  async function onUnlock(code?: string) {
    const value = (code ?? pin).replace(/\D/g, "").slice(0, 6);
    if (value.length !== 6 || unlockInFlight.current) return;
    unlockInFlight.current = true;
    setBusy(true);
    try {
      await unlockVault(value);
      setPin("");
      await loadUnlocked();
      toast.success(t("vault.unlocked"));
    } catch (err) {
      setPin("");
      toast.error(apiError(err, t("vault.unlockFailed")));
      await refreshStatus().catch(() => undefined);
    } finally {
      unlockInFlight.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (configured && !unlocked && pin.length === 6 && !busy && !unlockInFlight.current) {
      void onUnlock(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, configured, unlocked]);

  async function onSetupAdvance() {
    if (setupInFlight.current) return;
    if (setupStep === "create") {
      if (setupPin.length !== 6) return;
      setSetupStep("confirm");
      return;
    }
    if (setupConfirm.length !== 6) return;
    setupInFlight.current = true;
    setBusy(true);
    try {
      await setupVault(setupPin, setupConfirm);
      await unlockVault(setupPin);
      setConfigured(true);
      setSetupPin("");
      setSetupConfirm("");
      setSetupStep("create");
      await loadUnlocked();
      toast.success(t("vault.setupDone"));
    } catch (err) {
      setSetupConfirm("");
      setSetupStep("create");
      setSetupPin("");
      toast.error(apiError(err, t("vault.setupFailed")));
    } finally {
      setupInFlight.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (configured || unlocked || busy || setupInFlight.current) return;
    if (setupStep === "create" && setupPin.length === 6) void onSetupAdvance();
    if (setupStep === "confirm" && setupConfirm.length === 6) void onSetupAdvance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupPin, setupConfirm, setupStep, configured, unlocked]);

  async function onResetPin() {
    setBusy(true);
    try {
      await resetVaultPin(factoryPin, resetNewPin, resetConfirmPin);
      setResetOpen(false);
      setFactoryPin("");
      setResetNewPin("");
      setResetConfirmPin("");
      setConfigured(true);
      toast.success(t("vault.resetDone"));
    } catch (err) {
      toast.error(apiError(err, t("vault.resetFailed")));
    } finally {
      setBusy(false);
    }
  }

  function onLock() {
    lockVault();
    setUnlocked(false);
    setAssets([]);
    setTotals(null);
    setYearSummary(null);
    setPin("");
    toast.message(t("vault.locked"));
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(asset: VaultAsset) {
    setEditing(asset);
    setForm({
      owner: asset.owner,
      kind: asset.kind,
      name: asset.name,
      institution: asset.institution,
      amount: String(asset.amount),
      notes: asset.notes,
    });
    setDialogOpen(true);
  }

  async function onSaveAsset() {
    const name = form.name.trim();
    const amount = Number(form.amount);
    if (!name) {
      toast.error(t("vault.nameRequired"));
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error(t("vault.amountInvalid"));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateVaultAsset(editing.id, {
          owner: form.owner,
          kind: form.kind,
          name,
          institution: form.institution.trim(),
          amount,
          notes: form.notes.trim(),
          recordSnapshot: true,
        });
        toast.success(t("vault.assetUpdated"));
      } else {
        await createVaultAsset({
          owner: form.owner,
          kind: form.kind,
          name,
          institution: form.institution.trim(),
          amount,
          notes: form.notes.trim(),
        });
        toast.success(t("vault.assetCreated"));
      }
      setDialogOpen(false);
      await loadUnlocked();
    } catch (err) {
      toast.error(apiError(err, t("vault.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteAsset(asset: VaultAsset) {
    if (!confirm(t("vault.confirmDelete", { name: asset.name }))) return;
    try {
      await deleteVaultAsset(asset.id);
      toast.success(t("vault.assetDeleted"));
      await loadUnlocked();
    } catch (err) {
      toast.error(apiError(err, t("vault.deleteFailed")));
    }
  }

  async function onChangePin() {
    setBusy(true);
    try {
      await changeVaultPin(currentPin, newPin, confirmNewPin);
      setPinDialogOpen(false);
      setCurrentPin("");
      setNewPin("");
      setConfirmNewPin("");
      toast.success(t("vault.pinChanged"));
    } catch (err) {
      toast.error(apiError(err, t("vault.pinChangeFailed")));
    } finally {
      setBusy(false);
    }
  }

  const personalAssets = assets.filter((a) => a.owner === "personal");
  const companyAssets = assets.filter((a) => a.owner === "company");

  if (booting) {
    return (
      <div className="flex flex-col gap-6">
        <FinanceSubnav />
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="flex flex-col gap-6">
        <FinanceSubnav />
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-8">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            {configured ? <LockKeyhole className="size-7" /> : <Shield className="size-7" />}
          </div>
          <div className="text-center">
            <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
              {t("vault.eyebrow")}
            </p>
            <h1 className="text-nameplate mt-1 text-xl">
              {configured ? t("vault.unlockTitle") : t("vault.setupTitle")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {configured ? t("vault.unlockHint") : t("vault.setupHint")}
            </p>
            {vaultLockedOut ? (
              <p className="mt-2 text-sm text-destructive">{t("vault.temporarilyLocked")}</p>
            ) : null}
          </div>

          {configured ? (
            <>
              <PinPad
                value={pin}
                onChange={setPin}
                disabled={busy || vaultLockedOut}
                label={t("vault.unlockTitle")}
              />
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => setResetOpen(true)}
              >
                {t("vault.forgotPin")}
              </button>
            </>
          ) : (
            <div className="w-full space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                {setupStep === "create" ? t("vault.enterNewPin") : t("vault.confirmNewPin")}
              </p>
              <PinPad
                value={setupStep === "create" ? setupPin : setupConfirm}
                onChange={setupStep === "create" ? setSetupPin : setSetupConfirm}
                disabled={busy}
                label={setupStep === "create" ? t("vault.enterNewPin") : t("vault.confirmNewPin")}
              />
            </div>
          )}

          {busy ? <Loader2 className="size-5 animate-spin text-primary" /> : null}
        </div>

        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("vault.resetTitle")}</DialogTitle>
              <DialogDescription>{t("vault.resetHint")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>{t("vault.factoryPin")}</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={factoryPin}
                  onChange={(e) => setFactoryPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("vault.newPin")}</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={resetNewPin}
                  onChange={(e) => setResetNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("vault.confirmNewPin")}</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={resetConfirmPin}
                  onChange={(e) =>
                    setResetConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={() => void onResetPin()} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : t("vault.resetSave")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <FinanceSubnav />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-data text-[10px] tracking-[0.15em] text-muted-foreground uppercase">
            {t("vault.eyebrow")}
          </p>
          <h1 className="text-nameplate text-xl">{t("vault.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("vault.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setPinDialogOpen(true)}>
            {t("vault.changePin")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onLock} className="gap-1.5">
            <Lock className="size-3.5" />
            {t("vault.lockNow")}
          </Button>
          <Button type="button" size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="size-3.5" />
            {t("vault.addAsset")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: t("vault.personalTotal"), value: totals?.personal ?? 0 },
          { label: t("vault.companyTotal"), value: totals?.company ?? 0 },
          { label: t("vault.allTotal"), value: totals?.all ?? 0 },
        ].map((s) => (
          <Card key={s.label} className="py-0">
            <CardContent className="p-4">
              <p className="font-data text-[10px] tracking-wider text-muted-foreground uppercase">
                {s.label}
              </p>
              <p className="font-data mt-1 text-xl">{formatMoney(s.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AssetGroup
          title={t("vault.personal")}
          description={t("vault.personalDesc")}
          assets={personalAssets}
          empty={t("vault.emptyPersonal")}
          onEdit={openEdit}
          onDelete={onDeleteAsset}
          kindLabel={(k) => t(`vault.kind.${k}` as "vault.kind.bank")}
        />
        <AssetGroup
          title={t("vault.company")}
          description={t("vault.companyDesc")}
          assets={companyAssets}
          empty={t("vault.emptyCompany")}
          onEdit={openEdit}
          onDelete={onDeleteAsset}
          kindLabel={(k) => t(`vault.kind.${k}` as "vault.kind.bank")}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-nameplate text-sm">{t("vault.yearAssets")}</CardTitle>
            <CardDescription>{t("vault.yearAssetsDesc")}</CardDescription>
          </div>
          <div className="grid gap-1.5">
            <Label className="sr-only">{t("yearProgress.year")}</Label>
            <Select value={year} onValueChange={(v) => setYear(v || year)} items={yearItems}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(yearItems).map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("vault.yearEndPersonal")}</p>
              <p className="font-data text-sm">
                {formatMoney(yearSummary?.yearEnd.personal ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("vault.yearEndCompany")}</p>
              <p className="font-data text-sm">
                {formatMoney(yearSummary?.yearEnd.company ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("vault.yearEndAll")}</p>
              <p className="font-data text-sm">{formatMoney(yearSummary?.yearEnd.all ?? 0)}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {(yearSummary?.months || []).map((m) => (
              <div
                key={m.label}
                className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
              >
                <span className="text-sm">
                  {MONTH_LABELS[m.month - 1]} {m.year}
                </span>
                <span className="font-data text-xs">{formatMoney(m.all)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("vault.editAsset") : t("vault.addAsset")}
            </DialogTitle>
            <DialogDescription>{t("vault.assetFormHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label>{t("vault.owner")}</Label>
                <Select
                  value={form.owner}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, owner: v === "company" ? "company" : "personal" }))
                  }
                  items={{ personal: t("vault.personal"), company: t("vault.company") }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">{t("vault.personal")}</SelectItem>
                    <SelectItem value="company">{t("vault.company")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{t("vault.kindLabel")}</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      kind: (KIND_OPTIONS.includes(v as VaultKind) ? v : "bank") as VaultKind,
                    }))
                  }
                  items={Object.fromEntries(
                    KIND_OPTIONS.map((k) => [k, t(`vault.kind.${k}` as "vault.kind.bank")])
                  )}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`vault.kind.${k}` as "vault.kind.bank")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("vault.name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("vault.namePlaceholder")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("vault.institution")}</Label>
              <Input
                value={form.institution}
                onChange={(e) => setForm((f) => ({ ...f, institution: e.target.value }))}
                placeholder={t("vault.institutionPlaceholder")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("vault.amount")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("vault.notes")}</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={() => void onSaveAsset()} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("vault.changePin")}</DialogTitle>
            <DialogDescription>{t("vault.changePinHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>{t("vault.currentPin")}</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("vault.newPin")}</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("vault.confirmNewPin")}</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={confirmNewPin}
                onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPinDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={() => void onChangePin()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssetGroup({
  title,
  description,
  assets,
  empty,
  onEdit,
  onDelete,
  kindLabel,
}: {
  title: string;
  description: string;
  assets: VaultAsset[];
  empty: string;
  onEdit: (a: VaultAsset) => void;
  onDelete: (a: VaultAsset) => void;
  kindLabel: (k: VaultKind) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-nameplate text-sm">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {assets.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          assets.map((a) => (
            <div
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border/60 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{a.name}</p>
                  <Badge variant="secondary" className="font-data text-[10px]">
                    {kindLabel(a.kind)}
                  </Badge>
                </div>
                {a.institution ? (
                  <p className="text-xs text-muted-foreground">{a.institution}</p>
                ) : null}
                {a.notes ? <p className="mt-0.5 text-xs text-muted-foreground">{a.notes}</p> : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <p className="font-data text-sm">{formatMoney(a.amount)}</p>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="outline" onClick={() => onEdit(a)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => onDelete(a)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
