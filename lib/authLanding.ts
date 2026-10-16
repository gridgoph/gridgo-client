/**
 * Where a session lands.
 *
 * Five screens used to carry their own copy of this ladder (index, welcome,
 * login, signup, complete-profile), so a rule fixed in one of them stayed
 * broken in the others. It is one function now, and the screens render what it
 * returns.
 *
 * The ladder, in order:
 * - a client whose profile the app cannot read → complete profile;
 * - a Clerk identity GRIDGO has not mapped yet → complete profile, which is
 *   also where a Google sign-up agrees to the terms before GRIDGO enrolls it;
 * - a client with terms still to agree to → the agreement screen, ahead of
 *   everything else (`store/legalConsent.ts`); until that read answers, nothing;
 * - a client who has not ranked quality, speed, cost and distance → onboarding,
 *   whose last page is that ranking (gridgo-client#159);
 * - any other signed-in client → Home.
 *
 * The ranking rung waits for its own durable read. It is stored on the phone,
 * so a client who ranked last week is not signed in and ranked in the same
 * tick — sending them back to the ranking screen for the half-second before
 * storage answers would be a bug they could see. `pending` is that half-second:
 * the caller draws nothing rather than the wrong thing.
 *
 * Onboarding is keyed to the ranking, not to `justProvisioned`: a new client
 * has never ranked, so they meet the features, the notification ask and the
 * ranking in that order, and a client who ranked on another phone goes
 * straight Home. Either way a just-verified client leaves the code form.
 */

import type { User } from "@/lib/api";
import { needsClientProfile } from "@/lib/signup";
import type { LegalGateStatus } from "@/lib/legal";

export type AuthLanding =
  | { kind: "complete_profile" }
  /** Terms to agree to before anything else opens. */
  | { kind: "legal_review" }
  /** Unranked: the feature pages, the notification ask, then the ranking. */
  | { kind: "onboarding" }
  | { kind: "home" }
  /** Durable ranking read has not answered yet. Show nothing; do not guess. */
  | { kind: "pending" }
  | { kind: "signing_in" }
  | { kind: "signing_out" }
  | { kind: "signed_out" };

export type AuthLandingState = {
  user: Pick<User, "accountType" | "orgName"> | null;
  pendingClerkProfile: boolean;
  /**
   * Still written when activate creates the client. It no longer changes
   * landing: a complete client goes Home. Settings still offers onboarding.
   */
  justProvisioned: boolean;
  /** False until this phone's stored ranking has been read. */
  prioritiesReady: boolean;
  /** All four ranked. Only meaningful once `prioritiesReady`. */
  hasRanked: boolean;
  /**
   * This account's terms, from `GET /me/legal/pending`. Omitted reads as
   * clear, so a caller that does not track it keeps the old ladder.
   */
  legal?: LegalGateStatus;
  /** Local session is gone; Clerk sign-out may still be in flight. */
  signingOut?: boolean;
  /** Clerk → GRIDGO join is in flight (Google return, token wait). */
  loading?: boolean;
  /**
   * Google browser-SSO is in flight. Survives `endClerkSync` so an incomplete
   * `startSSOFlow` return cannot dump the person onto Welcome while the
   * native `sso-callback` is still about to adopt.
   */
  ssoInFlight?: boolean;
  /** Designed wait: Google/password join, or the sign-out beat. */
  sessionWait?: "in" | "out" | null;
  /** Wrong-role / refused identity — show the form, do not keep waiting. */
  error?: string | null;
  /**
   * Clerk already has a session. That alone is not Signing you in — a rider
   * Gmail on this app must reach the form, not "Taking your seat."
   */
  clerkJoined?: boolean;
};

export function authLanding(state: AuthLandingState): AuthLanding {
  if (state.sessionWait === "out") return { kind: "signing_out" };
  // Sign-out must not flash ranking / onboarding while Clerk is still leaving.
  if (state.signingOut) return { kind: "signed_out" };
  if (state.user && needsClientProfile(state.user)) return { kind: "complete_profile" };
  if (!state.user && state.pendingClerkProfile) return { kind: "complete_profile" };
  if (state.user) {
    if (state.legal === "unknown") return { kind: "pending" };
    if (state.legal === "blocked") return { kind: "legal_review" };
    if (!state.prioritiesReady) return { kind: "pending" };
    if (!state.hasRanked) return { kind: "onboarding" };
    return { kind: "home" };
  }
  // Google join after the Gmail is actually in. A leftover Clerk session
  // (rider, shop, or the tap that only opened the picker) is not this wait.
  if (
    !state.error &&
    (state.sessionWait === "in" || state.ssoInFlight)
  ) {
    return { kind: "signing_in" };
  }
  return { kind: "signed_out" };
}

/** True while the auth screens should keep showing their own form. */
export function staysOnAuthScreen(landing: AuthLanding): boolean {
  return landing.kind === "signed_out";
}

/**
 * Arm `usePreventRemove` only while the form is still the destination.
 * Back must not dump an in-progress code; a successful adopt must leave.
 */
export function shouldPreventAuthLeave(landing: AuthLanding, inProgress: boolean): boolean {
  return staysOnAuthScreen(landing) && inProgress;
}
