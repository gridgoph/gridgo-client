/**
 * Sign in with Facebook (gridgo-client#448, issue report 329B287C).
 *
 * Facebook runs through Clerk's browser OAuth exactly as Google does
 * (`useSSO().startSSOFlow({ strategy: "oauth_facebook" })`), asking Facebook
 * for the public profile and email only — Clerk's connection never posts.
 * Three things make it different enough to need its own rules:
 *
 * 1. **It ships switched off.** The button is drawn only while the Clerk
 *    instance lists `oauth_facebook` among its sign-in strategies, read from
 *    the environment Clerk fetches on every launch. Turning the connection on
 *    in the Clerk dashboard lights it up without an app release.
 * 2. **Facebook may return no email** (a phone-only Facebook account). Clerk
 *    then leaves the sign-up at `missing_requirements`, and the person adds an
 *    email or mobile and verifies a six-digit code before it can finish
 *    (`app/(auth)/finish-sign-in.tsx`).
 * 3. **That email or mobile may already be a GRIDGO person.** Clerk refuses it
 *    on the sign-up (`form_identifier_exists`), so the same screen signs into
 *    the existing account with a code sent to it instead. Never a second user.
 *
 * A Facebook account whose verified email matches an existing person is
 * linked by Clerk's own account linking and lands as an ordinary sign-in.
 */

import { clerkErrorCode, clerkErrorMessage } from "@/lib/clerkAuth";

export const FACEBOOK_STRATEGY = "oauth_facebook" as const;

/* --------------------------------------------------------------------------
   Is the button offered?
   -------------------------------------------------------------------------- */

type ClerkEnvironmentShape = {
  userSettings?: {
    authenticatableSocialStrategies?: readonly string[] | null;
    social?: Record<string, { enabled?: boolean; authenticatable?: boolean } | undefined> | null;
  } | null;
} | null;

/**
 * True when the Clerk instance will let a person sign in with Facebook.
 *
 * `clerk.__internal_environment` is Clerk's own read of the dashboard; it is
 * typed as internal, so it is read defensively and anything unexpected means
 * "not offered" — the screens then stay exactly as they were.
 */
export function clerkOffersFacebook(clerk: unknown): boolean {
  if (!clerk || typeof clerk !== "object") return false;
  let environment: ClerkEnvironmentShape;
  try {
    environment = (clerk as { __internal_environment?: ClerkEnvironmentShape })
      .__internal_environment ?? null;
  } catch {
    return false;
  }
  const settings = environment?.userSettings;
  if (!settings) return false;
  const strategies = settings.authenticatableSocialStrategies;
  if (Array.isArray(strategies)) return strategies.includes(FACEBOOK_STRATEGY);
  const facebook = settings.social?.[FACEBOOK_STRATEGY];
  return Boolean(facebook?.enabled && facebook.authenticatable !== false);
}

/**
 * A development build may draw the button before Clerk offers it, to look at
 * the screens (`EXPO_PUBLIC_SHOW_FACEBOOK_SIGN_IN=1`). Never in a release:
 * a button that leads to "not enabled" is a dead end.
 */
export function facebookPreviewForced(dev: boolean, flag: string | undefined): boolean {
  return dev && flag === "1";
}

/* --------------------------------------------------------------------------
   What came back from the Facebook window
   -------------------------------------------------------------------------- */

export type SsoFutureSignUp = {
  status?: string | null;
  missingFields?: readonly string[] | null;
  requiredFields?: readonly string[] | null;
  optionalFields?: readonly string[] | null;
  unverifiedFields?: readonly string[] | null;
  emailAddress?: string | null;
  phoneNumber?: string | null;
  createdSessionId?: string | null;
};

export type SsoFutureSignIn = {
  status?: string | null;
  identifier?: string | null;
  supportedFirstFactors?: readonly { strategy?: string | null }[] | null;
};

export type SocialSsoResult = {
  createdSessionId: string | null;
  authSessionResult?: { type?: string } | null;
  signIn?: SsoFutureSignIn | null;
  signUp?: SsoFutureSignUp | null;
};

export type SocialSsoOutcome =
  /** A session exists and has been activated by `startSSOFlow`. */
  | { status: "activated"; sessionId: string }
  /** The person closed the Facebook window. */
  | { status: "cancelled" }
  /** Facebook gave no email (or mobile): ask for one on the finish step. */
  | { status: "needs_contact" }
  /** Clerk wants the email Facebook shared confirmed before linking. */
  | { status: "needs_link_code" }
  /** Nothing to act on here; on Android the `sso-callback` route may still adopt. */
  | { status: "incomplete" };

export function socialSsoOutcome(result: SocialSsoResult): SocialSsoOutcome {
  if (result.createdSessionId) {
    return { status: "activated", sessionId: result.createdSessionId };
  }
  const closed = result.authSessionResult?.type;
  if (closed === "cancel" || closed === "dismiss") return { status: "cancelled" };
  if (signUpNeedsContact(result.signUp)) return { status: "needs_contact" };
  if (signInNeedsLinkCode(result.signIn)) return { status: "needs_link_code" };
  return { status: "incomplete" };
}

/* --------------------------------------------------------------------------
   The finish step
   -------------------------------------------------------------------------- */

export type ContactKind = "email" | "phone";

const CONTACT_FIELD: Record<ContactKind, string> = {
  email: "email_address",
  phone: "phone_number",
};

function listed(fields: readonly string[] | null | undefined, field: string): boolean {
  return Array.isArray(fields) && fields.includes(field);
}

/** A sign-up Clerk will not finish until an email or mobile is added. */
export function signUpNeedsContact(signUp: SsoFutureSignUp | null | undefined): boolean {
  if (!signUp || signUp.status !== "missing_requirements") return false;
  return contactKindsToAsk(signUp).length > 0;
}

/**
 * Which contact the finish step may ask for, in the order it offers them.
 *
 * A field Clerk lists as missing must be given; when either one would do
 * (Clerk lists one missing and the other as accepted), both are offered and
 * the person picks.
 */
export function contactKindsToAsk(signUp: SsoFutureSignUp | null | undefined): ContactKind[] {
  if (!signUp) return [];
  const kinds: ContactKind[] = ["email", "phone"];
  // A contact added but not yet verified still counts: "Use a different email"
  // comes back here, and Clerk then lists it as unverified rather than missing.
  const missing = kinds.filter(
    (kind) =>
      listed(signUp.missingFields, CONTACT_FIELD[kind]) ||
      listed(signUp.unverifiedFields, CONTACT_FIELD[kind]),
  );
  if (missing.length === 0) return [];
  if (missing.length === 2) return missing;
  const accepted = kinds.filter(
    (kind) =>
      missing.includes(kind) ||
      listed(signUp.optionalFields, CONTACT_FIELD[kind]) ||
      listed(signUp.requiredFields, CONTACT_FIELD[kind]),
  );
  return accepted;
}

/** Clerk asks for the shared email to be confirmed before linking it. */
export function signInNeedsLinkCode(signIn: SsoFutureSignIn | null | undefined): boolean {
  if (!signIn || signIn.status !== "needs_first_factor") return false;
  return (signIn.supportedFirstFactors ?? []).some((factor) => factor?.strategy === "email_code");
}

const LOCAL_MOBILE = /^0(9\d{9})$/;
const INTERNATIONAL_MOBILE = /^\+?63(9\d{9})$/;

/** A Philippine mobile as Clerk stores it (`+639XXXXXXXXX`), or null. */
export function philippineMobileE164(value: string): string | null {
  const compact = value.trim().replaceAll(/[\s()-]/g, "");
  const match = LOCAL_MOBILE.exec(compact) ?? INTERNATIONAL_MOBILE.exec(compact);
  return match ? `+63${match[1]}` : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is wrong with the typed contact, said on the field, or null. */
export function contactProblem(kind: ContactKind, value: string): string | null {
  const typed = value.trim();
  if (kind === "email") {
    if (!typed) return "Enter your email address.";
    return EMAIL.test(typed) ? null : "Check the email address — it looks incomplete.";
  }
  if (!typed) return "Enter your mobile number.";
  return philippineMobileE164(typed)
    ? null
    : "Enter a Philippine mobile number, for example 0917 123 4567.";
}

/** The typed contact the way Clerk takes it. Call only once `contactProblem` is null. */
export function contactValue(kind: ContactKind, value: string): string {
  return kind === "email" ? value.trim().toLowerCase() : (philippineMobileE164(value) ?? value.trim());
}

/** Clerk refused the contact because a person already holds it. */
export function isContactTakenError(error: unknown): boolean {
  const code = clerkErrorCode(error);
  if (code === "form_identifier_exists") return true;
  const message = clerkErrorMessage(error, "").toLowerCase();
  return message.includes("is taken") || message.includes("already exists");
}

/** A Facebook sign-in Clerk could not start (connection off, network, Meta down). */
export function isFacebookUnavailableError(error: unknown): boolean {
  const code = clerkErrorCode(error);
  return (
    code === "strategy_for_user_invalid" ||
    code === "oauth_provider_not_enabled" ||
    code === "form_param_value_invalid" ||
    code === "network_error"
  );
}

/* --------------------------------------------------------------------------
   Words
   -------------------------------------------------------------------------- */

/** Said, calmly, when the person closes the Facebook window. Not an error. */
export const FACEBOOK_CANCELLED =
  "Facebook sign-in was closed before it finished. Nothing was saved — tap Continue with Facebook to try again, or use another way below.";

/** Facebook or the connection to it is down. Points at the ways that still work. */
export const FACEBOOK_UNAVAILABLE =
  "Facebook sign-in isn't working right now. Try again in a moment, or continue with Google or your email.";

export const FACEBOOK_DID_NOT_FINISH = "Facebook sign-in did not finish. Try again.";

export type FinishCopy = { heading: string; body: string };

export function contactStepCopy(kinds: readonly ContactKind[]): FinishCopy {
  const what =
    kinds.length === 2 ? "an email or mobile number" : kinds[0] === "phone" ? "a mobile number" : "an email address";
  return {
    heading: "One more step",
    body: `Facebook didn't share an email with GRIDGO. Add ${what} so we can reach you about your orders. We'll send a six-digit code to check it's yours.`,
  };
}

export function codeStepCopy(kind: ContactKind, destination: string, existing: boolean): FinishCopy {
  const where = destination.trim() || (kind === "email" ? "your email" : "your mobile");
  if (existing) {
    return {
      heading: "Welcome back",
      body: `${where} already has a GRIDGO account. Enter the six-digit code we sent to it and you'll be signed in to that account — your orders stay together.`,
    };
  }
  return {
    heading: "Enter the code",
    body: `We sent a six-digit code to ${where}.`,
  };
}

export function linkCodeCopy(email: string | null | undefined): FinishCopy {
  const where = email?.trim() || "your email";
  return {
    heading: "Confirm it's you",
    body: `${where} already has a GRIDGO account. Enter the six-digit code we sent to it to connect Facebook to that account.`,
  };
}
