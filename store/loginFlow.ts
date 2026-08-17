import { create } from "zustand";

import type { ClerkSecondFactorStrategy } from "@/lib/clerkSignIn";

export type LoginStep = "credentials" | "recoveryCode" | "newPassword";
export type LoginCodePurpose = "reset" | "verify";

type LoginFlowState = {
  step: LoginStep;
  codePurpose: LoginCodePurpose;
  secondFactor: ClerkSecondFactorStrategy;
  code: string;
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
};

export const useLoginFlow = create<LoginFlowState>((set) => ({
  ...initial,
  enterVerification: (factor) =>
    set({
      step: "recoveryCode",
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
