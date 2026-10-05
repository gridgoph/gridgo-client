import { create } from "zustand";

import * as api from "@/lib/api";
import { deleteArtworkFiles, type DeletionResult } from "@/lib/artworkDeletion";

export type ArtworkDeletionEntry = {
  phase: "idle" | "confirming" | "deleting";
  /** The last attempt's outcome, until the client asks again. */
  result: DeletionResult | null;
  /** Rises after every attempt, so the file rows read themselves again. */
  version: number;
};

export const IDLE_DELETION: ArtworkDeletionEntry = { phase: "idle", result: null, version: 0 };

type ArtworkDeletionStore = {
  byOrder: Record<string, ArtworkDeletionEntry>;
  ask: (orderId: string) => void;
  cancel: (orderId: string) => void;
  run: (orderId: string, fileIds: readonly string[]) => Promise<void>;
};

/**
 * "Delete my artwork" on one order: asking, deleting, and what came of it.
 *
 * A store rather than screen state for the same reason as the sign-in steps:
 * the outcome lands from an async continuation after two presses, and that is
 * the update a test (and Fast Refresh) can drop from `useState`. Not persisted:
 * the file rows read the truth from GRIDGO on the next visit.
 */
export const useArtworkDeletion = create<ArtworkDeletionStore>()((set, get) => {
  const entry = (orderId: string) => get().byOrder[orderId] ?? IDLE_DELETION;
  const patch = (orderId: string, next: Partial<ArtworkDeletionEntry>) =>
    set((state) => ({ byOrder: { ...state.byOrder, [orderId]: { ...entry(orderId), ...next } } }));
  return {
    byOrder: {},
    ask: (orderId) => {
      if (entry(orderId).phase === "idle") patch(orderId, { phase: "confirming" });
    },
    cancel: (orderId) => {
      if (entry(orderId).phase === "confirming") patch(orderId, { phase: "idle" });
    },
    run: async (orderId, fileIds) => {
      if (entry(orderId).phase === "deleting") return;
      patch(orderId, { phase: "deleting", result: null });
      const result = await deleteArtworkFiles(fileIds, api.deleteFile);
      patch(orderId, { phase: "idle", result, version: entry(orderId).version + 1 });
    },
  };
});
