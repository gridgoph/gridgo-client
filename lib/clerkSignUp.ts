/**
 * What a Clerk sign-up attempt asks for next.
 *
 * Sign-up has the same shape as sign-in: `complete` is one of several honest
 * outcomes, and the others collect something rather than failing. A status the
 * screen does not recognise must still say what Clerk is waiting for — a dead
 * "could not create your account" is what sent people back to the form with
 * nothing to change.
 */

export type SignUpContinuation =
  /** Clerk kept the session it already had instead of creating one. */
  | { kind: "existing_session"; sessionId: string }
  | { kind: "complete" }
  | { kind: "email_code" }
  | { kind: "blocked"; message: string };

export type SignUpContinuationInput = {
  status?: string | null;
  unverifiedFields?: readonly string[] | null;
  missingFields?: readonly string[] | null;
  existingSession?: { sessionId: string } | null;
};

/** Clerk's field names in the words a person would recognise. */
const FIELD_LABELS: Record<string, string> = {
  email_address: "an email address",
  phone_number: "a phone number",
  username: "a username",
  first_name: "a first name",
  last_name: "a last name",
  password: "a password",
  legal_accepted: "the terms accepted",
};

const GENERIC_BLOCKED =
  "Your account could not be created yet. Check your details and try again.";

export function missingSignUpFieldsMessage(
  missingFields?: readonly string[] | null,
): string {
  const labels = (missingFields ?? [])
    .map((field) => FIELD_LABELS[field])
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) return GENERIC_BLOCKED;
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `This account still needs ${list}. Add that and try again.`;
}

export function continuationAfterSignUp(
  input: SignUpContinuationInput,
): SignUpContinuation {
  if (input.existingSession?.sessionId) {
    return { kind: "existing_session", sessionId: input.existingSession.sessionId };
  }
  if (input.status === "complete") return { kind: "complete" };

  const unverified = input.unverifiedFields ?? [];
  if (unverified.includes("email_address")) return { kind: "email_code" };

  // A field Clerk never received cannot be fixed by mailing a code, so say
  // which one it is instead.
  const missing = input.missingFields ?? [];
  if (missing.length > 0) {
    return { kind: "blocked", message: missingSignUpFieldsMessage(missing) };
  }

  // Clerk lists nothing when the SDK has not populated these yet; email
  // verification is this app's only sign-up factor, so it is the safe default.
  if (unverified.length === 0) return { kind: "email_code" };

  return { kind: "blocked", message: GENERIC_BLOCKED };
}
