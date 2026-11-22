import axios from "axios";
import { clearAuthToken, getAuthToken } from "@/lib/auth-token";
import { useAuthStore } from "@/stores/auth-store";
import { invalidateReference } from "@/lib/reference-cache";
import { emitDataChanged } from "@/lib/data-changed";

export const api = axios.create({
  // Same-origin /api is proxied to the backend by Next.js (avoids port clashes like XpertPPC on :5000).
  baseURL: "/api",
  withCredentials: true,
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Retry transient failures on safe (idempotent) requests only.
 *
 * Most screens still fetch with plain axios rather than React Query, so without
 * this a single dropped packet on a factory-floor connection leaves the screen
 * empty until the user reloads the whole app.
 *
 * Deliberately narrow:
 *   - GET/HEAD only. A POST that times out may already have been applied, and
 *     silently repeating it could double-post a payment or a production run.
 *   - network errors, timeouts and 5xx only. A 4xx means the request was wrong,
 *     and a 409 is the same-day duplicate question, which must reach the user.
 *   - a cancelled request is never retried.
 */
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 400;

function isRetryable(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  if (error.code === "ERR_CANCELED") return false;

  const method = (error.config?.method ?? "get").toLowerCase();
  if (method !== "get" && method !== "head") return false;

  const status = error.response?.status;
  if (status === undefined) return true; // network error or timeout
  return status >= 500 && status < 600;
}

/**
 * After any successful write, tell every cache in the app that server state has
 * moved. Without this, a sale recorded here would not invalidate the dashboard's
 * cached margin figures, because the write screens do not use React Query
 * mutations. Correctness over cache-hit rate for money and stock.
 */
api.interceptors.response.use(
  (response) => {
    const method = (response.config?.method ?? "get").toLowerCase();
    if (method !== "get" && method !== "head") {
      invalidateReference();
      emitDataChanged();
    }
    return response;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config as
      | (typeof error.config & { __retryCount?: number })
      | undefined;

    if (config && isRetryable(error)) {
      const attempt = config.__retryCount ?? 0;
      if (attempt < MAX_RETRIES) {
        config.__retryCount = attempt + 1;
        // Exponential backoff with jitter, so a brief outage does not produce a
        // synchronised retry storm from every open screen.
        const delay = RETRY_BASE_MS * 2 ** attempt + Math.random() * 200;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return api(config);
      }
    }

    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? "";
      const isAuthEndpoint =
        url.includes("/auth/login") ||
        url.includes("/auth/me") ||
        url.includes("/auth/logout");

      if (!isAuthEndpoint && typeof window !== "undefined") {
        clearAuthToken();
        useAuthStore.getState().clear();
        if (window.location.pathname.startsWith("/dashboard")) {
          window.location.href = "/";
        }
      }
    }
    return Promise.reject(error);
  }
);
