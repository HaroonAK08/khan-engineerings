"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  parseVoiceCommand,
} from "@/lib/voice/parser";
import {
  pageContextFromPath,
  isSessionPath,
  type VoicePageContext,
} from "@/lib/voice/page-context";
import { resolveVoiceCommand } from "@/lib/voice/resolve";
import { isSpeechSupported, VoiceRecognizer } from "@/lib/voice/speech";
import { isAcceptPhrase, isRejectPhrase } from "@/lib/voice/confirm-phrases";
import type { ResolvedVoiceDraft } from "@/lib/voice/types";
import {
  ensureVoiceModelFresh,
  getVoiceGrammarPhrases,
  loadVoiceModel,
  subscribeVoiceModel,
} from "@/lib/voice/voice-model";
import { createFactoryExpense } from "@/lib/expenses-api";
import {
  apiError,
  createPurchase,
  createSupplier,
  recordPayment,
  withSameDayConfirm,
} from "@/lib/materials-api";
import {
  createSalesman,
  recordCustomerPayment,
} from "@/lib/sales-api";
import { createWorker } from "@/lib/workers-api";
import { todayInput } from "@/lib/date-range";
import { isAlwaysCommonExpenseCategory } from "@/hooks/use-persisted-expense-scope";
import {
  VOICE_BUILTY_ADD_EVENT,
  VOICE_BUILTY_PENDING_KEY,
  VOICE_PRODUCE_ADD_EVENT,
  VOICE_PRODUCE_PENDING_KEY,
  VOICE_SALARY_PAY_EVENT,
  VOICE_SALARY_PAY_PENDING_KEY,
  isSalaryPagePath,
  type VoiceBuiltyFormPayload,
  type VoiceProduceFormPayload,
  type VoiceSalaryPayPayload,
} from "@/lib/voice/produce-bridge";

type Options = {
  unsupportedHint: string;
  onSaved?: (draft: ResolvedVoiceDraft) => void;
};

function isProduceFormPath(pathname: string | null) {
  return pathname === "/dashboard/production/new";
}

function isBuiltyFormPath(pathname: string | null) {
  if (!pathname) return false;
  if (pathname === "/dashboard/builty/new") return true;
  return /^\/dashboard\/builty\/[^/]+\/edit$/.test(pathname);
}

function isDirectPageIntent(
  intent: ResolvedVoiceDraft["intent"],
  ctx: VoicePageContext
) {
  if (intent === "produce" || intent === "builty") return true;
  if (intent === "expense" && ctx === "expense") return true;
  if (
    intent === "add_supplier" ||
    intent === "add_salesman" ||
    intent === "add_worker" ||
    intent === "salary_pay"
  ) {
    return true;
  }
  if (intent === "purchase" && ctx === "supplier") return true;
  if (intent === "supplier_payment" && ctx === "supplier") return true;
  return false;
}

function isContinuousIntent(intent: ResolvedVoiceDraft["intent"]) {
  return (
    intent === "produce" ||
    intent === "builty" ||
    intent === "expense" ||
    intent === "add_supplier" ||
    intent === "add_salesman" ||
    intent === "add_worker" ||
    intent === "salary_pay" ||
    intent === "purchase" ||
    intent === "supplier_payment"
  );
}

export function useVoiceEntry({ unsupportedHint, onSaved }: Options) {
  const router = useRouter();
  const pathname = usePathname();
  const pageContext = pageContextFromPath(pathname);
  const pageContextRef = useRef(pageContext);
  const supported = useRef(false);
  const recognizer = useRef<VoiceRecognizer | null>(null);
  const confirmOpenRef = useRef(false);
  const processingRef = useRef(false);
  const savingRef = useRef(false);
  const transcriptRef = useRef("");
  const interimRef = useRef("");

  const [ready, setReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [draft, setDraft] = useState<ResolvedVoiceDraft | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);

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
    voice.setLang("en-US");
    voice.setGrammarPhrases(getVoiceGrammarPhrases());

    const unsub = subscribeVoiceModel((model) => {
      voice.setGrammarPhrases(model?.phrases || getVoiceGrammarPhrases());
    });

    void ensureVoiceModelFresh()
      .then((model) => {
        voice.setGrammarPhrases(model.phrases);
      })
      .catch(() => {
        const cached = loadVoiceModel();
        if (cached) voice.setGrammarPhrases(cached.phrases);
      });

    return () => {
      unsub();
      voice.stop(true);
      recognizer.current = null;
    };
  }, []);

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
      const keepGoing = isSessionPath(href);
      if (keepGoing) {
        setPanelOpen(true);
        router.push(href);
      } else {
        setPanelOpen(false);
        router.push(href);
      }
    },
    [clearTranscript, router]
  );

  const applyProduceToForm = useCallback(
    async (resolved: ResolvedVoiceDraft) => {
      const items =
        resolved.items?.length
          ? resolved.items
          : resolved.selectedProductId && resolved.quantity
            ? [
                {
                  selectedProductId: resolved.selectedProductId,
                  quantity: Number(resolved.quantity),
                  materialType: resolved.materialType,
                },
              ]
            : [];

      const detail: VoiceProduceFormPayload = {
        productionDate: resolved.productionDate,
        items: items
          .filter((line) => line.selectedProductId)
          .map((line) => ({
            productId: line.selectedProductId!,
            quantity: Math.round(Number(line.quantity)),
            materialType: line.materialType || resolved.materialType,
            productionDate: resolved.productionDate,
          })),
      };

      if (!detail.items.length && !detail.productionDate) {
        toast.error("No product matched. Try again.");
        return false;
      }

      if (isProduceFormPath(pathname)) {
        window.dispatchEvent(
          new CustomEvent(VOICE_PRODUCE_ADD_EVENT, { detail })
        );
        toast.success(
          detail.items.length > 1
            ? `Added ${detail.items.length} products — tap mic to add more`
            : detail.items.length
              ? `Added — tap mic to add more`
              : detail.productionDate
                ? `Date set to ${detail.productionDate}`
                : "Updated"
        );
      } else {
        try {
          sessionStorage.setItem(
            VOICE_PRODUCE_PENDING_KEY,
            JSON.stringify(detail)
          );
        } catch {
          /* ignore */
        }
        toast.success("Opening produce form…");
        router.push("/dashboard/production/new");
      }

      clearTranscript();
      setPanelOpen(true);
      onSaved?.(resolved);
      // Mic stays off until user taps it again
      return true;
    },
    [clearTranscript, onSaved, pathname, router]
  );

  const applyBuiltyToForm = useCallback(
    async (resolved: ResolvedVoiceDraft) => {
      const items =
        resolved.items?.length
          ? resolved.items
          : resolved.selectedProductId && resolved.quantity
            ? [
                {
                  selectedProductId: resolved.selectedProductId,
                  quantity: Number(resolved.quantity),
                  rate: resolved.rate,
                  amount: resolved.amount,
                  pricingMode: resolved.pricingMode,
                  quantityExplicit: true as boolean | undefined,
                },
              ]
            : [];

      const detail: VoiceBuiltyFormPayload = {
        customerId: resolved.selectedCustomerId,
        customerQuery: resolved.customerMatches?.[0]?.label,
        builtyNo: resolved.builtyNo,
        billNo: resolved.billNo,
        builtyDate: resolved.builtyDate,
        rateOnly:
          resolved.pricingMode !== "fixed" &&
          resolved.rate != null &&
          !items.length
            ? Number(resolved.rate)
            : undefined,
        fixedOnly:
          resolved.pricingMode === "fixed" &&
          resolved.amount != null &&
          !items.length
            ? Number(resolved.amount)
            : undefined,
        items: items
          .filter((line) => line.selectedProductId)
          .map((line) => ({
            productId: line.selectedProductId!,
            quantity: Math.round(Number(line.quantity)),
            rate: line.rate,
            amount: line.amount,
            pricingMode: line.pricingMode || "rate_kg",
            quantityExplicit:
              "quantityExplicit" in line ? line.quantityExplicit : true,
          })),
      };

      if (
        !detail.items.length &&
        !detail.customerId &&
        !detail.builtyNo &&
        !detail.builtyDate &&
        detail.rateOnly == null &&
        detail.fixedOnly == null
      ) {
        toast.error("Could not match customer, products, rate, fixed price, or date.");
        return false;
      }

      if (isBuiltyFormPath(pathname)) {
        window.dispatchEvent(
          new CustomEvent(VOICE_BUILTY_ADD_EVENT, { detail })
        );
        const bits: string[] = [];
        if (detail.customerId) bits.push("customer set");
        if (detail.items.length) bits.push(`${detail.items.length} product(s) updated`);
        if (detail.rateOnly != null) bits.push(`rate ${detail.rateOnly}/kg`);
        if (detail.fixedOnly != null) bits.push(`fixed ${detail.fixedOnly}`);
        if (detail.builtyNo) bits.push(`builty no ${detail.builtyNo}`);
        if (detail.builtyDate) bits.push(`date ${detail.builtyDate}`);
        toast.success(
          bits.length
            ? `${bits.join(" · ")} — tap mic to add more`
            : "Updated builty form"
        );
      } else {
        try {
          sessionStorage.setItem(
            VOICE_BUILTY_PENDING_KEY,
            JSON.stringify(detail)
          );
        } catch {
          /* ignore */
        }
        const qs = detail.customerId
          ? `?customer=${encodeURIComponent(detail.customerId)}`
          : "";
        toast.success("Opening builty form…");
        router.push(`/dashboard/builty/new${qs}`);
      }

      clearTranscript();
      setPanelOpen(true);
      onSaved?.(resolved);
      return true;
    },
    [clearTranscript, onSaved, pathname, router]
  );

  const finishDirect = useCallback(
    (resolved: ResolvedVoiceDraft, message: string) => {
      toast.success(message);
      clearTranscript();
      setPanelOpen(true);
      onSaved?.(resolved);
    },
    [clearTranscript, onSaved]
  );

  const applyDirectIntent = useCallback(
    async (resolved: ResolvedVoiceDraft) => {
      switch (resolved.intent) {
        case "produce":
          return applyProduceToForm(resolved);
        case "builty":
          return applyBuiltyToForm(resolved);
        case "expense": {
          const category = resolved.category || "other";
          const { cancelled } = await withSameDayConfirm((confirmDuplicate) =>
            createFactoryExpense({
              category,
              amount: Number(resolved.amount),
              expenseDate: resolved.expenseDate || todayInput(),
              title:
                category === "other"
                  ? resolved.title?.trim() || undefined
                  : undefined,
              notes: resolved.notes?.trim() || undefined,
              scope: isAlwaysCommonExpenseCategory(category)
                ? "common"
                : resolved.scope || "common",
              confirmDuplicate,
            })
          );
          if (cancelled) return false;
          finishDirect(resolved, "Expense added");
          return true;
        }
        case "add_supplier": {
          const name = resolved.title?.trim();
          if (!name) {
            toast.error("Could not find supplier name.");
            return false;
          }
          const phone = resolved.notes?.replace(/^phone\s+/i, "").trim();
          await createSupplier({
            name,
            phone: phone || undefined,
            isActive: true,
          });
          finishDirect(resolved, `Supplier “${name}” added`);
          return true;
        }
        case "add_salesman": {
          const name = resolved.title?.trim();
          if (!name) {
            toast.error("Could not find salesman name.");
            return false;
          }
          const phone = resolved.notes?.replace(/^phone\s+/i, "").trim();
          await createSalesman({
            name,
            phone: phone || undefined,
            isActive: true,
          });
          finishDirect(resolved, `Salesman “${name}” added`);
          return true;
        }
        case "add_worker": {
          const name = resolved.title?.trim();
          if (!name) {
            toast.error("Could not find worker name.");
            return false;
          }
          await createWorker({ name, scope: "common" });
          finishDirect(resolved, `Worker “${name}” added`);
          return true;
        }
        case "salary_pay": {
          if (!resolved.selectedCustomerId || !resolved.amount) {
            toast.error("Could not match worker or amount.");
            return false;
          }
          const detail: VoiceSalaryPayPayload = {
            workerId: resolved.selectedCustomerId,
            workerName: resolved.customerMatches?.[0]?.label,
            amount: Number(resolved.amount),
            expenseDate: resolved.paymentDate || todayInput(),
            notes: resolved.notes?.trim() || undefined,
          };

          if (isSalaryPagePath(pathname)) {
            window.dispatchEvent(
              new CustomEvent(VOICE_SALARY_PAY_EVENT, { detail })
            );
            finishDirect(
              resolved,
              `Opened pay for ${detail.workerName || "worker"} — ${detail.amount}`
            );
            return true;
          }

          try {
            sessionStorage.setItem(
              VOICE_SALARY_PAY_PENDING_KEY,
              JSON.stringify(detail)
            );
          } catch {
            /* ignore */
          }
          toast.success("Opening salaries…");
          router.push("/dashboard/expenses/salaries");
          finishDirect(resolved, "Opening pay form");
          return true;
        }
        default:
          return false;
      }
    },
    [applyBuiltyToForm, applyProduceToForm, finishDirect, pathname, router]
  );

  const reviewAndOpenConfirm = useCallback(
    async (text: string) => {
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
        const parsed = parseVoiceCommand(cleaned, {
          pageContext: pageContextRef.current,
          pathname,
        });
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

        if (isDirectPageIntent(resolved.intent, pageContextRef.current)) {
          await applyDirectIntent(resolved);
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
    },
    [applyDirectIntent, goNavigate, pathname]
  );

  const appendFinalSpeech = useCallback(
    (text: string) => {
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

      // Keep listening — only accumulate transcript until user taps mic off
      const next = transcriptRef.current
        ? `${transcriptRef.current} ${cleaned}`.replace(/\s+/g, " ").trim()
        : cleaned;
      setTranscript(next);
      setInterim("");
      setStatusError(null);
      setPanelOpen(true);
    },
    []
  );

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
      onStart: () => {
        setListening(true);
        setPanelOpen(true);
      },
      onEnd: () => setListening(false),
    });
  }, [appendFinalSpeech, ready]);

  const saveDraft = useCallback(
    async (current: ResolvedVoiceDraft) => {
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
                title:
                  category === "other"
                    ? current.title?.trim() || undefined
                    : undefined,
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
            const ok = await applyDirectIntent(current);
            if (!ok) return;
            return;
          }
          case "builty": {
            const ok = await applyDirectIntent(current);
            if (!ok) return;
            return;
          }
          case "add_supplier":
          case "add_salesman":
          case "add_worker":
          case "salary_pay": {
            const ok = await applyDirectIntent(current);
            if (!ok) return;
            return;
          }
        }

        const keepSession =
          isContinuousIntent(current.intent) || isSessionPath(pathname);
        clearTranscript();
        setPanelOpen(keepSession || panelOpen);
        onSaved?.(current);
      } catch (err) {
        toast.error(apiError(err, "Failed to save entry"));
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [applyDirectIntent, clearTranscript, goNavigate, onSaved, panelOpen, pathname]
  );

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

  const stopListening = useCallback(() => {
    recognizer.current?.stop(true);
    setListening(false);
    setInterim("");
  }, []);

  const toggleListening = useCallback(() => {
    if (!supported.current) {
      toast.error(unsupportedHint);
      return;
    }
    const voice = recognizer.current;
    if (!voice) return;
    if (voice.isListening() || listening) {
      // Mic off → stop listening, then run whatever was spoken
      voice.stop();
      setListening(false);
      const merged = flushInterimIntoTranscript();
      if (merged.trim()) {
        void reviewAndOpenConfirm(merged);
      }
      return;
    }
    setStatusError(null);
    setPanelOpen(true);
    const started = voice.start();
    if (started) setListening(true);
  }, [
    flushInterimIntoTranscript,
    listening,
    reviewAndOpenConfirm,
    unsupportedHint,
  ]);

  const displayText = interim
    ? transcript
      ? `${transcript} ${interim}`
      : interim
    : transcript;

  const canDecide = Boolean(displayText.trim()) && !listening && !resolving;

  return {
    ready,
    supported: supported.current,
    listening,
    resolving,
    saving,
    draft,
    confirmOpen,
    setConfirmOpen,
    setDraft,
    statusError,
    setStatusError,
    displayText,
    transcript,
    setTranscript,
    setInterim,
    canDecide,
    panelOpen,
    setPanelOpen,
    clearTranscript,
    toggleListening,
    stopListening,
    reviewAndOpenConfirm,
    saveDraft,
    pageContext,
  };
}
