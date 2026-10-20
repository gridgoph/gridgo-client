import { create } from "zustand";
import { persist } from "zustand/middleware";

import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { shouldAcknowledgeTracking, type EarnedView } from "@/lib/foundingTester";
import { installationId } from "@/lib/installationId";
import { createPersistStorage } from "@/lib/persistStorage";
import { useSession } from "@/store/session";

const STORAGE_KEY = "gridgo.client.foundingTester.v1";

type InviteStatus = "idle" | "loading" | "ready" | "error";

export type InviteNotice = "copied" | "copy_failed" | null;

type FoundingTesterStore = {
  hydrated: boolean;
  /**
   * The `awardedAt` already celebrated on this phone, per account. Persisted:
   * a reload, a survey retry or a cold start reads the same stamp back, and the
   * celebration must not play again for it.
   */
  celebrated: Record<string, string>;
  /** The celebration on screen, latched as it opened. In memory only. */
  showing: EarnedView | null;
  /** Opens the celebration and records it in the same step. */
  celebrate: (userId: string, view: EarnedView) => void;
  close: () => void;

  /** The invite counts and link, as GRIDGO last answered. In memory only. */
  invites: api.TesterInvites | null;
  inviteStatus: InviteStatus;
  inviteError: string | null;
  /** What the last Copy did, said under the link. */
  notice: InviteNotice;
  /** Makes or reads back the client's invite code. */
  loadInvite: () => Promise<void>;
  setNotice: (notice: InviteNotice) => void;

  /** Tells GRIDGO which installation this account is using. Once per account per launch. */
  registerInstallation: () => Promise<void>;
  /** "Track your order": the tracking screen opened this order. */
  acknowledgeTracking: (order: api.Order) => Promise<void>;
  /** The account changed: nothing read for the last one is kept. */
  resetAccount: () => void;
};

/** Accounts this launch has already registered the installation for. */
const registered = new Set<string>();
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
    (set) => ({
      hydrated: false,
      celebrated: {},
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
        set((state) => ({ inviteStatus: state.invites ? "ready" : "loading", inviteError: null }));
        try {
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

      registerInstallation: async () => {
        const ownerId = useSession.getState().user?.id;
        if (!ownerId || registered.has(ownerId)) return;
        registered.add(ownerId);
        const id = await installationId();
        if (!id) return;
        try {
          applyRead(ownerId, await api.recordTesterInstallation(id));
        } catch {
          // An API without the route, or one bad read: the next launch tries
          // again. Nothing on screen depends on it.
          registered.delete(ownerId);
        }
      },

      acknowledgeTracking: async (order) => {
        const user = useSession.getState().user;
        if (!user || !shouldAcknowledgeTracking(user, order)) return;
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
        set({ showing: null, invites: null, inviteStatus: "idle", inviteError: null, notice: null });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({ celebrated: state.celebrated }),
      onRehydrateStorage: () => () => {
        useFoundingTester.setState({ hydrated: true });
      },
    },
  ),
);

/** Tests only: forget what this launch has already sent. */
export function resetFoundingTesterCallsForTests() {
  registered.clear();
  acknowledged.clear();
}
