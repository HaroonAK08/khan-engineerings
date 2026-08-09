export type SpeechLang = "en-US" | "ur-PK";

export type SpeechHandlers = {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onerror: ((ev: Event & { error?: string }) => void) | null;
  onresult: ((ev: Event & {
    resultIndex: number;
    results: ArrayLike<{
      isFinal: boolean;
      0: { transcript: string };
    }>;
  }) => void) | null;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechSupported() {
  return Boolean(getSpeechRecognitionCtor());
}

export class VoiceRecognizer {
  private recognition: BrowserSpeechRecognition | null = null;
  private handlers: SpeechHandlers = {};
  private wantListening = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  lang: SpeechLang = "en-US";

  setHandlers(handlers: SpeechHandlers) {
    this.handlers = handlers;
  }

  setLang(lang: SpeechLang) {
    this.lang = lang;
    if (this.recognition) this.recognition.lang = lang;
  }

  isListening() {
    return this.wantListening;
  }

  start() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.handlers.onError?.(
        "Speech recognition is not supported in this browser. Use Chrome or Edge."
      );
      return false;
    }

    this.clearRestartTimer();
    this.wantListening = true;
    this.handlers.onStart?.();
    return this.beginSession(Ctor);
  }

  stop(silent = false) {
    this.wantListening = false;
    this.clearRestartTimer();
    this.teardownSession();
    if (!silent) this.handlers.onEnd?.();
  }

  private clearRestartTimer() {
    if (this.restartTimer != null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private scheduleRestart() {
    this.clearRestartTimer();
    if (!this.wantListening) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.wantListening) return;
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) return;
      this.beginSession(Ctor);
    }, 200);
  }

  private teardownSession() {
    const rec = this.recognition;
    this.recognition = null;
    if (!rec) return;
    rec.onstart = null;
    rec.onend = null;
    rec.onerror = null;
    rec.onresult = null;
    try {
      rec.stop();
    } catch {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
  }

  private beginSession(Ctor: SpeechRecognitionCtor) {
    this.teardownSession();

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = null;

    recognition.onend = () => {
      this.recognition = null;
      if (this.wantListening) {
        this.scheduleRestart();
      }
    };

    recognition.onerror = (ev) => {
      const code = ev.error || "unknown";
      if (code === "aborted" || code === "no-speech") return;
      if (code === "network") {
        if (this.wantListening) this.scheduleRestart();
        return;
      }
      if (code === "not-allowed") {
        this.wantListening = false;
        this.clearRestartTimer();
        this.handlers.onError?.("Microphone permission denied.");
        this.handlers.onEnd?.();
        return;
      }
      this.handlers.onError?.(`Speech error: ${code}`);
    };

    recognition.onresult = (ev) => {
      let interim = "";
      let finalChunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        const text = result[0]?.transcript || "";
        if (result.isFinal) finalChunk += text;
        else interim += text;
      }
      if (interim.trim()) this.handlers.onInterim?.(interim.trim());
      if (finalChunk.trim()) this.handlers.onFinal?.(finalChunk.trim());
    };

    this.recognition = recognition;
    try {
      recognition.start();
      return true;
    } catch {
      if (this.wantListening) this.scheduleRestart();
      return false;
    }
  }
}
