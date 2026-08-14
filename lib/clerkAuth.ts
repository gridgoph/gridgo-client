type ClerkErrorShape = {
  errors?: Array<{
    longMessage?: string;
    message?: string;
  }>;
};

/** Split a display name into the fields Clerk's password sign-up accepts. */
export function splitFullName(fullName: string): {
  firstName: string;
  lastName?: string;
} {
  const [firstName = "", ...rest] = fullName.trim().split(/\s+/);
  const lastName = rest.join(" ");
  return { firstName, ...(lastName ? { lastName } : {}) };
}

export function passwordConfirmationError(
  password: string,
  confirmation: string,
): string | null {
  return password === confirmation ? null : "Passwords do not match.";
}

/** Clerk errors are structured; keep the most specific safe copy available. */
export function clerkErrorMessage(error: unknown, fallback: string): string {
  const clerkError = error as ClerkErrorShape | null;
  const first = clerkError?.errors?.[0];
  if (first?.longMessage) return first.longMessage;
  if (first?.message) return first.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Clerk refuses a second SSO start once a session is already active. */
export function isAlreadySignedInError(error: unknown): boolean {
  const message = clerkErrorMessage(error, "").toLowerCase();
  return message.includes("already signed in");
}
