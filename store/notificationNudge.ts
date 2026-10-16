import { create } from "zustand";
import { persist } from "zustand/middleware";

import { NUDGE_QUIET_MS } from "@/lib/notificationNudge";
import { createPersistStorage } from "@/lib/persistStorage";

const STORAGE_KEY = "gridgo-update-sound";

type NotificationNudgeStore = {
  /**
   * Settings > App sounds, off. It mutes every in-app sound — this chime and
   * the receipt's print (#229) — and lives here because the chime came first.
   * Per phone rather than per account: it is about the room the phone is in,
   * not who is signed in.
   */
  muted: boolean;
  setMuted: (muted: boolean) => void;
  /**
   * Bumped once per read that brought new updates. Every bell watches it and
   * swings when it moves; the root hook plays the chime. Not persisted — a
   * nudge belongs to the moment it happened.
   */
  seq: number;
  /** What a screen reader hears for the latest nudge. */
  announcement: string;
  /** When `seq` last moved, for the quiet window. */
  lastAt: number;
  /**
   * New updates landed. Inside `NUDGE_QUIET_MS` of the last nudge it rings
   * nothing: a burst of rows is one moment, one swing, one chime.
   */
  nudge: (announcement: string, now?: number) => void;
  /**
   * Until when the chime stays quiet while the bell still swings. Checkout and
   * the receipt's print set it (#229): the notices a client's own order writes
   * land while the receipt prints, and the print is already the sound for
   * that moment. Not persisted.
   */
  hushedUntil: number;
  hush: (ms: number, now?: number) => void;
};

/** The bell's moment, and whether it makes a sound (#230). */
export const useNotificationNudge = create<NotificationNudgeStore>()(
  persist(
    (set) => ({
      muted: false,
      setMuted: (muted) => set({ muted }),
      seq: 0,
      announcement: "",
      lastAt: 0,
      nudge: (announcement, now = Date.now()) =>
        set((state) =>
          now - state.lastAt < NUDGE_QUIET_MS
            ? state
            : { seq: state.seq + 1, announcement, lastAt: now },
        ),
      hushedUntil: 0,
      hush: (ms, now = Date.now()) =>
        set((state) => ({ hushedUntil: Math.max(state.hushedUntil, now + ms) })),
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({ muted: state.muted }),
    },
  ),
);
