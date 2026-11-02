import { create } from "zustand";

import * as api from "@/lib/api";
import { deliveryChoiceError } from "@/lib/basketGroups";
import { useCart } from "@/store/cart";

/**
 * The "Deliver separately" choice on checkout (gridgo-api#275,
 * `docs/SHOP_DELIVERIES_API.md`). GRIDGO answers with the re-planned basket,
 * which is adopted as it comes. A refusal is kept against the group it was
 * made on, so the line sits under the choice the client just touched.
 *
 * In a store rather than the screen's state: an error set after a press must
 * re-render, and a plain `useState` write in that position is dropped.
 */
type State = {
  error: { groupId: string; text: string } | null;
  choose: (groupId: string, split: "by_deadline" | "none") => Promise<void>;
  reset: () => void;
};

export const useShopDeliveries = create<State>((set) => ({
  error: null,
  choose: async (groupId, split) => {
    set({ error: null });
    const cart = useCart.getState().cart;
    try {
      const next = await useCart.getState().run((cartId) => api.setCartDeliveries(cartId, groupId, split));
      useCart.getState().adopt(next);
    } catch (error) {
      set({ error: { groupId, text: deliveryChoiceError(error, cart, split) } });
    }
  },
  reset: () => set({ error: null }),
}));
