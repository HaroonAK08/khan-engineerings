import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
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
  createBank,
  deleteBank,
  listBanks,
  updateBank,
  type Bank,
} from "../lib/banks-api";
import { formatMoney, isOfflineError } from "../lib/api";
import {
  getFavoriteBankIds,
  getRecentBankIds,
  toggleFavoriteBank,
  touchBankRecent,
} from "../lib/prefs";
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

type Props = NativeStackScreenProps<RootStackParamList, "Banks">;
type SortMode = "balance" | "recent";

const CASH = "cash";
const GAP = 12;
const COLS = 2;
const TILE = (Dimensions.get("window").width - 40 - GAP) / COLS;

function isCash(bank: Bank) {
  return bank.name.trim().toLowerCase() === CASH;
}

export function BanksScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const notify = useNotify();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("balance");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Bank | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (soft = false) => {
      if (!soft) setLoading(true);
      setLoadError(null);
      try {
        const [rows, favs, recents] = await Promise.all([
          listBanks(),
          getFavoriteBankIds(),
          getRecentBankIds(),
        ]);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setBanks(rows.filter((b) => !isCash(b)));
        setFavorites(favs);
        setRecent(recents);
      } catch (err) {
        setLoadError(err);
        if (!soft) notify.error("Couldn’t load banks");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    return navigation.addListener("focus", () => {
      void load(true);
    });
  }, [navigation, load]);

  const sorted = useMemo(() => {
    const favSet = new Set(favorites);
    const recentIndex = new Map(recent.map((id, i) => [id, i]));
    const copy = [...banks];
    copy.sort((a, b) => {
      const af = favSet.has(a._id) ? 0 : 1;
      const bf = favSet.has(b._id) ? 0 : 1;
      if (af !== bf) return af - bf;

      if (sortMode === "recent") {
        const ar = recentIndex.has(a._id) ? recentIndex.get(a._id)! : 999;
        const br = recentIndex.has(b._id) ? recentIndex.get(b._id)! : 999;
        if (ar !== br) return ar - br;
      }

      const balDiff = (b.totalBalance || 0) - (a.totalBalance || 0);
      if (balDiff !== 0) return balDiff;

      if (sortMode === "balance") {
        const ar = recentIndex.has(a._id) ? recentIndex.get(a._id)! : 999;
        const br = recentIndex.has(b._id) ? recentIndex.get(b._id)! : 999;
        if (ar !== br) return ar - br;
      }

      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [banks, favorites, recent, sortMode]);

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

  async function onSave() {
    if (!name.trim()) {
      notify.info("Name required");
      return;
    }
    setBusy(true);
    try {
      if (modal === "edit" && editing) {
        await updateBank(editing._id, { name: name.trim() });
        notify.success("Bank updated", name.trim());
      } else {
        const bank = await createBank({ name: name.trim() });
        setModal(null);
        setName("");
        notify.success("Bank added", bank.name);
        await touchBankRecent(bank._id);
        navigation.navigate("Bank", { bankId: bank._id, bankName: bank.name });
        return;
      }
      setModal(null);
      setEditing(null);
      setName("");
      await load(true);
    } catch (err: any) {
      notify.error("Couldn’t save", err?.message);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(bank: Bank) {
    Alert.alert("Delete bank?", `“${bank.name}” and all accounts will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteBank(bank._id);
              notify.success("Bank deleted");
              await load(true);
            } catch (err: any) {
              notify.error("Delete failed", err?.message);
            }
          })();
        },
      },
    ]);
  }

  async function onToggleFavorite(id: string) {
    try {
      const next = await toggleFavoriteBank(id);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFavorites(next);
    } catch (err: any) {
      notify.error("Couldn’t update favorite", err?.message);
    }
  }

  async function openBank(bank: Bank) {
    await touchBankRecent(bank._id);
    navigation.navigate("Bank", { bankId: bank._id, bankName: bank.name });
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={styles.sortRow}>
        <Pressable
          style={[
            styles.sortChip,
            {
              backgroundColor: sortMode === "balance" ? colors.accent : colors.surface,
              borderColor: sortMode === "balance" ? colors.accent : colors.border,
            },
          ]}
          onPress={() => setSortMode("balance")}
        >
          <Text
            style={{
              color: sortMode === "balance" ? "#fff" : colors.textSecondary,
              fontWeight: "700",
              fontSize: 12,
            }}
          >
            Balance
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.sortChip,
            {
              backgroundColor: sortMode === "recent" ? colors.accent : colors.surface,
              borderColor: sortMode === "recent" ? colors.accent : colors.border,
            },
          ]}
          onPress={() => setSortMode("recent")}
        >
          <Text
            style={{
              color: sortMode === "recent" ? "#fff" : colors.textSecondary,
              fontWeight: "700",
              fontSize: 12,
            }}
          >
            Recent
          </Text>
        </Pressable>
      </View>

      {loading && banks.length === 0 ? (
        <ListSkeleton rows={4} />
      ) : loadError && banks.length === 0 ? (
        <StateView
          kind={isOfflineError(loadError) ? "offline" : "error"}
          title={isOfflineError(loadError) ? "You’re offline" : "Couldn’t load banks"}
          message={
            isOfflineError(loadError)
              ? "Check your connection and try again."
              : String((loadError as Error)?.message || "Something went wrong")
          }
          onRetry={() => void load()}
        />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(b) => b._id}
          numColumns={COLS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
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
            <Pressable
              style={({ pressed }) => [
                styles.addTile,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.accent,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
              onPress={openAdd}
            >
              <View style={[styles.addIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="add" size={28} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.addTitle, { color: colors.text }]}>Add new bank</Text>
                <Text style={[styles.addSub, { color: colors.muted }]}>HBL, Meezan, JazzCash…</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          }
          ListEmptyComponent={
            <StateView
              kind="empty"
              title="No banks yet"
              message="Tap Add new bank above to create one"
              icon="business-outline"
            />
          }
          renderItem={({ item }) => {
            const fav = favorites.includes(item._id);
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.box,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    shadowColor: colors.shadow,
                    opacity: pressed ? 0.92 : 1,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  },
                ]}
                onPress={() => void openBank(item)}
                onLongPress={() =>
                  Alert.alert(item.name, undefined, [
                    { text: "Edit", onPress: () => openEdit(item) },
                    { text: "Delete", style: "destructive", onPress: () => confirmDelete(item) },
                    { text: "Cancel", style: "cancel" },
                  ])
                }
              >
                <View style={styles.boxTop}>
                  <View style={[styles.boxIcon, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.initial, { color: colors.accentDark }]}>
                      {item.name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.boxActions}>
                    <Pressable hitSlop={8} onPress={() => void onToggleFavorite(item._id)}>
                      <Ionicons
                        name={fav ? "star" : "star-outline"}
                        size={18}
                        color={fav ? colors.amber : colors.muted}
                      />
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      onPress={() =>
                        Alert.alert(item.name, undefined, [
                          { text: "Edit", onPress: () => openEdit(item) },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => confirmDelete(item),
                          },
                          { text: "Cancel", style: "cancel" },
                        ])
                      }
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                </View>
                <Text style={[styles.boxName, { color: colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.boxBal, { color: colors.text }]}>
                  {formatMoney(item.totalBalance || 0)}
                </Text>
                <Text style={[styles.boxMeta, { color: colors.muted }]}>
                  {item.accountCount || 0}{" "}
                  {(item.accountCount || 0) === 1 ? "account" : "accounts"}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      <FormSheet visible={modal != null} onClose={() => setModal(null)}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>
          {modal === "edit" ? "Edit bank" : "New bank"}
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
          placeholder="Bank name"
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void onSave()}
        />
        <View style={styles.modalActions}>
          <Pressable onPress={() => setModal(null)} style={styles.cancelBtn}>
            <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: colors.accent, opacity: busy || pressed ? 0.88 : 1 },
            ]}
            onPress={() => void onSave()}
            disabled={busy}
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
  sortRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  addTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1.5,
    borderStyle: "dashed",
    marginBottom: 4,
  },
  addIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  addTitle: { fontSize: 16, fontWeight: "800" },
  addSub: { fontSize: 13, marginTop: 2 },
  box: {
    width: TILE,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    minHeight: 148,
  },
  boxTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  boxActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  boxIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { fontWeight: "800", fontSize: 18 },
  boxName: { fontSize: 16, fontWeight: "800", textTransform: "capitalize" },
  boxBal: { fontSize: 15, fontWeight: "700", marginTop: 6 },
  boxMeta: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  modalTitle: { fontSize: 20, fontWeight: "800", marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 18,
    fontSize: 16,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, alignItems: "center" },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  saveBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  saveText: { color: "#fff", fontWeight: "700" },
});
