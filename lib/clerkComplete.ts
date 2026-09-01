/**
 * The one path out of a finished Clerk flow.
 *
 * Sign-up and sign-in both end the same way: Clerk has (or can activate) a
 * session, and GRIDGO still has to join it to the client projection before any
 * screen may leave the auth stack. Clerk finalizing on its own is not enough —
 * `useSession().user` is what Home renders on, so a flow that finalizes without
 * adopting leaves the person on the form with nothing happening. Both screens
 * call `completeClerkAuth`; neither owns a copy of this.
 */

import { isAlreadySignedInError } from "@/lib/clerkAuth";
import { invalidateClerkGridgoSync, syncClerkToGridgo } from "@/lib/clerkGridgoSync";
import type { ClerkBridgeResult } from "@/lib/clerkSessionBridge";
import type { ClerkGetToken, ClerkTokenWait } from "@/lib/clerkSignIn";

/** Clerk's flow methods answer with an error rather than throwing. */
export type ClerkFlowResult = { error?: unknown } | void | null;

export type CompleteClerkAuthDeps = {
  /** Clerk's `finalize` for the flow that just reached `complete`. */
  finalize?: () => Promise<ClerkFlowResult>;
  /** Set when Clerk refused to create a session because one already exists. */
  existingSessionId?: string | null;
  setActive: (args: { session: string }) => Promise<unknown>;
  getToken: ClerkGetToken;
  signOut: () => Promise<unknown>;
  /** Known Clerk session id, when the caller has one that is still current. */
  sessionId?: string | null;
  /** Override the short JWT wait. Google's native return needs a longer one. */
  tokenWait?: ClerkTokenWait;
};

export async function completeClerkAuth(
  deps: CompleteClerkAuthDeps,
): Promise<ClerkBridgeResult> {
  if (deps.existingSessionId) {
    try {
      await deps.setActive({ session: deps.existingSessionId });
    } catch {
      // Already the active session, or Clerk cannot select it — the token
      // probe below is the honest test of whether it is usable.
    }
  } else if (deps.finalize) {
    const finalized = await deps.finalize();
    const error = finalized && "error" in finalized ? finalized.error : null;
    // "You're already signed in" here means Clerk kept the session it had
    // rather than minting a new one. That is the session to adopt.
    if (error && !isAlreadySignedInError(error)) throw error;
  }

  // The session just changed, so a bridge run started against the previous one
  // must not win the race and write the wrong projection.
  invalidateClerkGridgoSync();
  return syncClerkToGridgo({
    getToken: deps.getToken,
    signOut: deps.signOut,
    sessionId: deps.existingSessionId ?? deps.sessionId ?? null,
    tokenWait: deps.tokenWait,
  });
}

export type SettleOutcome = "handled" | "ready";

export type SettledAttempt<T> = { kind: "handled" } | { kind: "ran"; value: T };

/**
 * Run a Clerk sign-in / sign-up attempt with any leftover session settled first.
 *
 * Clerk refuses a second attempt while a session is live, and it can refuse
 * after the fact too — the leftover is adopted or cleared, then the attempt is
 * made once more. "You are currently logged in" is never the end of the road;
 * only a leftover that can neither mint a token nor be signed out is, and that
 * throw reaches the caller so it can offer sign-out.
 */
export async function withSettledClerkSession<T>(deps: {
  isSignedIn: boolean;
  settle: (alreadySignedIn: boolean) => Promise<SettleOutcome>;
  run: () => Promise<T>;
}): Promise<SettledAttempt<T>> {
  if ((await deps.settle(deps.isSignedIn)) === "handled") return { kind: "handled" };
  try {
    return { kind: "ran", value: await deps.run() };
  } catch (error) {
    if (!isAlreadySignedInError(error)) throw error;
    if ((await deps.settle(true)) === "handled") return { kind: "handled" };
    return { kind: "ran", value: await deps.run() };
  }
}
