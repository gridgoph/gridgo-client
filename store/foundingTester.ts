import { create } from "zustand";
import { persist } from "zustand/middleware";

import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  awardIsHistory,
  foundingTesterView,
  openSurveyOrderIds,
  shouldAcknowledgeTracking,
  type EarnedView,
} from "@/lib/foundingTester";
import { installationId } from "@/lib/installationId";
import { createPersistStorage } from "@/lib/persistStorage";
import { useSession } from "@/store/session";

const STORAGE_KEY = "gridgo.client.foundingTester.v1";

type InviteStatus = "idle" | "loading" | "ready" | "error";

/**
 * Where telling GRIDGO about this installation stands for the account signed
 * in. `failed` is retried by the next invite read; `settled` includes an
 * installation with no ID to send (storage refused), which the contract allows.
 */
export type InstallationStatus = "pending" | "settled" | "failed";

export type InviteNotice = "copied" | "copy_failed" | null;

type FoundingTesterStore = {
  hydrated: boolean;
  /**
   * The `awardedAt` already celebrated on this phone, per account. Persisted:
   * a reload, a survey retry or a cold start reads the same stamp back, and the
   * celebration must not play again for it.
   */
  celebrated: Record<string, string>;
  /**
   * Accounts this installation has read before they had the label. Persisted:
   * only an award seen to arrive is celebrated, so a reinstall or a new phone
   * does not replay an old one.
   */
  seenOpen: Record<string, boolean>;
  /** Records what this installation has seen of the account; an award it never saw arrive is marked celebrated. */
  observe: (userId: string, view: ReturnType<typeof foundingTesterView>) => void;
  /** The celebration on screen, latched as it opened. In memory only. */
  showing: EarnedView | null;
  /** Opens the celebration and records it in the same step. */
  celebrate: (userId: string, view: EarnedView) => void;
  close: () => void;

  /**
   * The invite counts and link, as GRIDGO last answered. In memory only.
   * Current only while `inviteStatus` is `ready`: after a failed refresh they
   * are last known, and the link is not offered to share.
   */
  invites: api.TesterInvites | null;
  inviteStatus: InviteStatus;
  inviteError: string | null;
  /** What the last Copy did, said under the link. */
  notice: InviteNotice;
  /** Makes or reads back the client's invite code. */
  loadInvite: () => Promise<void>;
  setNotice: (notice: InviteNotice) => void;

  /** For the account signed in; null before any attempt. */
  installation: { userId: string; status: InstallationStatus } | null;
  /**
   * Tells GRIDGO which installation this account is using. Once per account
   * per launch; a failed attempt is tried again by the next call. Resolves
   * once settled either way.
   */
  registerInstallation: () => Promise<void>;

  /**
   * Orders whose survey is open now, from the last good `GET /me/surveys`.
   * Null until read, and again after a failed read: an answer GRIDGO could not
   * confirm is neither offered nor turned into "no survey is open".
   */
  openSurveys: string[] | null;
  loadOpenSurveys: () => Promise<void>;
  /** "Track your order": the tracking screen opened this order. */
  acknowledgeTracking: (order: api.Order) => Promise<void>;
  /** The account changed: nothing read for the last one is kept. */
  resetAccount: () => void;
};

/**
 * Accounts this launch has registered the installation for, or is registering
 * it, with how it ended. Outlives `resetAccount`, so an account signed back
 * into is ready at once and is not registered again.
 */
const registered = new Map<string, Promise<InstallationStatus>>();
/** `<user>:<order>` already acknowledged, or in flight, this launch. */
const acknowledged = new Set<string>();
let inviteSequence = 0;

/**
 * Lays GRIDGO's answer onto the account the app holds, so Home, Account and
 * the celebration read the step that just ticked without another `/me`.
 */
function applyRead(ownerId: string, read: api.FoundingTesterRead) {
  if (read?.foundingTester && typeof read.foundingTester === "object") {
    useSession.setState((state) =>
      state.user?.id === ownerId ? { user: { ...state.user, foundingTester: read.foundingTester } } : {},
    );
  }
  if (read?.invites && typeof read.invites === "object" && useSession.getState().user?.id === ownerId) {
    useFoundingTester.setState({ invites: read.invites });
  }
}

/**
 * The Founding Tester path's memory (`lib/foundingTester.ts` decides what is
 * due): the once-only celebration, the invite, and the two calls only this
 * app can make for the client — which installation it is, and that the client
 * really opened an order's tracking screen.
 *
 * The celebration stamp is written when it opens, not when it is put away,
 * so an app closed with it on screen does not play it a second time.
 */
export const useFoundingTester = create<FoundingTesterStore>()(
  persist(
    (set, get) => ({
      hydrated: false,
      celebrated: {},
      seenOpen: {},
      observe: (userId, view) => {
        const state = get();
        if (view && view.kind !== "earned" && !state.seenOpen[userId]) {
          set({ seenOpen: { ...state.seenOpen, [userId]: true } });
        } else if (view?.kind === "earned" && awardIsHistory(userId, view, state.celebrated, state.seenOpen)) {
          set({ celebrated: { ...state.celebrated, [userId]: view.awardedAt } });
        }
      },
      showing: null,
      celebrate: (userId, view) =>
        set((state) => ({
          showing: view,
          celebrated: { ...state.celebrated, [userId]: view.awardedAt },
        })),
      close: () => set({ showing: null }),

      invites: null,
      inviteStatus: "idle",
      inviteError: null,
      notice: null,
      loadInvite: async () => {
        const ownerId = useSession.getState().user?.id;
        if (!ownerId) return;
        const sequence = ++inviteSequence;
        set({ inviteStatus: "loading", inviteError: null });
        try {
          // The installation first: GRIDGO checks invites against it.
          await get().registerInstallation();
          const read = await api.createTesterInvite(await installationId());
          if (sequence !== inviteSequence || useSession.getState().user?.id !== ownerId) return;
          applyRead(ownerId, read);
          set({ inviteStatus: "ready" });
        } catch (error) {
          if (sequence !== inviteSequence) return;
          set({
            inviteStatus: "error",
            inviteError: userFacingError(error, "Could not load your invite link. Try again."),
          });
        }
      },
      setNotice: (notice) => set({ notice }),

      installation: null,
      registerInstallation: () => {
        const ownerId = useSession.getState().user?.id;
        if (!ownerId) return Promise.resolve();
        const mark = (status: InstallationStatus) => {
          if (useSession.getState().user?.id === ownerId) set({ installation: { userId: ownerId, status } });
        };
        // Already registered (or registering) this launch: an account signed
        // out of and back into gets its readiness back without another call.
        const running = registered.get(ownerId);
        if (running) {
          if (get().installation?.userId !== ownerId) mark("pending");
          return running.then(mark);
        }
        mark("pending");
        const attempt = (async (): Promise<InstallationStatus> => {
          const id = await installationId();
          if (!id) return "settled";
          try {
            applyRead(ownerId, await api.recordTesterInstallation(id));
            return "settled";
          } catch {
            // An API without the route, or one bad read: said as `failed`, and
            // the next invite read or launch tries again.
            registered.delete(ownerId);
            return "failed";
          }
        })();
        registered.set(ownerId, attempt);
        return attempt.then(mark);
      },

      openSurveys: null,
      loadOpenSurveys: async () => {
        const ownerId = useSession.getState().user?.id;
        if (!ownerId) return;
        try {
          const read = await api.listOpenSurveys();
          if (useSession.getState().user?.id !== ownerId) return;
          const now = Date.parse(read.serverTime);
          set({ openSurveys: openSurveyOrderIds(read.surveys ?? [], Number.isFinite(now) ? now : Date.now()) });
        } catch {
          // The survey read before may have closed since: withheld until a read succeeds.
          if (useSession.getState().user?.id === ownerId) set({ openSurveys: null });
        }
      },

      acknowledgeTracking: async (order) => {
        const user = useSession.getState().user;
        if (!user || !shouldAcknowledgeTracking(user)) return;
        const key = `${user.id}:${order.id}`;
        if (acknowledged.has(key)) return;
        acknowledged.add(key);
        try {
          applyRead(user.id, await api.acknowledgeTesterTracking(order.id, await installationId()));
        } catch (error) {
          // A refusal (`409 tester_order_not_placed`, `404 order_not_found`)
          // stays a refusal for this launch; a network failure may try again
          // next time the screen opens.
          if (!(error instanceof api.ApiError && error.status >= 400 && error.status < 500)) acknowledged.delete(key);
        }
      },

      resetAccount: () => {
        inviteSequence++;
        set({
          showing: null,
          invites: null,
          inviteStatus: "idle",
          inviteError: null,
          notice: null,
          installation: null,
          openSurveys: null,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({ celebrated: state.celebrated, seenOpen: state.seenOpen }),
      onRehydrateStorage: () => () => {
        useFoundingTester.setState({ hydrated: true });
      },
    },
  ),
);

/**
 * Whether invites and the reward may be shown: GRIDGO has heard which
 * installation this is, or the attempt has failed (the next invite read tries
 * again). `installation` is reset on every account change, so it is always
 * the signed-in account's.
 */
export function useInstallationSettled(): boolean {
  return useFoundingTester((s) => s.installation !== null && s.installation.status !== "pending");
}

/** Tests only: forget what this launch has already sent. */
export function resetFoundingTesterCallsForTests() {
  registered.clear();
  acknowledged.clear();
}
