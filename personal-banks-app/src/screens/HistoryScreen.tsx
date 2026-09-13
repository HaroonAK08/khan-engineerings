import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  deleteTransaction,
  listTransactions,
  updateTransaction,
  type Transaction,
} from "../lib/banks-api";
import { formatMoney } from "../lib/api";
import type { RootStackParamList } from "../navigation/types";
import { colors, radius } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "History">;

function typeMeta(t: Transaction["type"]) {
  if (t === "send") {
    return { label: "Sent", icon: "arrow-up" as const, tint: colors.dangerSoft, color: colors.danger };
  }
  if (t === "deposit") {
    return { label: "Deposit", icon: "arrow-down" as const, tint: colors.successSoft, color: colors.success };
  }
  return { label: "Adjust", icon: "swap-horizontal" as const, tint: colors.amberSoft, color: colors.amber };
}

export function HistoryScreen({ navigation, route }: Props) {
  const { accountId, bankId, recipient: recipientFilter } = route.params || {};
  const [rows, setRows] = useState<Transaction[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editRecipient, setEditRecipient] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (recipientFilter) {
      navigation.setOptions({ title: recipientFilter });
    }
  }, [navigation, recipientFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await listTransactions({
          account: accountId,
          bank: bankId,
          recipient: recipientFilter,
          q: recipientFilter ? undefined : q.trim() || undefined,
          type: recipientFilter ? "send" : undefined,
        })
      );
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, bankId, recipientFilter, q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 180);
    return () => clearTimeout(t);
  }, [load]);

  function openEdit(item: Transaction) {
    setEditing(item);
    setEditRecipient(item.recipient || "");
    setEditAmount(String(item.amount));
    setEditNotes(item.notes || "");
  }

  async function onSaveEdit() {
    if (!editing) return;
    const amount = Number(editAmount);
    if (!(amount > 0)) return Alert.alert("Enter a valid amount");
    if (editing.type === "send" && !editRecipient.trim()) {
      return Alert.alert("Recipient required");
    }
    setBusy(true);
    try {
      await updateTransaction(editing._id, {
        amount,
        notes: editNotes.trim(),
        recipient: editing.type === "send" ? editRecipient.trim() : undefined,
      });
      setEditing(null);
      await load();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(item: Transaction) {
    Alert.alert(
      "Delete entry?",
      item.type === "send"
        ? "Amount will be returned to the account."
        : item.type === "deposit"
          ? "Amount will be removed from the account."
          : "This entry will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteTransaction(item._id);
                await load();
              } catch (err: any) {
                Alert.alert("Error", err?.message || "Delete failed");
              }
            })();
          },
        },
      ]
    );
  }

  return (
    <View style={styles.root}>
      {!recipientFilter ? (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.input}
            placeholder="Search recipient or notes"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
          />
        </View>
      ) : (
        <Pressable
          style={styles.personBanner}
          onPress={() => navigation.navigate("Send", { recipient: recipientFilter })}
        >
          <Ionicons name="paper-plane" size={16} color={colors.blue} />
          <Text style={styles.personBannerText}>Send again to {recipientFilter}</Text>
        </Pressable>
      )}
      {loading && rows.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={34} color={colors.muted} />
              <Text style={styles.empty}>No history yet</Text>
            </View>
          }
          renderItem={({ item }) => {
            const meta = typeMeta(item.type);
            const negative = item.type === "send";
            const bankName = item.bank?.name || "";
            const accountName = item.account?.name || "";
            const canEditAmount = item.type === "send" || item.type === "deposit";
            return (
              <View style={styles.card}>
                <View style={[styles.iconBubble, { backgroundColor: meta.tint }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={styles.body}>
                  <View style={styles.row}>
                    <Text style={styles.type}>{meta.label}</Text>
                    <Text style={[styles.amount, negative && styles.out]}>
                      {negative ? "−" : "+"}
                      {formatMoney(item.amount)}
                    </Text>
                  </View>
                  {item.recipient ? (
                    <Text style={styles.recipient}>To: {item.recipient}</Text>
                  ) : null}
                  <Text style={styles.meta}>
                    {[bankName, accountName].filter(Boolean).join(" · ")}
                  </Text>
                  {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
                  <Text style={styles.date}>
                    {new Date(item.txnDate).toLocaleString()} · bal {formatMoney(item.balanceAfter)}
                  </Text>
                  <View style={styles.actions}>
                    {canEditAmount ? (
                      <Pressable style={styles.miniBtn} onPress={() => openEdit(item)}>
                        <Ionicons name="create-outline" size={14} color={colors.accent} />
                        <Text style={styles.miniText}>Edit</Text>
                      </Pressable>
                    ) : null}
                    <Pressable style={styles.miniBtn} onPress={() => confirmDelete(item)}>
                      <Ionicons name="trash-outline" size={14} color={colors.danger} />
                      <Text style={[styles.miniText, { color: colors.danger }]}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      <Modal
        visible={editing != null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(null)}
      >
        <Pressable style={styles.modalBg} onPress={() => setEditing(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Edit entry</Text>
            {editing?.type === "send" ? (
              <TextInput
                style={styles.modalInput}
                value={editRecipient}
                onChangeText={setEditRecipient}
                placeholder="Recipient"
                placeholderTextColor={colors.muted}
              />
            ) : null}
            <TextInput
              style={styles.modalInput}
              value={editAmount}
              onChangeText={setEditAmount}
              placeholder="Amount"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={styles.modalInput}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Notes"
              placeholderTextColor={colors.muted}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setEditing(null)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalSave}
                disabled={busy}
                onPress={() => void onSaveEdit()}
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
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    marginBottom: 14,
  },
  personBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.blueSoft,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  personBannerText: { color: colors.blue, fontWeight: "700", fontSize: 13 },
  input: {
    flex: 1,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 15,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  type: { color: colors.text, fontWeight: "700" },
  amount: { color: colors.success, fontWeight: "800" },
  out: { color: colors.danger },
  recipient: { color: colors.text, marginTop: 4, fontWeight: "600" },
  meta: { color: colors.muted, marginTop: 3, fontSize: 12 },
  notes: { color: colors.textSecondary, marginTop: 4, fontSize: 13 },
  date: { color: colors.muted, marginTop: 8, fontSize: 11 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  miniText: { color: colors.accent, fontWeight: "700", fontSize: 12 },
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
  modalInput: {
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
