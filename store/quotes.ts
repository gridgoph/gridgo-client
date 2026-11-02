import { create } from "zustand";

import * as api from "@/lib/api";
import { liveGeneration } from "@/lib/live";
import { expiredQuoteFrom, quoteErrorMessage } from "@/lib/quoteRequests";

/**
 * The client's quote requests (gridgo-api#226), as GRIDGO last answered.
 *
 * Held in a store so a refusal the client must read — an expired option, a
 * closed request — always re-renders, and so the list and a quote's own
 * screen agree. Belongs to the signed-in account: `reset` runs at the
 * identity boundary in `store/session.ts`. Never persisted.
 */
type QuotesState = {
  list: api.QuoteRequest[] | null;
  listError: string | null;
  byId: Record<string, api.QuoteRequest>;
  readError: Record<string, string | null>;
  /** What is running on a quote screen right now. */
  busy: "accept" | "cancel" | "open" | null;
  /** Why the last accept, cancel or open failed. */
  actionError: string | null;

  loadList: () => Promise<void>;
  load: (id: string) => Promise<void>;
  /** Accept one option. Resolves the new draft cart, or null when refused. */
  accept: (id: string, option: string) => Promise<api.Cart | null>;
  cancel: (id: string) => Promise<boolean>;
  /** The accepted option's basket, read back so checkout can open it. */
  openCart: (id: string) => Promise<api.Cart | null>;
  clearActionError: () => void;
  reset: () => void;
};

function put(state: QuotesState, quote: api.QuoteRequest): Partial<QuotesState> {
  return {
    byId: { ...state.byId, [quote.id]: quote },
    list: state.list ? state.list.map((row) => (row.id === quote.id ? quote : row)) : state.list,
  };
}

export const useQuotes = create<QuotesState>((set, get) => ({
  list: null,
  listError: null,
  byId: {},
  readError: {},
  busy: null,
  actionError: null,

  loadList: async () => {
    const owner = liveGeneration();
    try {
      const list = await api.listQuoteRequests();
      if (owner !== liveGeneration()) return;
      set((state) => ({
        list,
        listError: null,
        byId: { ...state.byId, ...Object.fromEntries(list.map((row) => [row.id, row])) },
      }));
    } catch (error) {
      if (owner !== liveGeneration()) return;
      set({ listError: quoteErrorMessage(error, "GRIDGO could not read your quotes.") });
    }
  },

  load: async (id) => {
    const owner = liveGeneration();
    try {
      const quote = await api.getQuoteRequest(id);
      if (owner !== liveGeneration()) return;
      set((state) => ({ ...put(state, quote), readError: { ...state.readError, [id]: null } }));
    } catch (error) {
      if (owner !== liveGeneration()) return;
      set((state) => ({
        readError: { ...state.readError, [id]: quoteErrorMessage(error, "GRIDGO could not read this quote.") },
      }));
    }
  },

  accept: async (id, option) => {
    if (get().busy) return null;
    set({ busy: "accept", actionError: null });
    try {
      const { quoteRequest, cart } = await api.acceptQuoteOption(id, option, get().byId[id]?.version);
      set((state) => put(state, quoteRequest));
      return cart;
    } catch (error) {
      // A 410 carries the request as it now stands, so the screen shows it expired.
      const refreshed = expiredQuoteFrom(error);
      // An expired request's own status line already says why; only say it
      // again when GRIDGO sent no refreshed request to draw.
      set((state) =>
        refreshed
          ? put(state, refreshed)
          : { actionError: quoteErrorMessage(error, "GRIDGO could not accept this option. Try again.") },
      );
      if (!refreshed) void get().load(id);
      return null;
    } finally {
      set({ busy: null });
    }
  },

  cancel: async (id) => {
    if (get().busy) return false;
    set({ busy: "cancel", actionError: null });
    try {
      const quote = await api.cancelQuoteRequest(id);
      set((state) => put(state, quote));
      return true;
    } catch (error) {
      set({ actionError: quoteErrorMessage(error, "GRIDGO could not cancel this quote. Try again.") });
      void get().load(id);
      return false;
    } finally {
      set({ busy: null });
    }
  },

  openCart: async (id) => {
    const cartId = get().byId[id]?.cartId;
    if (!cartId || get().busy) return null;
    set({ busy: "open", actionError: null });
    try {
      return await api.getCart(cartId);
    } catch (error) {
      set({ actionError: quoteErrorMessage(error, "GRIDGO could not open this quote's basket. Try again.") });
      return null;
    } finally {
      set({ busy: null });
    }
  },

  clearActionError: () => set({ actionError: null }),

  reset: () => set({ list: null, listError: null, byId: {}, readError: {}, busy: null, actionError: null }),
}));
