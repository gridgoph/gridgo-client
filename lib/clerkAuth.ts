type ClerkErrorShape = {
  errors?: {
    longMessage?: string;
    message?: string;
  }[];
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

/** Clerk refuses a second sign-in once a session is already active. */
export function isAlreadySignedInError(error: unknown): boolean {
  const message = clerkErrorMessage(error, "").toLowerCase();
  return (
    message.includes("already signed in") ||
    message.includes("already logged in") ||
    message.includes("currently signed in") ||
    message.includes("currently logged in")
  );
}

/**
 * Validate the public key without ever echoing its value into an error.
 * Development may use either Clerk instance; a release must use Production.
 */
export function clerkPublishableKey(
  value: string | null | undefined,
  development: boolean,
): string {
  const key = value?.trim() ?? "";
  if (!/^pk_(test|live)_/.test(key)) {
    throw new Error(
      "Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Pull the Clerk development environment locally, or set a pk_live_* value in the EAS build environment.",
    );
  }
  if (!development && !key.startsWith("pk_live_")) {
    throw new Error("Release builds require a Clerk publishable key starting pk_live_.");
  }
  return key;
}

/**
 * Extra is the preferred source (`app.config.ts` writes it at prebuild).
 * The static `process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` read is the
 * Gradle-time fallback: Babel inlines that identifier while bundling, so
 * a release still ships the live value if extra was empty.
 */
export function resolveClerkPublishableKey(
  extra: unknown,
  development: boolean,
): string {
  const fromExtra = typeof extra === "string" ? extra : "";
  return clerkPublishableKey(
    fromExtra || process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    development,
  );
}
