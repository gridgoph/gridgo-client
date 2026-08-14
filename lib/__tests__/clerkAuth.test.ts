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
  it("prefers Expo extra over the statically read environment value", () => {
    const original = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_environment";
    try {
      expect(resolveClerkPublishableKey("pk_live_extra", false)).toBe("pk_live_extra");
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
      else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = original;
    }
  });

  it("uses the statically read environment value when Expo extra is empty", () => {
    const original = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_environment";
    try {
      expect(resolveClerkPublishableKey("", false)).toBe("pk_live_environment");
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
      else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = original;
    }
  });

  it("rejects a development key in release mode", () => {
    expect(() => clerkPublishableKey("pk_test_example", false)).toThrow(/pk_live_/);
  });
});
