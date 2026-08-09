"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic, MicOff, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useVoiceEntry } from "@/hooks/use-voice-entry";
import { VoiceConfirmDialog } from "@/components/voice/voice-confirm-dialog";
import { isSpeechSupported } from "@/lib/voice/speech";
import { voiceTipForContext } from "@/lib/voice/page-context";
import { ensureVoiceModelFresh } from "@/lib/voice/voice-model";
import { useI18n } from "@/hooks/use-i18n";

const UNSUPPORTED =
  "Voice needs Chrome or Edge with microphone permission.";

export function VoiceHeaderControl() {
  const router = useRouter();
  const { t } = useI18n();
  const voice = useVoiceEntry({
    unsupportedHint: UNSUPPORTED,
    onSaved: () => router.refresh(),
  });

  useEffect(() => {
    void ensureVoiceModelFresh().catch(() => undefined);
  }, []);

  if (!voice.ready) return null;

  const startOrToggle = () => {
    if (!isSpeechSupported()) {
      toast.error(UNSUPPORTED);
      return;
    }
    if (!voice.panelOpen) {
      voice.setPanelOpen(true);
      if (!voice.listening) voice.toggleListening();
    } else {
      voice.toggleListening();
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={startOrToggle}
              disabled={voice.resolving}
              className={cn(
                "relative flex size-10 items-center justify-center rounded-full border-2 shadow-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70",
                voice.listening
                  ? "border-red-400 bg-red-500 text-white shadow-red-500/30"
                  : "border-amber-300 bg-amber-500 text-amber-950 hover:bg-amber-400 hover:shadow-amber-500/40"
              )}
              aria-label={
                voice.listening ? t("voice.listening") : t("nav.voice")
              }
              aria-pressed={voice.listening}
            >
              {voice.listening ? (
                <Mic className="size-5" />
              ) : (
                <MicOff className="size-5" />
              )}
              {voice.listening ? (
                <span className="absolute inset-0 animate-ping rounded-full bg-red-400/40" />
              ) : null}
            </button>
          }
        />
        <TooltipContent>
          {voice.listening ? t("voice.listening") : t("nav.voice")}
        </TooltipContent>
      </Tooltip>

      {voice.panelOpen ? (
        <div className="fixed top-[5.25rem] right-3 z-50 w-[min(92vw,24rem)] rounded-2xl border border-amber-500/30 bg-background p-4 shadow-xl sm:right-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                {voice.pageContext
                  ? `${voice.pageContext[0].toUpperCase()}${voice.pageContext.slice(1)} session`
                  : "Voice create"}
              </p>
              <p className="text-xs text-muted-foreground">
                {voiceTipForContext(voice.pageContext)}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close voice panel"
              onClick={() => {
                voice.stopListening();
                voice.clearTranscript();
                voice.setPanelOpen(false);
              }}
            >
              <X className="size-4" />
            </button>
          </div>

          <textarea
            className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={voice.displayText}
            onChange={(e) => {
              if (voice.listening) return;
              voice.setInterim("");
              voice.setTranscript(e.target.value);
              voice.setStatusError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
              }
            }}
            readOnly={voice.listening}
            placeholder="Speak, then tap the mic again to apply…"
          />
          {voice.statusError ? (
            <p className="mt-2 text-sm text-destructive">{voice.statusError}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className={cn(
                "gap-2",
                voice.listening
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-amber-500 text-amber-950 hover:bg-amber-400"
              )}
              onClick={voice.toggleListening}
              disabled={!voice.supported || voice.resolving}
            >
              {voice.listening ? (
                <Mic className="size-4" />
              ) : (
                <MicOff className="size-4" />
              )}
              {voice.listening ? "Listening…" : "Speak"}
            </Button>
            {voice.canDecide ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={voice.clearTranscript}
                  disabled={voice.resolving || voice.saving}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    void voice.reviewAndOpenConfirm(voice.displayText)
                  }
                  disabled={voice.resolving || voice.saving}
                >
                  {voice.resolving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Checking…
                    </>
                  ) : (
                    "Review"
                  )}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <VoiceConfirmDialog
        open={voice.confirmOpen}
        draft={voice.draft}
        saving={voice.saving}
        onOpenChange={(open) => {
          voice.setConfirmOpen(open);
          if (!open) voice.setDraft(null);
        }}
        onConfirm={(next) => {
          voice.setDraft(next);
          void voice.saveDraft(next);
        }}
      />
    </>
  );
}
