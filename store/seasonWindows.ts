import { create } from "zustand";
import { persist } from "zustand/middleware";

import * as api from "@/lib/api";
import { createPersistStorage } from "@/lib/persistStorage";
import {
  bannersToShow,
  davaoToday,
  EMPTY_SEASONS,
  type SeasonWindows,
} from "@/lib/seasonWindows";

const STORAGE_KEY = "gridgo.client.seasonWindows.v1";

/** A read this fresh is reused rather than asked again. */
export const SEASON_REUSE_MS = 10 * 60_000;

/** Dismissals kept per phone; old ones fall off once there are more than this. */
const MAX_DISMISSED = 50;

type SeasonWindowsStore = {
  seasons: SeasonWindows;
  /** When `seasons` was last read, ms since epoch, or null before the first read. */
  readAt: number | null;
  /** Window IDs whose Home banner this phone has put away. Persisted. */
  dismissed: string[];
  hydrated: boolean;
  /** Read the public windows, unless a fresh read is held. Never throws. */
  load: (options?: { force?: boolean; now?: number }) => Promise<void>;
  dismiss: (windowId: string) => void;
  /**
   * A tapped season push: re-read, then bring back any banner showing today
   * that this phone had put away. The push names no window, and a tap is the
   * client asking to read it — landing on a Home with nothing about it would
   * be a tap that went nowhere.
   */
  reveal: (now?: Date) => Promise<void>;
};

let inflight: Promise<void> | null = null;

/**
 * Season windows, read once and shared by Home and the deadline calendar.
 *
 * Public platform information, like the charges in `store/platformSettings.ts`,
 * so the last answer is kept on the phone and a cold start can shade the
 * calendar at once. A failed read keeps what is held and says nothing: a
 * season is a heads-up, and its absence must never stop anyone booking.
 *
 * Dismissals are per phone and per window, as the issue asks — a new season
 * is a new window ID, so dismissing this year's does not hide next year's.
 */
export const useSeasonWindows = create<SeasonWindowsStore>()(
  persist(
    (set, get) => ({
      seasons: EMPTY_SEASONS,
      readAt: null,
      dismissed: [],
      hydrated: false,
      load: ({ force = false, now = Date.now() } = {}) => {
        const { readAt } = get();
        if (!force && readAt !== null && now - readAt < SEASON_REUSE_MS) return Promise.resolve();
        if (inflight) return inflight;
        const read: Promise<void> = api
          .getSeasonWindows()
          .then((seasons) => {
            set({ seasons, readAt: Date.now() });
          })
          .catch(() => {
            // An API without the route, or no connection: keep what is held.
          })
          .finally(() => {
            inflight = null;
          });
        inflight = read;
        return read;
      },
      reveal: async (now = new Date()) => {
        await get().load({ force: true });
        const today = davaoToday(now);
        const active = new Set(
          bannersToShow(get().seasons, [], today).map((window) => window.id),
        );
        set({ dismissed: get().dismissed.filter((id) => !active.has(id)) });
      },
      dismiss: (windowId) => {
        const kept = get().dismissed.filter((id) => id !== windowId);
        set({ dismissed: [...kept, windowId].slice(-MAX_DISMISSED) });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({
        seasons: state.seasons,
        readAt: state.readAt,
        dismissed: state.dismissed,
      }),
      onRehydrateStorage: () => () => {
        useSeasonWindows.setState({ hydrated: true });
      },
    },
  ),
);
