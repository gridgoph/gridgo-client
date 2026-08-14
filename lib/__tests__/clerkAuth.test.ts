import { clerkErrorMessage, passwordConfirmationError, splitFullName } from "@/lib/clerkAuth";

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
});
