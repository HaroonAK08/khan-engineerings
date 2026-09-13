import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { formatMoney } from "../lib/api";
import type { RootStackParamList } from "../navigation/types";
import { colors, radius } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Send">;

export function SendScreen({ navigation, route }: Props) {
  const presetId = route.params?.accountId;
  const presetRecipient = route.params?.recipient || "";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [accountId, setAccountId] = useState(presetId || "");
  const [recipient, setRecipient] = useState(presetRecipient);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [rows, known] = await Promise.all([listAccounts(), listPeople()]);
        setAccounts(rows);
        setPeople(known);
        if (!presetId && rows[0]) setAccountId(rows[0]._id);
      } catch (err: any) {
        Alert.alert("Error", err?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [presetId]);

  const selected = accounts.find((a) => a._id === accountId);

  const suggestions = useMemo(() => {
    const q = recipient.trim().toLowerCase();
    if (!q) return people.slice(0, 8);
    return people
      .filter((p) => p.name.toLowerCase().includes(q) && p.name.toLowerCase() !== q)
      .slice(0, 8);
  }, [people, recipient]);

  async function onSend() {
    const n = Number(amount);
    if (!accountId) return Alert.alert("Select an account");
    if (!recipient.trim()) return Alert.alert("Enter recipient name");
    if (!(n > 0)) return Alert.alert("Enter amount");
    setBusy(true);
    try {
      await sendMoney({
        account: accountId,
        amount: n,
        recipient: recipient.trim(),
        notes: notes.trim() || undefined,
      });
      Alert.alert("Sent", `${formatMoney(n)} to ${recipient.trim()}`, [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Send failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.intro}>
        <View style={styles.introIcon}>
          <Ionicons name="paper-plane" size={22} color={colors.blue} />
        </View>
        <Text style={styles.introText}>
          Deduct from an account — past people appear as you type
        </Text>
      </View>

      <Text style={styles.label}>From account</Text>
      <View style={styles.list}>
        {accounts.map((a) => {
          const bankName = typeof a.bank === "object" ? a.bank.name : "";
          const active = a._id === accountId;
          return (
            <Pressable
              key={a._id}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipOn,
                pressed && styles.pressed,
              ]}
              onPress={() => setAccountId(a._id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.chipText, active && styles.chipTextOn]}>
                  {bankName ? `${bankName} · ` : ""}
                  {a.name}
                </Text>
              </View>
              <Text style={[styles.chipBal, active && styles.chipTextOn]}>
                {formatMoney(a.balance)}
              </Text>
              {active ? (
                <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginLeft: 8 }} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Send to</Text>
      <TextInput
        style={styles.input}
        placeholder="Type a name (e.g. Ahmad)"
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
        <View style={styles.suggestBox}>
          {suggestions.map((p) => (
            <Pressable
              key={p.name}
              style={({ pressed }) => [styles.suggestRow, pressed && styles.pressed]}
              onPress={() => {
                setRecipient(p.name);
                setShowSuggestions(false);
              }}
            >
              <View style={styles.suggestAvatar}>
                <Text style={styles.suggestInitial}>{p.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestName}>{p.name}</Text>
                <Text style={styles.suggestMeta}>
                  {p.count} {p.count === 1 ? "send" : "sends"} · {formatMoney(p.totalSent)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {!recipient && people.length > 0 && !showSuggestions ? (
        <Pressable onPress={() => setShowSuggestions(true)}>
          <Text style={styles.recentLink}>Show recent people</Text>
        </Pressable>
      ) : null}

      <Text style={styles.label}>Amount</Text>
      <TextInput
        style={styles.input}
        placeholder="0"
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
        onFocus={() => setShowSuggestions(false)}
      />

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="Reason"
        placeholderTextColor={colors.muted}
        value={notes}
        onChangeText={setNotes}
        onFocus={() => setShowSuggestions(false)}
      />

      {selected ? (
        <Text style={styles.hint}>Available: {formatMoney(selected.balance)}</Text>
      ) : null}

      <Pressable
        style={({ pressed }) => [styles.btn, (busy || pressed) && styles.pressed]}
        disabled={busy}
        onPress={() => void onSend()}
      >
        <Ionicons name="send" size={18} color="#fff" />
        <Text style={styles.btnText}>{busy ? "Sending…" : "Send & deduct"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  center: { justifyContent: "center", alignItems: "center" },
  intro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.blueSoft,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 8,
  },
  introIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  introText: { flex: 1, color: colors.blue, fontWeight: "600", fontSize: 13, lineHeight: 18 },
  label: {
    color: colors.textSecondary,
    marginBottom: 8,
    marginTop: 14,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  list: { gap: 8, marginBottom: 4 },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: "600" },
  chipTextOn: { color: "#fff", fontWeight: "700" },
  chipBal: { color: colors.muted, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 16,
  },
  suggestBox: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestInitial: { color: colors.blue, fontWeight: "800", fontSize: 15 },
  suggestName: { color: colors.text, fontWeight: "700", fontSize: 15 },
  suggestMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  recentLink: { color: colors.accent, fontWeight: "600", marginTop: 8, fontSize: 13 },
  hint: { color: colors.muted, marginTop: 12, fontWeight: "500" },
  btn: {
    marginTop: 28,
    backgroundColor: colors.blue,
    padding: 16,
    borderRadius: radius.lg,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  pressed: { opacity: 0.88 },
});
