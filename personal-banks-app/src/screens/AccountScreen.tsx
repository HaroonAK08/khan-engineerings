import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  deposit,
  listAccounts,
  listTransactions,
  type Account,
  type Transaction,
} from "../lib/banks-api";
import { formatMoney, isOfflineError } from "../lib/api";
import { hapticSuccess } from "../lib/haptics";
import { AmountChips } from "../components/AmountChips";
import { FormSheet } from "../components/FormSheet";
import { ListSkeleton } from "../components/Skeleton";
import { StateView } from "../components/StateView";
import { useNotify } from "../components/Notify";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import { radius, type } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Account">;

function txnMeta(t: Transaction["type"], colors: ReturnType<typeof useTheme>["colors"]) {
  if (t === "send") {
    return { label: "Sent", tint: colors.dangerSoft, color: colors.danger, icon: "arrow-up" as const };
  }
  if (t === "deposit") {
    return {
      label: "Deposit",
      tint: colors.successSoft,
      color: colors.success,
      icon: "arrow-down" as const,
    };
  }
  return {
    label: "Adjust",
    tint: colors.amberSoft,
    color: colors.amber,
    icon: "swap-horizontal" as const,
  };
}

export function AccountScreen({ navigation, route }: Props) {
  const { accountId, accountName, bankId, bankName } = route.params;
  const { colors } = useTheme();
  const notify = useNotify();
  const isCash = bankName.trim().toLowerCase() === "cash";

  const [account, setAccount] = useState<Account | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (soft = false) => {
      if (!soft) setLoading(true);
      setLoadError(null);
      try {
        const [accounts, transactions] = await Promise.all([
          listAccounts(bankId),
          listTransactions({ account: accountId, limit: 20 }),
        ]);
        const found = accounts.find((a) => a._id === accountId) || null;
        setAccount(found);
        setTxns(transactions);
        if (found) {
          navigation.setOptions({ title: found.name });
        }
      } catch (err) {
        setLoadError(err);
        if (!soft) notify.error("Couldn’t load account");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accountId, bankId, navigation, notify]
  );

  useEffect(() => {
    navigation.setOptions({ title: accountName, headerBackTitle: "Back" });
    return navigation.addListener("focus", () => {
      void load(true);
    });
  }, [navigation, accountName, load]);

  async function onDeposit() {
    if (busy) return;
    const n = Number(amount);
    if (!(n > 0)) return notify.info("Enter an amount");
    setBusy(true);
    try {
      await deposit({ account: accountId, amount: n });
      hapticSuccess();
      notify.success(isCash ? "Cash added" : "Money added", formatMoney(n));
      setDepositOpen(false);
      setAmount("");
      await load(true);
    } catch (err: any) {
      notify.error("Deposit failed", err?.message);
    } finally {
      setBusy(false);
    }
  }

  const balance = account?.balance ?? 0;

  if (loading && !account) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <ListSkeleton rows={5} />
      </View>
    );
  }

  if (loadError && !account) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <StateView
          kind={isOfflineError(loadError) ? "offline" : "error"}
          title={isOfflineError(loadError) ? "You’re offline" : "Couldn’t load account"}
          message={
            isOfflineError(loadError)
              ? "Check your connection and try again."
              : String((loadError as Error)?.message || "Something went wrong")
          }
          onRetry={() => void load()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.hero,
          { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow },
        ]}
      >
        <Text style={[type.label, { color: colors.muted }]}>{bankName}</Text>
        <Text style={[type.title, { color: colors.text, marginTop: 4 }]}>
          {account?.name || accountName}
        </Text>
        <Text style={[type.hero, { color: colors.text, fontSize: 34, marginTop: 10 }]}>
          {formatMoney(balance)}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
          ]}
          onPress={() => {
            setAmount("");
            setDepositOpen(true);
          }}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.primaryText}>{isCash ? "Add cash" : "Add money"}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryBtn,
            {
              backgroundColor: colors.blueSoft,
              borderColor: colors.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
          onPress={() =>
            navigation.navigate("Send", {
              accountId,
              accountName: account?.name || accountName,
            })
          }
        >
          <Ionicons name="paper-plane" size={16} color={colors.blue} />
          <Text style={[styles.secondaryText, { color: colors.blue }]}>Pay</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryBtn,
            {
              backgroundColor: colors.successSoft,
              borderColor: colors.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
          onPress={() =>
            navigation.navigate("Receive", {
              accountId,
            })
          }
        >
          <Ionicons name="arrow-down" size={16} color={colors.success} />
          <Text style={[styles.secondaryText, { color: colors.success }]}>Receive</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryBtn,
            {
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
          onPress={() => navigation.navigate("History", { accountId })}
        >
          <Ionicons name="time-outline" size={16} color={colors.accent} />
          <Text style={[styles.secondaryText, { color: colors.accent }]}>History</Text>
        </Pressable>
      </View>

      <Text style={[type.label, { color: colors.muted, marginBottom: 10 }]}>Recent</Text>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <FlatList
          data={txns}
          keyExtractor={(item) => item._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={
            <StateView
              kind="empty"
              title="No activity yet"
              message="Deposits and payments for this account will appear here."
              icon="receipt-outline"
            />
          }
          renderItem={({ item }) => {
            const meta = txnMeta(item.type, colors);
            const negative = item.type === "send";
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: pressed ? 0.92 : 1,
                  },
                ]}
                onPress={() => navigation.navigate("History", { accountId })}
              >
                <View style={[styles.icon, { backgroundColor: meta.tint }]}>
                  <Ionicons name={meta.icon} size={16} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: colors.text, fontWeight: "700" }]}>
                    {item.recipient || meta.label}
                  </Text>
                  <Text style={[type.meta, { color: colors.muted, marginTop: 2 }]}>
                    {new Date(item.txnDate).toLocaleString()}
                  </Text>
                </View>
                <Text
                  style={[
                    type.body,
                    { fontWeight: "800", color: negative ? colors.danger : colors.success },
                  ]}
                >
                  {negative ? "−" : "+"}
                  {formatMoney(item.amount)}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      <FormSheet visible={depositOpen} onClose={() => setDepositOpen(false)}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>
          {isCash ? "Add cash" : "Add money"}
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.surfaceMuted,
            },
          ]}
          placeholder="Amount"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          autoFocus
        />
        <AmountChips value={amount} onChange={setAmount} />
        <View style={styles.modalActions}>
          <Pressable onPress={() => setDepositOpen(false)} style={styles.cancelBtn}>
            <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.saveBtn, { backgroundColor: colors.accent, opacity: busy ? 0.7 : 1 }]}
            disabled={busy}
            onPress={() => void onDeposit()}
          >
            <Text style={styles.saveText}>{busy ? "…" : "Save"}</Text>
          </Pressable>
        </View>
      </FormSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  hero: {
    borderRadius: radius.lg,
    padding: 18,
    borderWidth: 1,
    marginBottom: 14,
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  actions: { flexDirection: "row", gap: 8, marginBottom: 18 },
  primaryBtn: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  secondaryText: { fontWeight: "800", fontSize: 13 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 4,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    alignItems: "center",
    marginTop: 12,
  },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  saveBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  saveText: { color: "#fff", fontWeight: "700" },
});
