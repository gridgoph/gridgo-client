import {
  continuationAfterSignUp,
  missingSignUpFieldsMessage,
} from "@/lib/clerkSignUp";

describe("continuationAfterSignUp", () => {
  it("finalizes a completed sign-up", () => {
    expect(continuationAfterSignUp({ status: "complete" })).toEqual({ kind: "complete" });
  });

  it("adopts the session Clerk kept instead of creating one", () => {
    expect(
      continuationAfterSignUp({
        status: "complete",
        existingSession: { sessionId: "sess_leftover" },
      }),
    ).toEqual({ kind: "existing_session", sessionId: "sess_leftover" });
  });

  it("collects the emailed code while the address is unverified", () => {
    expect(
      continuationAfterSignUp({
        status: "missing_requirements",
        unverifiedFields: ["email_address"],
      }),
    ).toEqual({ kind: "email_code" });
  });

  it("falls back to the email code when Clerk listed nothing yet", () => {
    expect(continuationAfterSignUp({ status: "missing_requirements" })).toEqual({
      kind: "email_code",
    });
  });

  it("names the field Clerk never received instead of mailing a code", () => {
    expect(
      continuationAfterSignUp({
        status: "missing_requirements",
        unverifiedFields: [],
        missingFields: ["phone_number"],
      }),
    ).toEqual({ kind: "blocked", message: "This account still needs a phone number. Add that and try again." });
  });
});

describe("missingSignUpFieldsMessage", () => {
  it("lists several fields in plain words", () => {
    expect(missingSignUpFieldsMessage(["first_name", "phone_number"])).toBe(
      "This account still needs a first name and a phone number. Add that and try again.",
    );
  });

  it("never leaks a raw Clerk field name", () => {
    expect(missingSignUpFieldsMessage(["something_new"])).not.toMatch(/something_new/);
  });
});
