import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  createAccount,
  createBank,
  getSummary,
  listAccounts,
  listBanks,
  listTransactions,
  type Bank,
  type Transaction,
} from "../lib/banks-api";
import { formatMoney, isOfflineError, setToken } from "../lib/api";
import { HomeSkeleton } from "../components/Skeleton";
import { StateView } from "../components/StateView";
import { useNotify } from "../components/Notify";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import { radius, type } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const CASH_BANK_NAME = "Cash";

function isCashBank(bank: Bank) {
  return bank.name.trim().toLowerCase() === CASH_BANK_NAME.toLowerCase();
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, toggle } = useTheme();
  const notify = useNotify();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [weekSpent, setWeekSpent] = useState(0);
  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (soft = false) => {
      if (!soft) setLoading(true);
      setLoadError(null);
      try {
        const [data, txns] = await Promise.all([
          getSummary(),
          listTransactions({ limit: 50 }),
        ]);
        setBanks(data.banks);
        setGrandTotal(data.grandTotal);

        const from = daysAgoISO(7);
        const fromMs = new Date(from).getTime();
        const spent = txns
          .filter((t) => t.type === "send" && new Date(t.txnDate).getTime() >= fromMs)
          .reduce((s, t) => s + (t.amount || 0), 0);
        setWeekSpent(spent);
        setRecentTxns(txns.slice(0, 3));
      } catch (err: any) {
        if (err?.status === 401) {
          await setToken(null);
          navigation.replace("Pin");
          return;
        }
        setLoadError(err);
        if (!soft) notify.error("Couldn’t load", err?.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [navigation, notify]
  );

  useEffect(() => {
    return navigation.addListener("focus", () => {
      void load(true);
    });
  }, [navigation, load]);

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
      notify.error("Couldn’t open cash", err?.message);
    } finally {
      setBusy(false);
    }
  }

  function openTxn(item: Transaction) {
    if (item.account?._id && item.bank?._id) {
      navigation.navigate("Account", {
        accountId: item.account._id,
        accountName: item.account.name,
        bankId: item.bank._id,
        bankName: item.bank.name,
      });
      return;
    }
    navigation.navigate("History", {
      accountId: item.account?._id,
      bankId: item.bank?._id,
    });
  }

  const cashBank = banks.find(isCashBank) || null;
  const bankCount = banks.filter((b) => !isCashBank(b)).length;
  const firstLoad = loading && banks.length === 0 && !loadError;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + 6 }]}>
      <View style={styles.topBar}>
        <View>
          <Text style={[styles.greeting, { color: colors.muted }]}>Your money</Text>
          <Text style={[styles.brand, { color: colors.text }]}>Personal Banks</Text>
        </View>
        <View style={styles.topActions}>
          <Pressable
            onPress={toggle}
            hitSlop={10}
            style={[
              styles.iconBtn,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Ionicons
              name={isDark ? "sunny-outline" : "moon-outline"}
              size={18}
              color={colors.textSecondary}
            />
          </Pressable>
          <Pressable
            onPress={() => void lock()}
            hitSlop={10}
            style={[
              styles.iconBtn,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {firstLoad ? (
        <HomeSkeleton />
      ) : loadError && banks.length === 0 ? (
        <StateView
          kind={isOfflineError(loadError) ? "offline" : "error"}
          title={isOfflineError(loadError) ? "You’re offline" : "Couldn’t load"}
          message={
            isOfflineError(loadError)
              ? "Check your connection and try again."
              : String((loadError as Error)?.message || "Something went wrong")
          }
          onRetry={() => void load()}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
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
        >
          <LinearGradient
            colors={["#0F766E", "#0D9488", "#2DD4BF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroLabel}>Total balance</Text>
            <Text style={styles.heroAmount}>{formatMoney(grandTotal)}</Text>
            <Text style={styles.heroSub}>
              {bankCount} {bankCount === 1 ? "bank" : "banks"}
              {cashBank ? " · cash included" : ""}
            </Text>
          </LinearGradient>

          <View
            style={[
              styles.weekCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={[styles.weekIcon, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="trending-down" size={18} color={colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.label, { color: colors.muted }]}>This week</Text>
              <Text style={[type.subtitle, { color: colors.text, marginTop: 2 }]}>
                {formatMoney(weekSpent)} spent
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Quick actions</Text>
          <View style={styles.grid}>
            <Pressable
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
              onPress={() => navigation.navigate("Banks")}
            >
              <View style={[styles.tileIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="business" size={24} color={colors.accent} />
              </View>
              <Text style={[styles.tileLabel, { color: colors.text }]}>Banks</Text>
              <Text style={[styles.tileMeta, { color: colors.muted }]}>
                {bankCount ? `${bankCount} saved` : "Open boxes"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
              onPress={() => void openCash()}
              disabled={busy}
            >
              <View style={[styles.tileIcon, { backgroundColor: colors.successSoft }]}>
                <Ionicons name="cash" size={24} color={colors.success} />
              </View>
              <Text style={[styles.tileLabel, { color: colors.text }]}>Cash</Text>
              <Text style={[styles.tileMeta, { color: colors.muted }]}>
                {cashBank ? formatMoney(cashBank.totalBalance || 0) : "Add cash"}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
              onPress={() => navigation.navigate("Send")}
            >
              <View style={[styles.tileIcon, { backgroundColor: colors.blueSoft }]}>
                <Ionicons name="paper-plane" size={24} color={colors.blue} />
              </View>
              <Text style={[styles.tileLabel, { color: colors.text }]}>Pay</Text>
              <Text style={[styles.tileMeta, { color: colors.muted }]}>Send money</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
              onPress={() => navigation.navigate("History", {})}
            >
              <View style={[styles.tileIcon, { backgroundColor: colors.amberSoft }]}>
                <Ionicons name="time" size={24} color={colors.amber} />
              </View>
              <Text style={[styles.tileLabel, { color: colors.text }]}>History</Text>
              <Text style={[styles.tileMeta, { color: colors.muted }]}>All activity</Text>
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.payeesRow,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            onPress={() => navigation.navigate("People")}
          >
            <View style={[styles.tileIconSm, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="people" size={18} color={colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.payeesTitle, { color: colors.text }]}>Payees</Text>
              <Text style={[styles.payeesSub, { color: colors.muted }]}>People you’ve paid</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>

          {recentTxns.length > 0 ? (
            <>
              <Text
                style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 18 }]}
              >
                Recent activity
              </Text>
              <View style={{ gap: 10 }}>
                {recentTxns.map((item) => {
                  const negative = item.type === "send";
                  const title =
                    item.recipient ||
                    (item.type === "deposit" ? "Deposit" : item.type === "send" ? "Sent" : "Adjust");
                  return (
                    <Pressable
                      key={item._id}
                      style={({ pressed }) => [
                        styles.txnRow,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          opacity: pressed ? 0.9 : 1,
                        },
                      ]}
                      onPress={() => openTxn(item)}
                    >
                      <View
                        style={[
                          styles.tileIconSm,
                          {
                            backgroundColor: negative ? colors.dangerSoft : colors.successSoft,
                          },
                        ]}
                      >
                        <Ionicons
                          name={negative ? "arrow-up" : "arrow-down"}
                          size={16}
                          color={negative ? colors.danger : colors.success}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[type.body, { color: colors.text, fontWeight: "700" }]}>
                          {title}
                        </Text>
                        <Text style={[type.meta, { color: colors.muted, marginTop: 2 }]}>
                          {[item.bank?.name, item.account?.name].filter(Boolean).join(" · ") ||
                            new Date(item.txnDate).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text
                        style={[
                          type.body,
                          {
                            fontWeight: "800",
                            color: negative ? colors.danger : colors.success,
                          },
                        ]}
                      >
                        {negative ? "−" : "+"}
                        {formatMoney(item.amount)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  topActions: { flexDirection: "row", gap: 8 },
  greeting: { fontSize: 13, fontWeight: "600" },
  brand: { fontSize: 22, fontWeight: "800", letterSpacing: -0.4, marginTop: 2 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  hero: {
    borderRadius: radius.xl,
    paddingHorizontal: 22,
    paddingVertical: 26,
    marginBottom: 14,
    overflow: "hidden",
  },
  heroLabel: { color: "rgba(255,255,255,0.82)", fontSize: 13, fontWeight: "600" },
  heroAmount: {
    color: "#fff",
    fontSize: 38,
    fontWeight: "800",
    marginTop: 8,
    letterSpacing: -1,
  },
  heroSub: { color: "rgba(255,255,255,0.78)", marginTop: 10, fontSize: 13, fontWeight: "500" },
  weekCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    marginBottom: 18,
  },
  weekIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 14,
  },
  tile: {
    width: "48%",
    flexGrow: 1,
    maxWidth: "48.5%",
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  tileIconSm: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { fontWeight: "800", fontSize: 15 },
  tileMeta: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  payeesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
  },
  payeesTitle: { fontWeight: "800", fontSize: 15 },
  payeesSub: { fontSize: 12, marginTop: 2 },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
  },
});
