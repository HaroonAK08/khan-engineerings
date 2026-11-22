import { create } from "zustand";
import { clearAuthToken } from "@/lib/auth-token";
import { invalidateReference } from "@/lib/reference-cache";
import type { AuthUser } from "@/types/auth";

type AuthState = {
  user: AuthUser | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  setUser: (user: AuthUser | null) => void;
  setStatus: (status: AuthState["status"]) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "idle",
  setUser: (user) =>
    set({
      user,
      status: user ? "authenticated" : "unauthenticated",
    }),
  setStatus: (status) => set({ status }),
  clear: () => {
    clearAuthToken();
    // Never let one session's reference data survive into the next.
    invalidateReference();
    set({ user: null, status: "unauthenticated" });
  },
}));
