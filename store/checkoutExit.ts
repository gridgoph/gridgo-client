import { create } from "zustand";

import * as api from "@/lib/api";
import {
  CHECKOUT_EXIT_OTHER,
  CHECKOUT_EXIT_QUESTION,
  exitAnswerErrorMessage,
  exitOptionsFrom,
  isExitPromptGone,
  otherTextProblem,
} from "@/lib/checkoutExit";

/**
 * The checkout exit question while it is being asked (rules in
 * `lib/checkoutExit.ts`, drawn by `components/CheckoutExitQuestion.tsx`).
 *
 * Never persisted. GRIDGO holds the "once" and the 7-day spacing; this keeps
 * only the prompt it handed over, from the claim until it is answered or
 * skipped, plus which app open has already asked.
 */

type Busy = "sending" | null;

type CheckoutExitState = {
  /** The claimed question, held until it is answered or skipped. */
  prompt: api.CheckoutExitPrompt | null;
  question: string;
  options: api.CheckoutExitOption[];
  /** The question is on screen. */
  open: boolean;
  /** The answer went in: the thank-you is up. */
  sent: boolean;
  busy: Busy;
  error: string | null;
  /** "Other" is chosen and its field is showing. */
  writingOther: boolean;
  otherText: string;
  /** Bumped each time the app comes back to the front. */
  foreground: number;
  /** The app open that has already asked GRIDGO, so one open asks once. */
  checked: number | null;
  /** Asks GRIDGO whether the question is due. Never throws. */
  claim: () => Promise<void>;
  show: () => void;
  answer: (reason: string) => Promise<boolean>;
  sendOther: () => Promise<boolean>;
  /** Every way the question is put away before answering: Skip, the scrim, a drag, back. */
  skip: () => void;
  /** Closes the thank-you. */
  finish: () => void;
  setWritingOther: (on: boolean) => void;
  setOtherText: (text: string) => void;
  /** The app came back to the front: a new open may ask again. */
  resume: () => void;
  reset: () => void;
};

let generation = 0;
let claiming = false;

const initial = {
  prompt: null,
  question: CHECKOUT_EXIT_QUESTION,
  options: exitOptionsFrom(null),
  open: false,
  sent: false,
  busy: null,
  error: null,
  writingOther: false,
  otherText: "",
  foreground: 0,
  checked: null,
} satisfies Partial<CheckoutExitState>;

export const useCheckoutExit = create<CheckoutExitState>()((set, get) => ({
  ...initial,

  claim: async () => {
    if (claiming || get().prompt || get().checked === get().foreground) return;
    const mine = generation;
    claiming = true;
    set({ checked: get().foreground });
    try {
      const read = await api.claimCheckoutExitPrompt();
      if (mine !== generation || !read.prompt) return;
      set({
        prompt: read.prompt,
        question: read.prompt.question || read.question || CHECKOUT_EXIT_QUESTION,
        options: exitOptionsFrom(read.options),
        open: false,
        sent: false,
        busy: null,
        error: null,
        writingOther: false,
        otherText: "",
      });
    } catch {
      // Nothing due, or GRIDGO could not be reached: either way nothing is asked.
    } finally {
      if (mine === generation) claiming = false;
    }
  },

  show: () => {
    if (get().prompt && !get().open) set({ open: true });
  },

  answer: async (reason) => {
    const prompt = get().prompt;
    if (!prompt || get().busy) return false;
    const otherText = reason === CHECKOUT_EXIT_OTHER ? get().otherText.trim() : undefined;
    if (otherText !== undefined && otherTextProblem(otherText)) {
      set({ error: otherTextProblem(otherText) });
      return false;
    }
    const mine = generation;
    set({ busy: "sending", error: null });
    try {
      await api.answerCheckoutExitPrompt(prompt.id, otherText !== undefined ? { reason, otherText } : { reason });
      if (mine !== generation) return false;
      set({ busy: null, sent: true });
      return true;
    } catch (error) {
      if (mine !== generation) return false;
      if (isExitPromptGone(error)) {
        // Nothing left to answer: put it away rather than ask again.
        set({ ...closed() });
        return false;
      }
      set({ busy: null, error: exitAnswerErrorMessage(error) });
      return false;
    }
  },

  sendOther: () => get().answer(CHECKOUT_EXIT_OTHER),

  skip: () => {
    const { prompt, sent } = get();
    if (prompt && !sent) {
      // The skip is final and counts like an answer; it is said once, and a
      // failure to say it costs nothing — GRIDGO never asks this prompt again.
      api.answerCheckoutExitPrompt(prompt.id, { skip: true }).catch(() => undefined);
    }
    set({ ...closed() });
  },

  finish: () => set({ ...closed() }),

  setWritingOther: (on) => set({ writingOther: on, error: null }),

  setOtherText: (text) => set({ otherText: text, error: null }),

  resume: () => set((state) => ({ foreground: state.foreground + 1 })),

  reset: () => {
    generation++;
    claiming = false;
    set((state) => ({ ...initial, foreground: state.foreground + 1 }));
  },
}));

/**
 * Put away. What was on screen stays as it was (the thank-you, the typed
 * words) so the sheet does not change under the finger while it slides out;
 * the next claim starts afresh.
 */
function closed(): Partial<CheckoutExitState> {
  return { prompt: null, open: false, busy: null };
}
