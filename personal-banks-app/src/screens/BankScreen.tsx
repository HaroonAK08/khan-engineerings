import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  createAccount,
  deleteAccount,
  deposit,
  listAccounts,
  updateAccount,
  type Account,
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
import { radius } from "../theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = NativeStackScreenProps<RootStackParamList, "Bank">;

export function BankScreen({ navigation, route }: Props) {
  const { bankId, bankName } = route.params;
  const { colors } = useTheme();
  const notify = useNotify();
  const isCash = bankName.trim().toLowerCase() === "cash";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [modal, setModal] = useState<"add" | "edit" | "deposit" | null>(null);
  const [selected, setSelected] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (soft = false) => {
      if (!soft) setLoading(true);
      setLoadError(null);
      try {
        const rows = await listAccounts(bankId);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setAccounts(rows);
      } catch (err) {
        setLoadError(err);
        if (!soft) notify.error("Couldn’t load accounts");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [bankId, notify]
  );

  useEffect(() => {
    navigation.setOptions({
      title: bankName,
      headerBackTitle: "Back",
    });
    void load();
  }, [navigation, bankName, load]);

  const total = accounts.reduce((s, a) => s + (a.balance || 0), 0);

  async function onAdd() {
    if (!name.trim()) return notify.info("Account name required");
    setBusy(true);
    try {
      await createAccount({
        bank: bankId,
        name: name.trim(),
        balance: Number(amount) || 0,
      });
      setModal(null);
      setName("");
      setAmount("");
      notify.success("Account added", name.trim());
      await load(true);
    } catch (err: any) {
      notify.error("Couldn’t add account", err?.message);
    } finally {
      setBusy(false);
    }
  }

  async function onEdit() {
    if (!selected) return;
    if (!name.trim()) return notify.info("Account name required");
    setBusy(true);
    try {
      await updateAccount(selected._id, { name: name.trim() });
      setModal(null);
      setSelected(null);
      setName("");
      notify.success("Account updated");
      await load(true);
    } catch (err: any) {
      notify.error("Couldn’t update", err?.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDeposit() {
    if (!selected || busy) return;
    const n = Number(amount);
    if (!(n > 0)) return notify.info("Enter an amount");
    setBusy(true);
    try {
      await deposit({ account: selected._id, amount: n });
      const label = selected.name;
      setModal(null);
      setSelected(null);
      setAmount("");
      hapticSuccess();
      notify.success(
        isCash ? "Cash added" : "Money added",
        `${formatMoney(n)} → ${label}`
      );
      await load(true);
    } catch (err: any) {
      notify.error("Deposit failed", err?.message);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(account: Account) {
    Alert.alert("Delete account?", `“${account.name}” and its history will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteAccount(account._id);
              notify.success("Account deleted");
              await load(true);
            } catch (err: any) {
              notify.error("Delete failed", err?.message);
            }
          })();
        },
      },
    ]);
  }

  function modalTitle() {
    if (modal === "edit") return "Edit account";
    if (modal === "deposit") return isCash ? "Add cash" : `Add money · ${selected?.name || ""}`;
    return "New account";
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.summary,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>
            {isCash ? "Cash in hand" : "Bank total"}
          </Text>
          <Text style={[styles.summaryAmount, { color: colors.text }]}>{formatMoney(total)}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.historyChip,
            { backgroundColor: colors.accentSoft, opacity: pressed ? 0.9 : 1 },
          ]}
          onPress={() => navigation.navigate("History", { bankId })}
        >
          <Ionicons name="time-outline" size={16} color={colors.accent} />
          <Text style={[styles.historyChipText, { color: colors.accent }]}>History</Text>
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.addAccount, pressed && { opacity: 0.9 }]}
        onPress={() => {
          setSelected(null);
          setName("");
          setAmount("");
          setModal("add");
        }}
      >
        <Ionicons name="add-circle" size={22} color={colors.accent} />
        <Text style={[styles.addAccountText, { color: colors.accent }]}>Add account</Text>
      </Pressable>

      {loading && accounts.length === 0 ? (
        <ListSkeleton rows={4} />
      ) : loadError && accounts.length === 0 ? (
        <StateView
          kind={isOfflineError(loadError) ? "offline" : "error"}
          title={isOfflineError(loadError) ? "You’re offline" : "Couldn’t load accounts"}
          message={
            isOfflineError(loadError)
              ? "Check your connection and try again."
              : String((loadError as Error)?.message || "Something went wrong")
          }
          onRetry={() => void load()}
        />
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(a) => a._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingBottom: 40 }}
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
              title="No accounts"
              message="Add an account to start tracking money"
              icon="card-outline"
            />
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                },
              ]}
            >
              <Pressable
                style={styles.cardMain}
                onPress={() =>
                  navigation.navigate("Account", {
                    accountId: item._id,
                    accountName: item.name,
                    bankId,
                    bankName,
                  })
                }
              >
                <View
                  style={[
                    styles.accIcon,
                    { backgroundColor: isCash ? colors.successSoft : colors.accentSoft },
                  ]}
                >
                  <Ionicons
                    name={isCash ? "cash" : "card"}
                    size={20}
                    color={isCash ? colors.success : colors.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.textSecondary }]}>{item.name}</Text>
                  <Text style={[styles.balance, { color: colors.text }]}>
                    {formatMoney(item.balance)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>

              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryAction,
                    { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
                  ]}
                  onPress={() => {
                    setSelected(item);
                    setAmount("");
                    setModal("deposit");
                  }}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.primaryActionText}>
                    {isCash ? "Add cash" : "Add money"}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.ghostAction,
                    {
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                  onPress={() =>
                    navigation.navigate("Send", { accountId: item._id, accountName: item.name })
                  }
                >
                  <Ionicons name="paper-plane-outline" size={16} color={colors.blue} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.ghostAction,
                    {
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                  onPress={() => {
                    setSelected(item);
                    setName(item.name);
                    setModal("edit");
                  }}
                >
                  <Ionicons name="create-outline" size={16} color={colors.accent} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.ghostAction,
                    {
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                  onPress={() => confirmDelete(item)}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <FormSheet visible={modal != null} onClose={() => setModal(null)}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>{modalTitle()}</Text>
        {modal === "add" || modal === "edit" ? (
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.text,
                backgroundColor: colors.surfaceMuted,
              },
            ]}
            placeholder="Account name"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            autoFocus
          />
        ) : null}
        {modal === "add" || modal === "deposit" ? (
          <>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.text,
                  backgroundColor: colors.surfaceMuted,
                },
              ]}
              placeholder={modal === "add" ? "Opening balance (optional)" : "Amount"}
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              autoFocus={modal === "deposit"}
            />
            {modal === "deposit" ? <AmountChips value={amount} onChange={setAmount} /> : null}
          </>
        ) : null}
        <View style={styles.modalActions}>
          <Pressable onPress={() => setModal(null)} style={styles.cancelBtn}>
            <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.modalSave,
              { backgroundColor: colors.accent, opacity: busy || pressed ? 0.88 : 1 },
            ]}
            disabled={busy}
            onPress={() =>
              void (modal === "add" ? onAdd() : modal === "edit" ? onEdit() : onDeposit())
            }
          >
            <Text style={styles.modalSaveText}>{busy ? "…" : "Save"}</Text>
          </Pressable>
        </View>
      </FormSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryAmount: { fontSize: 26, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  historyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  historyChipText: { fontWeight: "700", fontSize: 13 },
  addAccount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginBottom: 14,
    paddingVertical: 6,
  },
  addAccountText: { fontWeight: "800", fontSize: 15 },
  card: {
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  accIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 13, fontWeight: "700" },
  balance: { fontSize: 24, fontWeight: "800", marginTop: 2, letterSpacing: -0.4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  primaryAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  primaryActionText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  ghostAction: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    alignItems: "center",
    marginTop: 6,
  },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  modalSave: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  modalSaveText: { color: "#fff", fontWeight: "700" },
});
