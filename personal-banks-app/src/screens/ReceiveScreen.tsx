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
  createAccount,
  createBank,
  deposit,
  listAccounts,
  listBanks,
  listPeople,
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

type Props = NativeStackScreenProps<RootStackParamList, "Receive">;

const CASH = "cash";

function isCashBankName(name: string) {
  return name.trim().toLowerCase() === CASH;
}

export function ReceiveScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const notify = useNotify();
  const keyboardH = useKeyboardHeight();
  const presetId = route.params?.accountId;
  const [dest, setDest] = useState<"cash" | "account">(presetId ? "account" : "cash");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [accountId, setAccountId] = useState(presetId || "");
  const [from, setFrom] = useState(route.params?.from || "");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const bankAccounts = useMemo(
    () =>
      accounts.filter((a) => {
        const bankName = typeof a.bank === "object" ? a.bank.name : "";
        return !isCashBankName(bankName) && !isCashBankName(a.name);
      }),
    [accounts]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rows, known] = await Promise.all([listAccounts(), listPeople()]);
      setAccounts(rows);
      setPeople(known);
      if (presetId) {
        setAccountId(presetId);
        setDest("account");
      } else if (!accountId && rows[0]) {
        const firstBank = rows.find((a) => {
          const bn = typeof a.bank === "object" ? a.bank.name : "";
          return !isCashBankName(bn);
        });
        if (firstBank) setAccountId(firstBank._id);
      }
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
    const q = from.trim().toLowerCase();
    if (!q) return people.slice(0, 8);
    return people
      .filter((p) => p.name.toLowerCase().includes(q) && p.name.toLowerCase() !== q)
      .slice(0, 8);
  }, [people, from]);

  async function ensureCashAccount(): Promise<Account> {
    const banks = await listBanks();
    let cash = banks.find((b) => isCashBankName(b.name)) || null;
    if (!cash) cash = await createBank({ name: "Cash", notes: "Cash in hand" });
    const rows = await listAccounts(cash._id);
    if (rows[0]) return rows[0];
    return createAccount({ bank: cash._id, name: "Cash", balance: 0 });
  }

  function goConfirm() {
    const n = Number(amount);
    if (!(n > 0)) return notify.info("Enter an amount");
    if (dest === "account" && !accountId) return notify.info("Select an account");
    setShowSuggestions(false);
    setStep("confirm");
  }

  async function onReceive() {
    if (busy) return;
    const n = Number(amount);
    if (!(n > 0)) return;
    setBusy(true);
    try {
      let targetId = accountId;
      let label = selected
        ? `${typeof selected.bank === "object" ? selected.bank.name + " · " : ""}${selected.name}`
        : "Account";
      if (dest === "cash") {
        const cashAcc = await ensureCashAccount();
        targetId = cashAcc._id;
        label = "Cash";
      }
      await deposit({
        account: targetId,
        amount: n,
        from: from.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      hapticSuccess();
      notify.success(
        "Received",
        from.trim()
          ? `${formatMoney(n)} from ${from.trim()} → ${label}`
          : `${formatMoney(n)} → ${label}`
      );
      navigation.goBack();
    } catch (err: any) {
      notify.error("Couldn’t receive", err?.message);
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

  if (loadError && accounts.length === 0) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <StateView
          kind={isOfflineError(loadError) ? "offline" : "error"}
          title={isOfflineError(loadError) ? "You’re offline" : "Couldn’t load"}
          message={String((loadError as Error)?.message || "")}
          onRetry={() => void load()}
        />
      </View>
    );
  }

  const destLabel =
    dest === "cash"
      ? "Cash"
      : selected
        ? `${typeof selected.bank === "object" ? selected.bank.name + " · " : ""}${selected.name}`
        : "Account";

  if (step === "confirm") {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.confirmCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[type.label, { color: colors.muted }]}>Confirm receive</Text>
            <Text style={[styles.confirmAmount, { color: colors.success }]}>{formatMoney(Number(amount))}</Text>
            <View style={styles.confirmRow}>
              <Text style={[type.meta, { color: colors.muted }]}>Into</Text>
              <Text style={[type.body, { color: colors.text, fontWeight: "700", flex: 1, textAlign: "right" }]}>
                {destLabel}
              </Text>
            </View>
            {from.trim() ? (
              <View style={styles.confirmRow}>
                <Text style={[type.meta, { color: colors.muted }]}>From</Text>
                <Text style={[type.body, { color: colors.text, fontWeight: "700" }]}>{from.trim()}</Text>
              </View>
            ) : null}
            {notes.trim() ? (
              <View style={styles.confirmRow}>
                <Text style={[type.meta, { color: colors.muted }]}>Notes</Text>
                <Text style={[type.body, { color: colors.textSecondary, flex: 1, textAlign: "right" }]}>
                  {notes.trim()}
                </Text>
              </View>
            ) : null}
          </View>

          <Pressable
            style={({ pressed }) => [styles.btn, { backgroundColor: colors.success, opacity: busy || pressed ? 0.88 : 1 }]}
            disabled={busy}
            onPress={() => void onReceive()}
          >
            <Ionicons name="arrow-down-circle" size={18} color="#fff" />
            <Text style={styles.btnText}>{busy ? "Saving…" : "Confirm receive"}</Text>
          </Pressable>
          <Pressable style={styles.backLink} onPress={() => setStep("form")}>
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
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 40 + (Platform.OS === "android" ? keyboardH : 0) },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.intro, { backgroundColor: colors.successSoft }]}>
          <View style={[styles.introIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="arrow-down" size={22} color={colors.success} />
          </View>
          <Text style={[styles.introText, { color: colors.success }]}>
            Record money you received — into Cash or a bank account. History is kept either way.
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.textSecondary }]}>Receive into</Text>
        <View style={styles.destRow}>
          <Pressable
            style={({ pressed }) => [
              styles.destChip,
              {
                backgroundColor: dest === "cash" ? colors.success : colors.surface,
                borderColor: dest === "cash" ? colors.success : colors.border,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            onPress={() => setDest("cash")}
          >
            <Ionicons name="cash" size={18} color={dest === "cash" ? "#fff" : colors.success} />
            <Text style={{ color: dest === "cash" ? "#fff" : colors.text, fontWeight: "800" }}>Cash</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.destChip,
              {
                backgroundColor: dest === "account" ? colors.accent : colors.surface,
                borderColor: dest === "account" ? colors.accent : colors.border,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            onPress={() => setDest("account")}
          >
            <Ionicons name="card" size={18} color={dest === "account" ? "#fff" : colors.accent} />
            <Text style={{ color: dest === "account" ? "#fff" : colors.text, fontWeight: "800" }}>Account</Text>
          </Pressable>
        </View>

        {dest === "account" ? (
          <>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Account</Text>
            <View style={styles.list}>
              {bankAccounts.map((a) => {
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
                        opacity: pressed ? 0.9 : 1,
                      },
                    ]}
                    onPress={() => setAccountId(a._id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: active ? "#fff" : colors.text, fontWeight: "700" }}>
                        {bn ? `${bn} · ` : ""}
                        {a.name}
                      </Text>
                    </View>
                    <Text style={{ color: active ? "#fff" : colors.muted, fontWeight: "700" }}>
                      {formatMoney(a.balance)}
                    </Text>
                  </Pressable>
                );
              })}
              {bankAccounts.length === 0 ? (
                <Text style={{ color: colors.muted }}>No bank accounts yet — add a bank first.</Text>
              ) : null}
            </View>
          </>
        ) : null}

        <Text style={[styles.label, { color: colors.textSecondary }]}>Received from (optional)</Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text },
          ]}
          placeholder="e.g. Ahmad, Client, Salary"
          placeholderTextColor={colors.muted}
          value={from}
          onChangeText={(v) => {
            setFrom(v);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          autoCorrect={false}
        />

        {showSuggestions && suggestions.length > 0 ? (
          <View style={[styles.suggestBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {suggestions.map((p) => (
              <Pressable
                key={p.name}
                style={styles.suggestRow}
                onPress={() => {
                  setFrom(p.name);
                  setShowSuggestions(false);
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "700" }}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.textSecondary }]}>Amount</Text>
        <TextInput
          style={[
            styles.input,
            { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text },
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
            { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text },
          ]}
          placeholder="Reason"
          placeholderTextColor={colors.muted}
          value={notes}
          onChangeText={setNotes}
          onFocus={() => setShowSuggestions(false)}
        />

        <Pressable
          style={({ pressed }) => [styles.btn, { backgroundColor: colors.success, opacity: pressed ? 0.88 : 1 }]}
          onPress={goConfirm}
        >
          <Ionicons name="arrow-forward" size={18} color="#fff" />
          <Text style={styles.btnText}>Review</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20 },
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
  destRow: { flexDirection: "row", gap: 10 },
  destChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  list: { gap: 8 },
  chip: {
    borderRadius: radius.md,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
  },
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
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
  confirmCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  confirmAmount: { fontSize: 34, fontWeight: "800", letterSpacing: -0.8, marginVertical: 6 },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backLink: { alignItems: "center", marginTop: 16, padding: 12 },
});
