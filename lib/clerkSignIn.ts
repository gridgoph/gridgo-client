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

export type ClerkSecondFactorStrategy = "email_code" | "phone_code" | "totp" | "backup_code";

export type PasswordSignInContinuation =
  | { kind: "complete" }
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
): PasswordSignInContinuation {
  if (status === "complete") return { kind: "complete" };
  if (status === "needs_second_factor" || status === "needs_client_trust") {
    return {
      kind: "verification",
      factor: pickSupportedSecondFactor(supportedSecondFactors),
    };
  }
  return { kind: "blocked", message: clerkPasswordIncompleteMessage };
}

/** Fresh JWT for gridgo-api. Cached leftovers are often expired or empty. */
export async function clerkSessionToken(getToken: ClerkGetToken): Promise<string | null> {
  const token = (await getToken({ skipCache: true }))?.trim() ?? "";
  return token || null;
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

  try {
    await input.signOut();
  } catch {
    return { status: "cleanup_failed", message: clerkSignOutRecoveryMessage };
  }
  return { status: "cleared" };
}
