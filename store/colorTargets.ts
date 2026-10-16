import { create } from "zustand";

import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { colorTargetsRefusal, type ColorTargetInput } from "@/lib/colorTargets";
import { useCart } from "@/store/cart";

/**
 * Saving an item's exact colours (gridgo-client#249).
 *
 * The list lives on GRIDGO (`cart.lines[].colorTargets`); this holds only
 * whether a save is on its way and why the last one was refused. A PATCH
 * replaces the whole list, so each save sends every colour the client keeps.
 */
type ColorTargetsState = {
  saving: Record<string, boolean>;
  error: Record<string, string | null>;
  /** Resolves true once GRIDGO kept the list; never throws. */
  save: (lineId: string, targets: ColorTargetInput[]) => Promise<boolean>;
  clearError: (lineId: string) => void;
};

export const useColorTargets = create<ColorTargetsState>((set, get) => ({
  saving: {},
  error: {},
  save: async (lineId, targets) => {
    if (get().saving[lineId]) return false;
    set((state) => ({ saving: { ...state.saving, [lineId]: true }, error: { ...state.error, [lineId]: null } }));
    try {
      const cart = useCart.getState();
      cart.adopt(await cart.run((cartId) => api.updateCartLine(cartId, lineId, { colorTargets: targets })));
      return true;
    } catch (error) {
      const message =
        colorTargetsRefusal(error, targets.map((target) => target.label)) ??
        userFacingError(error, "Your colours did not save. Try again in a moment.");
      set((state) => ({ error: { ...state.error, [lineId]: message } }));
      return false;
    } finally {
      set((state) => ({ saving: { ...state.saving, [lineId]: false } }));
    }
  },
  clearError: (lineId) => set((state) => ({ error: { ...state.error, [lineId]: null } })),
}));
