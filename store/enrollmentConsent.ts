import { create } from "zustand";

import type { EnrollmentConsentBody } from "@/lib/api";

/**
 * What the client agreed to on the sign-up form, held until GRIDGO enrolls them.
 *
 * Clerk creates the identity first and GRIDGO's `POST /auth/clerk/activate`
 * comes after the emailed code, from the shared Clerk → GRIDGO bridge — so the
 * ticked boxes wait here for it. Memory only: an app that restarts before
 * activate asks again on Finish signing up, which is the honest outcome.
 *
 * `legacy` is an API with no legal library: the box was still ticked, but
 * there are no versions to name, so activate sends no consent fields.
 */
export type EnrollmentChoice =
  | { kind: "versioned"; body: EnrollmentConsentBody }
  | { kind: "legacy" };

type EnrollmentConsentState = {
  choice: EnrollmentChoice | null;
  hold: (choice: EnrollmentChoice) => void;
  clear: () => void;
};

export const useEnrollmentConsent = create<EnrollmentConsentState>((set) => ({
  choice: null,
  hold: (choice) => set({ choice }),
  clear: () => set({ choice: null }),
}));
