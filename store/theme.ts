import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  setThemePreference as applyThemePreference,
  type ThemePreference,
} from "@/hooks/useTheme";

const STORAGE_KEY = "gridgo.client.theme.v1";

type ThemeStore = {
  preference: ThemePreference;
  hydrated: boolean;
  setPreference: (preference: ThemePreference) => void;
};

/**
 * Persisted theme override (system | light | dark).
 * Applies to the live Appearance/css bridge in `hooks/useTheme`.
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      preference: "system",
      hydrated: false,
      setPreference: (preference) => {
        applyThemePreference(preference);
        set({ preference });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ preference: state.preference }),
      onRehydrateStorage: () => (state) => {
        if (state?.preference) {
          applyThemePreference(state.preference);
        }
        useThemeStore.setState({ hydrated: true });
      },
    },
  ),
);
