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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  createAccount,
  createBank,
  deleteBank,
  getSummary,
  listAccounts,
  listBanks,
  updateBank,
  type Bank,
} from "../lib/banks-api";
import { formatMoney, setToken } from "../lib/api";
import type { RootStackParamList } from "../navigation/types";
import { colors, radius } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const CASH_BANK_NAME = "Cash";

function accountLabel(n: number) {
  return n === 1 ? "1 account" : `${n} accounts`;
}

function isCashBank(bank: Bank) {
  return bank.name.trim().toLowerCase() === CASH_BANK_NAME.toLowerCase();
}

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Bank | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (soft = false) => {
      if (!soft) setLoading(true);
      try {
        const data = await getSummary();
        setBanks(data.banks);
        setGrandTotal(data.grandTotal);
      } catch (err: any) {
        if (err?.status === 401) {
          await setToken(null);
          navigation.replace("Pin");
          return;
        }
        if (!soft) Alert.alert("Error", err?.message || "Failed to load");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [navigation]
  );

  useEffect(() => {
    return navigation.addListener("focus", () => {
      void load(true);
    });
  }, [navigation, load]);

  function openAdd() {
    setEditing(null);
    setName("");
    setModal("add");
  }

  function openEdit(bank: Bank) {
    setEditing(bank);
    setName(bank.name);
    setModal("edit");
  }

  async function onSaveBank() {
    if (!name.trim()) {
      Alert.alert("Name required");
      return;
    }
    setBusy(true);
    try {
      if (modal === "edit" && editing) {
        await updateBank(editing._id, { name: name.trim() });
      } else {
        await createBank({ name: name.trim() });
      }
      setModal(null);
      setEditing(null);
      setName("");
      await load(true);
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Could not save bank");
    } finally {
      setBusy(false);
    }
  }

  function confirmDeleteBank(bank: Bank) {
    Alert.alert(
      "Delete bank?",
      `“${bank.name}” and all its accounts & history will be removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteBank(bank._id);
                await load(true);
              } catch (err: any) {
                Alert.alert("Error", err?.message || "Delete failed");
              }
            })();
          },
        },
      ]
    );
  }

  async function lock() {
    await setToken(null);
    navigation.replace("Pin");
  }

  async function openCash() {
    setBusy(true);
    try {
      const all = await listBanks();
      let cash = all.find(isCashBank) || null;
      if (!cash) {
        cash = await createBank({ name: CASH_BANK_NAME, notes: "Cash in hand" });
      }
      const accounts = await listAccounts(cash._id);
      if (accounts.length === 0) {
        await createAccount({ bank: cash._id, name: "Cash", balance: 0 });
      }
      navigation.navigate("Bank", { bankId: cash._id, bankName: cash.name });
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Could not open cash");
    } finally {
      setBusy(false);
    }
  }

  const cashBank = banks.find(isCashBank) || null;
  const otherBanks = banks.filter((b) => !isCashBank(b));
  const cashBalance = cashBank?.totalBalance || 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>Personal Banks</Text>
        <Pressable onPress={() => void lock()} hitSlop={10} style={styles.lockBtn}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      <LinearGradient
        colors={["#0F766E", "#0D9488", "#14B8A6"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroLabel}>Total balance</Text>
        <Text style={styles.heroAmount}>{formatMoney(grandTotal)}</Text>
        <Text style={styles.heroSub}>
          {banks.length} {banks.length === 1 ? "bank" : "banks"}
        </Text>
      </LinearGradient>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
          onPress={openAdd}
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="business" size={26} color={colors.accent} />
          </View>
          <Text style={styles.actionLabel}>Bank</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
          onPress={() => void openCash()}
          disabled={busy}
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.successSoft }]}>
            <Ionicons name="cash" size={26} color={colors.success} />
          </View>
          <Text style={styles.actionLabel}>Cash</Text>
          {cashBank ? (
            <Text style={styles.actionMeta}>{formatMoney(cashBalance)}</Text>
          ) : (
            <Text style={styles.actionMeta}>Tap to add</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
          onPress={() => navigation.navigate("Send")}
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.blueSoft }]}>
            <Ionicons name="paper-plane" size={26} color={colors.blue} />
          </View>
          <Text style={styles.actionLabel}>Pay</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
          onPress={() => navigation.navigate("History", {})}
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.amberSoft }]}>
            <Ionicons name="time" size={26} color={colors.amber} />
          </View>
          <Text style={styles.actionLabel}>History</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.actionTile, pressed && styles.pressed]}
          onPress={() => navigation.navigate("People")}
        >
          <View style={[styles.actionIcon, { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name="pricetags" size={26} color={colors.danger} />
          </View>
          <Text style={styles.actionLabel}>Payees</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Your banks</Text>
      </View>

      {loading && banks.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={otherBanks}
          keyExtractor={(item) => item._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 28, gap: 12 }}
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
          ListHeaderComponent={
            cashBank ? (
              <View style={[styles.card, { marginBottom: 12 }]}>
                <Pressable
                  style={styles.cardMain}
                  onPress={() =>
                    navigation.navigate("Bank", {
                      bankId: cashBank._id,
                      bankName: cashBank.name,
                    })
                  }
                >
                  <View style={[styles.bankIcon, { backgroundColor: colors.successSoft }]}>
                    <Ionicons name="cash" size={22} color={colors.success} />
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.bankName}>{cashBank.name}</Text>
                    <Text style={styles.meta}>Cash in hand</Text>
                  </View>
                  <Text style={styles.bankBal}>{formatMoney(cashBank.totalBalance || 0)}</Text>
                </Pressable>
                <View style={styles.cardActions}>
                  <Pressable style={styles.miniBtn} onPress={() => openEdit(cashBank)}>
                    <Ionicons name="create-outline" size={15} color={colors.accent} />
                    <Text style={styles.miniText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={styles.miniBtn}
                    onPress={() =>
                      navigation.navigate("Bank", {
                        bankId: cashBank._id,
                        bankName: cashBank.name,
                      })
                    }
                  >
                    <Ionicons name="open-outline" size={15} color={colors.blue} />
                    <Text style={[styles.miniText, { color: colors.blue }]}>Open</Text>
                  </Pressable>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            otherBanks.length === 0 && !cashBank ? (
              <View style={styles.emptyBox}>
                <Ionicons name="wallet-outline" size={36} color={colors.muted} />
                <Text style={styles.empty}>Add Cash or a bank to get started</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable
                style={styles.cardMain}
                onPress={() =>
                  navigation.navigate("Bank", { bankId: item._id, bankName: item.name })
                }
              >
                <View style={styles.bankIcon}>
                  <Text style={styles.bankInitial}>{item.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.bankName}>{item.name}</Text>
                  <Text style={styles.meta}>{accountLabel(item.accountCount || 0)}</Text>
                </View>
                <Text style={styles.bankBal}>{formatMoney(item.totalBalance || 0)}</Text>
              </Pressable>
              <View style={styles.cardActions}>
                <Pressable style={styles.miniBtn} onPress={() => openEdit(item)}>
                  <Ionicons name="create-outline" size={15} color={colors.accent} />
                  <Text style={styles.miniText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.miniBtn} onPress={() => confirmDeleteBank(item)}>
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[styles.miniText, { color: colors.danger }]}>Delete</Text>
                </Pressable>
                <Pressable
                  style={styles.miniBtn}
                  onPress={() =>
                    navigation.navigate("Bank", { bankId: item._id, bankName: item.name })
                  }
                >
                  <Ionicons name="open-outline" size={15} color={colors.blue} />
                  <Text style={[styles.miniText, { color: colors.blue }]}>Open</Text>
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
            <Text style={styles.modalTitle}>{modal === "edit" ? "Edit bank" : "Add bank"}</Text>
            <Text style={styles.modalHint}>e.g. HBL, Meezan (use Cash tile for cash)</Text>
            <TextInput
              style={styles.input}
              placeholder="Bank name"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void onSaveBank()}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModal(null)} hitSlop={8} style={styles.modalCancel}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalSave, pressed && styles.pressed]}
                onPress={() => void onSaveBank()}
                disabled={busy}
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
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  brand: { color: colors.text, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  lockBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  hero: {
    borderRadius: radius.xl,
    paddingHorizontal: 22,
    paddingVertical: 24,
    marginBottom: 18,
  },
  heroLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },
  heroAmount: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "800",
    marginTop: 6,
    letterSpacing: -0.8,
  },
  heroSub: { color: "rgba(255,255,255,0.75)", marginTop: 8, fontSize: 13 },
  actions: { flexDirection: "row", gap: 12, marginBottom: 12 },
  actionTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  actionLabel: { color: colors.text, fontWeight: "700", fontSize: 14 },
  actionMeta: { color: colors.muted, fontSize: 11, fontWeight: "600", marginTop: 4 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  sectionHead: { marginBottom: 10, marginTop: 4 },
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardMain: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  bankIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  bankInitial: { color: colors.accentDark, fontWeight: "800", fontSize: 18 },
  cardBody: { flex: 1 },
  bankName: { color: colors.text, fontSize: 16, fontWeight: "700", textTransform: "capitalize" },
  meta: { color: colors.muted, marginTop: 3, fontSize: 13 },
  bankBal: { color: colors.text, fontSize: 15, fontWeight: "700" },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  miniText: { color: colors.accent, fontWeight: "700", fontSize: 12 },
  emptyBox: { alignItems: "center", marginTop: 48, gap: 10 },
  empty: { color: colors.muted, textAlign: "center", lineHeight: 20 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.35)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 22,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 4 },
  modalHint: { color: colors.muted, marginBottom: 14, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    color: colors.text,
    marginBottom: 18,
    fontSize: 16,
    backgroundColor: colors.surfaceMuted,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, alignItems: "center" },
  modalCancel: { paddingHorizontal: 14, paddingVertical: 12 },
  cancel: { color: colors.textSecondary, fontWeight: "600" },
  modalSave: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  modalSaveText: { color: "#fff", fontWeight: "700" },
});
