import { Linking, Platform } from "react-native";
import { create } from "zustand";

import * as api from "@/lib/api";
import { buildDistribution } from "@/lib/buildDistribution";
import { optinErrorCopy, playOptinInstall, playStoreLinks } from "@/lib/playOptin";
import { openReleaseDestination } from "@/lib/releasePush";

/**
 * The Play closed-test opt-in, as GRIDGO last answered it (`lib/playOptin.ts`).
 *
 * Not persisted: GRIDGO's `show` is read fresh on every Home load, never
 * inferred from a cached answer. Only Android asks at all.
 */

/** This install, as every call reports it. */
export function currentPlayOptinInstall(): api.PlayOptinInstall {
  const forceAndroid = __DEV__ && process.env.EXPO_PUBLIC_PLAY_OPTIN_FORCE_ANDROID === "1";
  return playOptinInstall(Platform.OS, buildDistribution(), forceAndroid);
}

type PlayOptinStore = {
  owner: string | null;
  state: api.PlayOptinState | null;
  /** The flow's own call is running. */
  busy: boolean;
  /** The last refusal, worded; cleared by the next call. */
  error: string | null;
  /** The card was closed in this session: it stays away until the next launch. */
  dismissedThisSession: boolean;
  /** `shown` / `tapped` already sent for this account in this session. */
  reported: { owner: string | null; shown: boolean; tapped: boolean };
  /** Read (and report this install). Resolves once the read settles; never throws. */
  load: (userId: string | null) => Promise<void>;
  /** The card is on screen. */
  shown: () => void;
  /** The flow opened, from the card, a push or the inbox. Before any Gmail input. */
  tapped: () => void;
  dismiss: () => void;
  confirmGmail: (email: string, googleAccount: boolean) => Promise<boolean>;
  openGroup: () => Promise<void>;
  openOptIn: () => Promise<void>;
  openPlayStore: () => Promise<void>;
  reset: () => void;
};

let sequence = 0;

function codeOf(error: unknown): string | null {
  if (!(error instanceof api.ApiError)) return null;
  const body = error.body as { error?: unknown } | null;
  return body && typeof body.error === "string" ? body.error : null;
}

function report(type: api.PlayOptinEvent): Promise<void> {
  return api.reportPlayOptinEvent(currentPlayOptinInstall(), type).catch(() => undefined);
}

const EMPTY_REPORTED = { owner: null, shown: false, tapped: false };

export const usePlayOptin = create<PlayOptinStore>()((set, get) => {
  /** Run one of the flow's calls; a refusal is worded, and a stale step is read again. */
  async function step(run: () => Promise<void>): Promise<boolean> {
    set({ busy: true, error: null });
    try {
      await run();
      return true;
    } catch (error) {
      const code = codeOf(error);
      set({ error: optinErrorCopy(code) });
      if (code === "gmail_not_confirmed" || code === "group_step_required" || code === "campaign_not_available") {
        await get().load(get().owner);
      }
      return false;
    } finally {
      set({ busy: false });
    }
  }

  /** Open a link GRIDGO sent, then read where that leaves the person. */
  async function openLink(url: string | null | undefined, event: api.PlayOptinEvent) {
    if (!url) return;
    await step(async () => {
      await api.reportPlayOptinEvent(currentPlayOptinInstall(), event);
      await Linking.openURL(url).catch(() => undefined);
    });
    await get().load(get().owner);
  }

  return {
    owner: null,
    state: null,
    busy: false,
    error: null,
    dismissedThisSession: false,
    reported: EMPTY_REPORTED,

    load: async (userId) => {
      if (!userId) {
        get().reset();
        return;
      }
      const install = currentPlayOptinInstall();
      if (install.platform !== "android") return;
      if (get().owner !== userId) {
        set({ owner: userId, state: null, error: null, dismissedThisSession: false, reported: { ...EMPTY_REPORTED, owner: userId } });
      }
      const mine = ++sequence;
      try {
        const state = await api.getPlayOptin(install);
        if (mine === sequence && get().owner === userId) set({ state });
      } catch {
        // No card on a failed read; the next Home load asks again.
      }
    },

    shown: () => {
      const { owner, reported } = get();
      if (!owner || (reported.owner === owner && reported.shown)) return;
      set({ reported: { ...reported, owner, shown: true } });
      void report("shown");
    },

    tapped: () => {
      const { owner, reported } = get();
      if (!owner || (reported.owner === owner && reported.tapped)) return;
      set({ reported: { ...reported, owner, tapped: true } });
      void report("tapped");
    },

    dismiss: () => {
      // Counted once per close: GRIDGO hides the card for good after the third.
      set({ dismissedThisSession: true });
      void report("dismissed");
    },

    confirmGmail: (email, googleAccount) =>
      step(async () => {
        const state = await api.confirmPlayOptinGmail(currentPlayOptinInstall(), email.trim(), googleAccount);
        set({ state });
      }),

    openGroup: () => openLink(get().state?.groupJoinUrl, "group_opened"),

    openOptIn: () => openLink(get().state?.optInUrl, "optin_opened"),

    openPlayStore: async () => {
      await openReleaseDestination(playStoreLinks(get().state?.playStoreUrl), (url) => Linking.openURL(url));
    },

    reset: () => {
      sequence++;
      set({ owner: null, state: null, busy: false, error: null, dismissedThisSession: false, reported: EMPTY_REPORTED });
    },
  };
});
