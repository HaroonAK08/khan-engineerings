import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resetPin, setupPin, unlockPin, type AuthStatus } from "../lib/banks-api";
import { colors, radius } from "../theme";

type Props = {
  status: AuthStatus;
  onUnlocked: () => void;
};

type Step = "enter" | "confirm" | "reset_factory" | "reset_new";

export function PinScreen({ status, onUnlocked }: Props) {
  const insets = useSafeAreaInsets();
  const [digits, setDigits] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [factoryPin, setFactoryPin] = useState("");
  const [step, setStep] = useState<Step>("enter");
  const [resetting, setResetting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  const title =
    resetting && step === "reset_factory"
      ? "Factory unlock"
      : resetting && step === "reset_new"
        ? "New PIN"
        : status.setupRequired && step === "confirm"
          ? "Confirm PIN"
          : status.setupRequired
            ? "Create PIN"
            : "Welcome back";

  const hint =
    resetting && step === "reset_factory"
      ? "Enter your factory unlock code"
      : resetting && step === "reset_new"
        ? "Choose a new 4-digit PIN"
        : status.setupRequired && step === "confirm"
          ? "Enter the same PIN again"
          : status.setupRequired
            ? "Pick a 4-digit PIN to protect your balances"
            : "Enter your 4-digit PIN";

  async function finishWithPin(
    code: string,
    currentStep: Step,
    currentFirst: string,
    isResetting: boolean,
    factory: string
  ) {
    if (lock.current) return;
    lock.current = true;
    setError("");
    setBusy(true);
    try {
      if (isResetting && currentStep === "reset_new") {
        await resetPin(factory, code);
        setResetting(false);
        setStep("enter");
        setFirstPin("");
        setFactoryPin("");
        setDigits("");
        setError("PIN updated — unlock now");
        return;
      }

      if (status.setupRequired) {
        if (currentStep === "enter") {
          setFirstPin(code);
          setDigits("");
          setStep("confirm");
          return;
        }
        if (code !== currentFirst) {
          setError("PINs don’t match — try again");
          setDigits("");
          setFirstPin("");
          setStep("enter");
          return;
        }
        await setupPin(code);
        onUnlocked();
        return;
      }

      await unlockPin(code);
      onUnlocked();
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
      setDigits("");
      if (status.setupRequired) {
        setFirstPin("");
        setStep("enter");
      }
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  function pressDigit(d: string) {
    if (busy || lock.current) return;
    setError("");
    setDigits((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) {
        const snapStep = step;
        const snapFirst = firstPin;
        const snapReset = resetting;
        const snapFactory = factoryPin;
        setTimeout(() => {
          void finishWithPin(next, snapStep, snapFirst, snapReset, snapFactory);
        }, 50);
      }
      return next;
    });
  }

  function backspace() {
    if (busy || lock.current) return;
    setDigits((p) => p.slice(0, -1));
  }

  function startReset() {
    setResetting(true);
    setStep("reset_factory");
    setDigits("");
    setFirstPin("");
    setFactoryPin("");
    setError("");
  }

  function cancelReset() {
    setResetting(false);
    setStep("enter");
    setDigits("");
    setFactoryPin("");
    setError("");
  }

  async function submitResetFactory() {
    if (factoryPin.length < 4) {
      setError("Enter factory code");
      return;
    }
    setError("");
    setDigits("");
    setStep("reset_new");
  }

  const showPad = !(resetting && step === "reset_factory");

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.badge}>
        <Ionicons name="shield-checkmark" size={22} color={colors.accent} />
      </View>
      <Text style={styles.eyebrow}>PERSONAL BANKS</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>

      {resetting && step === "reset_factory" ? (
        <TextInput
          style={styles.input}
          value={factoryPin}
          onChangeText={(v) => setFactoryPin(v.replace(/\D/g, "").slice(0, 8))}
          placeholder="Factory code"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          autoFocus
        />
      ) : (
        <View style={styles.dots}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.dot, digits.length > i && styles.dotOn]} />
          ))}
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : <View style={styles.errorSlot} />}

      {busy ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 8 }} /> : null}

      {showPad ? (
        <View style={styles.pad}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((key, idx) => (
            <Pressable
              key={`${key}-${idx}`}
              style={({ pressed }) => [
                styles.key,
                !key && styles.keyEmpty,
                pressed && key ? styles.keyPressed : null,
              ]}
              disabled={!key || busy}
              onPress={() => {
                if (key === "⌫") backspace();
                else if (key) pressDigit(key);
              }}
            >
              {key === "⌫" ? (
                <Ionicons name="backspace-outline" size={24} color={colors.text} />
              ) : (
                <Text style={styles.keyText}>{key}</Text>
              )}
            </Pressable>
          ))}
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          onPress={() => void submitResetFactory()}
        >
          <Text style={styles.btnText}>Continue</Text>
        </Pressable>
      )}

      {!status.setupRequired || resetting ? (
        <Pressable onPress={resetting ? cancelReset : startReset} hitSlop={12}>
          <Text style={styles.link}>{resetting ? "Back to unlock" : "Forgot PIN?"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 28,
    alignItems: "center",
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 2.2,
    fontWeight: "700",
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  hint: {
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 22,
    maxWidth: 280,
  },
  dots: { flexDirection: "row", gap: 14, marginBottom: 8, minHeight: 18 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dotOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pad: {
    width: "100%",
    maxWidth: 300,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginTop: 18,
  },
  key: {
    width: 78,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  keyPressed: { backgroundColor: colors.accentSoft, transform: [{ scale: 0.96 }] },
  keyEmpty: { backgroundColor: "transparent", borderColor: "transparent" },
  keyText: { color: colors.text, fontSize: 24, fontWeight: "600" },
  btn: {
    marginTop: 20,
    backgroundColor: colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 15,
    borderRadius: radius.md,
    minWidth: 200,
    alignItems: "center",
  },
  btnPressed: { opacity: 0.9 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  link: { color: colors.accent, marginTop: 28, fontSize: 14, fontWeight: "600" },
  error: { color: colors.danger, textAlign: "center", minHeight: 22, marginBottom: 4 },
  errorSlot: { minHeight: 22, marginBottom: 4 },
  input: {
    width: "100%",
    maxWidth: 280,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 18,
    textAlign: "center",
    letterSpacing: 4,
  },
});
