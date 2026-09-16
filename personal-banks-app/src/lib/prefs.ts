import AsyncStorage from "@react-native-async-storage/async-storage";

const FAV_KEY = "pb_bank_favorites";
const RECENT_KEY = "pb_bank_recent";

export async function getFavoriteBankIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(FAV_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function toggleFavoriteBank(id: string): Promise<string[]> {
  const cur = await getFavoriteBankIds();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur];
  await AsyncStorage.setItem(FAV_KEY, JSON.stringify(next));
  return next;
}

export async function getRecentBankIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function touchBankRecent(id: string) {
  const cur = await getRecentBankIds();
  const next = [id, ...cur.filter((x) => x !== id)].slice(0, 20);
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
}
