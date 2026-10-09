import { create } from "zustand";

import * as api from "@/lib/api";
import {
  clockOffsetMs,
  codeAdded,
  codeShapeProblem,
  lockedUntilOf,
  normalizeCode,
  voucherErrorMessage,
  type CodeOutcome,
} from "@/lib/vouchers";
import { userFacingError } from "@/lib/copy";

/**
 * The voucher wallet as GRIDGO last answered it (gridgo-api#204).
 *
 * Never persisted: expiry is computed by GRIDGO on every read and a held
 * voucher can be released at any moment, so a copy from yesterday is a lie.
 * It is read on Account, on the wallet, at checkout, after every change, and
 * whenever the app comes back to the foreground. The countdown runs on GRIDGO's
 * clock (`offsetMs`), not the phone's.
 */
type VouchersState = {
  list: api.VoucherList | null;
  /** GRIDGO's clock minus the phone's, from the last read. */
  offsetMs: number;
  loading: boolean;
  error: string | null;
  /** Code entry is locked until then after five codes that did not work. */
  lockedUntil: string | null;
  /** What the last code entry came to, said under the field until the next one. */
  codeNotice: { ok: boolean; text: string } | null;
  /** A code is with GRIDGO now. */
  codeBusy: boolean;
  setCodeNotice: (notice: { ok: boolean; text: string } | null) => void;
  setCodeBusy: (busy: boolean) => void;
  /** Baskets the client took a voucher off this session (GRIDGO stops picking one). */
  removedCarts: string[];
  load: () => Promise<void>;
  /** Claims a code into the wallet. Never throws. */
  addCode: (code: string) => Promise<CodeOutcome>;
  /** Stores a quote or wallet answer's clock. */
  adoptClock: (serverTime: string | null | undefined) => void;
  markRemoved: (cartId: string, removed: boolean) => void;
  reset: () => void;
};

let generation = 0;

export const useVouchers = create<VouchersState>()((set, get) => ({
  list: null,
  offsetMs: 0,
  loading: false,
  error: null,
  lockedUntil: null,
  codeNotice: null,
  codeBusy: false,
  removedCarts: [],

  setCodeNotice: (codeNotice) => set({ codeNotice }),
  setCodeBusy: (codeBusy) => set({ codeBusy }),

  load: async () => {
    const mine = generation;
    set({ loading: true });
    try {
      const list = await api.listVouchers("all");
      if (mine !== generation) return;
      set({ list, offsetMs: clockOffsetMs(list.serverTime), loading: false, error: null });
    } catch (error) {
      if (mine !== generation) return;
      set({
        loading: false,
        error: userFacingError(error, "GRIDGO could not load your vouchers. Pull down to try again."),
      });
    }
  },

  addCode: async (raw) => {
    const shape = codeShapeProblem(raw);
    if (shape) {
      set({ codeNotice: { ok: false, text: shape } });
      return { ok: false, message: shape, lockedUntil: null };
    }
    const mine = generation;
    set({ codeBusy: true, codeNotice: null });
    try {
      const result = await api.addVoucherCode(normalizeCode(raw));
      if (mine !== generation) return { ok: false, message: "", lockedUntil: null };
      const outcome = codeAdded(result, Date.now() + get().offsetMs);
      set({ lockedUntil: null, codeBusy: false, codeNotice: { ok: outcome.ok && outcome.usable, text: outcome.message } });
      void get().load();
      return outcome;
    } catch (error) {
      const lockedUntil = lockedUntilOf(error);
      const message = voucherErrorMessage(
        error,
        userFacingError(error, "GRIDGO could not check that code. Try again in a moment."),
      );
      if (mine === generation) set({ lockedUntil, codeBusy: false, codeNotice: { ok: false, text: message } });
      return { ok: false, lockedUntil, message };
    }
  },

  adoptClock: (serverTime) => {
    if (serverTime) set({ offsetMs: clockOffsetMs(serverTime) });
  },

  markRemoved: (cartId, removed) =>
    set((state) => ({
      removedCarts: removed
        ? [...new Set([...state.removedCarts, cartId])]
        : state.removedCarts.filter((id) => id !== cartId),
    })),

  reset: () => {
    generation++;
    set({
      list: null,
      offsetMs: 0,
      loading: false,
      error: null,
      lockedUntil: null,
      codeNotice: null,
      codeBusy: false,
      removedCarts: [],
    });
  },
}));
