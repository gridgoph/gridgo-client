import { create } from "zustand";
import { persist } from "zustand/middleware";

import * as api from "@/lib/api";
import { newUuidV4 } from "@/lib/installationId";
import { refusalIsFinal, shareErrorMessage, type SharePresentation } from "@/lib/orderShare";
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

/**
 * A card event GRIDGO has not confirmed yet. Sent strictly in the order they
 * happened — GRIDGO refuses a "Maybe later" that arrives before its "shown" —
 * and kept across a failure or a restart until GRIDGO has answered.
 */
export type PendingCardEvent = {
  ownerId: string;
  orderId: string;
  presentation: api.ShareCardPresentation;
  action: api.ShareCardAction;
};

export type ShareNotice = { tone: "ok" | "error"; text: string };

/** The card on screen: whether a share is opening, has gone out, and what it left to say. */
export type ShareSheet = {
  /** `prepare` answered for this opening: only then is the invite on the picture GRIDGO's own. */
  prepared: boolean;
  /** `prepare` failed for this opening; a cached answer is not shared in its place. */
  prepareFailed: boolean;
  busy: boolean;
  finished: boolean;
  notice: ShareNotice | null;
};

const IDLE_SHEET: ShareSheet = { prepared: false, prepareFailed: false, busy: false, finished: false, notice: null };

type OrderShareState = {
  /** GRIDGO's last answer per order. In memory only: the card flags move on GRIDGO's side. */
  shares: Record<string, api.OrderShare>;
  status: Record<string, ReadStatus>;
  errors: Record<string, string | null>;
  /** Persisted: taps sent but not yet confirmed. */
  pendingTaps: PendingShareTap[];
  /** Persisted: card events not yet confirmed, oldest first. */
  pendingCards: PendingCardEvent[];
  /**
   * Orders whose card was just put off. The next order-screen visit for that
   * order takes it (`takePutOff`) and offers no repeat; the visit after does.
   */
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
  /**
   * Queues a card event and sends the queue in order. Never throws and never
   * keeps the card up: an event GRIDGO did not answer is resent later.
   */
  recordCard: (orderId: string, presentation: api.ShareCardPresentation, action: api.ShareCardAction) => Promise<void>;
  /** The order screen's visit straight after "Maybe later": true once, then cleared. */
  takePutOff: (orderId: string) => boolean;
  /** The client left without coming back to the order: the next visit is a later one. */
  dropPutOff: (orderId: string) => void;
  /** A repeat this phone showed that GRIDGO has not confirmed yet. */
  repeatUnconfirmed: (orderId: string) => boolean;
  /** Counts one tap on Share or Send to a friend. Never throws. */
  tap: (orderId: string, action: api.ShareTapAction) => Promise<void>;
  /** Resends the signed-in client's unconfirmed card events (in order) and taps. */
  flush: () => Promise<void>;
  reset: () => void;
};

let generation = 0;
/** Taps on the wire now, so a flush never sends one twice at once. */
const inFlight = new Set<string>();
/** Card-event passes run one after another, so two events can never race each other. */
let cardRun: Promise<void> = Promise.resolve();

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
          if (refusalIsFinal(error)) {
            set((state) => ({ pendingTaps: state.pendingTaps.filter((item) => item.eventId !== tap.eventId) }));
          }
        } finally {
          inFlight.delete(tap.eventId);
        }
      };

      const sameEvent = (a: PendingCardEvent, b: PendingCardEvent) =>
        a.ownerId === b.ownerId && a.orderId === b.orderId && a.presentation === b.presentation && a.action === b.action;

      /** Sends the queue head first, one at a time; stops at the first failure so order is kept. */
      const sendCards = async () => {
        for (;;) {
          const owner = ownerId();
          const head = owner ? get().pendingCards.find((event) => event.ownerId === owner) : undefined;
          if (!head) return;
          const mine = generation;
          try {
            const answer = await api.recordShareCard(head.orderId, head.presentation, head.action);
            if (mine === generation) adopt(head.orderId, answer);
          } catch (error) {
            // Lost on the way: keep it, and everything after it, for the next flush.
            if (!refusalIsFinal(error)) return;
          }
          set((state) => {
            const at = state.pendingCards.findIndex((event) => sameEvent(event, head));
            return at < 0 ? {} : { pendingCards: state.pendingCards.filter((_, index) => index !== at) };
          });
        }
      };

      const drainCards = () => {
        cardRun = cardRun.then(sendCards, sendCards);
        return cardRun;
      };

      return {
        shares: {},
        status: {},
        errors: {},
        pendingTaps: [],
        pendingCards: [],
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
          const owner = ownerId();
          if (!owner) return;
          if (action === "maybe_later") set((state) => ({ putOff: { ...state.putOff, [orderId]: true } }));
          set((state) => ({ pendingCards: [...state.pendingCards, { ownerId: owner, orderId, presentation, action }] }));
          await drainCards();
        },

        takePutOff: (orderId) => {
          if (!get().putOff[orderId]) return false;
          get().dropPutOff(orderId);
          return true;
        },
        dropPutOff: (orderId) =>
          set((state) => {
            if (!state.putOff[orderId]) return {};
            const putOff = { ...state.putOff };
            delete putOff[orderId];
            return { putOff };
          }),
        repeatUnconfirmed: (orderId) => {
          const owner = ownerId();
          return get().pendingCards.some(
            (event) => event.ownerId === owner && event.orderId === orderId && event.presentation === "order_repeat",
          );
        },

        tap: async (orderId, action) => {
          const owner = ownerId();
          if (!owner) return;
          const tap: PendingShareTap = { ownerId: owner, orderId, eventId: newUuidV4(), action };
          set((state) => ({ pendingTaps: [...state.pendingTaps, tap] }));
          await send(tap);
        },

        flush: async () => {
          const owner = ownerId();
          if (!owner) return;
          await Promise.all([drainCards(), ...get().pendingTaps.filter((tap) => tap.ownerId === owner).map(send)]);
        },

        reset: () => {
          generation++;
          // Unconfirmed taps and card events stay: each belongs to its own
          // account and is only resent while that account is signed in.
          set({ shares: {}, status: {}, errors: {}, putOff: {}, hold: null, presenting: null, sheet: IDLE_SHEET });
        },
      };
    },
    {
      name: STORAGE_KEY,
      storage: createPersistStorage<Pick<OrderShareState, "pendingTaps" | "pendingCards">>(),
      partialize: (state) => ({ pendingTaps: state.pendingTaps, pendingCards: state.pendingCards }),
    },
  ),
);
