"use client";

import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VOICE_EXAMPLES, parseVoiceCommand } from "@/lib/voice/parser";
import { VoiceConfirmDialog } from "@/components/voice/voice-confirm-dialog";
import { useVoiceEntry } from "@/hooks/use-voice-entry";

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
  const voice = useVoiceEntry({ unsupportedHint });

  if (!voice.ready) {
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

      {!voice.supported ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-800 dark:text-amber-200">
          {unsupportedHint}
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={voice.toggleListening}
          disabled={!voice.supported || voice.resolving}
          className={cn(
            "relative flex size-28 items-center justify-center rounded-full border transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            voice.listening
              ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_12px] shadow-primary/15"
              : "border-border bg-muted/40 text-foreground hover:bg-muted"
          )}
          aria-pressed={voice.listening}
          aria-label={voice.listening ? listeningLabel : idleLabel}
        >
          {voice.listening ? <Mic className="size-10" /> : <MicOff className="size-10" />}
          {voice.listening ? (
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          ) : null}
        </button>
        <p className="text-sm font-medium">
          {voice.resolving
            ? "Understanding…"
            : voice.listening
              ? listeningLabel
              : voice.displayText.trim()
                ? "Review the transcript, then tap Review or Cancel"
                : idleLabel}
        </p>
      </div>

      <div className="space-y-3 rounded-xl border bg-muted/30 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Transcript</p>
        <textarea
          className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-base leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          value={voice.displayText}
          onChange={(e) => {
            if (voice.listening) return;
            voice.setInterim("");
            voice.setTranscript(e.target.value);
            voice.setStatusError(null);
          }}
          readOnly={voice.listening}
          placeholder="Speak a command…"
        />
        {voice.statusError ? (
          <p className="text-sm text-destructive">{voice.statusError}</p>
        ) : null}
        <p className="text-xs text-muted-foreground leading-relaxed">{speakTip}</p>

        {voice.canDecide ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="min-w-28"
              onClick={voice.clearTranscript}
              disabled={voice.resolving || voice.saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-w-28"
              onClick={() => void voice.reviewAndOpenConfirm(voice.displayText)}
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
                if (voice.listening) return;
                voice.setInterim("");
                voice.setTranscript(example);
                voice.setStatusError(null);
                const parsed = parseVoiceCommand(example);
                if (parsed.intent === "navigate" && !parsed.error) {
                  void voice.reviewAndOpenConfirm(example);
                }
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

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
    </div>
  );
}
