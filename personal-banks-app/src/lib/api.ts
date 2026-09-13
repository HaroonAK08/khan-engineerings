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

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.auth !== false) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    method: options.method || (options.body ? "POST" : "GET"),
    headers,
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });

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
  return `Rs ${Math.round((Number(n) || 0) * 100) / 100}`;
}
