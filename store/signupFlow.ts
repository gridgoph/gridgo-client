import { create } from "zustand";

import { EMPTY_SIGNUP_CONSENT, type SignupConsent } from "@/lib/legal";

/**
 * Where a sign-up is up to, beside `store/loginFlow.ts`.
 *
 * The step is Clerk's, not the form's: the screen switches to the code because
 * Clerk asked for one. Keeping it in the store — rather than in the screen's
 * own state — is what lets the step survive a re-render started from an async
 * Clerk continuation, and it is the same shape login already uses.
 */

export type SignupStep = "details" | "emailCode";

type SignupFlowState = {
  step: SignupStep;
  code: string;
  /** The agreement boxes, unticked until the client ticks them. */
  consent: SignupConsent;
  setConsent: (consent: SignupConsent) => void;
  enterEmailCode: () => void;
  setCode: (code: string) => void;
  reset: () => void;
};

const initial = { step: "details" as const, code: "", consent: EMPTY_SIGNUP_CONSENT };

export const useSignupFlow = create<SignupFlowState>((set) => ({
  ...initial,
  enterEmailCode: () => set({ step: "emailCode", code: "" }),
  setConsent: (consent) => set({ consent }),
  setCode: (code) => set({ code }),
  reset: () => set(initial),
}));
