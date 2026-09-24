import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  describeOffer,
  fetchLatestRelease,
  justUpdated,
  localDay,
  shouldCheckForUpdate,
  shouldOfferUpdate,
  type AppBuild,
  type UpdateDismissal,
} from "@/lib/appUpdate";
import { createPersistStorage } from "@/lib/persistStorage";

const STORAGE_KEY = "gridgo.client.appUpdate.v1";

/**
 * Every decision the check makes, in a development build's Metro log, so a
 * prompt that does not appear says why instead of failing silently. A release
 * build logs nothing: an update prompt that finds nothing is not news.
 */
export function logUpdateCheck(line: string): void {
  if (__DEV__) console.info(`[update-check] ${line}`);
}

type AppUpdateStore = {
  hydrated: boolean;
  /** The newest `versionCode` this phone has launched. Persisted. */
  lastSeenVersionCode: number | null;
  /** The release "Later" put off, and when. Persisted. */
  dismissed: UpdateDismissal | null;

  /** This launch's build; `null` where the check does not run (Expo Go, dev). */
  installed: AppBuild | null;
  /** A newer release to offer. Drives the prompt. */
  available: AppBuild | null;
  /** Set on the first launch of a newer build. Drives the confirmation. */
  completed: AppBuild | null;
  /** In memory only, so every cold launch reads again. */
  lastCheckedAt: number | null;
  checking: boolean;

  /** Once per launch, after hydration: records the build and spots an upgrade. */
  start: (installed: AppBuild | null) => void;
  /** Reads the latest release unless one was read within the interval. */
  check: (now?: number, fetchImpl?: typeof fetch) => Promise<void>;
  later: (now?: number) => void;
  /** The download has been handed to the phone; the prompt steps aside. */
  startDownload: () => void;
  acknowledgeCompleted: () => void;
  reset: () => void;
};

const initial = {
  lastSeenVersionCode: null,
  dismissed: null,
  installed: null,
  available: null,
  completed: null,
  lastCheckedAt: null,
  checking: false,
};

/**
 * The update prompt's state. Every rule is in `lib/appUpdate.ts`; this only
 * remembers across launches what those rules need: the last build this phone
 * ran, and which release "Later" put off on which day.
 */
export const useAppUpdate = create<AppUpdateStore>()(
  persist(
    (set, get) => ({
      hydrated: false,
      ...initial,

      start: (installed) => {
        if (!installed) {
          set({ installed: null });
          return;
        }
        const { lastSeenVersionCode } = get();
        set({
          installed,
          completed: justUpdated(installed, lastSeenVersionCode) ? installed : null,
          // Never lowered: a downgrade is not an update, and must not make the
          // next reinstall of the newer build read as one.
          lastSeenVersionCode: Math.max(lastSeenVersionCode ?? 0, installed.versionCode),
        });
      },

      check: async (now = Date.now(), fetchImpl = fetch) => {
        const { installed, checking, lastCheckedAt } = get();
        if (!installed || checking) return;
        if (!shouldCheckForUpdate(lastCheckedAt, now)) {
          logUpdateCheck("skipped: the latest release was read less than 4 hours ago");
          return;
        }
        set({ checking: true });
        try {
          const read = await fetchLatestRelease(fetchImpl);
          logUpdateCheck(read.detail);
          // Only a read GitHub answered starts the interval. Offline or timed
          // out, the next return to the foreground tries again.
          if (read.answered) set({ lastCheckedAt: now });
          // Nothing to read: say nothing, and keep whatever is on screen.
          const { latest } = read;
          if (!latest) return;
          const input = {
            installed,
            latest,
            dismissed: get().dismissed,
            today: localDay(new Date(now)),
          };
          const offer = shouldOfferUpdate(input);
          logUpdateCheck(describeOffer(input, offer));
          set({ available: offer ? latest : null });
        } finally {
          set({ checking: false });
        }
      },

      later: (now = Date.now()) => {
        const { available } = get();
        if (!available) return;
        set({
          available: null,
          dismissed: { versionCode: available.versionCode, day: localDay(new Date(now)) },
        });
      },

      startDownload: () => set({ available: null }),

      acknowledgeCompleted: () => set({ completed: null }),

      reset: () => set({ ...initial }),
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({
        lastSeenVersionCode: state.lastSeenVersionCode,
        dismissed: state.dismissed,
      }),
      onRehydrateStorage: () => () => {
        useAppUpdate.setState({ hydrated: true });
      },
    },
  ),
);
