import { create } from "zustand";

import {
  fetchReleaseHistory,
  type HistoryStatus,
  type ReleaseNotes,
} from "@/lib/whatsNewHistory";

/** A successful read is reused this long, so opening the page twice is one request. */
export const WHATS_NEW_REFRESH_MS = 10 * 60 * 1000;

type WhatsNewHistoryStore = {
  status: HistoryStatus;
  /** Releases read from GitHub. In memory only: the bundled history is what reads offline. */
  online: ReleaseNotes[];
  loadedAt: number | null;
  /** Reads the releases list unless a successful read is still fresh. Never throws. */
  load: (now?: number, fetchImpl?: typeof fetch) => Promise<void>;
};

/**
 * The online half of Settings > What's new (`lib/whatsNewHistory.ts`). A
 * store rather than screen state so the result survives leaving and returning
 * to the page, and because an async `useState` write is dropped under the test
 * renderer (see AGENTS.md, "Running and testing").
 */
export const useWhatsNewHistory = create<WhatsNewHistoryStore>((set, get) => ({
  status: "idle",
  online: [],
  loadedAt: null,
  load: async (now = Date.now(), fetchImpl = fetch) => {
    const { status, loadedAt } = get();
    if (status === "loading") return;
    if (status === "online" && loadedAt !== null && now - loadedAt < WHATS_NEW_REFRESH_MS) return;
    set({ status: "loading" });
    const read = await fetchReleaseHistory(fetchImpl);
    set(
      read.outcome === "online"
        ? { status: "online", online: read.releases, loadedAt: now }
        : // Keep what an earlier read found: it is still true, only not newer.
          { status: read.outcome },
    );
  },
}));
