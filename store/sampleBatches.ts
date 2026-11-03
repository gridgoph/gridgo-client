import { create } from "zustand";

import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { liveGeneration } from "@/lib/live";

/**
 * The client's sampled batches (gridgo-api#222), as GRIDGO last answered.
 *
 * In a store rather than screen state so a refusal the client must read
 * always re-renders, and so the list and a sample's own screen agree.
 * Belongs to the signed-in account: `reset` runs at the identity boundary in
 * `store/session.ts`. Never persisted.
 */
type SampleBatchesState = {
  list: api.SampleBatch[] | null;
  listError: string | null;
  byId: Record<string, api.SampleBatch>;
  readError: Record<string, string | null>;
  /** What is running on a sample screen right now. */
  busy: "approve" | "reject" | "cancel" | "order" | null;
  /** Why the last decision or batch order failed. */
  actionError: string | null;

  loadList: () => Promise<void>;
  /** `quantity` prices the batch at another size. */
  load: (id: string, quantity?: number) => Promise<void>;
  approve: (id: string, samplePhotoFileId: string) => Promise<boolean>;
  reject: (id: string, reason: string, next: "resample" | "cancel") => Promise<boolean>;
  cancel: (id: string) => Promise<boolean>;
  /** The batch in a new basket, or null when refused. */
  orderBatch: (id: string, pricing: api.SampleBatchPricing, quantity: number) => Promise<api.Cart | null>;
  clearActionError: () => void;
  reset: () => void;
};

function put(state: SampleBatchesState, batch: api.SampleBatch): Partial<SampleBatchesState> {
  return {
    byId: { ...state.byId, [batch.id]: batch },
    list: state.list ? state.list.map((row) => (row.id === batch.id ? batch : row)) : state.list,
  };
}

export const useSampleBatches = create<SampleBatchesState>((set, get) => {
  /** One decision at a time; a refusal re-reads the draft so the screen shows where it stands. */
  const act = async (
    id: string,
    busy: NonNullable<SampleBatchesState["busy"]>,
    work: () => Promise<api.SampleBatch>,
    fallback: string,
  ): Promise<boolean> => {
    if (get().busy) return false;
    set({ busy, actionError: null });
    try {
      const batch = await work();
      set((state) => put(state, batch));
      return true;
    } catch (error) {
      set({ actionError: userFacingError(error, fallback) });
      void get().load(id);
      return false;
    } finally {
      set({ busy: null });
    }
  };

  return {
    list: null,
    listError: null,
    byId: {},
    readError: {},
    busy: null,
    actionError: null,

    loadList: async () => {
      const owner = liveGeneration();
      try {
        const list = await api.listSampleBatches();
        if (owner !== liveGeneration()) return;
        set((state) => ({
          list,
          listError: null,
          byId: { ...Object.fromEntries(list.map((row) => [row.id, row])), ...keepPreviews(state.byId, list) },
        }));
      } catch (error) {
        if (owner !== liveGeneration()) return;
        set({ listError: userFacingError(error, "GRIDGO could not read your samples.") });
      }
    },

    load: async (id, quantity) => {
      const owner = liveGeneration();
      try {
        const batch = await api.getSampleBatch(id, quantity);
        if (owner !== liveGeneration()) return;
        set((state) => ({ ...put(state, batch), readError: { ...state.readError, [id]: null } }));
      } catch (error) {
        if (owner !== liveGeneration()) return;
        set((state) => ({
          readError: { ...state.readError, [id]: userFacingError(error, "GRIDGO could not read this sample.") },
        }));
      }
    },

    approve: (id, samplePhotoFileId) =>
      act(id, "approve", () => api.approveSampleBatch(id, { samplePhotoFileId }), "GRIDGO could not approve the sample. Try again."),

    reject: (id, reason, next) =>
      act(id, "reject", () => api.rejectSampleBatch(id, { reason, next }), "GRIDGO could not send your answer. Try again."),

    cancel: (id) => act(id, "cancel", () => api.cancelSampleBatch(id), "GRIDGO could not cancel the batch. Try again."),

    orderBatch: async (id, pricing, quantity) => {
      if (get().busy) return null;
      set({ busy: "order", actionError: null });
      try {
        return await api.createSampleBatchCart(id, { pricing, quantity });
      } catch (error) {
        set({ actionError: userFacingError(error, "GRIDGO could not start the batch order. Try again.") });
        // An ended hold or another refusal changes what the screen offers.
        void get().load(id, quantity);
        return null;
      } finally {
        set({ busy: null });
      }
    },

    clearActionError: () => set({ actionError: null }),

    reset: () => set({ list: null, listError: null, byId: {}, readError: {}, busy: null, actionError: null }),
  };
});

/**
 * A sample's screen may hold a read priced at another quantity. The list
 * prices the saved quantity, so it only replaces a held read that is older.
 */
function keepPreviews(
  held: Record<string, api.SampleBatch>,
  list: api.SampleBatch[],
): Record<string, api.SampleBatch> {
  const kept: Record<string, api.SampleBatch> = {};
  for (const row of list) {
    const previous = held[row.id];
    if (previous && previous.version === row.version && previous.heldPrice?.quantity !== row.batch.quantity) {
      kept[row.id] = previous;
    }
  }
  return kept;
}
