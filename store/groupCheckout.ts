import { create } from "zustand";

import * as api from "@/lib/api";
import { groupError, useExpressGroup } from "@/store/expressGroup";

/**
 * The host's one checkout for a group (gridgo-client#452). GRIDGO prepares
 * the exact quote for everyone's files at one shop (delivery: the nearest open
 * shop that can print them all; pickup: the host's pick), and the host pays
 * it with today's Express payment options.
 */
type GroupCheckoutState = {
  groupId: string | null;
  /** Pickup only: open Express shops near the host. */
  shops: api.ExpressShop[] | null;
  shopsError: string | null;
  supplierId: string | null;
  prepared: api.ExpressGroupPrepared | null;
  preparing: boolean;
  error: string | null;

  start: (group: api.ExpressGroup) => Promise<void>;
  chooseShop: (supplierId: string) => Promise<void>;
  prepare: () => Promise<void>;
  adoptQuote: (quote: api.ExpressQuote) => void;
  reset: () => void;
};

let seq = 0;

const INITIAL = {
  groupId: null,
  shops: null,
  shopsError: null,
  supplierId: null,
  prepared: null,
  preparing: false,
  error: null,
};

export const useGroupCheckout = create<GroupCheckoutState>((set, get) => ({
  ...INITIAL,

  start: async (group) => {
    if (get().groupId !== group.id) set({ ...INITIAL, groupId: group.id });
    if (group.fulfillmentMode === "delivery") {
      await get().prepare();
      return;
    }
    const point = group.location;
    if (!point) return;
    try {
      const shops = await api.listExpressShops(point, "nearest", "pickup");
      if (get().groupId !== group.id) return;
      set({ shops, shopsError: null });
    } catch (error) {
      set({ shopsError: groupError(error, "Shops could not load. Try again.") });
    }
  },

  chooseShop: async (supplierId) => {
    set({ supplierId });
    await get().prepare();
  },

  prepare: async () => {
    const { groupId, supplierId } = get();
    if (!groupId) return;
    const mine = ++seq;
    set({ preparing: true, error: null });
    try {
      const prepared = await api.prepareExpressGroup(groupId, supplierId);
      if (mine !== seq) return;
      useExpressGroup.getState().adopt(prepared.group);
      set({ prepared, preparing: false });
    } catch (error) {
      if (mine !== seq) return;
      set({ preparing: false, prepared: null, error: groupError(error, "GRIDGO could not price the group. Try again.") });
    }
  },

  adoptQuote: (quote) => {
    const prepared = get().prepared;
    if (prepared) set({ prepared: { ...prepared, quote } });
  },

  reset: () => {
    seq++;
    set({ ...INITIAL });
  },
}));
