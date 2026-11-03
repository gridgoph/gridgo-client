import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  setThemePreference as applyThemePreference,
  type ThemePreference,
} from "@/hooks/useTheme";
import { saveAccountThemePreference } from "@/lib/api";
import { createPersistStorage } from "@/lib/persistStorage";
import { reconcileTheme } from "@/lib/themeSync";

const STORAGE_KEY = "gridgo.client.theme.v1";

type ThemeStore = {
  preference: ThemePreference;
  hydrated: boolean;
  /** A choice the account has not stored yet. */
  unsynced: boolean;
  /** The account this phone last reconciled its theme with. */
  owner: string | null;
  /** Show a theme on this phone only. */
  setPreference: (preference: ThemePreference) => void;
  /**
   * The client chose a theme: show it now and save it on the account
   * (`PATCH /me/theme`). A failed save is kept and sent again at the next
   * account read. Never throws.
   */
  choose: (preference: ThemePreference, userId: string | null) => Promise<void>;
  /** The account's saved theme was read (`lib/themeSync.ts` decides who wins). */
  adoptAccount: (userId: string, account: ThemePreference | null) => Promise<void>;
};

async function save(preference: ThemePreference): Promise<boolean> {
  try {
    await saveAccountThemePreference(preference);
    return true;
  } catch {
    return false;
  }
}

/**
 * Theme preference (system | light | dark): persisted on the phone for the
 * first frame, saved on the account so it follows the client everywhere.
 * Applies to the live Appearance/css bridge in `hooks/useTheme`.
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      preference: "system",
      hydrated: false,
      unsynced: false,
      owner: null,
      setPreference: (preference) => {
        applyThemePreference(preference);
        set({ preference });
      },
      choose: async (preference, userId) => {
        applyThemePreference(preference);
        set({ preference, unsynced: Boolean(userId), owner: userId ?? get().owner });
        if (!userId) return;
        const saved = await save(preference);
        // A newer tap owns the flag now.
        if (saved && get().preference === preference && get().owner === userId) set({ unsynced: false });
      },
      adoptAccount: async (userId, account) => {
        const { apply, push } = reconcileTheme(get(), userId, account);
        if (apply) applyThemePreference(apply);
        set({ owner: userId, ...(apply ? { preference: apply } : {}), unsynced: push != null });
        if (!push) return;
        const saved = await save(push);
        if (saved && get().preference === push && get().owner === userId) set({ unsynced: false });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({ preference: state.preference, unsynced: state.unsynced, owner: state.owner }),
      onRehydrateStorage: () => (state) => {
        if (state?.preference) {
          applyThemePreference(state.preference);
        }
        useThemeStore.setState({ hydrated: true });
      },
    },
  ),
);
