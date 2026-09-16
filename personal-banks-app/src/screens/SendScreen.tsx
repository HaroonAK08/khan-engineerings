import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  listAccounts,
  listPeople,
  sendMoney,
  type Account,
  type Person,
} from "../lib/banks-api";
import { formatMoney, isOfflineError } from "../lib/api";
import { hapticSuccess } from "../lib/haptics";
import { AmountChips } from "../components/AmountChips";
import { ListSkeleton } from "../components/Skeleton";
import { StateView } from "../components/StateView";
import { useNotify } from "../components/Notify";
import { useKeyboardHeight } from "../hooks/useKeyboardHeight";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import { radius, type } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Send">;

export function SendScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const notify = useNotify();
  const keyboardH = useKeyboardHeight();
  const presetId = route.params?.accountId;
  const presetRecipient = route.params?.recipient || "";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [accountId, setAccountId] = useState(presetId || "");
  const [recipient, setRecipient] = useState(presetRecipient);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rows, known] = await Promise.all([listAccounts(), listPeople()]);
      setAccounts(rows);
      setPeople(known);
      if (!presetId && rows[0]) setAccountId(rows[0]._id);
      else if (presetId) setAccountId(presetId);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [presetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = accounts.find((a) => a._id === accountId);

  const suggestions = useMemo(() => {
    const q = recipient.trim().toLowerCase();
    if (!q) return people.slice(0, 8);
    return people
      .filter((p) => p.name.toLowerCase().includes(q) && p.name.toLowerCase() !== q)
      .slice(0, 8);
  }, [people, recipient]);

  function goConfirm() {
    const n = Number(amount);
    if (!accountId) return notify.info("Select an account");
    if (!recipient.trim()) return notify.info("Enter who you paid");
    if (!(n > 0)) return notify.info("Enter an amount");
    if (selected && n > selected.balance) {
      return notify.info("Not enough balance", `Available ${formatMoney(selected.balance)}`);
    }
    setShowSuggestions(false);
    setStep("confirm");
  }

  async function onSend() {
    if (busy) return;
    const n = Number(amount);
    if (!accountId || !(n > 0) || !recipient.trim()) return;
    setBusy(true);
    try {
      await sendMoney({
        account: accountId,
        amount: n,
        recipient: recipient.trim(),
        notes: notes.trim() || undefined,
      });
      hapticSuccess();
      notify.success("Paid", `${formatMoney(n)} → ${recipient.trim()}`);
      navigation.goBack();
    } catch (err: any) {
      notify.error("Payment failed", err?.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg, padding: 20 }]}>
        <ListSkeleton rows={5} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <StateView
          kind={isOfflineError(loadError) ? "offline" : "error"}
          title={isOfflineError(loadError) ? "You’re offline" : "Couldn’t load"}
          message={isOfflineError(loadError) ? "Check your connection and try again." : String((loadError as Error)?.message || "Something went wrong")}
          onRetry={() => void load()}
        />
      </View>
    );
  }

  const bankName =
    selected && typeof selected.bank === "object" ? selected.bank.name : "";

  if (step === "confirm") {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.intro, { backgroundColor: colors.blueSoft }]}>
            <View style={[styles.introIcon, { backgroundColor: colors.surface }]}>
              <Ionicons name="checkmark-done" size={22} color={colors.blue} />
            </View>
            <Text style={[styles.introText, { color: colors.blue }]}>
              Confirm this payment before money is deducted.
            </Text>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[type.label, { color: colors.muted }]}>Amount</Text>
            <Text style={[type.hero, { color: colors.text, fontSize: 32, marginTop: 4 }]}>
              {formatMoney(Number(amount) || 0)}
            </Text>

            <View style={styles.summaryRow}>
              <Text style={[type.meta, { color: colors.muted }]}>From</Text>
              <Text style={[type.body, { color: colors.text, fontWeight: "700", textAlign: "right", flex: 1 }]}>
                {bankName ? `${bankName} · ` : ""}
                {selected?.name || "—"}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[type.meta, { color: colors.muted }]}>Payee</Text>
              <Text style={[type.body, { color: colors.text, fontWeight: "700", textAlign: "right", flex: 1 }]}>
                {recipient.trim()}
              </Text>
            </View>
            {notes.trim() ? (
              <View style={styles.summaryRow}>
                <Text style={[type.meta, { color: colors.muted }]}>Notes</Text>
                <Text style={[type.body, { color: colors.textSecondary, textAlign: "right", flex: 1 }]}>
                  {notes.trim()}
                </Text>
              </View>
            ) : null}
            <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
              <Text style={[type.meta, { color: colors.muted }]}>Available</Text>
              <Text style={[type.body, { color: colors.accent, fontWeight: "700" }]}>
                {formatMoney(selected?.balance || 0)}
              </Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: colors.blue, opacity: busy || pressed ? 0.88 : 1 },
            ]}
            disabled={busy}
            onPress={() => void onSend()}
          >
            <Ionicons name="send" size={18} color="#fff" />
            <Text style={styles.btnText}>{busy ? "Paying…" : "Confirm pay"}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.backBtn, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
            disabled={busy}
            onPress={() => setStep("form")}
          >
            <Text style={[type.body, { color: colors.textSecondary, fontWeight: "700" }]}>Back</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + (Platform.OS === "android" ? keyboardH : 0) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.intro, { backgroundColor: colors.blueSoft }]}>
          <View style={[styles.introIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="paper-plane" size={22} color={colors.blue} />
          </View>
          <Text style={[styles.introText, { color: colors.blue }]}>
            Pay anyone or anything — person, rent, petrol, shop. Past payees appear as you type.
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>From account</Text>
        <View style={styles.list}>
          {accounts.map((a) => {
            const bn = typeof a.bank === "object" ? a.bank.name : "";
            const active = a._id === accountId;
            return (
              <Pressable
                key={a._id}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                    opacity: pressed ? 0.88 : 1,
                  },
                ]}
                onPress={() => setAccountId(a._id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.chipText, { color: active ? "#fff" : colors.text }]}>
                    {bn ? `${bn} · ` : ""}
                    {a.name}
                  </Text>
                </View>
                <Text style={[styles.chipBal, { color: active ? "#fff" : colors.muted }]}>
                  {formatMoney(a.balance)}
                </Text>
                {active ? (
                  <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginLeft: 8 }} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Paid to</Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          ]}
          placeholder="e.g. Ahmad, Rent, Petrol, Utility"
          placeholderTextColor={colors.muted}
          value={recipient}
          onChangeText={(v) => {
            setRecipient(v);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          autoCorrect={false}
        />

        {showSuggestions && suggestions.length > 0 ? (
          <View
            style={[
              styles.suggestBox,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {suggestions.map((p) => (
              <Pressable
                key={p.name}
                style={({ pressed }) => [
                  styles.suggestRow,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.88 : 1 },
                ]}
                onPress={() => {
                  setRecipient(p.name);
                  setShowSuggestions(false);
                }}
              >
                <View style={[styles.suggestAvatar, { backgroundColor: colors.blueSoft }]}>
                  <Text style={[styles.suggestInitial, { color: colors.blue }]}>
                    {p.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.suggestName, { color: colors.text }]}>{p.name}</Text>
                  <Text style={[styles.suggestMeta, { color: colors.muted }]}>
                    {p.count} {p.count === 1 ? "payment" : "payments"} · {formatMoney(p.totalSent)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {!recipient && people.length > 0 && !showSuggestions ? (
          <Pressable onPress={() => setShowSuggestions(true)}>
            <Text style={[styles.recentLink, { color: colors.accent }]}>Show recent payees</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.label, { color: colors.textSecondary }]}>Amount</Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          ]}
          placeholder="0"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          onFocus={() => setShowSuggestions(false)}
        />
        <AmountChips value={amount} onChange={setAmount} />

        <Text style={[styles.label, { color: colors.textSecondary }]}>Notes (optional)</Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface },
          ]}
          placeholder="Reason"
          placeholderTextColor={colors.muted}
          value={notes}
          onChangeText={setNotes}
          onFocus={() => setShowSuggestions(false)}
        />

        {selected ? (
          <Text style={[styles.hint, { color: colors.muted }]}>
            Available: {formatMoney(selected.balance)}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.blue, opacity: pressed ? 0.88 : 1 },
          ]}
          onPress={goConfirm}
        >
          <Ionicons name="arrow-forward" size={18} color="#fff" />
          <Text style={styles.btnText}>Review payment</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  intro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 8,
  },
  introIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  introText: { flex: 1, fontWeight: "600", fontSize: 13, lineHeight: 18 },
  label: {
    marginBottom: 8,
    marginTop: 14,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  list: { gap: 8, marginBottom: 4 },
  chip: {
    borderRadius: radius.md,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
  chipText: { fontWeight: "600" },
  chipBal: { fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 16,
  },
  suggestBox: {
    marginTop: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  suggestAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestInitial: { fontWeight: "800", fontSize: 15 },
  suggestName: { fontWeight: "700", fontSize: 15 },
  suggestMeta: { fontSize: 12, marginTop: 2 },
  recentLink: { fontWeight: "600", marginTop: 8, fontSize: 13 },
  hint: { marginTop: 12, fontWeight: "500" },
  btn: {
    marginTop: 28,
    padding: 16,
    borderRadius: radius.lg,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  backBtn: {
    marginTop: 12,
    padding: 14,
    borderRadius: radius.lg,
    alignItems: "center",
    borderWidth: 1,
  },
  summaryCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 18,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(148,163,184,0.35)",
    marginTop: 4,
  },
});
