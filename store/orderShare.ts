import { create } from "zustand";
import { persist } from "zustand/middleware";

import * as api from "@/lib/api";
import { newUuidV4 } from "@/lib/installationId";
import { shareErrorMessage, tapRefusalIsFinal, type SharePresentation } from "@/lib/orderShare";
import { createPersistStorage } from "@/lib/persistStorage";
import { useSession } from "@/store/session";

const STORAGE_KEY = "gridgo.client.orderShare.v1";

type ReadStatus = "loading" | "ready" | "error";

/** A tap GRIDGO has not confirmed yet, kept so a retry reuses its ID and counts once. */
export type PendingShareTap = {
  ownerId: string;
  orderId: string;
  eventId: string;
  action: api.ShareTapAction;
};

export type ShareNotice = { tone: "ok" | "error"; text: string };

/** The card on screen: whether a share is opening, has gone out, and what it left to say. */
export type ShareSheet = { busy: boolean; finished: boolean; notice: ShareNotice | null };

const IDLE_SHEET: ShareSheet = { busy: false, finished: false, notice: null };

type OrderShareState = {
  /** GRIDGO's last answer per order. In memory only: the card flags move on GRIDGO's side. */
  shares: Record<string, api.OrderShare>;
  status: Record<string, ReadStatus>;
  errors: Record<string, string | null>;
  /** Persisted: taps sent but not yet confirmed. */
  pendingTaps: PendingShareTap[];
  /** Orders whose card was put off in this session: the repeat waits for a later visit. */
  putOff: Record<string, true>;
  /**
   * An order whose after-survey card is being decided. Other moments (the
   * Founding Tester celebration) wait while it is set, so the two never stack.
   */
  hold: string | null;
  /** The share card on screen, if any. */
  presenting: { orderId: string; presentation: SharePresentation } | null;
  /**
   * The card's own moment-to-moment state. Kept here rather than in the
   * screen because the share sheet answers asynchronously, and only a store
   * write reliably redraws after that (AGENTS.md, "Running and testing").
   */
  sheet: ShareSheet;
  setSheet: (patch: Partial<ShareSheet> | null) => void;

  /** `GET` the share data. Never throws; null when it could not be read. */
  load: (orderId: string) => Promise<api.OrderShare | null>;
  /** `POST prepare`: makes sure the invite code exists. Never throws. */
  prepare: (orderId: string) => Promise<api.OrderShare | null>;
  /** The survey is being sent: hold other moments until the card is decided. */
  holdForSurvey: (orderId: string) => void;
  release: (orderId: string) => void;
  setPresenting: (presenting: OrderShareState["presenting"]) => void;
  /** Records a card event. Best effort: a failure never keeps the card up. */
  recordCard: (orderId: string, presentation: api.ShareCardPresentation, action: api.ShareCardAction) => Promise<void>;
  /** Counts one tap on Share or Send to a friend. Never throws. */
  tap: (orderId: string, action: api.ShareTapAction) => Promise<void>;
  /** Resends the signed-in client's unconfirmed taps. */
  flushTaps: () => Promise<void>;
  reset: () => void;
};

let generation = 0;
/** Taps on the wire now, so a flush never sends one twice at once. */
const inFlight = new Set<string>();

function ownerId(): string | null {
  return useSession.getState().user?.id ?? null;
}

/**
 * The share card's memory (`lib/orderShare.ts` decides what is due). GRIDGO
 * owns whether a card is due; this store holds its last answer, the taps
 * still to be confirmed, and which card is on screen.
 */
export const useOrderShare = create<OrderShareState>()(
  persist(
    (set, get) => {
      const adopt = (orderId: string, read: api.OrderShareRead) =>
        set((state) => ({
          shares: { ...state.shares, [orderId]: read.share },
          status: { ...state.status, [orderId]: "ready" },
          errors: { ...state.errors, [orderId]: null },
        }));

      const read = async (orderId: string, call: (id: string) => Promise<api.OrderShareRead>) => {
        const mine = generation;
        set((state) => ({ status: { ...state.status, [orderId]: state.shares[orderId] ? state.status[orderId] ?? "ready" : "loading" } }));
        try {
          const answer = await call(orderId);
          if (mine !== generation) return null;
          adopt(orderId, answer);
          return answer.share;
        } catch (error) {
          if (mine !== generation) return null;
          set((state) => ({
            status: { ...state.status, [orderId]: "error" },
            errors: { ...state.errors, [orderId]: shareErrorMessage(error) },
          }));
          return null;
        }
      };

      const send = async (tap: PendingShareTap) => {
        if (inFlight.has(tap.eventId)) return;
        inFlight.add(tap.eventId);
        try {
          const answer = await api.recordShareTap(tap.orderId, tap.eventId, tap.action);
          if (ownerId() === tap.ownerId) adopt(tap.orderId, answer);
          set((state) => ({ pendingTaps: state.pendingTaps.filter((item) => item.eventId !== tap.eventId) }));
        } catch (error) {
          // A refusal that cannot change (a conflict, an order no longer
          // shareable) is dropped; anything else is resent later with the same ID.
          if (tapRefusalIsFinal(error)) {
            set((state) => ({ pendingTaps: state.pendingTaps.filter((item) => item.eventId !== tap.eventId) }));
          }
        } finally {
          inFlight.delete(tap.eventId);
        }
      };

      return {
        shares: {},
        status: {},
        errors: {},
        pendingTaps: [],
        putOff: {},
        hold: null,
        presenting: null,
        sheet: IDLE_SHEET,
        setSheet: (patch) => set((state) => ({ sheet: patch ? { ...state.sheet, ...patch } : IDLE_SHEET })),

        load: (orderId) => read(orderId, api.getOrderShare),
        prepare: (orderId) => read(orderId, api.prepareOrderShare),

        holdForSurvey: (orderId) => set({ hold: orderId }),
        release: (orderId) => {
          if (get().hold === orderId) set({ hold: null });
        },
        setPresenting: (presenting) =>
          set((state) => ({
            presenting,
            hold: presenting && state.hold === presenting.orderId ? null : state.hold,
          })),

        recordCard: async (orderId, presentation, action) => {
          if (action === "maybe_later") set((state) => ({ putOff: { ...state.putOff, [orderId]: true } }));
          const mine = generation;
          try {
            const answer = await api.recordShareCard(orderId, presentation, action);
            if (mine === generation) adopt(orderId, answer);
          } catch {
            // The card still closes. GRIDGO keeps its own answer, and a
            // repeat it still thinks is due is the worst that can follow.
          }
        },

        tap: async (orderId, action) => {
          const owner = ownerId();
          if (!owner) return;
          const tap: PendingShareTap = { ownerId: owner, orderId, eventId: newUuidV4(), action };
          set((state) => ({ pendingTaps: [...state.pendingTaps, tap] }));
          await send(tap);
        },

        flushTaps: async () => {
          const owner = ownerId();
          if (!owner) return;
          await Promise.all(get().pendingTaps.filter((tap) => tap.ownerId === owner).map(send));
        },

        reset: () => {
          generation++;
          // Unconfirmed taps stay: each belongs to its own account and is only
          // resent while that account is signed in.
          set({ shares: {}, status: {}, errors: {}, putOff: {}, hold: null, presenting: null, sheet: IDLE_SHEET });
        },
      };
    },
    {
      name: STORAGE_KEY,
      storage: createPersistStorage<Pick<OrderShareState, "pendingTaps">>(),
      partialize: (state) => ({ pendingTaps: state.pendingTaps }),
    },
  ),
);
