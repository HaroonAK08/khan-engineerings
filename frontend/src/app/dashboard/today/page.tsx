"use client";

import { VoiceEntryPanel } from "@/components/voice/voice-entry-panel";
import { useI18n } from "@/hooks/use-i18n";

export default function VoiceEntryPage() {
  const { t } = useI18n();

  return (
    <VoiceEntryPanel
      title={t("voice.title")}
      subtitle={t("voice.subtitle")}
      unsupportedHint={t("voice.unsupported")}
      listeningLabel={t("voice.listening")}
      idleLabel={t("voice.idle")}
      examplesLabel={t("voice.examples")}
      speakTip={t("voice.speakTip")}
    />
  );
}
