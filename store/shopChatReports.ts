import { create } from "zustand";

import { reportShopChatMessage } from "@/lib/api";
import { shopChatReportError, type ShopChatReportReason } from "@/lib/shopChat";

/**
 * Reporting a message in the print shop conversation (`lib/shopChat.ts`).
 *
 * The API keeps the report and never says back which messages this client
 * reported, so "Reported" lasts for this app session; reporting again later
 * is harmless, because the server keeps the first reason. Held in a store
 * rather than the screen so the answer lands after the request settles.
 */
type ShopChatReportsState = {
  /** The message whose reasons are showing. */
  choosingId: string | null;
  sendingId: string | null;
  reportedIds: string[];
  error: { messageId: string; message: string } | null;
  choose: (messageId: string | null) => void;
  report: (orderId: string, messageId: string, reason: ShopChatReportReason) => Promise<void>;
};

export const useShopChatReports = create<ShopChatReportsState>((set, get) => ({
  choosingId: null,
  sendingId: null,
  reportedIds: [],
  error: null,
  choose: (messageId) => set({ choosingId: messageId, error: null }),
  report: async (orderId, messageId, reason) => {
    if (get().sendingId) return;
    set({ sendingId: messageId, error: null });
    try {
      await reportShopChatMessage(orderId, messageId, reason);
      set((state) => ({
        sendingId: null,
        choosingId: null,
        reportedIds: state.reportedIds.includes(messageId) ? state.reportedIds : [...state.reportedIds, messageId],
      }));
    } catch (err) {
      set({ sendingId: null, error: { messageId, message: shopChatReportError(err) } });
    }
  },
}));
