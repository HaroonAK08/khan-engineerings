import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const TOKEN_KEY = "pb_token";

export function getApiBase() {
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  return (extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000/api").replace(
    /\/$/,
    ""
  );
}

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string | null) {
  if (!token) await AsyncStorage.removeItem(TOKEN_KEY);
  else await AsyncStorage.setItem(TOKEN_KEY, token);
}

type ApiOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

export function isOfflineError(err: unknown) {
  const msg = String((err as Error)?.message || err || "").toLowerCase();
  return (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("internet") ||
    (err as { status?: number })?.status === 0
  );
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.auth !== false) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      method: options.method || (options.body ? "POST" : "GET"),
      headers,
      body: options.body != null ? JSON.stringify(options.body) : undefined,
    });
  } catch (e) {
    const err = new Error("No internet connection") as Error & { status?: number; offline?: boolean };
    err.status = 0;
    err.offline = true;
    throw err;
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text || "Invalid response" };
  }

  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export function formatMoney(n: number) {
  const value = Math.round((Number(n) || 0) * 100) / 100;
  const fixed = Number.isInteger(value) ? String(Math.trunc(value)) : value.toFixed(2);
  const [whole, dec] = fixed.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec ? `Rs ${withCommas}.${dec}` : `Rs ${withCommas}`;
}
