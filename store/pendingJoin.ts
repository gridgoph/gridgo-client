import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";

/**
 * A member link that opened the app before anyone was signed in
 * (gridgo-client#475). A new student scans the QR first and signs up second,
 * so the token waits here until the signed-in shell can open it.
 */
type PendingJoinState = {
  token: string | null;
  hold: (token: string) => void;
  clear: () => void;
};

export const usePendingJoin = create<PendingJoinState>()(
  persist(
    (set) => ({
      token: null,
      hold: (token) => set({ token }),
      clear: () => set({ token: null }),
    }),
    { name: "gridgo.client.pendingJoin.v1", storage: createPersistStorage() },
  ),
);
