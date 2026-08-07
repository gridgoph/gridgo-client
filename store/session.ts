import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";

/** Expected role for this binary — mismatched login is rejected. */
export const APP_ROLE = "client" as const;
export const DEMO_EMAIL = "client@gridgo.local";

type SessionState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

export const useSession = create<SessionState>((set) => ({
  user: null,
  loading: false,
  error: null,
  clearError: () => set({ error: null }),
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { user } = await api.login(email, password);
      if (user.role !== APP_ROLE) {
        await api.logout();
        set({
          user: null,
          loading: false,
          error: `This account is role "${user.role}". Open the ${user.role} app instead.`,
        });
        return;
      }
      set({ user, loading: false });
    } catch (e) {
      let message: string;
      if (e instanceof api.ApiError && e.status === 401) {
        message = "Wrong email or password.";
      } else if (api.isNetworkFailure(e)) {
        message = `Cannot reach the backend at ${api.getApiBase()}. Is gridgo-api running on the LAN?`;
      } else if (e instanceof Error) {
        message = e.message;
      } else {
        message = "login_failed";
      }
      set({ loading: false, error: message });
    }
  },
  logout: async () => {
    await api.logout();
    set({ user: null });
  },
}));
