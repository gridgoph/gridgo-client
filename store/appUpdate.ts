import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  describePrompt,
  fetchLatestRelease,
  justUpdated,
  newerRelease,
  shouldCheckForUpdate,
  shouldShowUpdatePrompt,
  type AppBuild,
  type ReleaseBuild,
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

/** The local "Updated to version X" item, kept until the client dismisses it. */
export type UpdatedNotice = { build: AppBuild; at: number };

type AppUpdateStore = {
  hydrated: boolean;
  /** The newest `versionCode` this phone has launched. Persisted. */
  lastSeenVersionCode: number | null;
  /**
   * The newest release GitHub named, persisted so a launch with no network,
   * or inside GitHub's rate limit, still knows the phone is behind.
   */
  latest: ReleaseBuild | null;
  /** Set once, on the first launch of a newer build. Persisted. */
  updatedNotice: UpdatedNotice | null;

  /** This launch's build; `null` where the check does not run (Expo Go, dev). */
  installed: AppBuild | null;
  /**
   * False in a Google Play build (`offersSideloadUpdates`): nothing is read,
   * offered, confirmed or pinned, because Play installs the updates. In memory.
   */
  offersUpdates: boolean;
  /** Whether the update sheet is up. */
  promptOpen: boolean;
  /** "Later" or "Update now" this launch. In memory only: a cold launch asks again. */
  dismissed: UpdateDismissal | null;
  /** Set on the first launch of a newer build. Drives the confirmation sheet. */
  completed: AppBuild | null;
  /** In memory only, so every cold launch reads again. */
  lastCheckedAt: number | null;
  checking: boolean;

  /** Once per launch, after hydration: records the build and spots an upgrade. */
  start: (installed: AppBuild | null, now?: number, offersUpdates?: boolean) => void;
  /** Reads the latest release unless one was read within the interval. */
  check: (now?: number, fetchImpl?: typeof fetch) => Promise<void>;
  /** Back in the foreground: bring a put-off prompt back if it is due, then check. */
  resume: (now?: number, fetchImpl?: typeof fetch) => Promise<void>;
  later: (now?: number) => void;
  /** The download has been handed to the phone; the prompt steps aside. */
  startDownload: (now?: number) => void;
  acknowledgeCompleted: () => void;
  dismissUpdatedNotice: () => void;
  reset: () => void;
};

const initial = {
  lastSeenVersionCode: null,
  latest: null,
  updatedNotice: null,
  installed: null,
  offersUpdates: true,
  promptOpen: false,
  dismissed: null,
  completed: null,
  lastCheckedAt: null,
  checking: false,
};

/** The newer release waiting for this phone, or `null`. Drives the Notifications card. */
export function selectAvailableUpdate(
  state: Pick<AppUpdateStore, "installed" | "latest" | "offersUpdates">,
) {
  return state.offersUpdates ? newerRelease(state.installed, state.latest) : null;
}

/**
 * The update prompt's state. Every rule is in `lib/appUpdate.ts`; this only
 * remembers across launches what those rules need: the last build this phone
 * ran, the newest release seen, and the one "Updated to" item.
 */
export const useAppUpdate = create<AppUpdateStore>()(
  persist(
    (set, get) => {
      const promptDue = (now: number) => {
        const { installed, latest, dismissed, offersUpdates } = get();
        return offersUpdates && shouldShowUpdatePrompt({ installed, latest, dismissed, now });
      };

      const putAway = (now: number) => {
        const available = selectAvailableUpdate(get());
        set({
          promptOpen: false,
          dismissed: available ? { versionCode: available.versionCode, at: now } : get().dismissed,
        });
      };

      return {
        hydrated: false,
        ...initial,

        start: (installed, now = Date.now(), offersUpdates = true) => {
          if (!installed) {
            set({ installed: null, offersUpdates, promptOpen: false });
            return;
          }
          if (!offersUpdates) {
            // A Play build keeps its version for Settings > What's new, and
            // says nothing about updates: Play installs them and tells nobody
            // through this app.
            set({ installed, offersUpdates, promptOpen: false, completed: null, updatedNotice: null });
            return;
          }
          const { lastSeenVersionCode, updatedNotice } = get();
          const upgraded = justUpdated(installed, lastSeenVersionCode);
          set({
            installed,
            offersUpdates,
            completed: upgraded ? installed : null,
            updatedNotice: upgraded ? { build: installed, at: now } : updatedNotice,
            // Never lowered: a downgrade is not an update, and must not make the
            // next reinstall of the newer build read as one.
            lastSeenVersionCode: Math.max(lastSeenVersionCode ?? 0, installed.versionCode),
          });
          // A release this phone already knew about is offered before the read
          // answers, so no network, or GitHub's rate limit, cannot hide it.
          set({ promptOpen: promptDue(now) });
        },

        check: async (now = Date.now(), fetchImpl = fetch) => {
          const { installed, offersUpdates, checking, lastCheckedAt } = get();
          if (!installed || !offersUpdates || checking) return;
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
            // Nothing to read: say nothing, and keep what this phone already knew.
            if (!read.latest) return;
            set({ latest: read.latest });
            const input = { installed, latest: read.latest, dismissed: get().dismissed, now };
            const shown = shouldShowUpdatePrompt(input);
            logUpdateCheck(describePrompt(input, shown));
            set({ promptOpen: shown });
          } finally {
            set({ checking: false });
          }
        },

        resume: async (now = Date.now(), fetchImpl = fetch) => {
          if (!get().promptOpen && promptDue(now)) set({ promptOpen: true });
          await get().check(now, fetchImpl);
        },

        later: (now = Date.now()) => putAway(now),

        startDownload: (now = Date.now()) => putAway(now),

        acknowledgeCompleted: () => set({ completed: null }),

        dismissUpdatedNotice: () => set({ updatedNotice: null }),

        reset: () => set({ ...initial }),
      };
    },
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createPersistStorage(),
      partialize: (state) => ({
        lastSeenVersionCode: state.lastSeenVersionCode,
        latest: state.latest,
        updatedNotice: state.updatedNotice,
      }),
      // v1 also kept "Later" for the rest of the day. That is the rule issue
      // #105 retired, so it is dropped rather than carried across.
      migrate: (persisted) => {
        const old = (persisted ?? {}) as { lastSeenVersionCode?: number | null };
        return {
          lastSeenVersionCode: old.lastSeenVersionCode ?? null,
          latest: null,
          updatedNotice: null,
        };
      },
      onRehydrateStorage: () => () => {
        useAppUpdate.setState({ hydrated: true });
      },
    },
  ),
);
