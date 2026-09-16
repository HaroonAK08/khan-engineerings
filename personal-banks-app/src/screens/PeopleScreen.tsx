import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  deletePerson,
  listPeople,
  renamePerson,
  type Person,
} from "../lib/banks-api";
import { formatMoney, isOfflineError } from "../lib/api";
import { FormSheet } from "../components/FormSheet";
import { ListSkeleton } from "../components/Skeleton";
import { StateView } from "../components/StateView";
import { useNotify } from "../components/Notify";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import { radius } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "People">;

export function PeopleScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const notify = useNotify();
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setPeople(await listPeople({ q: q.trim() || undefined }));
    } catch (err) {
      setLoadError(err);
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 160);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    return navigation.addListener("focus", () => {
      void load();
    });
  }, [navigation, load]);

  async function onRename() {
    if (!editing) return;
    if (!newName.trim()) return notify.info("Name required");
    setBusy(true);
    try {
      await renamePerson(editing.name, newName.trim());
      setEditing(null);
      setNewName("");
      notify.success("Payee renamed", newName.trim());
      await load();
    } catch (err: any) {
      notify.error("Rename failed", err?.message);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(person: Person) {
    Alert.alert(
      "Delete payee?",
      `Remove “${person.name}” and all related payments. Money will be returned to the accounts.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deletePerson(person.name);
                notify.success("Payee deleted");
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

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <View
        style={[
          styles.searchWrap,
          { borderColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder="Search payees (people, rent, petrol…)"
          placeholderTextColor={colors.muted}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
        />
      </View>

      {loading && people.length === 0 ? (
        <ListSkeleton rows={5} />
      ) : loadError ? (
        <StateView
          kind={isOfflineError(loadError) ? "offline" : "error"}
          title={isOfflineError(loadError) ? "You’re offline" : "Couldn’t load payees"}
          message={
            isOfflineError(loadError)
              ? "Check your connection and try again."
              : String((loadError as Error)?.message || "Something went wrong")
          }
          onRetry={() => void load()}
        />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(item) => item.name}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 10, paddingBottom: 40 }}
          ListEmptyComponent={
            <StateView
              kind="empty"
              title="No payees yet"
              message="Anyone or anything you pay will show up here — people, bills, shops, etc."
              icon="pricetags-outline"
            />
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Pressable
                style={styles.cardMain}
                onPress={() => navigation.navigate("History", { recipient: item.name })}
              >
                <View style={[styles.avatar, { backgroundColor: colors.accentSoft }]}>
                  <Text style={[styles.initial, { color: colors.accentDark }]}>
                    {item.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.meta, { color: colors.muted }]}>
                    {item.count} {item.count === 1 ? "payment" : "payments"} · last{" "}
                    {new Date(item.lastTxnDate).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={[styles.total, { color: colors.danger }]}>
                  {formatMoney(item.totalSent)}
                </Text>
              </Pressable>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.surfaceMuted }]}
                  onPress={() => navigation.navigate("History", { recipient: item.name })}
                >
                  <Ionicons name="time-outline" size={16} color={colors.accent} />
                  <Text style={[styles.actionText, { color: colors.accent }]}>History</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.surfaceMuted }]}
                  onPress={() => {
                    setEditing(item);
                    setNewName(item.name);
                  }}
                >
                  <Ionicons name="create-outline" size={15} color={colors.accent} />
                  <Text style={[styles.actionText, { color: colors.accent }]}>Edit</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.surfaceMuted }]}
                  onPress={() => confirmDelete(item)}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, { backgroundColor: colors.blue }]}
                  onPress={() => navigation.navigate("Send", { recipient: item.name })}
                >
                  <Ionicons name="paper-plane" size={15} color="#fff" />
                  <Text style={styles.sendText}>Pay</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <FormSheet visible={editing != null} onClose={() => setEditing(null)}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>Rename payee</Text>
        <TextInput
          style={[
            styles.modalInput,
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.surfaceMuted,
            },
          ]}
          value={newName}
          onChangeText={setNewName}
          placeholder="Name or label"
          placeholderTextColor={colors.muted}
          autoFocus
        />
        <View style={styles.modalActions}>
          <Pressable onPress={() => setEditing(null)}>
            <Text style={[styles.cancel, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.modalSave, { backgroundColor: colors.accent, opacity: busy ? 0.7 : 1 }]}
            disabled={busy}
            onPress={() => void onRename()}
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
    marginBottom: 14,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 15 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { fontWeight: "800", fontSize: 17 },
  name: { fontWeight: "800", fontSize: 16 },
  meta: { marginTop: 3, fontSize: 12 },
  total: { fontWeight: "800", fontSize: 14 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
  },
  actionText: { fontWeight: "700", fontSize: 13 },
  sendText: { color: "#fff", fontWeight: "700", fontSize: 13 },
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
