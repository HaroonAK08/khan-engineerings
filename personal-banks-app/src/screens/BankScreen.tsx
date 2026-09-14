import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
  createAccount,
  deleteAccount,
  deposit,
  listAccounts,
  updateAccount,
  type Account,
} from "../lib/banks-api";
import { formatMoney } from "../lib/api";
import type { RootStackParamList } from "../navigation/types";
import { colors, radius } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Bank">;

export function BankScreen({ navigation, route }: Props) {
  const { bankId, bankName } = route.params;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<"add" | "edit" | "deposit" | null>(null);
  const [selected, setSelected] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (soft = false) => {
      if (!soft) setLoading(true);
      try {
        setAccounts(await listAccounts(bankId));
      } catch (err: any) {
        if (!soft) Alert.alert("Error", err?.message || "Failed to load accounts");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [bankId]
  );

  useEffect(() => {
    navigation.setOptions({ title: bankName });
    void load();
  }, [navigation, bankName, load]);

  async function onAdd() {
    if (!name.trim()) return Alert.alert("Account name required");
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
      await load(true);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Could not add");
    } finally {
      setBusy(false);
    }
  }

  async function onEdit() {
    if (!selected) return;
    if (!name.trim()) return Alert.alert("Account name required");
    setBusy(true);
    try {
      await updateAccount(selected._id, { name: name.trim() });
      setModal(null);
      setSelected(null);
      setName("");
      await load(true);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Could not update");
    } finally {
      setBusy(false);
    }
  }

  async function onDeposit() {
    if (!selected) return;
    const n = Number(amount);
    if (!(n > 0)) return Alert.alert("Enter amount");
    setBusy(true);
    try {
      await deposit({ account: selected._id, amount: n });
      setModal(null);
      setSelected(null);
      setAmount("");
      await load(true);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Deposit failed");
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
              await load(true);
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Delete failed");
            }
          })();
        },
      },
    ]);
  }

  function modalTitle() {
    if (modal === "edit") return "Edit account";
    if (modal === "deposit") return `Deposit · ${selected?.name || ""}`;
    return "Add account";
  }

  return (
    <View style={styles.root}>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={() => {
            setSelected(null);
            setName("");
            setAmount("");
            setModal("add");
          }}
        >
          <Ionicons name="add-circle" size={20} color="#fff" />
          <Text style={styles.primaryText}>Account</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          onPress={() => navigation.navigate("History", { bankId })}
        >
          <Ionicons name="time-outline" size={18} color={colors.accent} />
          <Text style={styles.secondaryText}>History</Text>
        </Pressable>
      </View>

      {loading && accounts.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
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
            <View style={styles.emptyBox}>
              <Ionicons name="card-outline" size={34} color={colors.muted} />
              <Text style={styles.empty}>No accounts yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable onPress={() => navigation.navigate("History", { accountId: item._id })}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.balance}>{formatMoney(item.balance)}</Text>
              </Pressable>
              <View style={styles.row}>
                <Pressable
                  style={styles.miniBtn}
                  onPress={() => {
                    setSelected(item);
                    setAmount("");
                    setModal("deposit");
                  }}
                >
                  <Ionicons name="add" size={16} color={colors.accent} />
                  <Text style={styles.link}>Add</Text>
                </Pressable>
                <Pressable
                  style={styles.miniBtn}
                  onPress={() =>
                    navigation.navigate("Send", { accountId: item._id, accountName: item.name })
                  }
                >
                  <Ionicons name="paper-plane-outline" size={15} color={colors.blue} />
                  <Text style={[styles.link, { color: colors.blue }]}>Pay</Text>
                </Pressable>
                <Pressable
                  style={styles.miniBtn}
                  onPress={() => {
                    setSelected(item);
                    setName(item.name);
                    setModal("edit");
                  }}
                >
                  <Ionicons name="create-outline" size={15} color={colors.accent} />
                  <Text style={styles.link}>Edit</Text>
                </Pressable>
                <Pressable style={styles.miniBtn} onPress={() => confirmDelete(item)}>
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[styles.link, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Modal
        visible={modal != null}
        transparent
        animationType="fade"
        onRequestClose={() => setModal(null)}
      >
        <Pressable style={styles.modalBg} onPress={() => setModal(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{modalTitle()}</Text>
            {modal === "add" || modal === "edit" ? (
              <TextInput
                style={styles.input}
                placeholder="Account name"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
                autoFocus
              />
            ) : null}
            {modal === "add" || modal === "deposit" ? (
              <TextInput
                style={styles.input}
                placeholder={modal === "add" ? "Opening balance (optional)" : "Amount"}
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                autoFocus={modal === "deposit"}
              />
            ) : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModal(null)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalSave, pressed && styles.pressed]}
                disabled={busy}
                onPress={() =>
                  void (modal === "add" ? onAdd() : modal === "edit" ? onEdit() : onDeposit())
                }
              >
                <Text style={styles.modalSaveText}>{busy ? "…" : "Save"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  actions: { flexDirection: "row", gap: 10, marginBottom: 16 },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.accent, fontWeight: "700" },
  pressed: { opacity: 0.88 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
  balance: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  link: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  emptyBox: { alignItems: "center", marginTop: 48, gap: 8 },
  empty: { color: colors.muted, textAlign: "center" },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 22 },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    color: colors.text,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: colors.surfaceMuted,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, alignItems: "center" },
  cancel: { color: colors.textSecondary, fontWeight: "600", padding: 12 },
  modalSave: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  modalSaveText: { color: "#fff", fontWeight: "700" },
});
