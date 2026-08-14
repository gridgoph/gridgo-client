import { clerkErrorMessage } from "@/lib/clerkAuth";

describe("Clerk sign-up errors", () => {
  it("turns a taken email into a next step, never an internal code", () => {
    expect(
      clerkErrorMessage(
        {
          errors: [
            {
              code: "form_identifier_exists",
              longMessage: "That email address is already registered. Sign in instead.",
            },
          ],
        },
        "Could not create account.",
      ),
    ).toBe("That email address is already registered. Sign in instead.");
  });
});
