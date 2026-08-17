/**
 * Adopt a leftover Clerk session, or clear it so the credentials just typed
 * can proceed. "You're already signed in" is never a login failure.
 */

export type ClerkGetToken = (options?: { skipCache?: boolean }) => Promise<string | null | undefined>;

export type AdoptOrClearClerkSessionInput = {
  isSignedIn: boolean;
  sessionId?: string | null;
  getToken: ClerkGetToken;
  setActive: (args: { session: string }) => Promise<unknown>;
  signOut: () => Promise<unknown>;
};

export type AdoptOrClearClerkSessionResult =
  | { status: "fresh" }
  | { status: "adopt" }
  | { status: "cleared" }
  | { status: "cleanup_failed"; message: string };

export const clerkSignOutRecoveryMessage =
  "GRIDGO could not sign you out of Clerk. Check your connection and try again.";

export const clerkPasswordIncompleteMessage =
  "This account needs another verification step. Please try again.";

export const clerkNeedsNewPasswordMessage =
  "This account has to choose a new password before signing in. Tap “Recover password” to get a code.";

export type ClerkSecondFactorStrategy = "email_code" | "phone_code" | "totp" | "backup_code";

export type PasswordSignInContinuation =
  | { kind: "complete" }
  /** Clerk kept the session it already had instead of creating one. */
  | { kind: "existing_session"; sessionId: string }
  | { kind: "verification"; factor: ClerkSecondFactorStrategy }
  | { kind: "blocked"; message: string };

const SECOND_FACTOR_ORDER: ClerkSecondFactorStrategy[] = [
  "email_code",
  "phone_code",
  "totp",
  "backup_code",
];

/** Email code, else the first second factor Clerk listed. Never throw. */
export function pickSupportedSecondFactor(
  factors?: readonly { strategy: string }[] | null,
): ClerkSecondFactorStrategy {
  const strategies = new Set((factors ?? []).map((factor) => factor.strategy));
  if (strategies.size === 0) return "email_code";
  return SECOND_FACTOR_ORDER.find((strategy) => strategies.has(strategy)) ?? "email_code";
}

/**
 * Password may finish, or Clerk may still need a second factor / new-device
 * email code. Those statuses collect a code; they are not a login failure.
 */
export function continuationAfterPassword(
  status: string | null | undefined,
  supportedSecondFactors?: readonly { strategy: string }[] | null,
  existingSession?: { sessionId: string } | null,
): PasswordSignInContinuation {
  // Clerk reports this instead of creating a second session for the same
  // person. It is the "you are currently logged in" case, and the session it
  // points at is the one to adopt — never a login failure.
  if (existingSession?.sessionId) {
    return { kind: "existing_session", sessionId: existingSession.sessionId };
  }
  if (status === "complete") return { kind: "complete" };
  if (status === "needs_second_factor" || status === "needs_client_trust") {
    return {
      kind: "verification",
      factor: pickSupportedSecondFactor(supportedSecondFactors),
    };
  }
  if (status === "needs_new_password") {
    return { kind: "blocked", message: clerkNeedsNewPasswordMessage };
  }
  return { kind: "blocked", message: clerkPasswordIncompleteMessage };
}

/**
 * True when Clerk is complaining that there is no session to act on.
 *
 * `getToken` and `signOut` both throw this once the session has gone, and the
 * app calls them from effects — an unhandled rejection there is the Metro
 * "Unable to authenticate / You are signed out" flood, not a real failure.
 */
export function isClerkSignedOutError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : typeof error === "string" ? error : ""
  ).toLowerCase();
  if (!message) return false;
  return (
    message.includes("signed out") ||
    message.includes("logged out") ||
    message.includes("no active session") ||
    message.includes("session not found") ||
    message.includes("unable to authenticate")
  );
}

/**
 * Fresh JWT for gridgo-api. Cached leftovers are often expired or empty, and a
 * signed-out Clerk throws rather than returning null — answer null either way.
 */
export async function clerkSessionToken(getToken: ClerkGetToken): Promise<string | null> {
  try {
    const token = (await getToken({ skipCache: true }))?.trim() ?? "";
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Sign out of Clerk and say whether the session is really gone. "You are
 * signed out" means it already was, which is success, not a cleanup failure.
 */
export async function releaseClerkSession(
  signOut: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await signOut();
    return true;
  } catch (error) {
    return isClerkSignedOutError(error);
  }
}

/**
 * If Clerk already has a session, activate it and keep it only when it can
 * mint a JWT. A dead leftover (failed Google, expired cache) is signed out
 * so password / Google can run again.
 */
export async function adoptOrClearClerkSession(
  input: AdoptOrClearClerkSessionInput,
): Promise<AdoptOrClearClerkSessionResult> {
  if (!input.isSignedIn) return { status: "fresh" };

  if (input.sessionId) {
    try {
      await input.setActive({ session: input.sessionId });
    } catch {
      // Already active, or the leftover id cannot be selected.
    }
  }

  const token = await clerkSessionToken(input.getToken);
  if (token) return { status: "adopt" };

  if (!(await releaseClerkSession(input.signOut))) {
    return { status: "cleanup_failed", message: clerkSignOutRecoveryMessage };
  }
  return { status: "cleared" };
}
