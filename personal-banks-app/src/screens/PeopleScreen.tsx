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
  deletePerson,
  listPeople,
  renamePerson,
  type Person,
} from "../lib/banks-api";
import { formatMoney } from "../lib/api";
import type { RootStackParamList } from "../navigation/types";
import { colors, radius } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "People">;

export function PeopleScreen({ navigation }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Person | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPeople(await listPeople({ q: q.trim() || undefined }));
    } catch {
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
    if (!newName.trim()) return Alert.alert("Name required");
    setBusy(true);
    try {
      await renamePerson(editing.name, newName.trim());
      setEditing(null);
      setNewName("");
      await load();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Rename failed");
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
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.input}
          placeholder="Search payees (people, rent, petrol…)"
          placeholderTextColor={colors.muted}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
        />
      </View>

      {loading && people.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(item) => item.name}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="pricetags-outline" size={36} color={colors.muted} />
              <Text style={styles.empty}>
                Anyone or anything you pay will show up here — people, bills, shops, etc.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable
                style={styles.cardMain}
                onPress={() => navigation.navigate("History", { recipient: item.name })}
              >
                <View style={styles.avatar}>
                  <Text style={styles.initial}>{item.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {item.count} {item.count === 1 ? "payment" : "payments"} · last{" "}
                    {new Date(item.lastTxnDate).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.total}>{formatMoney(item.totalSent)}</Text>
              </Pressable>
              <View style={styles.actions}>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => navigation.navigate("History", { recipient: item.name })}
                >
                  <Ionicons name="time-outline" size={16} color={colors.accent} />
                  <Text style={styles.actionText}>History</Text>
                </Pressable>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => {
                    setEditing(item);
                    setNewName(item.name);
                  }}
                >
                  <Ionicons name="create-outline" size={15} color={colors.accent} />
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => confirmDelete(item)}>
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.sendBtn]}
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

      <Modal
        visible={editing != null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(null)}
      >
        <Pressable style={styles.modalBg} onPress={() => setEditing(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Rename payee</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Name or label"
              placeholderTextColor={colors.muted}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setEditing(null)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalSave}
                disabled={busy}
                onPress={() => void onRename()}
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
  input: { flex: 1, paddingVertical: 13, color: colors.text, fontSize: 15 },
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
    gap: 12,
    padding: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { color: colors.accentDark, fontWeight: "800", fontSize: 17 },
  name: { color: colors.text, fontWeight: "800", fontSize: 16 },
  meta: { color: colors.muted, marginTop: 3, fontSize: 12 },
  total: { color: colors.danger, fontWeight: "800", fontSize: 14 },
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
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
  },
  actionText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
  sendBtn: { backgroundColor: colors.blue },
  sendText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  emptyBox: { alignItems: "center", marginTop: 48, gap: 10 },
  empty: { color: colors.muted, textAlign: "center", lineHeight: 20 },
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
