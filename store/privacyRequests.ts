import { create } from "zustand";

import * as api from "@/lib/api";
import type { PrivacyRequest, PrivacyRequestKind } from "@/lib/api";
import { PRIVACY_REQUEST_FAILED } from "@/lib/legal";

/**
 * The client's own privacy requests (`/me/privacy-requests`): the list on
 * Your data, and the send from the request screen.
 *
 * A store rather than screen state for the reason `store/loginFlow.ts` gives —
 * the send lands from an async continuation — and so the list is already up to
 * date when the client is taken back to it. Never persisted.
 */
type PrivacyRequestsState = {
  requests: PrivacyRequest[];
  status: "idle" | "loading" | "ready" | "failed";
  sending: boolean;
  error: string | null;
  /** The request just sent, for the confirmation. */
  sent: PrivacyRequest | null;
  load: () => Promise<void>;
  send: (kind: PrivacyRequestKind, details?: string) => Promise<PrivacyRequest | null>;
  clearSend: () => void;
  reset: () => void;
};

const initial = {
  requests: [] as PrivacyRequest[],
  status: "idle" as const,
  sending: false,
  error: null,
  sent: null,
};

export const usePrivacyRequests = create<PrivacyRequestsState>((set, get) => ({
  ...initial,

  load: async () => {
    if (!get().requests.length) set({ status: "loading" });
    try {
      const requests = await api.listPrivacyRequests();
      set({ requests: sortNewestFirst(requests), status: "ready" });
    } catch {
      set({ status: get().requests.length ? "ready" : "failed" });
    }
  },

  send: async (kind, details) => {
    if (get().sending) return null;
    set({ sending: true, error: null, sent: null });
    try {
      const request = await api.createPrivacyRequest(kind, details);
      set({
        sent: request,
        requests: sortNewestFirst([request, ...get().requests.filter((r) => r.id !== request.id)]),
      });
      return request;
    } catch {
      set({ error: PRIVACY_REQUEST_FAILED });
      return null;
    } finally {
      set({ sending: false });
    }
  },

  clearSend: () => set({ sending: false, error: null, sent: null }),
  reset: () => set(initial),
}));

function sortNewestFirst(requests: PrivacyRequest[]): PrivacyRequest[] {
  return [...requests].sort(
    (a, b) => (Date.parse(b.requestedAt) || 0) - (Date.parse(a.requestedAt) || 0),
  );
}
