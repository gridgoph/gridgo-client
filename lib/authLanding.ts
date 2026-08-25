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
 * - a Clerk identity GRIDGO has not mapped yet → complete profile;
 * - a client who has not ranked quality, speed and distance → rank them;
 * - any other signed-in client → Home.
 *
 * The ranking rung waits for its own durable read. It is stored on the phone,
 * so a client who ranked last week is not signed in and ranked in the same
 * tick — sending them back to the ranking screen for the half-second before
 * storage answers would be a bug they could see. `pending` is that half-second:
 * the caller draws nothing rather than the wrong thing.
 *
 * First-run onboarding is no longer a landing destination. `justProvisioned`
 * is still written when activate creates the client, and Settings still offers
 * “View onboarding”; a just-verified client must leave the code form for Home.
 */

import type { User } from "@/lib/api";
import { needsClientProfile } from "@/lib/signup";

export type AuthLanding =
  | { kind: "complete_profile" }
  | { kind: "priorities" }
  | { kind: "onboarding" }
  | { kind: "home" }
  /** Durable state has not answered yet. Show nothing; do not guess. */
  | { kind: "pending" }
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
  /** All three ranked. Only meaningful once `prioritiesReady`. */
  hasRanked: boolean;
};

export function authLanding(state: AuthLandingState): AuthLanding {
  if (state.user && needsClientProfile(state.user)) return { kind: "complete_profile" };
  if (!state.user && state.pendingClerkProfile) return { kind: "complete_profile" };
  if (state.user) {
    if (!state.prioritiesReady) return { kind: "pending" };
    if (!state.hasRanked) return { kind: "priorities" };
    return { kind: "home" };
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
