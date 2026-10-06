import { create } from "zustand";

/**
 * "Add more from Shop A": the shop group the next product should join.
 *
 * Set by checkout's add-more control and read by the match screen, which asks
 * GRIDGO for that group's shop only (`groupId` on `POST /me/matches`). Adding
 * to an existing group — same shop, same date — costs no extra delivery fee,
 * which is the whole point.
 *
 * Held here rather than threaded through the four screens between checkout and
 * the match. It is dropped as soon as the client starts a product any other
 * way — the category screen without a group, Home, a new basket — so a stale
 * target can never quietly hold a new product to one shop. The match screen
 * also says it out loud, with a way to search every shop instead.
 *
 * Not persisted: it is about this errand only.
 */
type BasketGroupTargetState = {
  groupId: string | null;
  label: string | null;
  /**
   * The group's date (gridgo-client#189). A group is one shop on one date, so
   * the product joining it is asked for that date rather than a new one.
   */
  deadline: string | null;
  set: (groupId: string, label: string, deadline?: string | null) => void;
  clear: () => void;
};

export const useBasketGroupTarget = create<BasketGroupTargetState>((set) => ({
  groupId: null,
  label: null,
  deadline: null,
  set: (groupId, label, deadline = null) => set({ groupId, label, deadline }),
  clear: () => set({ groupId: null, label: null, deadline: null }),
}));
