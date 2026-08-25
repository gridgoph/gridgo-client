import { create } from "zustand";

import * as api from "@/lib/api";
import { isCompleteRanking, type PriorityRanking } from "@/lib/priorities";

/**
 * How this client wants GRIDGO to match.
 *
 * The ranking belongs to the account, not the phone: `GET /me/preferences`
 * answers with the saved order and a `version`, and matching reads the same
 * record server-side. So there is nothing persisted here — a second device
 * signs in and already knows, and this store is only the copy the screens
 * read while the app is open.
 *
 * `version: 0` is the platform default coming back because nobody has answered
 * yet. That is not a preference, so the app treats it as unranked and asks;
 * matching on a default and calling it the client's choice would be the one
 * thing this whole flow is built to avoid.
 *
 * `loaded` matters more than usual: the landing ladder reads it, and acting
 * before the account has answered would send a client who ranked last week
 * back to the ranking screen.
 */
export type PrioritiesState = {
  ranking: PriorityRanking | null;
  /** True once GRIDGO has answered, whether or not a ranking came back. */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (ranking: PriorityRanking) => Promise<void>;
  /** Sign-out: forget this account's answer without asking the next one. */
  reset: () => void;
};

export const usePriorities = create<PrioritiesState>()((set, get) => ({
  ranking: null,
  loaded: false,
  loading: false,
  error: null,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const preferences = await api.getPreferences();
      set({
        // An unanswered account carries the default ranking and version 0.
        ranking:
          preferences.version > 0 && isCompleteRanking(preferences.ranking)
            ? (preferences.ranking as PriorityRanking)
            : null,
        loaded: true,
        error: null,
      });
    } catch (error) {
      // A failed read still counts as loaded, and deliberately so: the landing
      // ladder draws nothing while this is outstanding, so leaving it false
      // would hold a client on a blank screen until they killed the app. The
      // ranking screen is the safe place to land instead — it is where they
      // were going on a first run anyway, and it says so plainly if saving
      // fails too.
      set({
        loaded: true,
        error:
          error instanceof Error
            ? error.message
            : "GRIDGO could not read your matching preference.",
      });
    } finally {
      set({ loading: false });
    }
  },

  save: async (ranking) => {
    const saved = await api.savePreferences([...ranking]);
    set({
      ranking: isCompleteRanking(saved.ranking)
        ? (saved.ranking as PriorityRanking)
        : ranking,
      loaded: true,
      error: null,
    });
  },

  reset: () => set({ ranking: null, loaded: false, loading: false, error: null }),
}));

/** True once the client has actually put all three in order. */
export function hasRanked(state: Pick<PrioritiesState, "ranking">): boolean {
  return isCompleteRanking(state.ranking);
}
