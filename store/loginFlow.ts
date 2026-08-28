import { create } from "zustand";

import type { ClerkSecondFactorStrategy } from "@/lib/clerkSignIn";

export type LoginStep = "credentials" | "verifyCode" | "recoveryCode" | "newPassword";
export type LoginCodePurpose = "reset" | "verify";

type LoginFlowState = {
  step: LoginStep;
  codePurpose: LoginCodePurpose;
  secondFactor: ClerkSecondFactorStrategy;
  code: string;
  /**
   * A tap on this screen is in flight.
   *
   * Scoped to the tap: raised inside the handler, lowered in its `finally`,
   * and never joined to `session.loading` or Clerk's `fetchStatus` — a hung
   * background sync must not be able to disable Sign In. That was the dead
   * button.
   *
   * Here rather than in `useState` for the reason `step` is: on
   * @testing-library/react-native 14 with React 19, a plain `useState` write
   * made from an async continuation never re-renders the tree, so the
   * `finally` that lowers this would leave the button reading "Signing in…"
   * for good. A store write in the same position does re-render — and it also
   * means the mount reset below clears a stuck flag after Fast Refresh.
   */
  busy: boolean;
  setBusy: (busy: boolean) => void;
  enterVerification: (factor: ClerkSecondFactorStrategy) => void;
  enterRecovery: () => void;
  enterNewPassword: () => void;
  setCode: (code: string) => void;
  reset: () => void;
};

const initial = {
  step: "credentials" as const,
  codePurpose: "reset" as const,
  secondFactor: "email_code" as const,
  code: "",
  busy: false,
};

export const useLoginFlow = create<LoginFlowState>((set) => ({
  ...initial,
  setBusy: (busy) => set({ busy }),
  enterVerification: (factor) =>
    set({
      step: "verifyCode",
      codePurpose: "verify",
      secondFactor: factor,
      code: "",
    }),
  enterRecovery: () =>
    set({
      step: "recoveryCode",
      codePurpose: "reset",
      secondFactor: "email_code",
      code: "",
    }),
  enterNewPassword: () => set({ step: "newPassword", code: "" }),
  setCode: (code) => set({ code }),
  reset: () => set(initial),
}));
