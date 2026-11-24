import {
  clerkOffersFacebook,
  contactKindsToAsk,
  contactProblem,
  contactValue,
  facebookPreviewForced,
  isContactTakenError,
  isFacebookUnavailableError,
  philippineMobileE164,
  signInNeedsLinkCode,
  signUpNeedsContact,
  socialSsoOutcome,
} from "@/lib/socialSignIn";

const env = (strategies: string[]) => ({
  __internal_environment: { userSettings: { authenticatableSocialStrategies: strategies } },
});

describe("clerkOffersFacebook", () => {
  it("is true only while Clerk lists oauth_facebook", () => {
    expect(clerkOffersFacebook(env(["oauth_google", "oauth_facebook"]))).toBe(true);
    expect(clerkOffersFacebook(env(["oauth_google"]))).toBe(false);
  });

  it("reads the social map when the strategy list is absent", () => {
    const clerk = {
      __internal_environment: {
        userSettings: { social: { oauth_facebook: { enabled: true, authenticatable: true } } },
      },
    };
    expect(clerkOffersFacebook(clerk)).toBe(true);
    const off = {
      __internal_environment: {
        userSettings: { social: { oauth_facebook: { enabled: false, authenticatable: true } } },
      },
    };
    expect(clerkOffersFacebook(off)).toBe(false);
  });

  it("treats anything unexpected as not offered", () => {
    expect(clerkOffersFacebook(null)).toBe(false);
    expect(clerkOffersFacebook({})).toBe(false);
    expect(clerkOffersFacebook({ __internal_environment: null })).toBe(false);
    const throwing = {
      get __internal_environment() {
        throw new Error("not loaded");
      },
    };
    expect(clerkOffersFacebook(throwing)).toBe(false);
  });
});

describe("facebookPreviewForced", () => {
  it("only forces the button in a development build with the flag set", () => {
    expect(facebookPreviewForced(true, "1")).toBe(true);
    expect(facebookPreviewForced(false, "1")).toBe(false);
    expect(facebookPreviewForced(true, undefined)).toBe(false);
    expect(facebookPreviewForced(true, "true")).toBe(false);
  });
});

describe("socialSsoOutcome", () => {
  it("activates a created session", () => {
    expect(socialSsoOutcome({ createdSessionId: "sess_1" })).toEqual({
      status: "activated",
      sessionId: "sess_1",
    });
  });

  it("reads a closed window as cancelled", () => {
    expect(
      socialSsoOutcome({ createdSessionId: null, authSessionResult: { type: "cancel" } }),
    ).toEqual({ status: "cancelled" });
    expect(
      socialSsoOutcome({ createdSessionId: null, authSessionResult: { type: "dismiss" } }),
    ).toEqual({ status: "cancelled" });
  });

  it("asks for a contact when Facebook shared no email", () => {
    expect(
      socialSsoOutcome({
        createdSessionId: null,
        authSessionResult: { type: "success" },
        signUp: { status: "missing_requirements", missingFields: ["email_address"] },
      }),
    ).toEqual({ status: "needs_contact" });
  });

  it("asks for the link code when Clerk wants the shared email confirmed", () => {
    expect(
      socialSsoOutcome({
        createdSessionId: null,
        authSessionResult: { type: "success" },
        signIn: { status: "needs_first_factor", supportedFirstFactors: [{ strategy: "email_code" }] },
      }),
    ).toEqual({ status: "needs_link_code" });
  });

  it("leaves anything else to the native callback", () => {
    expect(
      socialSsoOutcome({ createdSessionId: null, authSessionResult: { type: "success" } }),
    ).toEqual({ status: "incomplete" });
  });
});

describe("contactKindsToAsk", () => {
  it("asks for what Clerk lists missing, and offers the other where Clerk takes it", () => {
    expect(
      contactKindsToAsk({
        status: "missing_requirements",
        missingFields: ["email_address"],
        optionalFields: ["phone_number"],
      }),
    ).toEqual(["email", "phone"]);
    expect(
      contactKindsToAsk({ status: "missing_requirements", missingFields: ["email_address"] }),
    ).toEqual(["email"]);
    expect(
      contactKindsToAsk({ status: "missing_requirements", missingFields: ["phone_number"] }),
    ).toEqual(["phone"]);
  });

  it("keeps an added but unverified contact changeable", () => {
    expect(
      contactKindsToAsk({ status: "missing_requirements", unverifiedFields: ["email_address"] }),
    ).toEqual(["email"]);
  });

  it("asks nothing when no contact is missing", () => {
    expect(contactKindsToAsk({ status: "missing_requirements", missingFields: ["username"] })).toEqual([]);
    expect(signUpNeedsContact({ status: "complete", missingFields: ["email_address"] })).toBe(false);
    expect(signUpNeedsContact(null)).toBe(false);
  });
});

describe("signInNeedsLinkCode", () => {
  it("needs an emailed code factor", () => {
    expect(signInNeedsLinkCode({ status: "needs_first_factor", supportedFirstFactors: [] })).toBe(false);
    expect(signInNeedsLinkCode({ status: "complete" })).toBe(false);
  });
});

describe("contacts", () => {
  it("writes a Philippine mobile as +63", () => {
    expect(philippineMobileE164("0917 123 4567")).toBe("+639171234567");
    expect(philippineMobileE164("+63 917-123-4567")).toBe("+639171234567");
    expect(philippineMobileE164("639171234567")).toBe("+639171234567");
    expect(philippineMobileE164("1234")).toBeNull();
  });

  it("says what is wrong with the field", () => {
    expect(contactProblem("email", "")).toBe("Enter your email address.");
    expect(contactProblem("email", "ana@")).toMatch(/incomplete/);
    expect(contactProblem("email", "ana@example.com")).toBeNull();
    expect(contactProblem("phone", "12")).toMatch(/Philippine mobile/);
    expect(contactProblem("phone", "09171234567")).toBeNull();
  });

  it("sends the contact the way Clerk takes it", () => {
    expect(contactValue("email", " Ana@Example.COM ")).toBe("ana@example.com");
    expect(contactValue("phone", "0917 123 4567")).toBe("+639171234567");
  });
});

describe("refusals", () => {
  it("knows a contact another account holds", () => {
    expect(isContactTakenError({ errors: [{ code: "form_identifier_exists" }] })).toBe(true);
    expect(isContactTakenError({ errors: [{ message: "That email address is taken." }] })).toBe(true);
    expect(isContactTakenError({ errors: [{ code: "form_code_incorrect" }] })).toBe(false);
  });

  it("knows Facebook is not available", () => {
    expect(isFacebookUnavailableError({ errors: [{ code: "oauth_provider_not_enabled" }] })).toBe(true);
    expect(isFacebookUnavailableError({ errors: [{ code: "form_code_incorrect" }] })).toBe(false);
  });
});
