import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
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
  deleteTransaction,
  listAccounts,
  listBanks,
  listTransactions,
  updateTransaction,
  type Account,
  type Bank,
  type Transaction,
} from "../lib/banks-api";
import { formatMoney, isOfflineError } from "../lib/api";
import { hapticLight } from "../lib/haptics";
import { FormSheet } from "../components/FormSheet";
import { ListSkeleton } from "../components/Skeleton";
import { StateView } from "../components/StateView";
import { useNotify } from "../components/Notify";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import { radius } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "History">;

type TypeFilter = "all" | "deposit" | "send";
type DateFilter = "all" | "7d" | "30d" | "month";

function startOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function typeMeta(t: Transaction["type"], colors: ReturnType<typeof useTheme>["colors"]) {
  if (t === "send") {
    return { label: "Sent", icon: "arrow-up" as const, tint: colors.dangerSoft, color: colors.danger };
  }
  if (t === "deposit") {
    return { label: "Received", icon: "arrow-down" as const, tint: colors.successSoft, color: colors.success };
  }
  return { label: "Adjust", icon: "swap-horizontal" as const, tint: colors.amberSoft, color: colors.amber };
}

export function HistoryScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const notify = useNotify();
  const { accountId: routeAccountId, bankId: routeBankId, recipient: recipientFilter } =
    route.params || {};
  const bankLocked = Boolean(routeBankId);
  const accountLocked = Boolean(routeAccountId);

  const [rows, setRows] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [bankId, setBankId] = useState(routeBankId || "");
  const [accountId, setAccountId] = useState(routeAccountId || "");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
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

  useEffect(() => {
    if (bankLocked || accountLocked) return;
    void (async () => {
      try {
        setBanks(await listBanks());
      } catch {
        /* ignore filter meta errors */
      }
    })();
  }, [bankLocked, accountLocked]);

  useEffect(() => {
    if (accountLocked) return;
    const id = bankId || routeBankId;
    if (!id) {
      setAccounts([]);
      return;
    }
    void (async () => {
      try {
        setAccounts(await listAccounts(id));
      } catch {
        setAccounts([]);
      }
    })();
  }, [bankId, routeBankId, accountLocked]);

  const dateRange = useMemo(() => {
    if (dateFilter === "7d") return { from: daysAgoISO(7), to: undefined as string | undefined };
    if (dateFilter === "30d") return { from: daysAgoISO(30), to: undefined };
    if (dateFilter === "month") return { from: startOfMonthISO(), to: undefined };
    return { from: undefined, to: undefined };
  }, [dateFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(
        await listTransactions({
          account: accountId || routeAccountId || undefined,
          bank: accountId || routeAccountId ? undefined : bankId || routeBankId || undefined,
          recipient: recipientFilter,
          q: recipientFilter ? undefined : q.trim() || undefined,
          type: recipientFilter ? "send" : typeFilter === "all" ? undefined : typeFilter,
          from: dateRange.from,
          to: dateRange.to,
        })
      );
    } catch (err) {
      setLoadError(err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [
    accountId,
    routeAccountId,
    bankId,
    routeBankId,
    recipientFilter,
    q,
    typeFilter,
    dateRange.from,
    dateRange.to,
  ]);

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
    if (!(amount > 0)) return notify.info("Enter a valid amount");
    if (editing.type === "send" && !editRecipient.trim()) {
      return notify.info("Payee required");
    }
    setBusy(true);
    try {
      await updateTransaction(editing._id, {
        amount,
        notes: editNotes.trim(),
        recipient: editing.type === "send" ? editRecipient.trim() : undefined,
      });
      setEditing(null);
      notify.success("Entry updated");
      await load();
    } catch (err: any) {
      notify.error("Update failed", err?.message);
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
                hapticLight();
                notify.success("Entry deleted");
                await load();
              } catch (err: any) {
                notify.error("Delete failed", err?.message);
              }
            })();
          },
        },
      ]
    );
  }

  function Chip({
    label,
    active,
    onPress,
  }: {
    label: string;
    active: boolean;
    onPress: () => void;
  }) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: active ? colors.accent : colors.surface,
            borderColor: active ? colors.accent : colors.border,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
        onPress={onPress}
      >
        <Text style={{ color: active ? "#fff" : colors.textSecondary, fontWeight: "700", fontSize: 12 }}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      {!recipientFilter ? (
        <>
          <View
            style={[
              styles.searchWrap,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder="Search payee or notes"
              placeholderTextColor={colors.muted}
              value={q}
              onChangeText={setQ}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
            style={{ flexGrow: 0, marginBottom: 8 }}
          >
            <Chip label="All" active={typeFilter === "all"} onPress={() => setTypeFilter("all")} />
            <Chip
              label="Received"
              active={typeFilter === "deposit"}
              onPress={() => setTypeFilter("deposit")}
            />
            <Chip label="Sent" active={typeFilter === "send"} onPress={() => setTypeFilter("send")} />
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
            style={{ flexGrow: 0, marginBottom: 8 }}
          >
            <Chip label="All time" active={dateFilter === "all"} onPress={() => setDateFilter("all")} />
            <Chip label="7d" active={dateFilter === "7d"} onPress={() => setDateFilter("7d")} />
            <Chip label="30d" active={dateFilter === "30d"} onPress={() => setDateFilter("30d")} />
            <Chip
              label="This month"
              active={dateFilter === "month"}
              onPress={() => setDateFilter("month")}
            />
          </ScrollView>

          {!bankLocked && !accountLocked ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
              style={{ flexGrow: 0, marginBottom: 8 }}
            >
              <Chip
                label="All banks"
                active={!bankId}
                onPress={() => {
                  setBankId("");
                  setAccountId("");
                }}
              />
              {banks.map((b) => (
                <Chip
                  key={b._id}
                  label={b.name}
                  active={bankId === b._id}
                  onPress={() => {
                    setBankId(b._id);
                    setAccountId("");
                  }}
                />
              ))}
            </ScrollView>
          ) : null}

          {!accountLocked && (bankId || routeBankId) && accounts.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
              style={{ flexGrow: 0, marginBottom: 10 }}
            >
              <Chip label="All accounts" active={!accountId} onPress={() => setAccountId("")} />
              {accounts.map((a) => (
                <Chip
                  key={a._id}
                  label={a.name}
                  active={accountId === a._id}
                  onPress={() => setAccountId(a._id)}
                />
              ))}
            </ScrollView>
          ) : null}
        </>
      ) : (
        <Pressable
          style={[styles.personBanner, { backgroundColor: colors.blueSoft }]}
          onPress={() => navigation.navigate("Send", { recipient: recipientFilter })}
        >
          <Ionicons name="paper-plane" size={16} color={colors.blue} />
          <Text style={[styles.personBannerText, { color: colors.blue }]}>
            Pay again → {recipientFilter}
          </Text>
        </Pressable>
      )}

      {loading && rows.length === 0 ? (
        <ListSkeleton rows={5} />
      ) : loadError ? (
        <StateView
          kind={isOfflineError(loadError) ? "offline" : "error"}
          title={isOfflineError(loadError) ? "You’re offline" : "Couldn’t load history"}
          message={
            isOfflineError(loadError)
              ? "Check your connection and try again."
              : String((loadError as Error)?.message || "Something went wrong")
          }
          onRetry={() => void load()}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingBottom: 40 }}
          ListEmptyComponent={
            <StateView
              kind="empty"
              title="No history yet"
              message="Payments and deposits will show up here."
              icon="receipt-outline"
            />
          }
          renderItem={({ item }) => {
            const meta = typeMeta(item.type, colors);
            const negative = item.type === "send";
            const bankName = item.bank?.name || "";
            const accountName = item.account?.name || "";
            const canEditAmount = item.type === "send" || item.type === "deposit";
            return (
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={[styles.iconBubble, { backgroundColor: meta.tint }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={styles.body}>
                  <View style={styles.row}>
                    <Text style={[styles.type, { color: colors.text }]}>{meta.label}</Text>
                    <Text
                      style={[
                        styles.amount,
                        { color: negative ? colors.danger : colors.success },
                      ]}
                    >
                      {negative ? "−" : "+"}
                      {formatMoney(item.amount)}
                    </Text>
                  </View>
                  {item.recipient ? (
                    <Text style={[styles.recipient, { color: colors.text }]}>
                      {item.type === "deposit" ? "From: " : "Paid to: "}
                      {item.recipient}
                    </Text>
                  ) : null}
                  <Text style={[styles.meta, { color: colors.muted }]}>
                    {[bankName, accountName].filter(Boolean).join(" · ")}
                  </Text>
                  {item.notes ? (
                    <Text style={[styles.notes, { color: colors.textSecondary }]}>{item.notes}</Text>
                  ) : null}
                  <Text style={[styles.date, { color: colors.muted }]}>
                    {new Date(item.txnDate).toLocaleString()} · bal {formatMoney(item.balanceAfter)}
                  </Text>
                  <View style={styles.actions}>
                    {canEditAmount ? (
                      <Pressable
                        style={[styles.miniBtn, { backgroundColor: colors.surfaceMuted }]}
                        onPress={() => openEdit(item)}
                      >
                        <Ionicons name="create-outline" size={14} color={colors.accent} />
                        <Text style={[styles.miniText, { color: colors.accent }]}>Edit</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[styles.miniBtn, { backgroundColor: colors.surfaceMuted }]}
                      onPress={() => confirmDelete(item)}
                    >
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

      <FormSheet visible={editing != null} onClose={() => setEditing(null)}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>Edit entry</Text>
        {editing?.type === "send" ? (
          <TextInput
            style={[
              styles.modalInput,
              {
                borderColor: colors.border,
                color: colors.text,
                backgroundColor: colors.surfaceMuted,
              },
            ]}
            value={editRecipient}
            onChangeText={setEditRecipient}
            placeholder="Payee (person, rent, petrol…)"
            placeholderTextColor={colors.muted}
          />
        ) : null}
        <TextInput
          style={[
            styles.modalInput,
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.surfaceMuted,
            },
          ]}
          value={editAmount}
          onChangeText={setEditAmount}
          placeholder="Amount"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          autoFocus
        />
        <TextInput
          style={[
            styles.modalInput,
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.surfaceMuted,
            },
          ]}
          value={editNotes}
          onChangeText={setEditNotes}
          placeholder="Notes"
          placeholderTextColor={colors.muted}
        />
        <View style={styles.modalActions}>
          <Pressable onPress={() => setEditing(null)}>
            <Text style={[styles.cancel, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.modalSave, { backgroundColor: colors.accent, opacity: busy ? 0.7 : 1 }]}
            disabled={busy}
            onPress={() => void onSaveEdit()}
          >
            <Text style={styles.modalSaveText}>{busy ? "…" : "Save"}</Text>
          </Pressable>
        </View>
      </FormSheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  personBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  personBannerText: { fontWeight: "700", fontSize: 13 },
  input: { flex: 1, paddingVertical: 13, fontSize: 15 },
  filters: { gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  card: {
    borderRadius: radius.lg,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
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
  type: { fontWeight: "700" },
  amount: { fontWeight: "800" },
  recipient: { marginTop: 4, fontWeight: "600" },
  meta: { marginTop: 3, fontSize: 12 },
  notes: { marginTop: 4, fontSize: 13 },
  date: { marginTop: 8, fontSize: 11 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  miniBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  miniText: { fontWeight: "700", fontSize: 12 },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 14 },
  modalInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, alignItems: "center" },
  cancel: { fontWeight: "600", padding: 12 },
  modalSave: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  modalSaveText: { color: "#fff", fontWeight: "700" },
});
