import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { FoundingTesterView } from "@/lib/foundingTester";
import { createPersistStorage } from "@/lib/persistStorage";

const STORAGE_KEY = "gridgo.client.foundingTester.v1";

type Earned = Extract<FoundingTesterView, { kind: "earned" }>;

type FoundingTesterStore = {
  hydrated: boolean;
  /**
   * The `awardedAt` already celebrated on this phone, per account. Persisted:
   * a reload, a survey retry or a cold start reads the same stamp back, and the
   * celebration must not play again for it.
   */
  celebrated: Record<string, string>;
  /** The celebration on screen, latched as it opened. In memory only. */
  showing: Earned | null;
  /** Opens the celebration and records it in the same step. */
  celebrate: (userId: string, view: Earned) => void;
  close: () => void;
};

/**
 * The Founding Tester celebration's memory (`lib/foundingTester.ts` decides
 * whether it is due).
 *
 * The stamp is written when the celebration opens, not when it is put away,
 * so an app closed with it on screen does not play it a second time.
 */
export const useFoundingTester = create<FoundingTesterStore>()(
  persist(
    (set) => ({
      hydrated: false,
      celebrated: {},
      showing: null,
      celebrate: (userId, view) =>
        set((state) => ({
          showing: view,
          celebrated: { ...state.celebrated, [userId]: view.awardedAt },
        })),
      close: () => set({ showing: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({ celebrated: state.celebrated }),
      onRehydrateStorage: () => () => {
        useFoundingTester.setState({ hydrated: true });
      },
    },
  ),
);
