import { create } from "zustand";
import { persist } from "zustand/middleware";

import * as api from "@/lib/api";
import { createPersistStorage } from "@/lib/persistStorage";

const STORAGE_KEY = "gridgo.client.platform-settings.v1";

/**
 * GRIDGO's charges (`GET /settings`), read once and shared.
 *
 * Every price a client reads is the shop's figure plus GRIDGO's charge at
 * `serviceFeeRateBps` (`lib/clientPrice.ts`), so the match rows, the order
 * sheet and the basket all need the rate — and none of them may draw the
 * shop's raw figure while waiting for it. One store, one in-flight read,
 * and the last answer kept on the phone so a cold start already knows the
 * rate. It is a platform setting, not someone else's live data, which is why
 * persisting it is fine where a rider's location never would be.
 *
 * Checkout still reads `/settings` itself for the delivery bands and hands
 * the answer here, so the two never disagree.
 */
export type PlatformSettingsState = {
  settings: api.PlatformSettings | null;
  hydrated: boolean;
  /** Read the charges, unless they are already held. `refresh` forces a re-read. */
  load: (options?: { refresh?: boolean }) => Promise<api.PlatformSettings | null>;
  /** Keep charges a screen fetched for itself. */
  adopt: (settings: api.PlatformSettings) => void;
  /** The rate GRIDGO's charge is at, or null before the first answer. */
  serviceFeeRateBps: () => number | null;
  reset: () => void;
};

let inflight: Promise<api.PlatformSettings> | null = null;

export const usePlatformSettings = create<PlatformSettingsState>()(
  persist(
    (set, get) => ({
      settings: null,
      hydrated: false,
      load: async ({ refresh = false } = {}) => {
        const held = get().settings;
        if (held && !refresh) return held;
        if (!inflight) {
          inflight = api.getSettings().finally(() => {
            inflight = null;
          });
        }
        const settings = await inflight;
        set({ settings });
        return settings;
      },
      adopt: (settings) => set({ settings }),
      serviceFeeRateBps: () => get().settings?.serviceFeeRateBps ?? null,
      reset: () => {
        inflight = null;
        set({ settings: null });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({ settings: state.settings }),
      onRehydrateStorage: () => () => {
        usePlatformSettings.setState({ hydrated: true });
      },
    },
  ),
);

/** The rate every client-facing price is drawn at, or null until GRIDGO answers. */
export function useServiceFeeRateBps(): number | null {
  return usePlatformSettings((state) => state.settings?.serviceFeeRateBps ?? null);
}
