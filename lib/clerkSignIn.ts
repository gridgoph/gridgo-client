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
  | { status: "cleared" };

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
    // Clearing a dead leftover must not block the credentials just submitted.
  }
  return { status: "cleared" };
}
