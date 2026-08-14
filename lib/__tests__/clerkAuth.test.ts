import {
  clerkErrorMessage,
  clerkPublishableKey,
  isAlreadySignedInError,
  passwordConfirmationError,
  resolveClerkPublishableKey,
  splitFullName,
} from "@/lib/clerkAuth";

describe("Clerk auth helpers", () => {
  it("splits the first word from the rest of a full name", () => {
    expect(splitFullName("  Ana Marie Santos  ")).toEqual({
      firstName: "Ana",
      lastName: "Marie Santos",
    });
    expect(splitFullName("Ana")).toEqual({ firstName: "Ana", lastName: undefined });
  });

  it("requires an exact password confirmation", () => {
    expect(passwordConfirmationError("secret", "different")).toBe(
      "Passwords do not match.",
    );
    expect(passwordConfirmationError("secret", "secret")).toBeNull();
  });

  it("turns Clerk's structured errors into useful copy", () => {
    expect(
      clerkErrorMessage(
        { errors: [{ longMessage: "That email address is already registered." }] },
        "Fallback",
      ),
    ).toBe("That email address is already registered.");
    expect(clerkErrorMessage(new Error("Offline"), "Fallback")).toBe("Offline");
    expect(clerkErrorMessage({}, "Fallback")).toBe("Fallback");
  });

  it("recognises Clerk's already-signed-in refusal", () => {
    expect(isAlreadySignedInError(new Error("You're already signed in"))).toBe(true);
    expect(isAlreadySignedInError({ errors: [{ message: "You're already signed in." }] })).toBe(
      true,
    );
    expect(isAlreadySignedInError(new Error("Invalid password"))).toBe(false);
  });
});

describe("Clerk publishable key bake", () => {
  it("allows a development key only in development", () => {
    expect(clerkPublishableKey("pk_test_example", true)).toBe("pk_test_example");
    expect(() => clerkPublishableKey("pk_test_example", false)).toThrow(/pk_live_/);
  });

  it("requires an explicit live key in production", () => {
    expect(clerkPublishableKey("pk_live_example", false)).toBe("pk_live_example");
    expect(() => clerkPublishableKey(undefined, false)).toThrow(/Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  });

  it("never echoes the key value when validation fails", () => {
    expect(() => clerkPublishableKey("sk_test_do-not-print", true)).toThrow(
      /Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY/,
    );
    try {
      clerkPublishableKey("sk_test_do-not-print", true);
    } catch (error) {
      expect(String(error)).not.toMatch(/sk_test_do-not-print/);
    }
  });

  it("prefers the Expo extra value and falls back to the statically read env", () => {
    const original = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_envFallback";
    try {
      expect(resolveClerkPublishableKey("pk_live_bakedExtra", false)).toBe(
        "pk_live_bakedExtra",
      );
      expect(resolveClerkPublishableKey(undefined, false)).toBe("pk_live_envFallback");
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
      else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = original;
    }
  });
});
