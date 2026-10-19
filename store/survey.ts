import { create } from "zustand";

import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  EMPTY_SURVEY_DRAFT,
  canSend,
  isSurveyClosed,
  surveyErrorMessage,
  toSubmission,
  type SurveyDraft,
} from "@/lib/survey";
import { useSession } from "@/store/session";
import { useVouchers } from "@/store/vouchers";

/**
 * Post-order surveys as GRIDGO last answered them (gridgo-api
 * `docs/SURVEY_API.md`), one per order, plus the answers being given.
 *
 * Never persisted. A survey closes on GRIDGO's clock and its low-score
 * shortcut is re-decided on every read, so a stored copy would be wrong by
 * tomorrow. The answers being given are kept for as long as the app is open,
 * per order: leaving the survey half-done and coming back finds it as it was.
 * There is no partial save on GRIDGO, so nothing is sent until "Send".
 *
 * GRIDGO's clock goes to the voucher store (`adoptClock`), which the wallet's
 * countdowns already run on; the survey's "open until" reads the same clock.
 */

type ReadStatus = "loading" | "ready" | "error";
type Busy = "submitting" | "dismissing" | null;

type SurveyState = {
  /** `undefined` before the first read; `null` when the order has no survey. */
  surveys: Record<string, api.OrderSurvey | null>;
  status: Record<string, ReadStatus>;
  options: api.SurveyOptions | null;
  drafts: Record<string, SurveyDraft>;
  busy: Record<string, Busy>;
  /** The last send or skip that did not go through, in words. */
  errors: Record<string, string | null>;
  /**
   * An order whose issue form should open when its screen is next shown: the
   * survey's "Report a problem" lands there rather than a second form.
   */
  reportIntent: string | null;
  /** Reads the survey. Never throws. */
  load: (orderId: string) => Promise<void>;
  /** Hides the automatic prompt. Resolves whether GRIDGO took it. */
  dismiss: (orderId: string) => Promise<boolean>;
  /** Sends the answers. Resolves whether GRIDGO took them. */
  submit: (orderId: string) => Promise<boolean>;
  setDraft: (orderId: string, patch: Partial<SurveyDraft>) => void;
  requestReport: (orderId: string) => void;
  /** The issue form opened or closed: the ask is answered. */
  clearReport: () => void;
  reset: () => void;
};

let generation = 0;

function adopt(set: (fn: (state: SurveyState) => Partial<SurveyState>) => void, orderId: string, read: api.OrderSurveyRead) {
  useVouchers.getState().adoptClock(read.serverTime);
  set((state) => ({
    surveys: { ...state.surveys, [orderId]: read.survey },
    status: { ...state.status, [orderId]: "ready" },
    options: read.options ?? state.options,
  }));
}

export const useSurvey = create<SurveyState>()((set, get) => ({
  surveys: {},
  status: {},
  options: null,
  drafts: {},
  busy: {},
  errors: {},
  reportIntent: null,

  load: async (orderId) => {
    const mine = generation;
    set((state) => ({ status: { ...state.status, [orderId]: state.surveys[orderId] === undefined ? "loading" : state.status[orderId] ?? "loading" } }));
    try {
      const read = await api.getOrderSurvey(orderId);
      if (mine !== generation) return;
      adopt(set, orderId, read);
    } catch {
      if (mine !== generation) return;
      set((state) => ({ status: { ...state.status, [orderId]: "error" } }));
    }
  },

  dismiss: async (orderId) => {
    const mine = generation;
    set((state) => ({ busy: { ...state.busy, [orderId]: "dismissing" }, errors: { ...state.errors, [orderId]: null } }));
    try {
      const read = await api.dismissOrderSurvey(orderId);
      if (mine !== generation) return false;
      adopt(set, orderId, read);
      set((state) => ({ busy: { ...state.busy, [orderId]: null } }));
      return true;
    } catch (error) {
      if (mine !== generation) return false;
      set((state) => ({
        busy: { ...state.busy, [orderId]: null },
        errors: {
          ...state.errors,
          [orderId]: surveyErrorMessage(error, userFacingError(error, "GRIDGO could not skip the survey just now. Try again in a moment.")),
        },
      }));
      if (isSurveyClosed(error)) void get().load(orderId);
      return false;
    }
  },

  submit: async (orderId) => {
    const survey = get().surveys[orderId];
    const draft = get().drafts[orderId] ?? EMPTY_SURVEY_DRAFT;
    if (!survey || !canSend(draft) || get().busy[orderId]) return false;
    const mine = generation;
    set((state) => ({ busy: { ...state.busy, [orderId]: "submitting" }, errors: { ...state.errors, [orderId]: null } }));
    try {
      const read = await api.submitOrderSurvey(orderId, toSubmission(draft, survey.fulfillmentKind, get().options));
      if (mine !== generation) return false;
      adopt(set, orderId, read);
      set((state) => {
        const drafts = { ...state.drafts };
        delete drafts[orderId];
        return { drafts, busy: { ...state.busy, [orderId]: null } };
      });
      // The voucher is in the wallet now; Account and the wallet say so. The
      // account is read too: a survey can be the Founding Tester mission that
      // earns the label, and the celebration reads it from there.
      void useVouchers.getState().load();
      void useSession.getState().refresh();
      return true;
    } catch (error) {
      if (mine !== generation) return false;
      set((state) => ({
        busy: { ...state.busy, [orderId]: null },
        errors: {
          ...state.errors,
          [orderId]: surveyErrorMessage(error, userFacingError(error, "Your answers did not reach GRIDGO. Check your connection and send again.")),
        },
      }));
      if (isSurveyClosed(error)) void get().load(orderId);
      return false;
    }
  },

  setDraft: (orderId, patch) =>
    set((state) => ({
      drafts: { ...state.drafts, [orderId]: { ...(state.drafts[orderId] ?? EMPTY_SURVEY_DRAFT), ...patch } },
      errors: { ...state.errors, [orderId]: null },
    })),

  requestReport: (orderId) => set({ reportIntent: orderId }),

  clearReport: () => {
    if (get().reportIntent) set({ reportIntent: null });
  },

  reset: () => {
    generation++;
    set({ surveys: {}, status: {}, options: null, drafts: {}, busy: {}, errors: {}, reportIntent: null });
  },
}));
