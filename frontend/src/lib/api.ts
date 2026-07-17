import axios from "axios";
import { useAuthStore } from "@/stores/auth-store";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api",
  withCredentials: true,
  timeout: 10_000,
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
        useAuthStore.getState().clear();
        if (window.location.pathname.startsWith("/dashboard")) {
          window.location.href = "/";
        }
      }
    }
    return Promise.reject(error);
  }
);
