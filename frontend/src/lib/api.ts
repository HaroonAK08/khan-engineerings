import axios from "axios";
import { clearAuthToken, getAuthToken } from "@/lib/auth-token";
import { useAuthStore } from "@/stores/auth-store";

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
