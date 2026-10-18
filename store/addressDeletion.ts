import { create } from "zustand";

import * as api from "@/lib/api";
import { ApiError, type ClientAddress } from "@/lib/api";
import { DELETE_FAILED, deletedNotice } from "@/lib/addressDeletion";
import { userFacingError } from "@/lib/copy";

/** Which screen asked, so only its dialog opens when two lists are stacked. */
export type AddressListOwner = "saved-places" | "where" | "fulfilment";

type AddressDeletionStore = {
  owner: AddressListOwner | null;
  phase: "idle" | "confirming" | "deleting";
  /** The address being asked about or deleted. */
  target: ClientAddress | null;
  /** How many other addresses stay saved, for the notice afterwards. */
  remaining: number;
  /** Why the delete failed, shown in the dialog that is still open. */
  error: string | null;
  /** What came of it, shown on the screen once the dialog closes. */
  notice: string | null;
  /** Ids deleted here, kept off every list until GRIDGO's next read agrees. */
  removed: string[];
  /** Rises after every delete, so lists read themselves again. */
  version: number;
  ask: (owner: AddressListOwner, address: ClientAddress, all: ClientAddress[]) => void;
  cancel: () => void;
  confirm: () => Promise<void>;
  clearNotice: (owner: AddressListOwner) => void;
};

function isGone(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 404 &&
    typeof error.body === "object" &&
    error.body !== null &&
    (error.body as { error?: unknown }).error === "address_not_found"
  );
}

/**
 * Deleting a saved address: asking, deleting, and what came of it.
 *
 * A store rather than screen state because the outcome lands from an async
 * continuation after a press, which is the update a test (and Fast Refresh)
 * can drop from `useState` — the same reason as `store/artworkDeletion.ts`.
 * Not persisted: the lists read the truth from GRIDGO on the next visit.
 */
export const useAddressDeletion = create<AddressDeletionStore>()((set, get) => {
  const settle = (notice: string, removedId: string) =>
    set((state) => ({
      phase: "idle",
      target: null,
      error: null,
      notice,
      removed: [...state.removed, removedId],
      version: state.version + 1,
    }));

  return {
    owner: null,
    phase: "idle",
    target: null,
    remaining: 0,
    error: null,
    notice: null,
    removed: [],
    version: 0,

    ask: (owner, address, all) => {
      if (get().phase !== "idle") return;
      set({
        owner,
        phase: "confirming",
        target: address,
        remaining: all.filter((row) => row.id !== address.id).length,
        error: null,
        notice: null,
      });
    },

    cancel: () => {
      if (get().phase === "confirming") set({ phase: "idle", target: null, error: null });
    },

    clearNotice: (owner) => {
      if (get().owner === owner && get().notice) set({ notice: null });
    },

    confirm: async () => {
      const { phase, target, remaining } = get();
      if (phase !== "confirming" || !target) return;
      set({ phase: "deleting", error: null });
      try {
        const { defaultCleared } = await api.deleteAddress(target.id);
        settle(deletedNotice(target, defaultCleared, remaining), target.id);
      } catch (error) {
        // Already gone — deleted on another phone, say. The list was stale.
        if (isGone(error)) {
          settle(userFacingError(error, DELETE_FAILED), target.id);
          return;
        }
        set({ phase: "confirming", error: userFacingError(error, DELETE_FAILED) });
      }
    },
  };
});
