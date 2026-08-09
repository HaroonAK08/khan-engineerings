"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VOICE_EXAMPLES, parseVoiceCommand } from "@/lib/voice/parser";
import { resolveVoiceCommand } from "@/lib/voice/resolve";
import { isSpeechSupported, VoiceRecognizer, type SpeechLang } from "@/lib/voice/speech";
import { isAcceptPhrase, isRejectPhrase } from "@/lib/voice/confirm-phrases";
import type { ResolvedVoiceDraft } from "@/lib/voice/types";
import { VoiceConfirmDialog } from "@/components/voice/voice-confirm-dialog";
import { createFactoryExpense } from "@/lib/expenses-api";
import {
  apiError,
  createPurchase,
  recordPayment,
  withSameDayConfirm,
} from "@/lib/materials-api";
import { createBuilty, recordCustomerPayment } from "@/lib/sales-api";
import { produce } from "@/lib/production-api";
import { todayInput } from "@/lib/date-range";
import { isAlwaysCommonExpenseCategory } from "@/hooks/use-persisted-expense-scope";

type Props = {
  title: string;
  subtitle: string;
  unsupportedHint: string;
  listeningLabel: string;
  idleLabel: string;
  examplesLabel: string;
  speakTip: string;
};

export function VoiceEntryPanel({
  title,
  subtitle,
  unsupportedHint,
  listeningLabel,
  idleLabel,
  examplesLabel,
  speakTip,
}: Props) {
  const router = useRouter();
  const supported = useRef(false);
  const recognizer = useRef<VoiceRecognizer | null>(null);
  const confirmOpenRef = useRef(false);
  const processingRef = useRef(false);
  const savingRef = useRef(false);
  const transcriptRef = useRef("");
  const interimRef = useRef("");

  const [ready, setReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<SpeechLang>("en-US");
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [draft, setDraft] = useState<ResolvedVoiceDraft | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    interimRef.current = interim;
  }, [interim]);

  useEffect(() => {
    supported.current = isSpeechSupported();
    setReady(true);
    if (!supported.current) return;

    const voice = new VoiceRecognizer();
    recognizer.current = voice;
    voice.setLang(lang);

    return () => {
      voice.stop(true);
      recognizer.current = null;
    };
  }, []);

  useEffect(() => {
    recognizer.current?.setLang(lang);
  }, [lang]);

  useEffect(() => {
    confirmOpenRef.current = confirmOpen;
  }, [confirmOpen]);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setInterim("");
    setStatusError(null);
    setDraft(null);
    setConfirmOpen(false);
  }, []);

  const goNavigate = useCallback(
    (current: ResolvedVoiceDraft) => {
      const href = current.navigateHref;
      if (!href) {
        toast.error("No page selected.");
        return;
      }
      recognizer.current?.stop(true);
      setListening(false);
      toast.success(`Opening ${current.navigateLabel || "page"}`);
      clearTranscript();
      router.push(href);
    },
    [clearTranscript, router]
  );

  const reviewAndOpenConfirm = useCallback(async (text: string) => {
    const cleaned = text.trim();
    if (!cleaned) {
      toast.error("Nothing to add yet. Speak first, then tap Review.");
      return;
    }
    if (processingRef.current) return;
    processingRef.current = true;
    setStatusError(null);
    setResolving(true);

    try {
      const parsed = parseVoiceCommand(cleaned);
      const resolved = await resolveVoiceCommand(parsed);
      if ("error" in resolved) {
        setStatusError(resolved.error);
        toast.error(resolved.error);
        return;
      }

      if (resolved.intent === "navigate") {
        const options = resolved.navigateOptions || [];
        const ambiguous =
          options.length > 1 &&
          options[0].score - (options[1]?.score || 0) < 10;
        if (ambiguous) {
          setDraft(resolved);
          setConfirmOpen(true);
          return;
        }
        goNavigate(resolved);
        return;
      }

      setDraft(resolved);
      setConfirmOpen(true);
    } catch (err) {
      const message = apiError(err, "Could not resolve voice command.");
      setStatusError(message);
      toast.error(message);
    } finally {
      setResolving(false);
      processingRef.current = false;
    }
  }, [goNavigate]);

  const appendFinalSpeech = useCallback((text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;

    if (confirmOpenRef.current) {
      if (isAcceptPhrase(cleaned)) {
        window.dispatchEvent(new CustomEvent("voice-confirm-accept"));
        return;
      }
      if (isRejectPhrase(cleaned)) {
        setConfirmOpen(false);
        setDraft(null);
        return;
      }
      return;
    }

    setTranscript((prev) => {
      const next = prev ? `${prev} ${cleaned}`.replace(/\s+/g, " ").trim() : cleaned;
      return next;
    });
    setInterim("");
    setStatusError(null);
  }, []);

  useEffect(() => {
    const voice = recognizer.current;
    if (!voice) return;

    voice.setHandlers({
      onInterim: (text) => setInterim(text),
      onFinal: (text) => appendFinalSpeech(text),
      onError: (message) => {
        setStatusError(message);
        toast.error(message);
        setListening(false);
      },
      onStart: () => setListening(true),
      onEnd: () => setListening(false),
    });
  }, [appendFinalSpeech, ready]);

  const saveDraft = useCallback(async (current: ResolvedVoiceDraft) => {
    if (current.intent === "navigate") {
      goNavigate(current);
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      switch (current.intent) {
        case "expense": {
          const category = current.category || "other";
          const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
            createFactoryExpense({
              category,
              amount: Number(current.amount),
              expenseDate: current.expenseDate || todayInput(),
              title: category === "other" ? current.title?.trim() || undefined : undefined,
              notes: current.notes?.trim() || undefined,
              scope: isAlwaysCommonExpenseCategory(category)
                ? "common"
                : current.scope || "common",
              confirmDuplicate,
            })
          );
          if (cancelled) return;
          toast.success("Expense added");
          break;
        }
        case "purchase": {
          const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
            createPurchase({
              supplier: current.selectedSupplierId!,
              materialType: current.materialType || "scrap",
              quantityKg: Math.round(Number(current.quantity)),
              ratePerKg: current.rate,
              totalAmount: current.amount,
              purchaseDate: current.purchaseDate || todayInput(),
              notes: current.notes?.trim() || undefined,
              confirmDuplicate,
            })
          );
          if (cancelled) return;
          toast.success("Purchase added");
          break;
        }
        case "builty": {
          const pricingMode = current.pricingMode || "rate_kg";
          const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
            createBuilty({
              builtyNo: current.builtyNo!.trim(),
              billNo: current.billNo?.trim() || undefined,
              customer: current.selectedCustomerId!,
              builtyDate: current.builtyDate || todayInput(),
              notes: current.notes?.trim() || undefined,
              amountPaid: current.amountPaid,
              items: [
                {
                  product: current.selectedProductId!,
                  quantity: Number(current.quantity),
                  pricingMode,
                  ratePerKg: pricingMode === "rate_kg" ? Number(current.rate) : undefined,
                  fixedAmount:
                    pricingMode === "fixed" ? Number(current.amount) : undefined,
                },
              ],
              confirmDuplicate,
            })
          );
          if (cancelled) return;
          toast.success("Builty created");
          break;
        }
        case "customer_payment": {
          const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
            recordCustomerPayment(current.selectedCustomerId!, {
              amount: Number(current.amount),
              paymentDate: current.paymentDate || todayInput(),
              notes: current.notes?.trim() || undefined,
              confirmDuplicate,
            })
          );
          if (cancelled) return;
          toast.success("Customer payment recorded");
          break;
        }
        case "supplier_payment": {
          const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
            recordPayment(current.selectedSupplierId!, {
              amount: Number(current.amount),
              entryDate: current.paymentDate || todayInput(),
              notes: current.notes?.trim() || undefined,
              confirmDuplicate,
            })
          );
          if (cancelled) return;
          toast.success("Supplier payment recorded");
          break;
        }
        case "produce": {
          const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
            produce({
              productId: current.selectedProductId!,
              quantity: Math.round(Number(current.quantity)),
              wastePercent: current.wastePercent,
              materialType: current.materialType,
              productionDate: current.productionDate || todayInput(),
              batchNo: current.batchNo?.trim() || undefined,
              notes: current.notes?.trim() || undefined,
              confirmDuplicate,
            })
          );
          if (cancelled) return;
          toast.success("Production recorded");
          break;
        }
      }
      clearTranscript();
    } catch (err) {
      toast.error(apiError(err, "Failed to save entry"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [clearTranscript, goNavigate]);

  const flushInterimIntoTranscript = useCallback(() => {
    const pending = interimRef.current.trim();
    if (!pending) return transcriptRef.current;
    const merged = transcriptRef.current
      ? `${transcriptRef.current} ${pending}`.replace(/\s+/g, " ").trim()
      : pending;
    setTranscript(merged);
    setInterim("");
    return merged;
  }, []);

  const toggleListening = () => {
    if (!supported.current) {
      toast.error(unsupportedHint);
      return;
    }
    const voice = recognizer.current;
    if (!voice) return;
    if (voice.isListening() || listening) {
      voice.stop();
      setListening(false);
      flushInterimIntoTranscript();
      return;
    }
    setStatusError(null);
    const started = voice.start();
    if (started) setListening(true);
  };

  const displayText = interim
    ? transcript
      ? `${transcript} ${interim}`
      : interim
    : transcript;

  const canDecide = Boolean(displayText.trim()) && !listening && !resolving;

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-2">
      <div className="space-y-2 text-center">
        <h1 className="text-nameplate text-3xl tracking-tight sm:text-4xl">{title}</h1>
        <p className="text-muted-foreground text-base leading-relaxed">{subtitle}</p>
      </div>

      {!supported.current ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-800 dark:text-amber-200">
          {unsupportedHint}
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={toggleListening}
          disabled={!supported.current || resolving}
          className={cn(
            "relative flex size-28 items-center justify-center rounded-full border transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            listening
              ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_12px] shadow-primary/15"
              : "border-border bg-muted/40 text-foreground hover:bg-muted"
          )}
          aria-pressed={listening}
          aria-label={listening ? listeningLabel : idleLabel}
        >
          {listening ? <Mic className="size-10" /> : <MicOff className="size-10" />}
          {listening ? (
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          ) : null}
        </button>
        <p className="text-sm font-medium">
          {resolving
            ? "Understanding…"
            : listening
              ? listeningLabel
              : displayText.trim()
                ? "Review the transcript, then tap Review or Cancel"
                : idleLabel}
        </p>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={lang === "en-US" ? "default" : "outline"}
            onClick={() => setLang("en-US")}
          >
            EN
          </Button>
          <Button
            type="button"
            size="sm"
            variant={lang === "ur-PK" ? "default" : "outline"}
            onClick={() => setLang("ur-PK")}
          >
            UR
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-muted/30 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Transcript</p>
        <textarea
          className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={displayText}
          onChange={(e) => {
            if (listening) return;
            setInterim("");
            setTranscript(e.target.value);
            setStatusError(null);
          }}
          readOnly={listening}
          placeholder="Speak a command…"
        />
        {statusError ? (
          <p className="text-sm text-destructive">{statusError}</p>
        ) : null}
        <p className="text-xs text-muted-foreground leading-relaxed">{speakTip}</p>

        {canDecide ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="min-w-28"
              onClick={clearTranscript}
              disabled={resolving || saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-w-28"
              onClick={() => void reviewAndOpenConfirm(displayText)}
              disabled={resolving || saving}
            >
              {resolving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Checking…
                </>
              ) : (
                "Review"
              )}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{examplesLabel}</p>
        <div className="flex flex-wrap gap-2">
          {VOICE_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="rounded-full border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              onClick={() => {
                if (listening) return;
                setInterim("");
                setTranscript(example);
                setStatusError(null);
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <VoiceConfirmDialog
        open={confirmOpen}
        draft={draft}
        saving={saving}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setDraft(null);
        }}
        onConfirm={(next) => {
          setDraft(next);
          void saveDraft(next);
        }}
      />
    </div>
  );
}
