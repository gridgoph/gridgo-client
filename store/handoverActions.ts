import { create } from "zustand";

import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { DELIVERY_MISMATCH_REASON } from "@/lib/handover";

/**
 * The two things a client can send about a handover: a paid redelivery of an
 * unclaimed hub order, and a report that the rider's code did not match.
 *
 * Each lives here, per order, rather than in the card's own state, so a button
 * can never be left reading "Sending…" by a screen that went away mid-request
 * (the gridgo-client#127 lesson). Nothing is persisted: the API is the record,
 * and the order screen re-reads it after either one lands.
 */
type ActionState = {
  busy: boolean;
  error: string | null;
  done: boolean;
};

const IDLE: ActionState = { busy: false, error: null, done: false };

type HandoverActionsState = {
  redelivery: Record<string, ActionState>;
  escalation: Record<string, ActionState>;
  /** Resolves true when the API kept the request. Never throws. */
  requestRedelivery: (orderId: string) => Promise<boolean>;
  /** Resolves true when Operations has been told. Never throws. */
  reportMismatch: (orderId: string) => Promise<boolean>;
  reset: () => void;
};

export const useHandoverActions = create<HandoverActionsState>()((set, get) => ({
  redelivery: {},
  escalation: {},

  requestRedelivery: async (orderId) => {
    if (get().redelivery[orderId]?.busy) return false;
    set((state) => ({ redelivery: { ...state.redelivery, [orderId]: { ...IDLE, busy: true } } }));
    try {
      await api.requestHubRedelivery(orderId);
      set((state) => ({ redelivery: { ...state.redelivery, [orderId]: { ...IDLE, done: true } } }));
      return true;
    } catch (error) {
      const message = userFacingError(error, "The redelivery request did not reach GRIDGO. Try again.");
      set((state) => ({ redelivery: { ...state.redelivery, [orderId]: { ...IDLE, error: message } } }));
      return false;
    }
  },

  reportMismatch: async (orderId) => {
    if (get().escalation[orderId]?.busy) return false;
    set((state) => ({ escalation: { ...state.escalation, [orderId]: { ...IDLE, busy: true } } }));
    try {
      await api.escalateHandover(orderId, DELIVERY_MISMATCH_REASON);
      set((state) => ({ escalation: { ...state.escalation, [orderId]: { ...IDLE, done: true } } }));
      return true;
    } catch (error) {
      const message = userFacingError(error, "Your report did not reach GRIDGO. Try again, or message GRIDGO below.");
      set((state) => ({ escalation: { ...state.escalation, [orderId]: { ...IDLE, error: message } } }));
      return false;
    }
  },

  reset: () => set({ redelivery: {}, escalation: {} }),
}));

/** One order's state for an action, idle when nothing has been sent. */
export function actionFor(map: Record<string, ActionState>, orderId: string): ActionState {
  return map[orderId] ?? IDLE;
}
