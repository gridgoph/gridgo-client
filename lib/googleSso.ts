/**
 * Complete a Clerk Google browser-SSO attempt.
 *
 * `useSSO().startSSOFlow` is not enough: a created session must be activated
 * with `setActive({ session })` or Clerk has a session the app never adopted.
 * A second tap while already signed in must not start SSO again.
 *
 * The native redirect (`gridgoclient://sso-callback`) is a different moment:
 * the browser is already gone. `finishGoogleSsoReturn` activates or adopts
 * without opening Google again. Bouncing that route to login before adopt is
 * how a successful return landed on Welcome. A first token miss is not a
 * dead session — retry `/auth/me` until Home, or a definitive refusal.
 */

import {
  clerkTokenUnavailableMessage,
  type ClerkBridgeResult,
} from "@/lib/clerkSessionBridge";

export type GoogleSsoFlowResult = {
  createdSessionId: string | null;
  setActive?: (args: { session: string }) => Promise<unknown>;
  authSessionResult?: { type?: string } | null;
};

export type GoogleSsoOutcome =
  | { status: "already_signed_in" }
  | { status: "activated"; sessionId: string }
  | { status: "cancelled" }
  | { status: "incomplete" };

export async function completeGoogleSso(input: {
  alreadySignedIn: boolean;
  startSSOFlow: () => Promise<GoogleSsoFlowResult>;
  setActive: (args: { session: string }) => Promise<unknown>;
}): Promise<GoogleSsoOutcome> {
  if (input.alreadySignedIn) return { status: "already_signed_in" };

  const result = await input.startSSOFlow();
  const dismiss = result.authSessionResult?.type;
  if (dismiss === "cancel" || dismiss === "dismiss") return { status: "cancelled" };

  if (result.createdSessionId) {
    const activate = result.setActive ?? input.setActive;
    await activate({ session: result.createdSessionId });
    return { status: "activated", sessionId: result.createdSessionId };
  }

  return { status: "incomplete" };
}

/** First non-empty string Expo Router may hand us as a string or a one-item list. */
export function firstQueryValue(value: unknown): string | null {
  if (Array.isArray(value)) return firstQueryValue(value[0]);
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Session id Clerk put on the native redirect, if any. */
export function googleSsoCreatedSessionId(params: Record<string, unknown>): string | null {
  return firstQueryValue(params.createdSessionId) ?? firstQueryValue(params.created_session_id);
}

/** Native OAuth completion token on `gridgoclient://sso-callback`. */
export function googleSsoRotatingTokenNonce(params: Record<string, unknown>): string | null {
  return (
    firstQueryValue(params.rotating_token_nonce) ?? firstQueryValue(params.rotatingTokenNonce)
  );
}

/**
 * Finish a Google return that has already landed in the app.
 *
 * Never opens a browser. If Clerk is already signed in, adopt that session —
 * starting SSO from the callback is how a successful return bounced to login.
 */
export async function finishGoogleSsoReturn(input: {
  alreadySignedIn: boolean;
  createdSessionId: string | null;
  setActive: (args: { session: string }) => Promise<unknown>;
}): Promise<GoogleSsoOutcome> {
  return completeGoogleSso({
    alreadySignedIn: input.alreadySignedIn,
    startSSOFlow: async () => ({ createdSessionId: input.createdSessionId }),
    setActive: input.setActive,
  });
}

type GoogleSsoReloadedResource = {
  createdSessionId?: string | null;
  existingSession?: { sessionId?: string | null } | null;
  firstFactorVerification?: { status?: string | null } | null;
  finalize?: () => Promise<{ error?: unknown } | void | null>;
  __internal_future?: GoogleSsoReloadedResource;
};

function asReloadedResource(value: unknown): GoogleSsoReloadedResource | null {
  if (!value || typeof value !== "object") return null;
  return value as GoogleSsoReloadedResource;
}

/** Unwrap Clerk's classic SignIn reload into the future resource startSSOFlow uses. */
export function googleSsoSignInAfterReload(reloaded: unknown): GoogleSsoReloadedResource | null {
  const resource = asReloadedResource(reloaded);
  if (!resource) return null;
  return asReloadedResource(resource.__internal_future) ?? resource;
}

/**
 * After `signIn.reload({ rotatingTokenNonce })`, activate the created (or
 * transferred) session the same way experimental `useSSO` does once the
 * browser has returned a URL.
 */
export async function createdSessionIdFromSsoReload(
  reloaded: unknown,
  transfer: () => Promise<unknown>,
): Promise<string | null> {
  const signIn = googleSsoSignInAfterReload(reloaded);
  if (!signIn) return null;

  const transferable = signIn.firstFactorVerification?.status === "transferable";
  const resource = transferable
    ? (googleSsoSignInAfterReload(await transfer()) ?? signIn)
    : signIn;
  const sessionId =
    firstQueryValue(resource.createdSessionId) ??
    firstQueryValue(resource.existingSession?.sessionId);
  if (sessionId && resource.finalize) {
    const finalized = await resource.finalize();
    const error =
      finalized && typeof finalized === "object" && "error" in finalized
        ? finalized.error
        : null;
    if (error) throw error;
  }
  return sessionId;
}

/** Native Clerk client reload used to finish SSO when Expo Router ate the redirect URL. */
export const GOOGLE_SSO_ADOPT_RETRIES = 3;
export const GOOGLE_SSO_ADOPT_RETRY_MS = 400;

/** Transient GRIDGO join failures — keep the spinner and try token / `/auth/me` again. */
export function googleSsoAdoptShouldRetry(result: ClerkBridgeResult): boolean {
  return result.kind === "error";
}

/**
 * Join the Google session to GRIDGO, retrying token and `/auth/me` misses.
 *
 * Wrong-role, a complete profile lockup, and a successful adopt all stop.
 * Everything else stays in flight until the retries are spent — only then
 * is the session confirmed dead.
 */
export async function adoptGoogleSsoClient(deps: {
  adopt: () => Promise<ClerkBridgeResult>;
  retries?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  cancelled?: () => boolean;
}): Promise<ClerkBridgeResult> {
  const retries = deps.retries ?? GOOGLE_SSO_ADOPT_RETRIES;
  const delayMs = deps.delayMs ?? GOOGLE_SSO_ADOPT_RETRY_MS;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let last: ClerkBridgeResult = {
    kind: "error",
    message: clerkTokenUnavailableMessage,
    signOut: false,
  };
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (deps.cancelled?.()) return last;
    last = await deps.adopt();
    if (!googleSsoAdoptShouldRetry(last)) return last;
    if (attempt < retries) await sleep(delayMs);
  }
  return last;
}

export async function reloadClerkSignInForSso(
  clerk: unknown,
  rotatingTokenNonce: string,
): Promise<unknown> {
  if (!clerk || typeof clerk !== "object") return null;
  const client = (clerk as { client?: unknown }).client;
  if (!client || typeof client !== "object") return null;
  const signIn = (client as { signIn?: unknown }).signIn;
  if (!signIn || typeof signIn !== "object") return null;
  const reload = (signIn as { reload?: unknown }).reload;
  if (typeof reload !== "function") return null;
  return reload({ rotatingTokenNonce });
}
