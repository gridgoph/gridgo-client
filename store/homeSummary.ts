import { create } from "zustand";

import { getHomeSummary, type HomeSummary } from "@/lib/api";
import { useSession } from "@/store/session";

type HomeSummaryStore = {
  /** The last answer, kept for the account that asked. */
  summary: HomeSummary | null;
  owner: string | null;
  loading: boolean;
  /** The last read failed (the tile falls back; nothing is guessed). */
  failed: boolean;
  load: (userId: string | null) => Promise<void>;
  clear: () => void;
};

let sequence = 0;

/**
 * `GET /me/home-summary`, shared by Home's smart tile, the "+" sheet (Track
 * order, the bug-report tag) and the Founding Tester screen. Never persisted:
 * it is live order and voucher state.
 */
export const useHomeSummary = create<HomeSummaryStore>()((set, get) => ({
  summary: null,
  owner: null,
  loading: false,
  failed: false,
  load: async (userId) => {
    if (!userId) {
      get().clear();
      return;
    }
    const mine = ++sequence;
    if (get().owner !== userId) set({ summary: null, owner: userId });
    set({ loading: true });
    try {
      const summary = await getHomeSummary();
      if (mine === sequence) set({ summary, failed: false, loading: false });
    } catch {
      if (mine === sequence) set({ failed: true, loading: false });
    }
  },
  clear: () => {
    sequence++;
    set({ summary: null, owner: null, loading: false, failed: false });
  },
}));

/** The summary, only while it belongs to the account signed in now. */
export function useOwnHomeSummary(): HomeSummary | null {
  const userId = useSession((s) => s.user?.id ?? null);
  return useHomeSummary((s) => (userId && s.owner === userId ? s.summary : null));
}
