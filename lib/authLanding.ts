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
 * - a client the platform *created* during this sign-in → first-run onboarding,
 *   which finishes on Home. An existing client never goes there: `provisioned`
 *   is set only when `/auth/me` refused the identity and activate had to make
 *   the client, and onboarding clears the flag as it leaves;
 * - any other signed-in client → Home.
 */

import type { User } from "@/lib/api";
import { needsClientProfile } from "@/lib/signup";

export type AuthLanding =
  | { kind: "complete_profile" }
  | { kind: "onboarding" }
  | { kind: "home" }
  | { kind: "signed_out" };

export type AuthLandingState = {
  user: Pick<User, "accountType" | "orgName"> | null;
  pendingClerkProfile: boolean;
  justProvisioned: boolean;
};

export function authLanding(state: AuthLandingState): AuthLanding {
  if (state.user && needsClientProfile(state.user)) return { kind: "complete_profile" };
  if (!state.user && state.pendingClerkProfile) return { kind: "complete_profile" };
  if (state.user && state.justProvisioned) return { kind: "onboarding" };
  if (state.user) return { kind: "home" };
  return { kind: "signed_out" };
}

/** True while the auth screens should keep showing their own form. */
export function staysOnAuthScreen(landing: AuthLanding): boolean {
  return landing.kind === "signed_out";
}
