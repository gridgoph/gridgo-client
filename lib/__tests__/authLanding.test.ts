import { authLanding, shouldPreventAuthLeave, staysOnAuthScreen } from "@/lib/authLanding";

const client = { accountType: "individual" as const, orgName: undefined };

/**
 * The ranking rungs are exercised in their own block below. Everywhere else the
 * phone has already answered and the client has already ranked, so those two
 * facts are held still and each test varies only what it is about.
 */
const ranked = { prioritiesReady: true, hasRanked: true };

describe("authLanding", () => {
  it("keeps a signed-out visitor on the auth screen", () => {
    const landing = authLanding({
      user: null,
      pendingClerkProfile: false,
      justProvisioned: false,
      ...ranked,
    });
    expect(landing).toEqual({ kind: "signed_out" });
    expect(staysOnAuthScreen(landing)).toBe(true);
  });

  it("sends an adopted client home", () => {
    const landing = authLanding({
      user: client,
      pendingClerkProfile: false,
      justProvisioned: false,
      ...ranked,
    });
    expect(landing).toEqual({ kind: "home" });
    expect(staysOnAuthScreen(landing)).toBe(false);
  });

  it("sends a just-activated complete client home, not first-run onboarding", () => {
    expect(
      authLanding({ user: client, pendingClerkProfile: false, justProvisioned: true, ...ranked }),
    ).toEqual({ kind: "home" });
  });

  it("never sends an existing client to onboarding", () => {
    expect(
      authLanding({
        user: { accountType: "business", orgName: "Davao Events Co." },
        pendingClerkProfile: false,
        justProvisioned: false,
      ...ranked,
      }),
    ).toEqual({ kind: "home" });
  });

  it("asks for the missing profile before anything else", () => {
    expect(
      authLanding({
        // Business without the name the lockup reads.
        user: { accountType: "business", orgName: "" },
        pendingClerkProfile: false,
        justProvisioned: true,
      ...ranked,
      }),
    ).toEqual({ kind: "complete_profile" });
    expect(
      authLanding({ user: null, pendingClerkProfile: true, justProvisioned: false, ...ranked }),
    ).toEqual({ kind: "complete_profile" });
  });
});

describe("the ranking rung", () => {
  const base = { user: client, pendingClerkProfile: false, justProvisioned: false };

  it("shows nothing until the phone has answered", () => {
    expect(
      authLanding({ ...base, prioritiesReady: false, hasRanked: false }),
    ).toEqual({ kind: "pending" });
    // Even a stored ranking is not trusted before the read lands.
    expect(
      authLanding({ ...base, prioritiesReady: false, hasRanked: true }),
    ).toEqual({ kind: "pending" });
  });

  it("asks a client who has never ranked", () => {
    expect(
      authLanding({ ...base, prioritiesReady: true, hasRanked: false }),
    ).toEqual({ kind: "priorities" });
  });

  it("lets a ranked client through to Home", () => {
    expect(authLanding({ ...base, ...ranked })).toEqual({ kind: "home" });
  });

  it("still asks for a missing profile first", () => {
    expect(
      authLanding({
        user: { accountType: "business", orgName: "" },
        pendingClerkProfile: false,
        justProvisioned: false,
        prioritiesReady: true,
        hasRanked: false,
      }),
    ).toEqual({ kind: "complete_profile" });
  });

  it("does not hold a signed-out visitor on a durable read they do not need", () => {
    expect(
      authLanding({
        user: null,
        pendingClerkProfile: false,
        justProvisioned: false,
        prioritiesReady: false,
        hasRanked: false,
      }),
    ).toEqual({ kind: "signed_out" });
  });
});

describe("shouldPreventAuthLeave", () => {
  it("holds the code step only while the person is still signed out", () => {
    expect(shouldPreventAuthLeave({ kind: "signed_out" }, true)).toBe(true);
    expect(shouldPreventAuthLeave({ kind: "signed_out" }, false)).toBe(false);
  });

  it("lets a successful adopt leave even if the code step is still showing", () => {
    expect(shouldPreventAuthLeave({ kind: "home" }, true)).toBe(false);
    expect(shouldPreventAuthLeave({ kind: "complete_profile" }, true)).toBe(false);
    expect(shouldPreventAuthLeave({ kind: "onboarding" }, true)).toBe(false);
  });
});
