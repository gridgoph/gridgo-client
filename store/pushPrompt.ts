import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";
import type { PushExplainerMode } from "@/lib/push";

const STORAGE_KEY = "gridgo.client.pushPrompt.v1";

type PushPromptStore = {
  hydrated: boolean;
  /** When the explainer was last drawn on this phone. Persisted. */
  lastOfferedAt: number | null;
  /** The explainer is on screen. In memory only. */
  open: boolean;
  /**
   * Which explainer is up. Latched when it opens, so a refusal in the OS dialog
   * cannot swap its words while the sheet is still sliding away.
   */
  mode: PushExplainerMode;
  /** Draw the explainer and start the re-offer clock. */
  offer: (mode: PushExplainerMode, now?: number) => void;
  /** Every way the explainer is put away: either button, the scrim, a drag, back. */
  dismiss: () => void;
  reset: () => void;
};

/**
 * The notification explainer's memory: when it was last offered, per phone.
 *
 * Per phone rather than per account, because what it asks for is the phone's
 * permission. The stamp is written when the sheet opens, not when it is
 * answered, so "at most once a week" holds even if the app is closed with the
 * sheet up. Whether it is due is `pushExplainerDue` in `lib/push.ts`.
 */
export const usePushPrompt = create<PushPromptStore>()(
  persist(
    (set) => ({
      hydrated: false,
      lastOfferedAt: null,
      open: false,
      mode: "ask",
      offer: (mode, now = Date.now()) => set({ open: true, mode, lastOfferedAt: now }),
      dismiss: () => set({ open: false }),
      reset: () => set({ lastOfferedAt: null, open: false }),
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({ lastOfferedAt: state.lastOfferedAt }),
      onRehydrateStorage: () => () => {
        usePushPrompt.setState({ hydrated: true });
      },
    },
  ),
);
