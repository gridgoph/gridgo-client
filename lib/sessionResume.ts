/**
 * Whether coming back to the app should join a Clerk session to GRIDGO again.
 *
 * Clerk can hold a live session that GRIDGO has not joined: the launch join
 * found no token yet (a phone waking up, a slow or offline Clerk round trip).
 * That session is the client's, so returning to the app retries the join
 * instead of leaving them on Welcome (#338). Nothing is retried that the
 * person or the platform has already answered: a sign-out, a refused identity
 * (`error`), a join already running, or a sign-in form collecting a code.
 */
export type ClerkJoinRetryState = {
  clerkSignedIn: boolean;
  user: unknown;
  pendingClerkProfile: boolean;
  loading: boolean;
  signingOut: boolean;
  error: string | null;
  loginIdle: boolean;
  signupIdle: boolean;
};

export function shouldRetryClerkJoin(state: ClerkJoinRetryState): boolean {
  return (
    state.clerkSignedIn &&
    state.user == null &&
    !state.pendingClerkProfile &&
    !state.loading &&
    !state.signingOut &&
    !state.error &&
    state.loginIdle &&
    state.signupIdle
  );
}
